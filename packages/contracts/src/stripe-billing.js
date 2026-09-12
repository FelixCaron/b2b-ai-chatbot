// ---------------------------------------------------------------------------
// Stripe subscription → a tenant's billing columns.
//
// One mapping, shared by both halves of the billing loop: the webhook (Stripe
// tells us something changed) and the reconcile path in api/billing/checkout.js
// (we ask Stripe what is true). They must agree — a tenant whose row says
// `plan_status: 'trialing'` while Stripe says 'active' is a paying customer
// whose assistant stops appearing on their own website (resolveTenantPlan's
// widgetActive reads these very columns), which is exactly the failure this
// file exists to stop repeating.
//
// It lives in contracts rather than under /api for the same reason
// resolveTenantPlan() does (see plans.js): a new file under /api counts against
// the Vercel Hobby serverless-function cap this project sits exactly at, and
// the logic has to stay identical on both sides regardless.
//
// Everything here is pure — a plain Stripe subscription object in, plain column
// values out. No SDK, no network, no env reads (price ids are passed in).
// ---------------------------------------------------------------------------

/** Stripe statuses that mean "this account is subscribed right now".
 *  'past_due' is included deliberately: the subscription still exists and
 *  Stripe is still retrying the card, so the tenant is a customer in a dunning
 *  window, not a cancelled one. What that status *unlocks* is the caller's
 *  decision (hasActivePlan() in the admin app gates the install snippet on
 *  'active'/'trialing' only) — this set answers the narrower question of
 *  whether Stripe is still tracking a subscription for them at all. */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function isLiveSubscriptionStatus(status) {
  return LIVE_STATUSES.has(status);
}

/** The live subscription among a customer's subscriptions, if any. A customer
 *  can carry old cancelled ones (and, before this fix's double-checkout guard,
 *  more than one live one) — prefer the most recently created live one. */
export function pickLiveSubscription(subscriptions = []) {
  const live = subscriptions.filter((sub) => isLiveSubscriptionStatus(sub?.status));
  if (live.length === 0) return null;
  return live.sort((a, b) => (b?.created || 0) - (a?.created || 0))[0];
}

/**
 * Which plan slug a Stripe price id sells.
 *
 * @param {string|null} priceId
 * @param {Record<string, string|undefined>} priceIds - { basic, pro, premium }
 *   as configured in the environment.
 * @returns {string|null} the plan slug, or null when the price is not one of
 *   ours — the caller decides what to do with that (keep the tenant's current
 *   plan rather than silently downgrading them to the cheapest tier).
 */
export function planFromPriceId(priceId, priceIds = {}) {
  if (!priceId) return null;
  const match = Object.entries(priceIds).find(([, id]) => id && id === priceId);
  return match ? match[0] : null;
}

/**
 * The end of the current billing period, as an ISO string, or null.
 *
 * `current_period_end` moved off the subscription and onto its ITEMS in
 * Stripe's 2025 API versions; on older versions it is only on the subscription.
 * Read both. And return null rather than throwing when it is absent: this is a
 * display/bookkeeping field, and a subscription update that drops the *plan*
 * because it could not read a date is how a paying customer ends up locked out.
 * (`new Date(undefined * 1000).toISOString()` throws RangeError — it did.)
 */
export function subscriptionPeriodEnd(subscription) {
  const seconds =
    subscription?.items?.data?.[0]?.current_period_end ?? subscription?.current_period_end;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The tenants-table patch that makes a row match a Stripe subscription.
 *
 * @param {object} subscription - a Stripe Subscription object.
 * @param {object} options
 * @param {Record<string, string|undefined>} options.priceIds - { basic, pro, premium }.
 * @param {string} [options.fallbackPlan] - the plan to keep when the
 *   subscription's price is not one of ours (pass the tenant's current plan).
 * @returns {object} columns to write on `tenants`.
 */
export function tenantBillingFromSubscription(subscription, { priceIds = {}, fallbackPlan = 'basic' } = {}) {
  const priceId = subscription?.items?.data?.[0]?.price?.id || null;
  const columns = {
    plan: planFromPriceId(priceId, priceIds) || fallbackPlan,
    // Stripe's own status, stored as-is. 'trialing' is a real, paid-for trial
    // here (it carries a subscription id), which hasActivePlan() treats as
    // active — see plan-limits.js in the admin app.
    plan_status: subscription?.status || 'free',
    stripe_subscription_id: subscription?.id || null
  };
  if (subscription?.customer) {
    columns.stripe_customer_id =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  }
  const periodEnd = subscriptionPeriodEnd(subscription);
  if (periodEnd) columns.plan_expires_at = periodEnd;
  return columns;
}

/** The patch that records "this tenant no longer has a subscription". */
export function tenantBillingForCancellation() {
  return { plan: 'basic', plan_status: 'canceled', stripe_subscription_id: null };
}
