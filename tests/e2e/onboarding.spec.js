import { test, expect, trackConsoleErrors } from './support/test.js';

// Start every test in this file from a fresh tenant with no sites yet, so
// the onboarding hero (not the dashboard) is what renders on load.
test.use({ mockOverrides: { db: { sites: [], leads: [], documents: [], site_summaries: [] } } });

test.describe('Onboarding — website URL field', () => {
  test('renders the onboarding hero when the tenant has no sites', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Deploy Your AI Assistant/i })).toBeVisible();
    await expect(page.getByPlaceholder(/your-company\.com/i)).toBeVisible();
  });

  test('the URL field accepts a tap+type anywhere across its width, including near the leading icon', async ({ page }) => {
    // Regression test: #b2b-chatbot-container (the admin's own floating
    // Copilot widget) used to be an invisible box covering most of the
    // viewport even while closed, silently swallowing taps that landed on
    // it instead of the field underneath. Also covers the earlier
    // (unrelated but real) bug where a decorative absolutely-positioned
    // icon without pointer-events:none could eat clicks meant for the input.
    await page.goto('/');
    const input = page.getByPlaceholder(/your-company\.com/i);
    await expect(input).toBeVisible();
    const box = await input.boundingBox();
    expect(box).not.toBeNull();

    // Tap near the very left edge, right where the leading Globe icon sits.
    await page.touchscreen.tap(box.x + 14, box.y + box.height / 2).catch(() => {});
    await input.click({ position: { x: 14, y: box.height / 2 } });
    await page.keyboard.type('example.com');
    await expect(input).toHaveValue('example.com');

    // Confirm elementFromPoint at that exact spot resolves inside the input
    // itself, not to some unrelated overlay/host element.
    const topElementIsInput = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.tagName === 'INPUT';
    }, { x: box.x + 14, y: box.y + box.height / 2 });
    expect(topElementIsInput).toBe(true);
  });

  test('submitting a URL runs the crawl/index pipeline to completion', async ({ page, mock }) => {
    await page.goto('/');
    const input = page.getByPlaceholder(/your-company\.com/i);
    await input.fill('newclient.example.com');
    await page.getByRole('button', { name: /Create My AI Assistant/i }).click();

    // Learning/progress modal should appear and eventually complete.
    await expect(page.getByText(/Teaching Your AI from|Your AI Assistant is Ready/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Your AI Assistant is Ready/i)).toBeVisible({ timeout: 20_000 });

    // The new site should now exist in our mocked backend.
    const newSite = mock.db.sites.find((s) => s.domain === 'newclient.example.com');
    expect(newSite).toBeTruthy();
  });
});
