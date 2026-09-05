// Single source of truth for plan → limit mapping on the client.
//
// The real enforcement lives in the database (plan_site_limit() in
// supabase/migrations/20260905030000_site_limits_and_guest_claims.sql,
// backing the sites_enforce_limit trigger) — these functions exist only so
// the UI can show the right number and block obviously-over-limit actions
// before round-tripping to the server. Keep the numbers below in sync with
// plan_site_limit(); a mismatch here is a UX bug (wrong copy, a check that
// passes client-side and then fails server-side), not a security hole.
export function getMaxSitesForPlan(plan) {
  switch (plan) {
    case 'premium': return 10;
    case 'pro': return 2;
    default: return 1; // basic, legacy 'free', null/undefined
  }
}

export function getMaxPagesForPlan(plan) {
  if (plan === 'premium') return 9999;
  if (plan === 'pro') return 2000;
  return 500; // basic
}
