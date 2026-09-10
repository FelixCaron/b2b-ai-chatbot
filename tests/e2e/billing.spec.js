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
    await expect(page.getByRole('heading', { name: 'acme.example.com' })).toBeVisible();
    await clickGuestNavButton(page, /^Plans/i);
    await expect(page.getByRole('heading', { name: /Turn Website Visitors Into Customers/i })).toBeVisible();

    // Fixture tenant is on 'pro', so the 'basic' plan button is clickable
    // (not the disabled "Active Plan" state).
    await page.locator('#plan-btn-basic').click();

    await expect.poll(() => mock.state.calls.some((c) => c.path === 'billing/checkout')).toBe(true);
    const call = mock.state.calls.find((c) => c.path === 'billing/checkout');
    expect(call.authHeader).toMatch(/^Bearer .+/);
  });
});

test.describe('Billing — Manage Subscription (authenticated)', () => {
  // The "Manage" button (→ Stripe billing portal) only renders for a tenant
  // with a real Stripe subscription — a self-serve trial is active but has no
  // subscription yet and sees "Upgrade / Plans" instead (see AppHeader's
  // hasStripeBilling gate). Seed a real subscription so the portal button is
  // present for this test.
  test.use({
    authenticated: true,
    mockOverrides: {
      tenantPatch: { stripe_customer_id: 'cus_test', stripe_subscription_id: 'sub_test' },
    },
  });

  test('"Manage" sends an Authorization header to /api/billing/portal', async ({ page, mock }) => {
    await page.goto('/');
    await page.locator('#manage-subscription-btn').click();

    await expect.poll(() => mock.state.calls.some((c) => c.path === 'billing/portal')).toBe(true);
    const call = mock.state.calls.find((c) => c.path === 'billing/portal');
    expect(call.authHeader).toMatch(/^Bearer .+/);
  });
});
