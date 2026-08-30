import { test, expect, trackConsoleErrors, clickGuestNavButton } from './support/test.js';

test.describe('Header navigation', () => {
  // A fresh session with our mocked auth backend always comes back as a
  // Supabase anonymous ("guest") user, since real login (magic link) can't
  // be exercised without a live Supabase project. Guests see App.jsx's
  // lightweight fallback header (Dashboard / Leads / Plans / About - the
  // same four tabs as the full <Header> shown to signed-in users).
  test('Dashboard / Leads / Plans / About tabs switch views without console errors (guest header)', async ({ page, mock }) => {
    const consoleTracker = trackConsoleErrors(page);
    await page.goto('/');

    // Dashboard (default view) — the existing fixture site should render.
    await expect(page.getByText('acme.example.com')).toBeVisible();

    await clickGuestNavButton(page, /^Leads/i);
    await expect(page.getByRole('heading', { name: /Captured Leads & Contacts/i })).toBeVisible();
    await expect(page.getByText('jane@example.com')).toBeVisible();

    await clickGuestNavButton(page, /^Plans/i);
    await expect(page.getByRole('heading', { name: /Level Up Your Customer Support/i })).toBeVisible();

    // Reachable directly from the nav — no need to ask the chatbot to get here.
    await clickGuestNavButton(page, /^About/i);
    await expect(page.getByRole('heading', { name: /Pioneering the Future of/i })).toBeVisible();

    await clickGuestNavButton(page, /^Dashboard/i);
    await expect(page.getByText('acme.example.com')).toBeVisible();

    consoleTracker.assertNone();
  });

  test('the "Sign In" affordance is offered to guests', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByText('acme.example.com')).toBeVisible();
    const menuToggle = page.getByRole('button', { name: /open menu/i });
    if (await menuToggle.isVisible().catch(() => false)) {
      await menuToggle.click();
    }
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });
});

test.describe('Header navigation (no site yet)', () => {
  // No site on the fixture tenant, so '/' shows the URL-paste onboarding
  // hero instead of an existing site's dashboard.
  test.use({ mockOverrides: { db: { sites: [], leads: [], documents: [], site_summaries: [] } } });

  test('the app-shell header is hidden on the root onboarding hero before any site exists', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Deploy Your AI Assistant/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /open menu/i })).not.toBeVisible();
  });

  test('About is still reachable from the footer even with the header hidden', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Deploy Your AI Assistant/i })).toBeVisible();
    await page.getByRole('button', { name: /^About$/i }).click();
    await expect(page.getByRole('heading', { name: /Pioneering the Future of/i })).toBeVisible();
  });
});
