import { test, expect } from './support/test.js';

// Dedicated regression coverage for the bug fixed in widget.css:
// #b2b-chatbot-container (the admin's own embedded Copilot widget, loaded
// unconditionally by apps/admin/index.html — the exact same widget.css every
// customer site embeds) is `position: fixed` with only bottom/right set, so
// its box sizes itself to its flex content. Because the closed chat panel
// stays in flex layout (hidden only via opacity), the "closed" container's
// box actually spans a large invisible rectangle stretching well past the
// small round launcher bubble — and used to swallow every click landing in
// that empty space instead of passing it through to the page underneath.
test.describe('Floating Copilot widget — click-through integrity', () => {
  test('while closed, clicks anywhere under the widget wrapper reach the real page element, not the widget host', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByText('acme.example.com')).toBeVisible();

    const containerBox = await page.evaluate(() => {
      const host = document.getElementById('b2b-chatbot-host');
      const container = host?.shadowRoot?.querySelector('#b2b-chatbot-container');
      if (!container) return null;
      const r = container.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    expect(containerBox, 'the widget host/container should exist on the page').not.toBeNull();

    // Sample a grid of points across the widget wrapper's box — including
    // its empty top-left corner, which is exactly where the old bug bit —
    // and confirm none of them resolve to the widget host when the panel is
    // closed (only the small launcher bubble itself should be "live").
    const samples = await page.evaluate(({ box }) => {
      const host = document.getElementById('b2b-chatbot-host');
      const launcher = host?.shadowRoot?.querySelector('#b2b-launcher');
      const launcherRect = launcher?.getBoundingClientRect();
      const points = [];
      for (const fx of [0.05, 0.5, 0.95]) {
        for (const fy of [0.05, 0.5, 0.95]) {
          points.push({ x: box.x + box.width * fx, y: box.y + box.height * fy });
        }
      }
      return points.map(({ x, y }) => {
        const isInsideLauncher =
          launcherRect &&
          x >= launcherRect.x && x <= launcherRect.x + launcherRect.width &&
          y >= launcherRect.y && y <= launcherRect.y + launcherRect.height;
        const el = document.elementFromPoint(x, y);
        return { x, y, isInsideLauncher, topElementIsWidgetHost: el?.id === 'b2b-chatbot-host' };
      });
    }, { box: containerBox });

    for (const sample of samples) {
      if (sample.isInsideLauncher) continue; // the launcher itself is *supposed* to catch its own clicks
      expect(
        sample.topElementIsWidgetHost,
        `point (${Math.round(sample.x)}, ${Math.round(sample.y)}) outside the launcher resolved to the widget host — it should pass through to the page`
      ).toBe(false);
    }
  });

  test('the launcher still opens the panel, and the panel is still interactive', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByText('acme.example.com')).toBeVisible();

    // Playwright locators pierce open shadow roots by default, so a plain
    // CSS locator chain reaches into the widget's shadow DOM directly.
    const launcherLocator = page.locator('#b2b-chatbot-host').locator('#b2b-launcher');
    await expect(launcherLocator).toBeVisible();
    await launcherLocator.click();

    const panelLocator = page.locator('#b2b-chatbot-host').locator('#b2b-panel');
    await expect(panelLocator).toHaveClass(/active/);

    const chatInput = page.locator('#b2b-chatbot-host').locator('#b2b-input');
    await expect(chatInput).toBeVisible();
    await chatInput.fill('Hello there');
    await expect(chatInput).toHaveValue('Hello there');

    const closeBtn = page.locator('#b2b-chatbot-host').locator('#b2b-close-btn');
    await closeBtn.click();
    await expect(panelLocator).not.toHaveClass(/active/);
  });
});
