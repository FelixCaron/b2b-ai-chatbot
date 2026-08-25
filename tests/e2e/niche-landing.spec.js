import { test, expect, trackConsoleErrors } from './support/test.js';

// The osteopathy niche landing page (/solutions/osteopathes) is a static,
// zero-backend-dependency marketing page: it must load directly (as a real
// visitor / search engine would hit it) and its CTAs must route into the
// real onboarding flow, without ever calling a live API itself.
test.describe('Niche landing — Ostéopathes', () => {
  test('loads directly at its URL with the right headline and demo preview, no console errors', async ({
    page,
    mock,
  }) => {
    const consoleTracker = trackConsoleErrors(page);
    await page.goto('/solutions/osteopathes');

    await expect(page.getByRole('heading', { name: /répond à vos patients/i })).toBeVisible();
    await expect(page.getByText(/Pensé pour les ostéopathes/i)).toBeVisible();

    // Scripted demo conversation renders progressively — first question bubble
    // should appear without any network call (this page has no live widget).
    await expect(page.getByText(/première consultation est différente/i)).toBeVisible({ timeout: 5000 });

    await expect(page).toHaveTitle(/ostéopathes/i);

    consoleTracker.assertNone();
  });

  test('"Voir les tarifs" routes to the Pricing view', async ({ page, mock }) => {
    await page.goto('/solutions/osteopathes');
    await page.getByRole('button', { name: /Voir les tarifs/i }).click();
    await expect(page.getByRole('heading', { name: /Level Up Your Customer Support/i })).toBeVisible();
  });

  test('no horizontal overflow on mobile viewport', async ({ page, mock }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/solutions/osteopathes');
    await expect(page.getByRole('heading', { name: /répond à vos patients/i })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});

test.describe('Niche landing — Ostéopathes (no site yet)', () => {
  // No site on the fixture tenant, so landing on 'dashboard' shows the
  // URL-paste onboarding hero rather than an existing site's dashboard.
  test.use({ mockOverrides: { db: { sites: [], leads: [], documents: [], site_summaries: [] } } });

  test('"Essayer avec le site de ma clinique" routes into the real onboarding form', async ({ page, mock }) => {
    await page.goto('/solutions/osteopathes');
    await page.getByRole('button', { name: /Essayer avec le site de ma clinique/i }).click();
    await expect(page.getByPlaceholder(/your-company\.com/i)).toBeVisible();
  });
});
