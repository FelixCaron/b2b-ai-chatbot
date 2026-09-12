// Contract verification — the check that keeps the API "products" honest.
//
// 1. Every endpoint in the registry is addressable: a handler file exists for
//    its path. (This is what catches a route renamed on one side only.)
// 2. Request validation accepts what the app really sends and rejects what it
//    must never send.
// 3. The registry itself is well-formed (no duplicate name or route) — that is
//    enforced at import time by registry(), so importing at all proves it.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { contracts, endpoints, ValidationError, createApiClient } from '../../packages/contracts/src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`PASS: ${label}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${label} — ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- 1. Every endpoint has a handler on disk -------------------------------
// The staff routes are deployed from dorafi/staff's own Vercel project;
// everything else from the root /api.
const HANDLER_ROOTS = [path.join(ROOT, 'dorafi/admin/api'), path.join(ROOT, 'dorafi/staff/api')];

function handlerExists(endpointPath) {
  const relative = endpointPath.split('?')[0].replace(/^\/api\/?/, '');
  return HANDLER_ROOTS.some((root) =>
    fs.existsSync(path.join(root, `${relative}.js`)) ||
    fs.existsSync(path.join(root, relative, 'index.js'))
  );
}

for (const endpoint of Object.values(endpoints)) {
  check(`${endpoint.name} → a handler exists for ${endpoint.path}`, () => {
    assert(handlerExists(endpoint.path), `no handler file found for ${endpoint.path}`);
  });
}

// Every endpoint in the registry must also be reachable through
// `contracts.<family>.<name>` — the grouping apps actually call
// (`api.staff.deleteTenant(...)`, not `endpoints['staff.deleteTenant']`).
// That grouping is a hand-written object per family in index.js (its own
// family/name split, not always the same as the endpoint's dotted registry
// name), so registering an endpoint and forgetting to add it there leaves
// it unreachable through `contracts` while `endpoints` still has it — a gap
// the handler-exists check above can't see (it walks `endpoints`, not
// `contracts`), and one that only surfaces at runtime as "Cannot read
// properties of undefined (reading 'safeParseRequest')" the first time
// something calls it.
const reachableEndpoints = new Set(
  Object.values(contracts).flatMap((family) => Object.values(family))
);
for (const endpoint of Object.values(endpoints)) {
  check(`${endpoint.name} → reachable through the \`contracts\` grouping`, () => {
    assert(reachableEndpoints.has(endpoint), `endpoint '${endpoint.name}' is registered but missing from its contracts.<family> object in index.js`);
  });
}

// --- 2. Request validation -------------------------------------------------
const UUID_A = '11111111-2222-3333-4444-555555555555';
const UUID_B = '22222222-3333-4444-5555-666666666666';

check('chat.send accepts a complete widget message', () => {
  const parsed = contracts.chat.send.parseRequest({
    message: 'Quels sont vos tarifs ?',
    tenant_public_key: UUID_A,
    session_id: 'sess_12345'
  });
  assert(parsed.message === 'Quels sont vos tarifs ?', 'message did not round-trip');
});

check('chat.send rejects an empty message', () => {
  let threw = false;
  try {
    contracts.chat.send.parseRequest({ message: '', tenant_public_key: UUID_A, session_id: 's' });
  } catch (err) {
    threw = err instanceof ValidationError;
  }
  assert(threw, 'an empty message was accepted');
});

check('crawler.scan accepts a bare hostname as its url', () => {
  const parsed = contracts.crawler.scan.parseRequest({
    site_id: UUID_A,
    tenant_id: UUID_B,
    url: 'acme.example.com'
  });
  assert(parsed.url === 'acme.example.com', 'the url was rewritten unexpectedly');
});

check('crawler.scan rejects a missing tenant_id — the tenant-isolation field', () => {
  const result = contracts.crawler.scan.safeParseRequest({ site_id: UUID_A, url: 'https://acme.com' });
  assert(!result.ok, 'a scan without a tenant_id was accepted');
  assert(result.issues.some((issue) => issue.path === 'tenant_id'), 'the issue did not name tenant_id');
});

check('sites.claim accepts both of its actions and rejects a third', () => {
  contracts.sites.claim.parseRequest({ action: 'redeem' });
  contracts.sites.claim.parseRequest({ action: 'create', guest_tenant_id: UUID_A, site_id: UUID_B, email: 'A@Example.com ' });
  assert(!contracts.sites.claim.safeParseRequest({ action: 'transfer' }).ok, "action 'transfer' was accepted");
});

check('sites.claim normalizes the email it files a claim against', () => {
  const parsed = contracts.sites.claim.parseRequest({ action: 'create', email: '  Jane@Example.COM ' });
  assert(parsed.email === 'jane@example.com', `email was not normalized: ${parsed.email}`);
});

check('crawler.update still accepts an empty content — how a page is cleared', () => {
  const parsed = contracts.crawler.update.parseRequest({
    site_id: UUID_A, tenant_id: UUID_B, url: 'https://acme.com/a', content: ''
  });
  assert(parsed.content === '', 'an empty content was rejected or dropped');
});

check('billing.checkout requires a tenant, billing.portal too', () => {
  assert(!contracts.billing.checkout.safeParseRequest({ planId: 'pro' }).ok, 'checkout without tenantId was accepted');
  assert(!contracts.billing.portal.safeParseRequest({}).ok, 'portal without tenantId was accepted');
});

check('every tenant-scoped endpoint actually asks for a tenant id', () => {
  for (const endpoint of Object.values(endpoints)) {
    if (endpoint.auth !== 'tenant') continue;
    const fields = Object.keys(endpoint.request);
    assert(
      fields.includes('tenant_id') || fields.includes('tenantId'),
      `${endpoint.name} is tenant-scoped but its request has no tenant id`
    );
  }
});

// --- 3. Response contracts -------------------------------------------------
check('crawler.discover describes the shape its handler really returns', () => {
  const result = contracts.crawler.discover.safeParseResponse({
    success: true,
    root_url: 'https://acme.com',
    total_discovered: 2,
    pages: [{ url: 'https://acme.com/', title: "Page d'accueil" }, { url: 'https://acme.com/a', title: 'A' }]
  });
  assert(result.ok, `a real crawl response failed its own contract: ${result.message}`);
});

check('chat.init describes the widget fallback payload', () => {
  const result = contracts.chat.init.safeParseResponse({
    welcome_message: 'Hello! How can I help you today?',
    ui_status_title: 'Virtual Assistant',
    ui_status_online: 'Online',
    ui_input_placeholder: 'Ask a question...',
    language: 'en'
  });
  assert(result.ok, `the widget fallback failed its own contract: ${result.message}`);
});

// --- 4. The shared browser transport --------------------------------------
// One client for every app, so the request a component *means* to make and the
// request that goes on the wire cannot drift.
function withFetchSpy(run) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };
  const client = createApiClient({
    getAuthHeaders: async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer test-token' }),
    getOrigin: () => 'https://dorafi.test'
  });
  return run(client, calls).finally(() => { globalThis.fetch = originalFetch; });
}

async function clientChecks() {
  await withFetchSpy(async (client, calls) => {
    await client.callEndpoint(contracts.crawler.scan, { site_id: UUID_A, tenant_id: UUID_B, url: 'https://acme.com' });
    check('the client posts a tenant-scoped call to its contract address, with a bearer token', () => {
      assert(calls[0].url === 'https://dorafi.test/api/crawler/scan', `wrong url: ${calls[0].url}`);
      assert(calls[0].init.method === 'POST', 'wrong method');
      assert(calls[0].init.headers.Authorization === 'Bearer test-token', 'no bearer token on a tenant-scoped call');
      assert(JSON.parse(calls[0].init.body).tenant_id === UUID_B, 'tenant_id did not reach the body');
    });
  });

  await withFetchSpy(async (client, calls) => {
    await client.callEndpoint(contracts.chat.init, { tenant_public_key: UUID_A });
    check('a GET endpoint carries its payload in the query string, unauthenticated', () => {
      assert(calls[0].url === `https://dorafi.test/api/chat/init?tenant_public_key=${UUID_A}`, `wrong url: ${calls[0].url}`);
      assert(!calls[0].init.body, 'a GET was given a body');
      assert(!calls[0].init.headers.Authorization, 'a public endpoint was sent a bearer token');
    });
  });

  await withFetchSpy(async (client, calls) => {
    await client.callEndpoint(contracts.staff.updateTenantPlan, { id: UUID_A, plan: 'pro' });
    check('a query-addressed PATCH splits the addressing key into the URL and the rest into the body', () => {
      assert(calls[0].url === `https://dorafi.test/api/staff/tenants?id=${UUID_A}`, `wrong url: ${calls[0].url}`);
      const body = JSON.parse(calls[0].init.body);
      assert(body.plan === 'pro', 'plan did not reach the body');
      assert(!('id' in body), 'the addressing key was duplicated into the body');
    });
  });

  await withFetchSpy(async (client, calls) => {
    const result = await client.callEndpoint(contracts.crawler.scan, { site_id: 'not-a-uuid', tenant_id: UUID_B, url: 'https://acme.com' });
    check('an invalid payload never reaches the network', () => {
      assert(!result.ok, 'an invalid payload was reported as ok');
      assert(calls.length === 0, 'a request we knew was invalid was still sent');
    });
  });
}

await clientChecks();

console.log(`\nContract Test Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
