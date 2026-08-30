import { test, expect } from './support/test.js';

// Regression coverage for a real bug: the backend streams a navigate_to
// tool_call event as a flat payload ({ name, page }), but the widget was
// dispatching it verbatim as the window event's `detail` - and App.jsx's
// listener destructures `{ name, args }`, reading `args.page`. Since the
// payload had no `args` key, the condition was always false and
// setCurrentView never ran. The model still received a synthetic "tool"
// result claiming success and truthfully narrated it to the user ("I've
// opened our About Us page for you") - so the copilot lied about an action
// that silently did nothing. Fixed in apps/widget/src/chat.js by
// normalizing the event shape before dispatching.
test.describe('Admin Copilot — navigate_to tool call', () => {
  test('asking to see the About page actually navigates there, not just claims to', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByText('acme.example.com')).toBeVisible();

    const host = page.locator('#b2b-chatbot-host');
    await host.locator('#b2b-launcher').click();
    await expect(host.locator('#b2b-panel')).toHaveClass(/active/);

    const input = host.locator('#b2b-input');
    await input.fill('Have a about us page I can read?');
    await host.locator('#b2b-send-btn').click();

    // The bug: this text reply would show up while the page underneath
    // never actually changed. Assert the real navigation, not just the
    // bot's claim of it.
    await expect(page.getByRole('heading', { name: /Pioneering the Future of/i })).toBeVisible();
  });
});
