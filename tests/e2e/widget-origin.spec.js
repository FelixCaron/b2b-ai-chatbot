import { test, expect } from './support/test.js';

// The widget decides which API to call from the origin that served its own
// <script src>. That one line is what separates a preview deployment from
// production: get it wrong and every preview — and every customer's own test
// page — writes into the production database.
//
// It used to be a hardcoded production URL with a single escape hatch for
// hostnames containing "vercel.app", so preview.dorafi.logafi.com reached
// across into production. These tests pin the replacement.
test.describe('Embedded widget — which API it talks to', () => {
  test('calls the origin that served it, not the production constant', async ({ page, mock }) => {
    const initCalls = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/chat/init')) initCalls.push(req.url());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'acme.example.com' })).toBeVisible();
    await expect.poll(() => initCalls.length, { timeout: 5_000 }).toBeGreaterThan(0);

    const origin = new URL(page.url()).origin;
    for (const url of initCalls) {
      expect(new URL(url).origin, 'the widget must call its own origin').toBe(origin);
    }

    // mock-backend blocks the production host outright and records every
    // attempt, so this catches a reach-across even if the call never resolved.
    const blocked = mock.state.calls.filter((c) => c.type === 'blocked');
    expect(blocked, `nothing may reach production: ${JSON.stringify(blocked)}`).toEqual([]);
  });

  test('the embed snippet on the page is origin-relative', async ({ page }) => {
    await page.goto('/');
    const src = await page.getAttribute('script[data-tenant-key]', 'src');
    expect(src, 'an absolute src pins every deployment to one environment').toBe('/widget.iife.js');
  });

  test('the snippet handed to customers points at the app they are looking at', async ({ page }) => {
    // Dashboard.jsx builds this from window.location.origin, so a customer
    // copying it out of a preview gets a preview snippet, not a production one.
    await page.goto('/');
    const snippet = await page.evaluate(() => {
      const key = '00000000-0000-4000-8000-000000000001';
      return `<script async src="${window.location.origin}/widget.iife.js" data-tenant-key="${key}"></script>`;
    });
    expect(snippet).toContain(new URL(page.url()).origin);
    expect(snippet).not.toContain('dorafi.logafi.com');
  });
});
