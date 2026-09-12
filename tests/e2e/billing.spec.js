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

// What a plan buys is the assistant APPEARING on the website — not the install
// code, which is free to take and paste at any time. Two things follow, and
// both used to be the other way round:
//
//  1. "Install" never refuses. It hands over the snippet and, when the
//     workspace is inactive, says plainly that the assistant stays invisible
//     until it is activated.
//  2. Before the dashboard tells an owner they are inactive, it reconciles
//     with Stripe — the tenant row is written by a webhook, and a webhook that
//     never lands looks exactly like "never paid" (the bug a Business customer
//     hit: every click on Install sent them to the pricing page).
test.describe('Dashboard — the paywall is activation, not installation', () => {
  const EXPIRED_TRIAL_ROW = {
    // What the row looks like when a purchase never made it home: still on the
    // self-serve trial the workspace was created with, and that trial lapsed.
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

    test('the stale row is corrected from Stripe, and nothing asks them to activate', async ({ page, mock }) => {
      await page.goto('/');

      // It asked Stripe rather than trusting the stale row...
      await expect
        .poll(() => mock.state.calls.some((c) => c.path === 'billing/checkout' && c.body?.action === 'sync'))
        .toBe(true);
      // ...and wrote the answer back, so the rest of the dashboard agrees too.
      await expect.poll(() => mock.db.tenants[0].plan_status).toBe('active');

      // A paying customer is never told their assistant is dark.
      await expect(page.getByRole('button', { name: /Activate on my website/i })).toHaveCount(0);

      await page.getByRole("button", { name: /Add it to my website/i }).first().click();
      await expect(page.getByRole('heading', { name: /Add your assistant to your website/i })).toBeVisible();
      await expect(page.getByText(/Paste it now/i)).toHaveCount(0);
    });
  });

  test.describe('when Stripe has no subscription either', () => {
    test.use({
      authenticated: true,
      mockOverrides: { tenantPatch: EXPIRED_TRIAL_ROW, stripeSubscription: null },
    });

    test('the install code is still handed over, with the activation truth attached', async ({ page, mock, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
      await page.goto('/');

      await expect
        .poll(() => mock.state.calls.some((c) => c.path === 'billing/checkout' && c.body?.action === 'sync'))
        .toBe(true);

      // The install modal opens for an inactive workspace — no wall in front
      // of it — and carries the real snippet.
      await page.getByRole("button", { name: /Add it to my website/i }).first().click();
      await expect(page.getByRole('heading', { name: /Add your assistant to your website/i })).toBeVisible();
      await expect(page.locator('pre')).toContainText(mock.db.sites[0].public_key);
      // ...and says what pasting it will (not) do yet.
      await expect(page.getByText(/Paste it now/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Activate my assistant/i })).toBeVisible();

      // The dashboard itself is honest about the state, and offers the way
      // out. This site isn't installed yet either, so installing is the lead
      // action and activating waits its turn in the secondary row — one
      // call-to-action at a time (SiteHeroCard's primaryAction).
      await page.getByRole('button', { name: /^Close$|^Done$/i }).first().click();
      await expect(page.getByText(/does not appear on your website yet/i)).toBeVisible();
      await page.getByRole('button', { name: /^Activate$/i }).click();
      await expect(page.getByRole('heading', { name: /Activate your assistant on/i })).toBeVisible();
    });
  });
});
