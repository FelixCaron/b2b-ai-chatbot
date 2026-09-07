// Plan → website limit. The database enforces exactly these numbers in
// public.plan_site_limit() and the sites_enforce_limit trigger (migration
// 20260905030000_site_limits_and_guest_claims.sql), so this check only exists
// to spare the user a doomed round trip — it never has the last word.
export const PLAN_SITE_LIMITS = {
  premium: 10,
  pro: 2,
  basic: 1
};

/** basic — and any unknown/legacy plan value: 1 website. */
export const DEFAULT_SITE_LIMIT = 1;

export function getMaxSitesForPlan(plan) {
  return PLAN_SITE_LIMITS[plan] ?? DEFAULT_SITE_LIMIT;
}

export const PLAN_PAGE_LIMITS = {
  premium: 9999,
  pro: 2000,
  basic: 2000
};

/** Do not block unless over 500 pages. */
export const DEFAULT_PAGE_LIMIT = 500;

export function getMaxPagesForPlan(plan) {
  return PLAN_PAGE_LIMITS[plan] ?? DEFAULT_PAGE_LIMIT;
}

/** The plan the upgrade prompt offers next, and the website count it buys.
 *  `null` on the largest plan — there is nothing left to sell. */
export function getNextPlanUpgrade(plan) {
  if (plan === 'premium') return null;
  if (plan === 'pro') return { name: 'Premium', sites: PLAN_SITE_LIMITS.premium };
  return { name: 'Pro', sites: PLAN_SITE_LIMITS.pro };
}
