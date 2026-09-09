// ---------------------------------------------------------------------------
// Self-serve trial resolution — the one place that turns a tenant's stored
// billing columns into "what plan is actually in force right now".
//
// New self-serve tenants (the paste-your-URL onboarding, which inserts a
// tenants row with no plan columns) start on a 14-day Business ('pro') trial
// via the column defaults set in migration 20260909030000. That trial has to
// end, and the Vercel cron slot that would sweep it is currently unavailable
// (see TODO.md) — so expiry is enforced *lazily*, here, on every read that
// gates behavior, instead of by a scheduled job flipping the column.
//
// A self-serve trial is one with plan_status = 'trialing' and NO
// stripe_subscription_id: nobody is paying, and no Stripe lifecycle will move
// it off 'trialing'. Once its trial_ends_at has passed it is treated as
// unpaid — the widget stops serving until the owner subscribes. A
// Stripe-managed subscription always carries a stripe_subscription_id and is
// governed entirely by the billing webhook (trialing -> active -> canceled),
// so this lazy expiry never touches it.
// ---------------------------------------------------------------------------

const DEFAULT_PLAN = 'basic';

/**
 * Resolve a tenant's live plan state from its billing columns.
 *
 * @param {object|null} tenant - a row (or joined object) exposing `plan`,
 *   `plan_status`, `trial_ends_at`, `stripe_subscription_id`. Any may be
 *   missing on an older/partial read; missing is treated conservatively.
 * @returns {{ effectivePlan: string, trialActive: boolean,
 *   trialExpiredUnpaid: boolean, trialDaysLeft: number|null }}
 */
export function resolveTenantPlan(tenant) {
  const plan = tenant?.plan || DEFAULT_PLAN;
  const status = tenant?.plan_status || 'free';
  const hasStripeSub = Boolean(tenant?.stripe_subscription_id);
  const trialEndsAt = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : null;
  const now = Date.now();

  const isSelfServeTrial = status === 'trialing' && !hasStripeSub;
  const trialExpiredUnpaid =
    isSelfServeTrial && trialEndsAt !== null && !Number.isNaN(trialEndsAt) && trialEndsAt < now;
  const trialActive = isSelfServeTrial && !trialExpiredUnpaid;

  // Once an unconverted self-serve trial lapses, no paid plan is in force —
  // the account behaves as unpaid (the caller refuses to serve). While the
  // trial is live the stored plan ('pro') is exactly what applies.
  const effectivePlan = trialExpiredUnpaid ? DEFAULT_PLAN : plan;

  const trialDaysLeft =
    trialActive && trialEndsAt !== null
      ? Math.max(0, Math.ceil((trialEndsAt - now) / 86400000))
      : null;

  return { effectivePlan, trialActive, trialExpiredUnpaid, trialDaysLeft };
}
