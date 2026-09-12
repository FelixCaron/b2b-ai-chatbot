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

});

// The default fixture tenant is on 'pro' ("Business"), which as of the
// 2026-09-09 repricing covers only 1 site (packages/contracts/src/plans.js)
// — same as 'basic'. Adding a *second* site needs a plan with room for one,
// so this test runs against 'premium' ("Pro", 3 sites) instead.
test.describe('Dashboard — settings & embed flows (multi-site plan)', () => {
  test.use({ mockOverrides: { tenantPatch: { plan: 'premium' } } });

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

  // Once the widget has actually been seen loading on the customer's own
  // domain, the install call-to-action has done its job and gets out of the
  // way — an owner who already pasted the snippet does not need a button
  // telling them to paste it. The code itself stays reachable from Settings,
  // for the day the site is rebuilt.
  test.describe('when the widget has already been seen on the site', () => {
    // Stamped on the live fixture rather than passed as an override: the
    // default site's id is generated inside the mock and every other fixture
    // points at it, so replacing the row wholesale would break them.
    // Three days ago on purpose: this is the case that used to be wrong. A
    // site installed weeks back with no visitor in the last ten minutes was
    // reported as "not installed yet" and told to go install it again.
    test.beforeEach(async ({ mock }) => {
      mock.db.sites[0].widget_last_seen_at = new Date(Date.now() - 3 * 86400000).toISOString();
    });

    test('the install button is gone, and the snippet lives in Settings', async ({ page, mock }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'acme.example.com' })).toBeVisible();

      await expect(page.getByRole('button', { name: /Add it to my website/i })).toHaveCount(0);
      await expect(page.getByText(/Installed on your website/i).first()).toBeVisible();

      await page.getByRole('button', { name: /Show Settings/i }).click();
      await page.getByRole('button', { name: /Show install code/i }).click();
      await expect(page.locator('pre')).toContainText(mock.db.sites[0].public_key);
    });
  });

  test('Install modal shows a minimal snippet carrying only the site public key', async ({ page, mock, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.goto('/');

    await page.getByRole("button", { name: /Add it to my website/i }).first().click();
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
