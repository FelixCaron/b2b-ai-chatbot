import { test, expect, trackConsoleErrors } from './support/test.js';

// Start every test in this file from a fresh tenant with no sites yet, so
// the onboarding hero (not the dashboard) is what renders on load.
test.use({ mockOverrides: { db: { sites: [], leads: [], documents: [], site_summaries: [] } } });

test.describe('Onboarding — website URL field', () => {
  test('renders the onboarding hero when the tenant has no sites', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Turn your website into an AI assistant/i })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: /Learning |Your assistant is ready/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Your assistant is ready/i })).toBeVisible({ timeout: 20_000 });

    // The new site should now exist in our mocked backend.
    const newSite = mock.db.sites.find((s) => s.domain === 'newclient.example.com');
    expect(newSite).toBeTruthy();
  });

  test('the first click starts one loading state, not two at once', async ({ page }) => {
    // Hold the first backend call open so the in-flight state is observable
    // at all — everything the mock answers instantly otherwise.
    await page.route('**/api/chat/theme', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ primary_color: '#4f46e5', org_name: 'Acme Corp' }),
      });
    });

    await page.goto('/');
    await page.getByPlaceholder(/your-company\.com/i).fill('newclient.example.com');

    const card = page.locator('form').first().locator('xpath=..');
    await page.getByRole('button', { name: /Create My AI Assistant/i }).click();

    // The button narrates the step it is on...
    await expect(card.getByRole('button', { name: /Reading your website/i })).toBeVisible();
    // ...once. Pressing the button used to light up two loading states side
    // by side: a generic one in the button and a second, differently-worded
    // status line under it, which read as two things happening at once.
    await expect(card.getByText(/Reading your website/i)).toHaveCount(1);
    await expect(card.locator('.animate-spin')).toHaveCount(1);
  });
});
