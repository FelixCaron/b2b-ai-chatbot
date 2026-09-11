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

// The bug this covers, as the customer experienced it: they subscribe to
// Business, and every time they click "Install" the app sends them to the
// pricing page to buy the plan they already pay for.
//
// The tenant row is what the gate reads, and the row is written by the Stripe
// webhook — so a webhook that never lands (wrong endpoint secret, test-vs-live
// mode, a handler that 500s, a subscription created by hand in the Stripe
// dashboard) is indistinguishable from "never paid". The gate no longer takes
// that row's word for it: before refusing, it reconciles with Stripe, which is
// the only place the truth actually lives.
test.describe('Dashboard — the install gate reconciles before it refuses', () => {
  const EXPIRED_TRIAL_ROW = {
    // What the row looks like when the purchase never made it home: still on
    // the self-serve trial it was created with, and that trial has now lapsed.
    plan: 'pro',
    plan_status: 'trialing',
    stripe_subscription_id: null,
    trial_ends_at: new Date(Date.now() - 86400000).toISOString(),
    stripe_customer_id: 'cus_test',
  };

  test.describe('when Stripe says the customer is subscribed', () => {
    test.use({
      authenticated: true,
      mockOverrides: {
        tenantPatch: EXPIRED_TRIAL_ROW,
        stripeSubscription: { plan: 'pro', plan_status: 'active', stripe_subscription_id: 'sub_test' },
      },
    });

    test('Install opens the install code, not the pricing wall', async ({ page, mock }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /^Install$/i }).first().click();

      // It asked Stripe rather than trusting the stale row...
      await expect
        .poll(() => mock.state.calls.some((c) => c.path === 'billing/checkout' && c.body?.action === 'sync'))
        .toBe(true);

      // ...and the paying customer gets what they paid for.
      await expect(page.getByRole('heading', { name: /Add your assistant to your website/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Subscribe to install/i })).toHaveCount(0);
      // The corrected state is written back, so the rest of the dashboard
      // (and the next click) stops disagreeing with Stripe too.
      expect(mock.db.tenants[0].plan_status).toBe('active');
      expect(mock.db.tenants[0].stripe_subscription_id).toBe('sub_test');
    });
  });

  test.describe('when Stripe has no subscription either', () => {
    test.use({
      authenticated: true,
      mockOverrides: { tenantPatch: EXPIRED_TRIAL_ROW, stripeSubscription: null },
    });

    test('Install still asks them to subscribe', async ({ page, mock }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /^Install$/i }).first().click();

      await expect
        .poll(() => mock.state.calls.some((c) => c.path === 'billing/checkout' && c.body?.action === 'sync'))
        .toBe(true);
      await expect(page.getByRole('heading', { name: /Subscribe to install/i })).toBeVisible();
    });
  });
});
