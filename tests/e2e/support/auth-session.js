// Seeds a valid Supabase session into localStorage *before* the app's own
// scripts run, so it boots as an already-signed-in (non-anonymous) user
// instead of going through App.jsx's default anonymous-guest bootstrap.
// There is no live Supabase project to run the real magic-link login flow
// against in these tests, so this is the only way to exercise the parts of
// the UI gated behind `!isGuest` (the full <Header> with its About tab, the
// Embed Widget modal, "Manage Subscription", etc.).
//
// Key format (`sb-<project-ref>-auth-token`) and payload shape come straight
// from @supabase/supabase-js's own GoTrueClient — see the storage key
// template `sb-${new URL(url).hostname.split('.')[0]}-auth-token` and
// _saveSession(). Verified empirically against this exact supabase-js
// version rather than assumed from memory.

export function authStorageKeyFor(supabaseUrl) {
  const hostname = new URL(supabaseUrl).hostname;
  return `sb-${hostname.split('.')[0]}-auth-token`;
}

export function makeAuthenticatedSession({ userId = 'e2e-real-user-0001', email = 'owner@acme.example.com' } = {}) {
  return {
    access_token: 'mock-access-token-' + userId,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'mock-refresh-token-' + userId,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      is_anonymous: false,
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

/** Call before `page.goto(...)`. Returns the seeded session (its `user` is
 * what you should use as the fixture tenant's `owner_user_id`). */
export async function seedAuthenticatedSession(page, supabaseUrl, options = {}) {
  const session = makeAuthenticatedSession(options);
  const storageKey = authStorageKeyFor(supabaseUrl);
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session }
  );
  return session;
}
