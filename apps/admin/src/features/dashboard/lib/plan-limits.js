// Thin client-side wrapper around the plan config in @b2b-ai-chatbot/contracts
// (the single source of truth — see packages/contracts/src/plans.js for why).
// This file exists so call sites don't each import from contracts directly.
import {
  getMaxSitesForPlan as sharedGetMaxSitesForPlan,
  getMaxPagesForPlan as sharedGetMaxPagesForPlan,
  getMaxConversationsForPlan as sharedGetMaxConversationsForPlan,
  getPlanDisplayName as sharedGetPlanDisplayName,
  getNextPlan,
  isWidgetActive,
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
 *  anywhere a plan is shown to a user; never show the raw slug. The result is
 *  an English source string like every other piece of UI copy — pass it
 *  through t() at the call site (it has French entries in i18n/fr/pricing.js)
 *  rather than rendering it directly. */
export function getPlanDisplayName(plan) {
  return sharedGetPlanDisplayName(plan);
}

/** Whether this tenant's assistant is actually live on its website — the one
 *  thing a plan buys.
 *
 *  Building an assistant, testing it, and taking its install snippet are all
 *  free; what an active plan pays for is the widget APPEARING for real
 *  visitors. So this is not a dashboard-only notion: it re-exports the exact
 *  predicate the widget's own init and the chat endpoint gate on
 *  (`isWidgetActive` → `resolveTenantPlan().widgetActive` in contracts), so
 *  the dashboard can never tell an owner they are live while the widget is
 *  hiding itself, or the reverse. */
export function isAssistantActive(tenant) {
  return isWidgetActive(tenant);
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
