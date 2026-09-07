// ---------------------------------------------------------------------------
// An endpoint definition — the "product sheet" for one API.
//
// Everything a caller or an implementer needs to know about an endpoint lives
// in one object: where it is, what it accepts, what it answers with, who is
// allowed to call it, and what it costs in latency. Both sides import the same
// object, so a request shape can no longer drift from the handler that reads it
// (the failure mode this replaces: a field renamed in Dashboard.jsx and left
// alone in api/crawler/scan.js, discovered in production).
// ---------------------------------------------------------------------------

import { parseFields, safeParseFields } from './schema.js';

/**
 * Who may call an endpoint.
 * - 'public'  — no credentials (the widget's chat, the pre-signup crawlers).
 * - 'user'    — any signed-in Supabase user (Bearer token).
 * - 'tenant'  — a signed-in user who owns the `tenant_id` in the payload.
 * - 'staff'   — an internal-admin staff account.
 * - 'webhook' — authenticated by a provider signature, not by our own tokens.
 * - 'cron'    — invoked by the platform scheduler.
 */
export const AUTH = Object.freeze({
  PUBLIC: 'public',
  USER: 'user',
  TENANT: 'tenant',
  STAFF: 'staff',
  WEBHOOK: 'webhook',
  CRON: 'cron'
});

export function defineEndpoint({
  name,
  summary,
  method = 'POST',
  path,
  auth = AUTH.PUBLIC,
  runtime = 'edge',
  request = {},
  response = {},
  // Documented, non-exhaustive: the failures a caller is expected to handle by
  // name rather than by string-matching a message.
  errors = {},
  streaming = false
}) {
  if (!name) throw new Error('defineEndpoint: `name` is required');
  if (!path) throw new Error(`defineEndpoint(${name}): \`path\` is required`);

  return Object.freeze({
    name,
    summary: summary || '',
    method,
    path,
    auth,
    runtime,
    request,
    response,
    errors: Object.freeze({ ...errors }),
    streaming,

    /** Validate an outgoing/incoming request payload. Throws ValidationError. */
    parseRequest(payload) {
      return parseFields(request, payload);
    },

    /** Non-throwing variant, for client-side pre-flight checks. */
    safeParseRequest(payload) {
      return safeParseFields(request, payload);
    },

    /**
     * Validate a response body. Responses are checked in a *warn* posture, not
     * an enforcing one: a handler that grew a field must not start failing for
     * clients that haven't been redeployed yet, and a client must not throw
     * away a body it could still read. Callers get the issues and decide.
     */
    safeParseResponse(payload) {
      return safeParseFields(response, payload);
    },

    /** True when this endpoint answers with a stream rather than a JSON body. */
    isStreaming: Boolean(streaming),

    toString() {
      return `${method} ${path} (${name})`;
    }
  });
}

/** Index a list of endpoints by name, and fail loudly on a duplicate name or
 *  a duplicate method+path — two products claiming the same address is a bug
 *  worth catching at import time. */
export function registry(...endpoints) {
  const byName = {};
  const seenRoutes = new Map();

  for (const endpoint of endpoints.flat()) {
    if (byName[endpoint.name]) {
      throw new Error(`Duplicate endpoint name: ${endpoint.name}`);
    }
    const route = `${endpoint.method} ${endpoint.path}`;
    if (seenRoutes.has(route)) {
      throw new Error(`Duplicate endpoint route: ${route} (${seenRoutes.get(route)} and ${endpoint.name})`);
    }
    seenRoutes.set(route, endpoint.name);
    byName[endpoint.name] = endpoint;
  }

  return Object.freeze(byName);
}
