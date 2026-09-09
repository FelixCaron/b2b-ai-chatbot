import { test, expect, trackConsoleErrors } from './support/test.js';
import { NICHES } from '../../apps/admin/src/content/niches.js';

// The /solutions/<slug> pages are static, zero-backend-dependency marketing
// pages: each must load directly (as a real visitor or a search engine would
// hit it) and its CTAs must route into the real onboarding flow, without ever
// calling a live API itself.
//
// Driven by the same content list the app renders from, so a segment added in
// content/niches.js is covered here the moment it exists — no test to
// remember to write.
for (const niche of NICHES) {
  test.describe(`Niche landing — ${niche.navLabel}`, () => {
    test('loads directly at its URL with its own headline, demo preview and SEO title', async ({ page, mock }) => {
      const consoleTracker = trackConsoleErrors(page);
      await page.goto(niche.path);

      await expect(page.getByRole('heading', { name: niche.hero.titleAccent })).toBeVisible();
      await expect(page.getByText(niche.badge.text)).toBeVisible();

      // Scripted demo conversation renders progressively — the first question
      // must appear with no network call (this page has no live widget).
      await expect(page.getByText(niche.demo.exchange[0].q)).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(niche.demo.assistantLabel)).toBeVisible();

      await expect(page).toHaveTitle(niche.seoTitle);

      consoleTracker.assertNone();
    });

    test('"Voir les tarifs" routes to the Pricing view', async ({ page, mock }) => {
      await page.goto(niche.path);
      await page.getByRole('button', { name: /Voir les tarifs/i }).click();
      await expect(page.getByRole('heading', { name: /Turn Website Visitors Into Customers/i })).toBeVisible();
    });

    test('no horizontal overflow on mobile viewport', async ({ page, mock }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(niche.path);
      await expect(page.getByRole('heading', { name: niche.hero.titleAccent })).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  });

  test.describe(`Niche landing — ${niche.navLabel} (no site yet)`, () => {
    // No site on the fixture tenant, so landing on 'dashboard' shows the
    // URL-paste onboarding hero rather than an existing site's dashboard.
    test.use({ mockOverrides: { db: { sites: [], leads: [], documents: [], site_summaries: [] } } });

    test('the hero CTA routes into the real onboarding form', async ({ page, mock }) => {
      await page.goto(niche.path);
      await page.getByRole('button', { name: niche.hero.primaryCta }).click();
      await expect(page.getByPlaceholder(/your-company\.com/i)).toBeVisible();
    });

    test('is reachable from the footer, not just by knowing the URL', async ({ page, mock }) => {
      await page.goto('/');
      await page.getByRole('contentinfo').getByRole('button', { name: niche.navLabel }).click();
      await expect(page.getByRole('heading', { name: niche.hero.titleAccent })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${niche.path}$`));
    });
  });
}
