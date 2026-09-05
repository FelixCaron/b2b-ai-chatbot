import { defineConfig, devices } from '@playwright/test';
import { MOCK_SUPABASE_URL, MOCK_ANON_KEY } from './tests/e2e/support/mock-backend.js';

const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// This sandbox ships one pre-installed Chromium build whose revision doesn't
// match the @playwright/test version's expected browser (see PLAYWRIGHT.md
// in this repo, or the session's own tool docs). Point at it explicitly when
// PLAYWRIGHT_CHROMIUM_EXECUTABLE is set; otherwise fall back to Playwright's
// normal resolution (e.g. after a real `npx playwright install` in CI).
const chromiumLaunchOptions = {
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  // Sandboxed containers/CI often run as root, where Chromium refuses to
  // launch its sandbox (crbug.com/638180). Only relevant/safe in a throwaway
  // test browser, never for a real user-facing browsing session.
  ...(process.env.PLAYWRIGHT_NO_SANDBOX ? { args: ['--no-sandbox'] } : {}),
};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Kept low and fixed rather than Playwright's CPU-based default: running
  // 3 near-identical Chromium-based projects with a high worker count causes
  // real instability (browsers failing to launch) in constrained sandboxes.
  workers: 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev --workspace=@b2b-ai-chatbot/admin -- --port ${PORT} --host 127.0.0.1 --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: MOCK_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: MOCK_ANON_KEY,
      // apps/admin's Vite dev plugin executes the real /api/** handlers as a
      // dev convenience; our tests intercept those requests in-browser
      // before they ever reach it, but give it harmless placeholder server
      // env vars anyway so it doesn't log a scary (and here, irrelevant)
      // "Missing required server configuration" error if a request ever did
      // slip through.
      SUPABASE_URL: MOCK_SUPABASE_URL,
      SUPABASE_SECRET_KEY: 'mock-service-role-key-for-e2e-tests',
    },
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: chromiumLaunchOptions,
      },
    },
    {
      name: 'Mobile Chrome (Pixel 7)',
      use: {
        ...devices['Pixel 7'],
        launchOptions: chromiumLaunchOptions,
      },
    },
    // A third "iPhone 13 viewport via Chromium" project was deliberately
    // left out: it's the same rendering engine as Mobile Chrome above (this
    // sandbox has no real WebKit build — see the note below), so it added
    // launch-order/CPU contention without unique coverage. iPhone-sized
    // viewports are still explicitly exercised — see
    // responsive-integrity.spec.js's per-device-width sweep — just within
    // the two projects above rather than a third full project run.
    // Swap in devices['iPhone 13'] with browserName: 'webkit' for real
    // Safari coverage once a WebKit build is available in this environment.
  ],
});
