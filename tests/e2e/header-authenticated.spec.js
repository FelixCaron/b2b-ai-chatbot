import { test, expect, trackConsoleErrors } from './support/test.js';

// The guest (anonymous) header is covered in navigation.spec.js. This file
// covers the full <Header> shown to signed-in users — tenant selector, plan
// badge, Upgrade/Manage button, and the About tab that guests never see.
test.describe('Full header (authenticated user)', () => {
  test.use({ authenticated: true });

  test('shows the tenant selector, plan badge, and all four nav tabs including About', async ({ page, mock }) => {
    const consoleTracker = trackConsoleErrors(page);
    await page.goto('/');

    await expect(page.getByText('Secure Workspace')).toBeVisible();
    // The tenant name lives inside a <select><option> — real and present in
    // the DOM, but Playwright correctly reports plain <option> elements as
    // not independently "visible" (they only render when the dropdown is
    // open), so assert on selected value / option content instead.
    await expect(page.locator('select option:checked')).toHaveText(mock.db.tenants[0].name);
    // Plan badge reflects the fixture tenant's plan (scoped via its title
    // attribute — a loose text match like /pro/i also matches unrelated
    // copy elsewhere on the page, e.g. "prospect captured").
    await expect(page.locator(`[title^="Plan "]`)).toContainText(new RegExp(mock.db.tenants[0].plan, 'i'));

    for (const tab of [/^Dashboard/i, /^Leads/i, /^Plans/i, /^About/i]) {
      await expect(page.getByRole('button', { name: tab })).toBeVisible();
    }

    await page.getByRole('button', { name: /^About/i }).click();
    await expect(page.getByRole('heading', { name: /Pioneering the Future of/i })).toBeVisible();

    consoleTracker.assertNone();
  });

  test('sign out returns the user to the guest experience', async ({ page, mock }) => {
    // `mock` must be destructured even though the body doesn't touch it
    // directly — Playwright fixtures are lazy, and it's the `mock` fixture
    // that actually installs the network mocks + seeds the authenticated
    // session (via test.use({ authenticated: true }) above). Without it in
    // the signature here, this test would hit the real (nonexistent) backend.
    await page.goto('/');
    await expect(page.getByTitle('Sign out')).toBeVisible();
    await page.getByTitle('Sign out').click();
    // Signing out drops back to an anonymous session, so the lightweight
    // guest header (with its own "Sign In" affordance) takes over.
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible({ timeout: 10_000 });
  });
});
