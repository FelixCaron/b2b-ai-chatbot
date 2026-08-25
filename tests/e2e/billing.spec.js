import { test, expect, clickGuestNavButton } from './support/test.js';

// Regression coverage for an IDOR fixed in api/billing/checkout.js and
// api/billing/portal.js: neither endpoint verified the caller actually owned
// the tenantId in the request body, so anyone who knew/guessed a tenantId
// could point that tenant's Stripe customer at themselves, or open a
// DIFFERENT tenant's billing portal (invoices, payment methods, cancel).
// The fix requires an Authorization header server-side; this suite checks
// the frontend actually sends one on both calls.
test.describe('Billing — checkout & portal send auth', () => {
  test('selecting a plan sends an Authorization header to /api/billing/checkout', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByText('acme.example.com')).toBeVisible();
    await clickGuestNavButton(page, /^Plans/i);
    await expect(page.getByRole('heading', { name: /Level Up Your Customer Support/i })).toBeVisible();

    // Fixture tenant is on 'pro', so the 'basic' plan button is clickable
    // (not the disabled "Active Plan" state).
    await page.locator('#plan-btn-basic').click();

    await expect.poll(() => mock.state.calls.some((c) => c.path === 'billing/checkout')).toBe(true);
    const call = mock.state.calls.find((c) => c.path === 'billing/checkout');
    expect(call.authHeader).toMatch(/^Bearer .+/);
  });
});

test.describe('Billing — Manage Subscription (authenticated)', () => {
  test.use({ authenticated: true });

  test('"Manage" sends an Authorization header to /api/billing/portal', async ({ page, mock }) => {
    await page.goto('/');
    await page.locator('#manage-subscription-btn').click();

    await expect.poll(() => mock.state.calls.some((c) => c.path === 'billing/portal')).toBe(true);
    const call = mock.state.calls.find((c) => c.path === 'billing/portal');
    expect(call.authHeader).toMatch(/^Bearer .+/);
  });
});
