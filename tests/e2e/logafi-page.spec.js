import { test, expect, trackConsoleErrors } from './support/test.js';

// ─────────────────────────────────────────────────────────────────────────
// apps/admin/public/logafi.html — the parent company's own page.
//
// It ships inside this deployment but shares none of the app's code: a plain
// static file, no React, no Supabase, no /api call. These tests pin the two
// things that are easy to break from the outside: that /logafi actually
// reaches the static file instead of falling through to the SPA (the rewrite
// in vercel.json, mirrored by apps/admin/vite.config.js for the dev server),
// and that the bilingual toggle still swaps both directions.
// ─────────────────────────────────────────────────────────────────────────

/** The page pulls Inter/Poppins from Google Fonts. Answering that request
 *  locally keeps these tests independent of outbound network access (and of
 *  Google being up), instead of letting a failed stylesheet show up as a
 *  console error the assertions would have to tolerate. */
async function stubWebFonts(page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' })
  );
}

test.describe('logafi — parent company page', () => {
  test('/logafi serves the static company page, not the Dorafi app', async ({ page }) => {
    const consoleTracker = trackConsoleErrors(page);
    await stubWebFonts(page);
    await page.goto('/logafi');

    // The SPA's mount point is the tell: if the rewrite ever stops matching,
    // the catch-all answers with index.html and this page becomes the app.
    await expect(page.locator('#root')).toHaveCount(0);

    await expect(page).toHaveTitle(/logafi/);
    await expect(page.getByRole('banner').getByRole('img', { name: 'logafi' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'SnowPro Advanced: Architect' })).toBeVisible();

    // The whole reason the page exists on this deployment: it points back at
    // the product it is the parent of.
    await expect(page.getByRole('link', { name: /dorafi\.logafi\.com/i })).toHaveAttribute(
      'href',
      'https://dorafi.logafi.com'
    );

    consoleTracker.assertNone();
  });

  test('the FR/EN toggle swaps the copy both ways', async ({ page }) => {
    await stubWebFonts(page);
    await page.goto('/logafi');

    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Design, migrate and optimize/i);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.getByRole('button', { name: 'FR' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Concevoir, migrer et optimiser/i);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('no horizontal overflow on a phone viewport', async ({ page }) => {
    await stubWebFonts(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/logafi');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test('the Dorafi footer links to it', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /logafi/i })).toHaveAttribute('href', '/logafi');
  });
});

// A visitor whose browser is French gets French without touching the toggle —
// same rule as the app's own i18n (apps/admin/src/i18n/LanguageContext.jsx).
test.describe('logafi — parent company page (French browser)', () => {
  test.use({ locale: 'fr-CA' });

  test('defaults to French', async ({ page }) => {
    await stubWebFonts(page);
    await page.goto('/logafi');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Concevoir, migrer et optimiser/i);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});
