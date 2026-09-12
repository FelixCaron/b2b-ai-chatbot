import { test, expect, trackConsoleErrors } from './support/test.js';
import { LOGAFI_URL } from './support/logafi-site.js';

// ─────────────────────────────────────────────────────────────────────────
// apps/logafi — the parent company's site, its own Vercel project on its own
// domain (logafi.com). It shares this repository with Dorafi and nothing
// else: no build step, no framework, no backend call, so these tests run
// against the directory served as-is, exactly what Vercel returns.
//
// What they pin is what would rot unnoticed: the page still loads standalone,
// the bilingual toggle still swaps both ways, the phone layout still holds,
// and the two products stay pointed at each other's real addresses.
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

test.describe('logafi — parent company site', () => {
  test('loads standalone at the site root, with its logo and credential', async ({ page }) => {
    const consoleTracker = trackConsoleErrors(page);
    await stubWebFonts(page);
    await page.goto(LOGAFI_URL);

    // Nothing of the Dorafi SPA belongs here — no mount point, no bundle.
    await expect(page.locator('#root')).toHaveCount(0);

    await expect(page).toHaveTitle(/logafi/);
    await expect(page.getByRole('banner').getByRole('img', { name: 'logafi' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'SnowPro Advanced: Architect' })).toBeVisible();

    // Its own domain, its own canonical: this project must never claim, or be
    // claimed by, dorafi.logafi.com.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://logafi.com/');

    consoleTracker.assertNone();
  });

  test('every asset it references actually resolves', async ({ page }) => {
    const missing = [];
    page.on('response', (response) => {
      if (response.url().startsWith(LOGAFI_URL) && response.status() >= 400) {
        missing.push(`${response.status()} ${response.url()}`);
      }
    });
    await stubWebFonts(page);
    await page.goto(LOGAFI_URL, { waitUntil: 'networkidle' });

    // The footer logo is the one below the fold, so scroll it into view before
    // concluding that everything loaded.
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');

    expect(missing, `Assets the page asks for but the site does not serve:\n${missing.join('\n')}`).toEqual([]);
    // Both logo files decode — a broken PNG is a 200 too.
    for (const img of await page.locator('img').all()) {
      expect(await img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
    }
  });

  test('the FR/EN toggle swaps the copy both ways', async ({ page }) => {
    await stubWebFonts(page);
    await page.goto(LOGAFI_URL);

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
    await page.goto(LOGAFI_URL);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test('the two sites point at each other', async ({ page, mock }) => {
    await stubWebFonts(page);
    await page.goto(LOGAFI_URL);
    await expect(page.getByRole('link', { name: /dorafi\.logafi\.com/i })).toHaveAttribute(
      'href',
      'https://dorafi.logafi.com'
    );

    // And back: Dorafi's footer is the only place in the product that names
    // the parent company. Different deployment, so an absolute URL.
    await page.goto('/');
    await expect(page.getByRole('link', { name: /logafi/i })).toHaveAttribute('href', 'https://logafi.com');
  });
});

// A visitor whose browser is French gets French without touching the toggle —
// same rule as the Dorafi app's i18n (apps/admin/src/i18n/LanguageContext.jsx).
test.describe('logafi — parent company site (French browser)', () => {
  test.use({ locale: 'fr-CA' });

  test('defaults to French', async ({ page }) => {
    await stubWebFonts(page);
    await page.goto(LOGAFI_URL);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Concevoir, migrer et optimiser/i);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});
