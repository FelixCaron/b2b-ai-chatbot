import { test, expect } from './support/test.js';

test.describe('Dashboard — settings & embed flows', () => {
  test('toggling lead capture in Advanced Settings persists the change', async ({ page, mock }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Show Settings/i }).click();

    const toggle = page.getByRole('switch', { name: /Toggle lead capture/i });
    await expect(toggle).toBeVisible();
    const before = mock.db.sites[0].enable_lead_capture;
    await expect(toggle).toHaveAttribute('aria-checked', String(before));

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', String(!before));
    expect(mock.db.sites[0].enable_lead_capture).toBe(!before);
  });

  test('adding a second website via the modal creates it and switches the site tabs', async ({ page, mock }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /\+ Add Website/i }).first().click();
    await expect(page.getByRole('heading', { name: /Add a New Website/i })).toBeVisible();

    await page.getByPlaceholder(/second-company\.com/i).fill('secondsite.example.com');
    await page.getByRole('button', { name: /Add & Learn Website/i }).click();

    await expect(page.getByRole('heading', { name: /Add a New Website/i })).not.toBeVisible({ timeout: 15_000 });
    expect(mock.db.sites.some((s) => s.domain === 'secondsite.example.com')).toBe(true);
    // With 2+ sites the multi-site tab selector should now be visible.
    await expect(page.getByText('Websites:')).toBeVisible();
  });
});

// Guests clicking "Install" get redirected to sign in first (real,
// correct app behavior — see Dashboard.jsx's `isGuest ? onRequireLogin() :
// ...`), so this flow needs an authenticated session to actually be reachable.
test.describe('Dashboard — embed flow (authenticated)', () => {
  test.use({ authenticated: true });

  test('Install modal shows a minimal snippet carrying only the site public key', async ({ page, mock, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.goto('/');

    await page.getByRole('button', { name: /^Install$/i }).first().click();
    await expect(page.getByRole('heading', { name: /Add your assistant to your website/i })).toBeVisible();

    const snippet = page.locator('pre');
    await expect(snippet).toContainText('widget.iife.js');
    await expect(snippet).toContainText(mock.db.sites[0].public_key);
    // Everything else (API URL, theme color, "Powered by" branding) is
    // resolved by the widget itself at load time — from its own production
    // default and a live /chat/init read — never baked into the snippet.
    await expect(snippet).not.toContainText('data-api-url');
    await expect(snippet).not.toContainText('data-theme-color');
    await expect(snippet).not.toContainText('data-hide-branding');

    await page.getByRole('button', { name: /Copy Code/i }).click();
    await expect(page.getByRole('button', { name: /^Copied$/ })).toBeVisible();
  });
});
