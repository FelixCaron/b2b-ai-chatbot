// Thin client-side wrapper around the plan config in @b2b-ai-chatbot/contracts
// (the single source of truth — see packages/contracts/src/plans.js for why).
// This file exists so call sites don't each import from contracts directly,
// and so `hasActivePlan` (a UI-only concept, not part of the plan config)
// still has a home.
import {
  getMaxSitesForPlan as sharedGetMaxSitesForPlan,
  getMaxPagesForPlan as sharedGetMaxPagesForPlan,
  getMaxConversationsForPlan as sharedGetMaxConversationsForPlan,
  getPlanDisplayName as sharedGetPlanDisplayName,
  getNextPlan,
} from '@b2b-ai-chatbot/contracts';

export function getMaxSitesForPlan(plan) {
  return sharedGetMaxSitesForPlan(plan);
}

export function getMaxPagesForPlan(plan) {
  return sharedGetMaxPagesForPlan(plan);
}

export function getMaxConversationsForPlan(plan) {
  return sharedGetMaxConversationsForPlan(plan);
}

/** The marketing name for a plan slug — 'pro' → 'Business', etc. Use this
 *  anywhere a plan is shown to a user; never show the raw slug. */
export function getPlanDisplayName(plan) {
  return sharedGetPlanDisplayName(plan);
}

/** Whether a tenant has an actually-paid-for, currently-active (or trialing)
 *  subscription — the one gate that matters for anything that touches a
 *  real, live website (installing the widget chief among them). A tenant's
 *  `plan` column is always basic/pro/premium regardless of billing state;
 *  what decides "active" is Stripe's own status on `plan_status`. Trialing
 *  counts as active: a 14-day trial that can't actually use the product
 *  isn't a trial. Shared here so every place that needs this answer (the
 *  header's "Manage Subscription" vs. "Upgrade" switch, the Install gate)
 *  agrees on the same definition.
 *
 *  Trialing counts as active only while the trial is live: a self-serve
 *  Business trial (plan_status 'trialing' with no Stripe subscription) expires
 *  at `trial_ends_at`, after which the account is unpaid and the widget stops
 *  serving (resolveTenantPlan in contracts). A Stripe-managed trial always carries a
 *  stripe_subscription_id and stays active until Stripe itself moves it. */
export function hasActivePlan(tenant) {
  if (tenant?.plan_status === 'active') return true;
  if (tenant?.plan_status === 'trialing') {
    if (tenant?.stripe_subscription_id) return true;
    const endsAt = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : null;
    return endsAt === null || Number.isNaN(endsAt) || endsAt > Date.now();
  }
  return false;
}

/** Live self-serve-trial state for a tenant, mirroring the server's
 *  resolveTenantPlan() (@b2b-ai-chatbot/contracts) so the dashboard and the widget agree
 *  on when a trial is running and when it has lapsed. A self-serve trial is
 *  `plan_status === 'trialing'` with no Stripe subscription; a Stripe-managed
 *  trial (with a subscription id) is Stripe's to expire, never this. */
export function getTrialInfo(tenant) {
  const isSelfServeTrial =
    tenant?.plan_status === 'trialing' && !tenant?.stripe_subscription_id;
  if (!isSelfServeTrial) {
    return { trialActive: false, trialExpired: false, trialDaysLeft: null };
  }
  const endsAt = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : null;
  if (endsAt === null || Number.isNaN(endsAt)) {
    // A trialing row with no end date can't be expired — treat it as live.
    return { trialActive: true, trialExpired: false, trialDaysLeft: null };
  }
  const now = Date.now();
  if (endsAt <= now) {
    return { trialActive: false, trialExpired: true, trialDaysLeft: 0 };
  }
  return {
    trialActive: true,
    trialExpired: false,
    trialDaysLeft: Math.max(1, Math.ceil((endsAt - now) / 86400000)),
  };
}

/** The plan the upgrade prompt offers next, and the website count it buys.
 *  `null` on the largest plan — there is nothing left to sell. */
export function getNextPlanUpgrade(plan) {
  const next = getNextPlan(plan);
  if (!next) return null;
  return { name: next.displayName, sites: next.maxSites };
}
