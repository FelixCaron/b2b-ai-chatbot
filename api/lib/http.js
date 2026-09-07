// ---------------------------------------------------------------------------
// The contract runtime for serverless handlers.
//
// Every route in /api used to open with the same forty lines: an OPTIONS
// branch, a method check, a try/catch around req.json(), a hand-written list of
// `if (!field) return 400`, and a per-response literal of CORS headers. That
// boilerplate is where the drift lived — one route spelled an error
// `{ error }`, another `{ message }`; one accepted a missing tenant_id, its
// neighbour didn't.
//
// `edgeRoute` / `nodeRoute` take an endpoint definition from
// @b2b-ai-chatbot/contracts and do all of it once, from the contract: CORS,
// method, JSON parsing, request validation, auth, and error shaping. What is
// left in each route file is the part that is actually about that product.
// ---------------------------------------------------------------------------

import { ValidationError } from '@b2b-ai-chatbot/contracts';
import { requireAuthentication, requireTenantOwnership } from './server-config.js';

const JSON_TYPE = { 'Content-Type': 'application/json' };

export function corsHeaders(endpoint, origin = '*') {
  const methods = [endpoint?.method || 'POST', 'OPTIONS'].join(', ');
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': methods
  };
}

/** The single error body shape every endpoint answers with. */
export function errorBody(err, fallback = 'Internal error') {
  const body = { error: err?.message || fallback };
  if (err instanceof ValidationError) body.issues = err.issues;
  return body;
}

function statusFor(err) {
  if (err instanceof ValidationError) return 400;
  return err?.statusCode || err?.status || 500;
}

// The tenant field is named `tenant_id` almost everywhere and `tenantId` in the
// billing routes (Stripe-side naming, kept for the existing clients).
function tenantIdFrom(payload) {
  return payload?.tenant_id || payload?.tenantId || null;
}

async function enforceAuth(endpoint, req, payload) {
  switch (endpoint.auth) {
    case 'tenant': {
      const tenantId = tenantIdFrom(payload);
      const { user, supabase } = await requireTenantOwnership(req, tenantId);
      return { user, supabase, tenantId };
    }
    case 'user': {
      const { user, supabase } = await requireAuthentication(req);
      return { user, supabase, tenantId: tenantIdFrom(payload) };
    }
    default:
      return { user: null, supabase: null, tenantId: tenantIdFrom(payload) };
  }
}

async function readEdgePayload(endpoint, req) {
  if (endpoint.method === 'GET' || req.method === 'GET') {
    return Object.fromEntries(new URL(req.url).searchParams.entries());
  }
  try {
    return (await req.json()) || {};
  } catch {
    const err = new Error('Invalid JSON body');
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Wrap an Edge (Request → Response) handler in its contract.
 *
 * The handler receives `(req, ctx)` where ctx is
 * `{ data, user, supabase, tenantId, endpoint, cors, json }` — `data` being the
 * validated request payload, and `json(body, status)` a reply already carrying
 * the right headers.
 *
 * `options.validate: false` opts one route out of request validation while
 * keeping the rest (used by /api/chat/init, which must answer 200 with English
 * defaults rather than 400 when a widget calls it with no key at all).
 */
export function edgeRoute(endpoint, handler, { validate = true } = {}) {
  return async function contractHandler(req) {
    const cors = corsHeaders(endpoint, req.headers.get('origin') || '*');
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...JSON_TYPE, ...cors } });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    if (req.method !== endpoint.method && !(endpoint.method === 'GET' && req.method === 'POST')) {
      return json({ error: 'Method not allowed' }, 405);
    }

    try {
      const raw = await readEdgePayload(endpoint, req);
      const data = validate ? endpoint.parseRequest(raw) : raw;
      const auth = await enforceAuth(endpoint, req, data);
      return await handler(req, { ...auth, data, raw, endpoint, cors, json });
    } catch (err) {
      const status = statusFor(err);
      if (status >= 500) console.error(`[${endpoint.name}] handler exception:`, err);
      return json(errorBody(err), status);
    }
  };
}

/**
 * Wrap a Node (req, res) handler in its contract — same guarantees, Vercel's
 * other function signature. The handler receives `(req, res, ctx)`.
 */
export function nodeRoute(endpoint, handler, { validate = true } = {}) {
  return async function contractHandler(req, res) {
    if (req.method === 'OPTIONS') {
      const cors = corsHeaders(endpoint, req.headers?.origin || '*');
      Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));
      return res.status(200).end('ok');
    }

    if (req.method !== endpoint.method) {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const raw = endpoint.method === 'GET' || endpoint.method === 'DELETE'
        ? { ...(req.query || {}) }
        : { ...(req.query || {}), ...(req.body || {}) };
      const data = validate ? endpoint.parseRequest(raw) : raw;
      const auth = await enforceAuth(endpoint, req, data);
      return await handler(req, res, { ...auth, data, raw, endpoint });
    } catch (err) {
      const status = statusFor(err);
      if (status >= 500) console.error(`[${endpoint.name}] handler exception:`, err);
      return res.status(status).json(errorBody(err));
    }
  };
}
