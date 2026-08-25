import { test, expect, trackConsoleErrors } from './support/test.js';

// A sweep across common device widths, checking that nothing in the app
// forces horizontal page scroll (the #1 "this looks broken on my phone"
// symptom) and that navigating between the views guests can reach doesn't
// throw. This is not pixel-perfect visual testing — it's a fast, cheap
// integrity net that catches "a fixed-width element blew out the layout" or
// "a click target went missing/unclickable" regressions.
const VIEWPORTS = [
  { name: 'iPhone SE (320x568)', width: 320, height: 568 },
  { name: 'iPhone 13 (390x844)', width: 390, height: 844 },
  { name: 'Large Android (414x896)', width: 414, height: 896 },
  { name: 'iPad (768x1024)', width: 768, height: 1024 },
  { name: 'Desktop (1280x800)', width: 1280, height: 800 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`Responsive integrity — ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('dashboard, leads, and pricing views have no horizontal overflow and no console errors', async ({ page, mock }) => {
      const consoleTracker = trackConsoleErrors(page);
      await page.goto('/');
      await expect(page.getByText('acme.example.com')).toBeVisible();
      await assertNoHorizontalOverflow(page, 'dashboard');

      await page.getByRole('button', { name: /^Leads/i }).click();
      await expect(page.getByRole('heading', { name: /Captured Leads & Contacts/i })).toBeVisible();
      await assertNoHorizontalOverflow(page, 'leads');

      await page.getByRole('button', { name: /^Plans/i }).click();
      await expect(page.getByRole('heading', { name: /Level Up Your Customer Support/i })).toBeVisible();
      await assertNoHorizontalOverflow(page, 'pricing');

      consoleTracker.assertNone();
    });

    test('every primary action button on the dashboard has a real, on-screen, tappable hit target', async ({ page, mock }) => {
      await page.goto('/');
      await expect(page.getByText('acme.example.com')).toBeVisible();

      const buttonNames = [/Test Live Assistant/i, /Embed Widget/i, /Show Settings/i, /\+ Add Website/i, /^Delete$/];
      for (const name of buttonNames) {
        const button = page.getByRole('button', { name }).first();
        await expect(button).toBeVisible();
        const box = await button.boundingBox();
        expect(box, `${name} should have a layout box`).not.toBeNull();
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        // Fully inside the viewport horizontally — nothing bleeding off-screen.
        expect(box.x).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      }
    });
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${label} view: page content (scrollWidth=${overflow.scrollWidth}) overflows the viewport (clientWidth=${overflow.clientWidth})`
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}
