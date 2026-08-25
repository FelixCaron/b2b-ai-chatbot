// Infra-free mock of everything the admin SPA talks to over the network:
// Supabase Auth, Supabase PostgREST (`/rest/v1/<table>`), and our own
// serverless `/api/**` routes. Vite's dev server (what these tests run
// against) never executes the real `/api/*` Vercel functions, and this repo
// has no live Supabase project wired into CI/this sandbox — so instead of
// skipping frontend E2E coverage entirely, we intercept every request at the
// network layer and answer it the way the real backend would, using a small
// in-memory dataset. This is deliberately a *frontend* test harness: it
// proves the UI renders, transitions, and error-handles correctly against
// realistic responses — it does not (and cannot, without live infra) verify
// server-side logic like RLS or the delete_site_cascade SQL function itself.

const MOCK_SUPABASE_URL = 'https://mock.supabase.test';
const MOCK_ANON_KEY = 'mock-anon-key-for-e2e-tests';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function makeAnonUser() {
  const id = uuid();
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: null,
    is_anonymous: true,
    app_metadata: { provider: 'anonymous' },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
}

function makeSession(user) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'mock-access-token-' + user.id,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'mock-refresh-token-' + user.id,
    user,
  };
}

/**
 * Default fixture dataset, owned by `user` (an anonymous guest by default,
 * or a seeded authenticated session's user — see support/auth-session.js).
 * Each test can override/extend via
 * installMockBackend(page, { db: { ... }, anonUser: {...} }).
 */
export function defaultFixtures(user) {
  const anonUser = user || makeAnonUser();
  const tenantId = uuid();
  const siteId = uuid();
  const sitePublicKey = uuid();

  return {
    anonUser,
    db: {
      tenants: [
        {
          id: tenantId,
          name: 'Acme Corp',
          owner_user_id: anonUser.id,
          plan: 'pro',
          plan_status: 'active',
          stripe_customer_id: null,
          stripe_subscription_id: null,
          created_at: new Date().toISOString(),
        },
      ],
      sites: [
        {
          id: siteId,
          tenant_id: tenantId,
          domain: 'acme.example.com',
          public_key: sitePublicKey,
          enable_lead_capture: true,
          theme_primary_color: '#6366f1',
          bot_goal: 'support',
          bot_tone: 'professionnel',
          support_email: null,
          calendar_link: null,
          created_at: new Date().toISOString(),
        },
      ],
      leads: [
        {
          id: uuid(),
          tenant_id: tenantId,
          site_id: siteId,
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: null,
          summary: 'Interested in enterprise plan.',
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ],
      usage: [
        { tenant_id: tenantId, messages_count: 42, leads_count: 1, updated_at: new Date().toISOString() },
      ],
      documents: [
        {
          id: uuid(),
          tenant_id: tenantId,
          site_id: siteId,
          url: 'https://acme.example.com/',
          content: 'Acme Corp home page content.',
          metadata: { title: 'Home' },
          created_at: new Date().toISOString(),
        },
      ],
      site_summaries: [
        {
          id: uuid(),
          tenant_id: tenantId,
          site_id: siteId,
          summary: 'Acme Corp sells premium widgets to businesses worldwide.',
          updated_at: new Date().toISOString(),
        },
      ],
    },
  };
}

function applyEqFilters(rows, searchParams) {
  let result = rows;
  for (const [key, value] of searchParams.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    if (value.startsWith('eq.')) {
      const target = value.slice(3);
      result = result.filter((r) => String(r[key]) === target);
    } else if (value.startsWith('in.')) {
      const list = value.slice(3).replace(/^\(|\)$/g, '').split(',');
      result = result.filter((r) => list.includes(String(r[key])));
    } else if (value.startsWith('ilike.') || value.startsWith('like.')) {
      const pattern = value.split('.').slice(1).join('.').replace(/%/g, '').toLowerCase();
      result = result.filter((r) => String(r[key] ?? '').toLowerCase().includes(pattern));
    }
  }
  return result;
}

function applyOrder(rows, searchParams) {
  const order = searchParams.get('order');
  if (!order) return rows;
  const [col, dir] = order.split('.');
  const sorted = [...rows].sort((a, b) => {
    if (a[col] < b[col]) return dir === 'desc' ? 1 : -1;
    if (a[col] > b[col]) return dir === 'desc' ? -1 : 1;
    return 0;
  });
  return sorted;
}

/**
 * Installs route interception for Supabase auth/REST and our /api/** routes
 * on the given Playwright `page`. Returns the mutable `db` object so tests
 * can assert on/seed it, plus `state` for recording things like the last
 * body sent to a given endpoint.
 */
export async function installMockBackend(page, overrides = {}) {
  const anonUser = overrides.anonUser || makeAnonUser();
  const fixtures = defaultFixtures(anonUser);
  // Patch fields onto the auto-generated default tenant (e.g. { plan: 'basic' })
  // rather than replacing db.tenants wholesale — the default tenant's id is
  // generated here and every fixture site/lead/etc. already points at it, so
  // a full-array override would silently break those foreign keys.
  if (overrides.tenantPatch) {
    Object.assign(fixtures.db.tenants[0], overrides.tenantPatch);
  }
  const db = { ...fixtures.db, ...(overrides.db || {}) };
  const state = {
    deleteSiteShouldFail: false,
    calls: [],
  };

  // --- Supabase Auth -------------------------------------------------
  await page.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());
    state.calls.push({ type: 'auth', path: url.pathname });

    // signOut() expects an empty 204 response, not a session payload — if we
    // return a fake session body here, supabase-js's logout handling can
    // throw, which (since App.jsx's handleLogout doesn't catch errors)
    // aborts the subsequent signInAnonymously() call and leaves the app
    // stuck showing the just-signed-out user instead of falling back to a
    // guest session.
    if (url.pathname.includes('/logout')) {
      state.loggedOut = true;
      return route.fulfill({ status: 204, body: '' });
    }

    // Before any logout: this is the app's very first bootstrap sign-in, so
    // hand back the fixture's own user (its id is what the fixture tenant's
    // owner_user_id is set to). After a logout: a real signInAnonymously()
    // always creates a brand-new anonymous identity, so mirror that instead
    // of re-handing out the same (possibly non-anonymous) user we just
    // signed out of — otherwise the app would look "still logged in".
    const sessionUser = state.loggedOut ? makeAnonUser() : anonUser;
    const session = makeSession(sessionUser);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...session }),
    });
  });

  // --- Supabase REST (PostgREST) --------------------------------------
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/rest/v1/')[1]?.split('?')[0];
    const method = request.method();
    const accept = request.headers()['accept'] || '';
    const wantsSingle = accept.includes('vnd.pgrst.object');
    state.calls.push({ type: 'rest', table, method, url: url.toString() });

    if (!db[table]) db[table] = [];

    // supabase-js sends a HEAD request with `Prefer: count=exact` for
    // `.select(..., { count: 'exact', head: true })` calls — it reads the
    // row count from the Content-Range response header, body is empty.
    if (method === 'HEAD') {
      const rows = applyEqFilters(db[table], url.searchParams);
      const len = rows.length;
      return route.fulfill({
        status: 200,
        headers: { 'content-range': `0-${Math.max(len - 1, 0)}/${len}` },
        body: '',
      });
    }

    const respond = (rows, status = 200) => {
      if (wantsSingle) {
        if (rows.length === 0) {
          return route.fulfill({
            status: 406,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'JSON object requested, multiple (or no) rows returned' }),
          });
        }
        return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(rows[0]) });
      }
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(rows) });
    };

    if (method === 'GET') {
      let rows = applyEqFilters(db[table], url.searchParams);
      rows = applyOrder(rows, url.searchParams);
      return respond(rows);
    }

    if (method === 'POST') {
      const body = request.postDataJSON();
      const items = Array.isArray(body) ? body : [body];
      const inserted = items.map((item) => ({
        id: item.id || uuid(),
        created_at: new Date().toISOString(),
        ...item,
      }));
      db[table].push(...inserted);
      return respond(inserted, 201);
    }

    if (method === 'PATCH') {
      const body = request.postDataJSON() || {};
      const matches = applyEqFilters(db[table], url.searchParams);
      matches.forEach((row) => Object.assign(row, body));
      return respond(matches);
    }

    if (method === 'DELETE') {
      const matches = applyEqFilters(db[table], url.searchParams);
      db[table] = db[table].filter((row) => !matches.includes(row));
      return respond(matches);
    }

    return route.continue();
  });

  // --- Our own /api/** serverless routes (not executed by `vite dev`) --
  await page.route('**/api/crawler/delete-site', async (route) => {
    const request = route.request();
    const body = request.postDataJSON() || {};
    state.calls.push({ type: 'api', path: 'delete-site', body });

    if (state.deleteSiteShouldFail) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Simulated deletion failure for test coverage' }),
      });
    }

    const { site_id, tenant_id } = body;
    const siteRow = db.sites.find((s) => s.id === site_id && s.tenant_id === tenant_id);
    if (!siteRow) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: `Site ${site_id} not found for tenant ${tenant_id}` }),
      });
    }

    const before = {
      documents: db.documents.filter((d) => d.site_id === site_id).length,
      site_summaries: db.site_summaries.filter((d) => d.site_id === site_id).length,
      leads: db.leads.filter((d) => d.site_id === site_id).length,
    };
    db.documents = db.documents.filter((d) => d.site_id !== site_id);
    db.site_summaries = db.site_summaries.filter((d) => d.site_id !== site_id);
    db.leads = db.leads.filter((d) => d.site_id !== site_id);
    db.sites = db.sites.filter((s) => s.id !== site_id);

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        site_id,
        deleted: {
          site_id,
          tenant_id,
          documents_deleted: before.documents,
          site_summaries_deleted: before.site_summaries,
          leads_deleted: before.leads,
          scan_jobs_deleted: 0,
        },
      }),
    });
  });

  await page.route('**/api/chat/theme', async (route) => {
    state.calls.push({ type: 'api', path: 'theme' });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ primary_color: '#4f46e5', org_name: 'Acme Corp' }),
    });
  });

  await page.route('**/api/crawler/crawl', async (route) => {
    state.calls.push({ type: 'api', path: 'crawl' });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pages: [{ url: 'https://acme.example.com/', title: 'Home Page' }] }),
    });
  });

  await page.route('**/api/crawler/scan', async (route) => {
    state.calls.push({ type: 'api', path: 'scan' });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { chunks_count: 3 } }),
    });
  });

  await page.route('**/api/crawler/summarize', async (route) => {
    state.calls.push({ type: 'api', path: 'summarize' });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ summary: 'Acme Corp sells premium widgets to businesses worldwide.' }),
    });
  });

  // Both billing routes used to accept a bare tenantId with no proof the
  // caller owns it (IDOR — see ADR). Record the Authorization header so
  // tests can confirm the frontend actually sends one now.
  await page.route('**/api/billing/checkout', async (route) => {
    const authHeader = route.request().headers()['authorization'];
    state.calls.push({ type: 'api', path: 'billing/checkout', authHeader });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://checkout.stripe.com/mock-session', sessionId: 'sess_mock' }),
    });
  });

  await page.route('**/api/billing/portal', async (route) => {
    const authHeader = route.request().headers()['authorization'];
    state.calls.push({ type: 'api', path: 'billing/portal', authHeader });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://billing.stripe.com/mock-portal' }),
    });
  });

  await page.route('**/api/chat', async (route) => {
    state.calls.push({ type: 'api', path: 'chat' });
    const sseBody = [
      'data: {"text":"Hello"}',
      '',
      'data: {"text":"Hello! How can I help you today?"}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n');
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseBody,
    });
  });

  // --- Third-party scripts we don't want to depend on real network for --
  await page.route('**/challenges.cloudflare.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '// turnstile stub (no-op in tests)' });
  });
  // Fulfill (not abort) so the browser doesn't log a real network-failure
  // console error for an intentionally-stubbed request — we just don't want
  // these tests depending on a real network round-trip to Google's CDN.
  // Stub out the actual Stripe redirect targets so a checkout/portal click
  // in a test doesn't try to navigate to the real (unreachable) internet.
  await page.route('**/checkout.stripe.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>mock stripe checkout</body></html>' })
  );
  await page.route('**/billing.stripe.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>mock stripe portal</body></html>' })
  );

  await page.route('**/fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '/* fonts stubbed out for tests */' })
  );
  await page.route('**/fonts.gstatic.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.from('') })
  );

  return { db, state, anonUser };
}

export { MOCK_SUPABASE_URL, MOCK_ANON_KEY };
