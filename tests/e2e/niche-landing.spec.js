import { test, expect, trackConsoleErrors } from './support/test.js';
import { NICHES } from '../../dorafi/admin/src/content/niches.js';

// The /solutions/<slug> pages are static, zero-backend-dependency outreach
// pages: each must load directly (as a prospect following a link would hit
// it) and its CTAs must route into the real onboarding flow, without ever
// calling a live API itself.
//
// They are unlisted by design — reachable by link, not by browsing — so this
// also pins the two halves of that: the page asks not to be indexed, and
// nothing in the product links to it.
//
// Driven by the same list the app renders from, so a segment added in
// content/niches.js is covered here the moment it exists — no test to
// remember to write.
for (const niche of NICHES) {
  test.describe(`Niche landing — ${niche.label}`, () => {
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

      // Unlisted: findable by whoever was sent the link, not by search.
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        /noindex/i
      );

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

  test.describe(`Niche landing — ${niche.label} (no site yet)`, () => {
    // No site on the fixture tenant, so landing on 'dashboard' shows the
    // URL-paste onboarding hero rather than an existing site's dashboard.
    test.use({ mockOverrides: { db: { sites: [], leads: [], documents: [], site_summaries: [] } } });

    test('the hero CTA routes into the real onboarding form', async ({ page, mock }) => {
      await page.goto(niche.path);
      await page.getByRole('button', { name: niche.hero.primaryCta }).click();
      await expect(page.getByPlaceholder(/your-company\.com/i)).toBeVisible();
    });

    test('is not linked anywhere in the product — the link is the only door', async ({ page, mock }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Turn your website into an AI assistant/i })).toBeVisible();

      // Not in the footer (where it briefly was), and not anywhere else on
      // the page a customer lands on.
      await expect(page.getByRole('link', { name: niche.label })).toHaveCount(0);
      await expect(page.getByRole('button', { name: niche.label })).toHaveCount(0);
      await expect(page.locator(`a[href*="${niche.path}"]`)).toHaveCount(0);
    });
  });
}
