import { test as base, expect } from '@playwright/test';
import { installMockBackend, MOCK_SUPABASE_URL } from './mock-backend.js';
import { seedAuthenticatedSession } from './auth-session.js';

// Every spec gets a fully mocked backend (Supabase auth/REST + our /api/**
// routes) wired up before the page ever navigates, so `mock.db` reflects
// exactly what the app will see and can be asserted against afterwards.
export const test = base.extend({
  // Per-file/per-test override point: `test.use({ mockOverrides: { db: { sites: [] } } })`
  // to start a spec from a different fixture shape (e.g. a brand-new tenant
  // with no sites yet, to exercise the onboarding screen).
  mockOverrides: [{}, { option: true }],
  // `test.use({ authenticated: true })` seeds a real (non-anonymous) signed-in
  // session before the app loads, for flows gated behind `!isGuest`: the full
  // <Header> (with its About tab), the Embed Widget modal, etc. The fixture
  // tenant is automatically owned by this seeded user so it still shows up.
  authenticated: [false, { option: true }],
  mock: async ({ page, mockOverrides, authenticated }, use) => {
    let anonUser;
    if (authenticated) {
      const session = await seedAuthenticatedSession(page, MOCK_SUPABASE_URL);
      anonUser = session.user;
    }
    const mock = await installMockBackend(page, { ...mockOverrides, anonUser });
    await use(mock);
  },
});

/** Collects console errors/pageerrors for a page; call .assertNone() at the
 * end of a test to fail loudly on anything unexpected. Some noisy/expected
 * warnings (mocked-network artifacts, the intentionally-stubbed captcha) are
 * filtered out. */
export function trackConsoleErrors(page) {
  const errors = [];
  const ignore = [
    /favicon/i,
    /Turnstile/i, // our stub intentionally isn't a real captcha widget
  ];
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (ignore.some((re) => re.test(text))) return;
    errors.push(`[console.error] ${text}`);
  });
  return {
    errors,
    assertNone() {
      expect(errors, `Unexpected console/page errors:\n${errors.join('\n')}`).toEqual([]);
    },
  };
}

export { expect };
