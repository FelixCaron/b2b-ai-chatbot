// ---------------------------------------------------------------------------
// Plan pricing, limits, and display names — the one place these numbers live.
//
// `id` is the internal plan slug. It is wired through Stripe env vars
// (STRIPE_PRICE_ID_BASIC/PRO/PREMIUM, scripts/ops/setup-stripe.mjs), the
// tenants.plan column, api/billing/webhook.js's price→plan mapping, and every
// DB trigger/function that gates behavior by plan (plan_site_limit,
// plan_conversation_limit, enforce_pro_features — see
// supabase/migrations/2026090*). It never changes on its own: renaming it
// would mean remapping real Stripe products and rewriting SQL that already
// keys off these exact strings, for a cosmetic reason. `displayName` is what
// changes when the marketing name changes.
//
// Everything else here (Pricing.jsx, plan-limits.js, the conversation-limit
// migration, PlanBadge.jsx) reads or mirrors these exact numbers, so the
// "advertised vs enforced" drift bugs already fixed once (see ADR 057 —
// getMaxSitesForPlan, its own comment, and Pricing.jsx each advertised a
// different site limit) don't reappear as a third round.
// ---------------------------------------------------------------------------

export const PLAN_IDS = ['basic', 'pro', 'premium'];

export const DEFAULT_PLAN_ID = 'basic';

export const PLANS = Object.freeze([
  {
    id: 'basic',
    displayName: 'Starter',
    tagline: 'Answer',
    priceCad: 19,
    description: 'Automatically answer visitor questions on your website, 24/7.',
    maxSites: 1,
    maxPagesPerSite: 500,
    maxConversationsPerMonth: 300,
    popular: false,
    features: [
      '1 website',
      'Up to 500 indexed pages',
      '300 conversations / month',
      'Answers grounded in your website content',
      'Customizable widget',
      'French + English',
      'Conversation history',
    ],
  },
  {
    id: 'pro',
    displayName: 'Business',
    tagline: 'Convert',
    priceCad: 49,
    description: 'Turn visitors into qualified leads and booked appointments.',
    maxSites: 1,
    maxPagesPerSite: 2000,
    maxConversationsPerMonth: 1500,
    popular: true,
    features: [
      'Everything in Starter, plus:',
      '1,500 conversations / month',
      'Up to 2,000 indexed pages',
      'Lead capture & visitor qualification',
      'Booking link in chat (Calendly, Cal.com, GoRendezvous…)',
      'Lead export',
      'Full analytics & notifications',
      'Priority support',
    ],
  },
  {
    id: 'premium',
    displayName: 'Pro',
    tagline: 'Automate',
    priceCad: 99,
    description: 'For businesses handling a high volume of visitor requests.',
    maxSites: 3,
    maxPagesPerSite: 10000,
    maxConversationsPerMonth: 5000,
    popular: false,
    features: [
      'Everything in Business, plus:',
      '5,000 conversations / month',
      'Up to 3 websites',
      'Up to 10,000 indexed pages per site',
      'Advanced analytics',
      'Dedicated onboarding',
    ],
  },
]);

export function getPlan(planId) {
  return PLANS.find((p) => p.id === planId) || PLANS.find((p) => p.id === DEFAULT_PLAN_ID);
}

export function getPlanDisplayName(planId) {
  return getPlan(planId).displayName;
}

export function getMaxSitesForPlan(planId) {
  return getPlan(planId).maxSites;
}

export function getMaxPagesForPlan(planId) {
  return getPlan(planId).maxPagesPerSite;
}

export function getMaxConversationsForPlan(planId) {
  return getPlan(planId).maxConversationsPerMonth;
}

/** Pro-gated features (lead capture, calendar/support-email integrations,
 *  lead-gen conversation goal) are unlocked from Business up — every plan
 *  except the entry one. Mirrors the DB's `NOT IN ('pro', 'premium')` checks
 *  (sites_enforce_pro_features trigger, api/chat/index.js's hasProPlan) and
 *  must be kept in step with them: this only changes if the plan *slugs*
 *  that unlock these features change, which display-name renames never do. */
export function hasProFeatures(planId) {
  return planId === 'pro' || planId === 'premium';
}

/** The plan the upgrade prompt should offer next; null on the top plan. */
export function getNextPlan(planId) {
  const idx = PLANS.findIndex((p) => p.id === planId);
  if (idx === -1 || idx >= PLANS.length - 1) return null;
  return PLANS[idx + 1];
}
