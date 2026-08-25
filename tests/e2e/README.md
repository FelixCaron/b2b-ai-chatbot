# E2E tests (Playwright)

Frontend end-to-end tests for `apps/admin`. They run against a real `vite
dev` server but a **fully mocked backend** — see `support/mock-backend.js` —
because there's no live Supabase project wired into CI/most dev machines,
and `vite dev` never executes the real `/api/**` Vercel functions anyway.
That means these tests prove the UI renders, transitions, and error-handles
correctly against realistic responses; they do **not** verify server-side
logic (RLS policies, the `delete_site_cascade` SQL function, etc.) — that
needs a live project (see `scripts/tests/test-e2e-chat.js` for that side).

## Running

```bash
npm run test:e2e            # headless, both projects (Desktop Chrome, Mobile Chrome)
npm run test:e2e:report     # open the last HTML report
npx playwright test tests/e2e/delete-site.spec.js   # a single file
npx playwright test -g "sign out"                   # by test name
```

If your Chromium build's revision doesn't match what this `@playwright/test`
version expects (common in sandboxed/offline environments — you'll see
`Executable doesn't exist at .../chromium_headless_shell-XXXX/...`), point at
whatever Chromium *is* installed and, if running as root, disable the
sandbox:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome PLAYWRIGHT_NO_SANDBOX=1 npm run test:e2e
```

In a normal dev machine / real CI, just run `npx playwright install
chromium` once and `npm run test:e2e` with no extra env vars.

## Layout

- `support/mock-backend.js` — intercepts Supabase Auth, Supabase REST
  (`/rest/v1/<table>`), and our own `/api/**` routes with an in-memory
  dataset. `installMockBackend(page, overrides)` seeds it; each test gets a
  fresh instance via the `mock` fixture.
- `support/auth-session.js` — seeds a signed-in (non-anonymous) Supabase
  session into `localStorage` before the app boots, for flows gated behind
  `!isGuest` (the full `<Header>` with its About tab, Embed Widget, etc.).
  Use `test.use({ authenticated: true })` in a `describe` block.
- `support/test.js` — the extended `test`/`expect` every spec imports from.
  `test.use({ mockOverrides: { db: { sites: [] } } })` starts a spec from a
  different fixture shape (e.g. no sites yet, to hit onboarding).

## Adding a fixture-dependent test

Every test **must** destructure `mock` in its params if the spec (or its
`describe`) relies on `test.use({ authenticated: true })` or
`mockOverrides` — Playwright fixtures are lazy and only run if requested,
even indirectly. A test that never touches `mock.db`/`mock.state` in its
body still needs `async ({ page, mock }) => { ... }`, otherwise the backend
never gets mocked at all and the page silently falls back to whatever a real
(nonexistent) network would do.
