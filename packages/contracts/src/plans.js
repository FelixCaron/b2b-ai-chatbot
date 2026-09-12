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
    // Was 'Pro' — read as ambiguous next to 'Business' (which plan comes
    // first?) and, on top of that, collided with the *other* plan's internal
    // slug ('pro', the id below this one — see this file's header comment on
    // why ids never change), so a raw plan id shown anywhere by mistake
    // ('pro') looked like it named the top tier when it's actually the
    // middle one. 'Premium' reads unambiguously as the top tier and matches
    // this plan's own id, removing that trap for good.
    displayName: 'Premium',
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

// ---------------------------------------------------------------------------
// Self-serve trial resolution.
//
// New self-serve tenants start on a 14-day Business ('pro') trial (migration
// 20260912000000 sets the tenants column defaults). That trial expires lazily
// at read time — there is no scheduled job to flip the column (the Vercel cron
// slot is unavailable, see TODO.md) — so every server read that gates behavior
// resolves the *effective* plan through this function.
//
// It lives here, in the dependency-free contracts package the API routes
// already import, rather than in a file under /api: a new file under /api can
// count against the Vercel Hobby serverless-function cap the project sits
// exactly at, and this logic must stay identical between api/chat/index.js and
// api/chat/init.js anyway.
//
// A self-serve trial is plan_status 'trialing' with NO stripe_subscription_id:
// nobody is paying and no Stripe lifecycle will move it off 'trialing'. Once
// trial_ends_at passes it is unpaid — the widget stops serving until the owner
// subscribes. A Stripe-managed subscription always carries a subscription id
// and is governed by the billing webhook, so this never touches it.
//
// The same function answers the question the whole product is actually gated
// on: IS THIS TENANT'S ASSISTANT ALLOWED TO APPEAR ON ITS WEBSITE? Building an
// assistant, testing it, and taking its install snippet are all free — what a
// plan buys is the widget showing up for real visitors. That answer has to be
// identical in three places (the widget's own init, the chat endpoint, and the
// dashboard that tells the owner whether they are live), which is why it is
// computed once here rather than re-derived from plan_status at each site.
// ---------------------------------------------------------------------------

/** Billing statuses under which the assistant keeps serving.
 *
 *  'past_due' is deliberately included: Stripe is still retrying the card and
 *  the customer has not left. Taking a live assistant off someone's website
 *  the hour a renewal charge bounces costs them visitors over something a
 *  retry usually fixes by itself — the dashboard warns them instead, and
 *  Stripe moves the subscription to 'canceled'/'unpaid' when it really gives
 *  up, which does stop the widget. */
const SERVING_STATUSES = new Set(['active', 'past_due']);

/**
 * Resolve a tenant's live plan state from its billing columns.
 *
 * @param {object|null} tenant - a row exposing `plan`, `plan_status`,
 *   `trial_ends_at`, `stripe_subscription_id`; any may be missing on a partial
 *   read and is treated conservatively.
 * @returns {{ effectivePlan: string, trialActive: boolean,
 *   trialExpiredUnpaid: boolean, trialDaysLeft: number|null,
 *   widgetActive: boolean, inactiveReason: 'trial_ended'|'no_plan'|null }}
 *   `widgetActive` is the gate: whether the assistant may appear on the
 *   tenant's website at all. `inactiveReason` says why it may not, so the
 *   widget, the chat endpoint and the dashboard can each phrase it their own
 *   way without inventing their own rule.
 */
export function resolveTenantPlan(tenant) {
  const plan = tenant?.plan || DEFAULT_PLAN_ID;
  const status = tenant?.plan_status || 'free';
  const hasStripeSub = Boolean(tenant?.stripe_subscription_id);
  const trialEndsAt = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : null;
  const now = Date.now();

  const isSelfServeTrial = status === 'trialing' && !hasStripeSub;
  const trialExpiredUnpaid =
    isSelfServeTrial && trialEndsAt !== null && !Number.isNaN(trialEndsAt) && trialEndsAt < now;
  const trialActive = isSelfServeTrial && !trialExpiredUnpaid;

  const effectivePlan = trialExpiredUnpaid ? DEFAULT_PLAN_ID : plan;
  const trialDaysLeft =
    trialActive && trialEndsAt !== null
      ? Math.max(0, Math.ceil((trialEndsAt - now) / 86400000))
      : null;

  // A Stripe-managed trial (status 'trialing' WITH a subscription) is a real
  // subscription Stripe will move to 'active' itself; a self-serve trial is
  // live until its end date. Everything else — 'free', 'canceled', 'unpaid',
  // an incomplete checkout — means nobody is paying and the assistant stays
  // off the customer's website.
  const widgetActive = trialActive || (status === 'trialing' && hasStripeSub) || SERVING_STATUSES.has(status);
  const inactiveReason = widgetActive ? null : trialExpiredUnpaid ? 'trial_ended' : 'no_plan';

  return {
    effectivePlan,
    trialActive,
    trialExpiredUnpaid,
    trialDaysLeft,
    widgetActive,
    inactiveReason
  };
}

/** Whether this tenant's assistant may appear on its website right now.
 *  The one gate, shared by the widget's init, the chat endpoint, and the
 *  dashboard — see resolveTenantPlan above. */
export function isWidgetActive(tenant) {
  return resolveTenantPlan(tenant).widgetActive;
}
