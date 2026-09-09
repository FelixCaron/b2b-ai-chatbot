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
 *  agrees on the same definition. */
export function hasActivePlan(tenant) {
  return tenant?.plan_status === 'active' || tenant?.plan_status === 'trialing';
}

/** The plan the upgrade prompt offers next, and the website count it buys.
 *  `null` on the largest plan — there is nothing left to sell. */
export function getNextPlanUpgrade(plan) {
  const next = getNextPlan(plan);
  if (!next) return null;
  return { name: next.displayName, sites: next.maxSites };
}
