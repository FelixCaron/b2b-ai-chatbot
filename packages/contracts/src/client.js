// ---------------------------------------------------------------------------
// The browser end of the contracts — one transport, shared by every app.
//
// It reads the endpoint definition to decide the URL, the method, whether to
// attach a Bearer token, and how to split the payload between query string and
// JSON body; then it validates the request *before* it leaves the browser, so a
// mistyped field is a console error here instead of a 400 in production.
//
// Every call resolves to the same envelope, and never throws:
//   { ok: true,  status, data }
//   { ok: false, status, error, issues? }
// Call sites used to each invent their own ({ success, data }, a bare `data`, a
// thrown Error, a null) — which is why several of them silently swallowed
// server errors. One envelope, checked one way.
//
// Auth is injected rather than imported: each app has its own Supabase client,
// and this package must stay dependency-free.
// ---------------------------------------------------------------------------

/** The keys a query-addressed route carries in its URL rather than its body.
 *  Contracts spell those routes as '/api/staff/tenants?id' — the '?id' names
 *  the addressing key, it is not part of the path. */
function addressKeys(endpoint) {
  const suffix = endpoint.path.split('?')[1];
  return suffix ? suffix.split('&').filter(Boolean) : [];
}

function pick(payload, keys) {
  const out = {};
  for (const key of keys) if (key in payload) out[key] = payload[key];
  return out;
}

function omit(payload, keys) {
  const out = { ...payload };
  for (const key of keys) delete out[key];
  return out;
}

function needsAuth(endpoint) {
  return endpoint.auth === 'user' || endpoint.auth === 'tenant' || endpoint.auth === 'staff';
}

/**
 * Build an API client bound to one app's credentials.
 *
 * @param {object}   options
 * @param {function} options.getAuthHeaders  async () => headers, for authenticated endpoints
 * @param {function} [options.getOrigin]     defaults to window.location.origin
 * @param {boolean}  [options.checkResponses=false]  warn when a response drifts from its contract
 */
export function createApiClient({ getAuthHeaders, getOrigin, checkResponses = false } = {}) {
  const origin = () => {
    if (getOrigin) return getOrigin();
    return typeof window !== 'undefined' ? window.location.origin : '';
  };

  const headersFor = async (endpoint) => {
    if (!needsAuth(endpoint)) return { 'Content-Type': 'application/json' };
    return (await getAuthHeaders?.()) || { 'Content-Type': 'application/json' };
  };

  /** Absolute URL for an endpoint, so the same client works from the SPA, the
   *  preview page, and a widget embedded on another origin. */
  function endpointUrl(endpoint, query = null) {
    const base = origin();
    const path = endpoint.path.split('?')[0];
    const url = new URL(path, base || 'http://localhost');
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
      });
    }
    return base ? url.toString() : path;
  }

  /**
   * Call an endpoint by its contract.
   *
   * @param {object} endpoint  a definition from this package
   * @param {object} payload   the request fields, as named in the contract
   * @param {object} [options]
   * @param {boolean} [options.validate=true]  pre-flight the payload locally
   * @param {AbortSignal} [options.signal]
   */
  async function callEndpoint(endpoint, payload = {}, { validate = true, signal } = {}) {
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

    // A GET/DELETE carries its whole payload in the URL. A POST/PATCH on a
    // query-addressed route (PATCH /api/staff/tenants?id=<uuid>) carries only
    // the addressing keys there and the rest in the JSON body — exactly the
    // split apps/internal-admin/api/staff/tenants.js reads back.
    const inUrl = addressKeys(endpoint);
    const carriesBody = endpoint.method !== 'GET' && endpoint.method !== 'DELETE';
    const query = carriesBody ? pick(payload, inUrl) : payload;
    const body = carriesBody ? omit(payload, inUrl) : null;

    let res;
    try {
      res = await fetch(endpointUrl(endpoint, query), {
        method: endpoint.method,
        headers: await headersFor(endpoint),
        signal,
        ...(carriesBody ? { body: JSON.stringify(body) } : {})
      });
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: false, status: 0, error: 'Request cancelled', aborted: true };
      return { ok: false, status: 0, error: err?.message || 'Network error. Please check your connection and try again.' };
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      // A body that isn't JSON (an HTML error page, an empty 204) is not fatal
      // — the status still carries the outcome.
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.error || `${endpoint.name} failed (HTTP ${res.status}).`,
        issues: data?.issues,
        data
      };
    }

    // Responses are checked but never rejected: a server that grew a field must
    // not break a browser tab that has been open since before the deploy.
    if (checkResponses && Object.keys(endpoint.response).length) {
      const checked = endpoint.safeParseResponse(data || {});
      if (!checked.ok) console.warn(`[api] ${endpoint.name} — response drifted from its contract: ${checked.message}`);
    }

    return { ok: true, status: res.status, data };
  }

  /** URL, headers and body for a call this module does not own the transport of
   *  — the SSE chat stream, which fetch-event-source drives itself. */
  async function streamRequestInit(endpoint, payload) {
    return {
      url: endpointUrl(endpoint),
      headers: await headersFor(endpoint),
      body: JSON.stringify(payload)
    };
  }

  return { callEndpoint, endpointUrl, streamRequestInit };
}

export default createApiClient;
