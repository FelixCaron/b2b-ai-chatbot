// ---------------------------------------------------------------------------
// The browser end of the API contracts.
//
// One transport for every call: it reads the endpoint definition to decide the
// URL, the method, whether to attach a Bearer token, and how to shape the
// payload — then validates the request *before* it leaves the browser, so a
// mistyped field is a console warning here instead of a 400 in production.
//
// Every call resolves to the same envelope, never throws:
//   { ok: true,  status, data }
//   { ok: false, status, error, issues? }
// Call sites used to each invent their own ({ success, data }, a bare `data`,
// a thrown Error, a null) — which is why three of them silently swallowed
// server errors. One envelope, checked one way.
// ---------------------------------------------------------------------------

import { authenticatedHeaders } from '../supabase';

/** Absolute URL for an endpoint, so the same client works from the admin SPA,
 *  the preview page, and a widget embedded on another origin. */
export function endpointUrl(endpoint, query = null) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  // Contracts spell query-addressed staff routes as '/api/staff/tenants?id';
  // the '?id' is documentation of the key, not part of the path.
  const path = endpoint.path.split('?')[0];
  const url = new URL(path, base || 'http://localhost');
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
  }
  return base ? url.toString() : path;
}

function needsAuth(endpoint) {
  return endpoint.auth === 'user' || endpoint.auth === 'tenant' || endpoint.auth === 'staff';
}

/**
 * Call an endpoint by its contract.
 *
 * @param {object} endpoint  a definition from @b2b-ai-chatbot/contracts
 * @param {object} payload   the request fields, as named in the contract
 * @param {object} [options]
 * @param {boolean} [options.validate=true]  pre-flight the payload locally
 * @param {AbortSignal} [options.signal]
 */
export async function callEndpoint(endpoint, payload = {}, { validate = true, signal } = {}) {
  if (validate) {
    const parsed = endpoint.safeParseRequest(payload);
    if (!parsed.ok) {
      // A contract violation is a programming error, not a user error: say so
      // loudly rather than sending a request we know the server will reject.
      console.error(`[api] ${endpoint.name} — invalid request: ${parsed.message}`);
      return { ok: false, status: 0, error: parsed.message, issues: parsed.issues };
    }
    payload = parsed.value;
  }

  const isQueryCall = endpoint.method === 'GET' || endpoint.method === 'DELETE';
  const url = endpointUrl(endpoint, isQueryCall ? payload : null);

  const headers = needsAuth(endpoint)
    ? await authenticatedHeaders()
    : { 'Content-Type': 'application/json' };

  let res;
  try {
    res = await fetch(url, {
      method: endpoint.method,
      headers,
      signal,
      ...(isQueryCall ? {} : { body: JSON.stringify(payload) })
    });
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, status: 0, error: 'Request cancelled', aborted: true };
    return { ok: false, status: 0, error: err?.message || 'Network error. Please check your connection and try again.' };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // A body that isn't JSON (an HTML error page, an empty 204) is not fatal —
    // the status still carries the outcome.
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: body?.error || `${endpoint.name} failed (HTTP ${res.status}).`,
      issues: body?.issues,
      data: body
    };
  }

  // Responses are checked but never rejected: a server that grew a field must
  // not break a browser tab that has been open since before the deploy.
  if (import.meta.env?.DEV && Object.keys(endpoint.response).length) {
    const checked = endpoint.safeParseResponse(body || {});
    if (!checked.ok) console.warn(`[api] ${endpoint.name} — response drifted from its contract: ${checked.message}`);
  }

  return { ok: true, status: res.status, data: body };
}

/** Headers + URL for a call this module does not own the transport of — the
 *  SSE chat stream, which fetch-event-source drives itself. */
export async function streamRequestInit(endpoint, payload) {
  return {
    url: endpointUrl(endpoint),
    headers: needsAuth(endpoint) ? await authenticatedHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}
