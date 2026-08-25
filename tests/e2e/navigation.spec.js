import { test, expect, trackConsoleErrors } from './support/test.js';

test.describe('Header navigation', () => {
  // A fresh session with our mocked auth backend always comes back as a
  // Supabase anonymous ("guest") user, since real login (magic link) can't
  // be exercised without a live Supabase project. Guests see App.jsx's
  // lightweight fallback header (Dashboard / Leads / Plans only — no About
  // tab, that one lives in the full <Header> shown to signed-in users).
  test('Dashboard / Leads / Plans tabs switch views without console errors (guest header)', async ({ page, mock }) => {
    const consoleTracker = trackConsoleErrors(page);
    await page.goto('/');

    // Dashboard (default view) — the existing fixture site should render.
    await expect(page.getByText('acme.example.com')).toBeVisible();

    await page.getByRole('button', { name: /^Leads/i }).click();
    await expect(page.getByRole('heading', { name: /Captured Leads & Contacts/i })).toBeVisible();
    await expect(page.getByText('jane@example.com')).toBeVisible();

    await page.getByRole('button', { name: /^Plans/i }).click();
    await expect(page.getByRole('heading', { name: /Level Up Your Customer Support/i })).toBeVisible();

    await page.getByRole('button', { name: /^Dashboard/i }).click();
    await expect(page.getByText('acme.example.com')).toBeVisible();

    consoleTracker.assertNone();
  });

  test('the "Sign In" affordance is offered to guests', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });
});
