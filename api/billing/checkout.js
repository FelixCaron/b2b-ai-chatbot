// api/billing/checkout.js
// Vercel Serverless Function — a tenant's subscription, in the two directions
// it moves (see contracts/endpoints/billing.js for the `action` split):
//
//   'checkout' — open a Stripe Checkout Session for a plan.
//   'sync'     — ask Stripe what this tenant's subscription actually is, and
//                write it onto the tenant row.
//
// Both start the same way: reconcile the row with Stripe. The tenant's billing
// columns used to be written by the webhook and nothing else, so a delivery
// that never arrived (wrong endpoint secret, a test-mode endpoint on a live
// account, a handler that 500s, a subscription created by hand in the Stripe
// dashboard with no tenant metadata) left a paying customer's row reading
// 'trialing'/'free' forever — and the dashboard's install gate sent them to the
// pricing page they had already paid on. Stripe is the source of truth; this
// route reads it instead of waiting to be told.
import Stripe from 'stripe';
import WebSocket from 'ws';
import {
  contracts,
  isLiveSubscriptionStatus,
  pickLiveSubscription,
  tenantBillingForCancellation,
  tenantBillingFromSubscription
} from '@b2b-ai-chatbot/contracts';
import { nodeRoute } from '../lib/http.js';
import { requireServerEnv } from '../lib/server-config.js';

if (typeof globalThis !== 'undefined' && !globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

/**
 * Bring a tenant's billing columns in line with Stripe, and report what Stripe
 * says. Never throws: a Stripe outage must not stop someone from subscribing,
 * and must not rewrite a row on a guess.
 */
async function reconcileTenantBilling({ stripe, supabase, tenantId, tenant, priceIds }) {
  const unchanged = {
    subscribed: Boolean(tenant?.stripe_subscription_id) && isLiveSubscriptionStatus(tenant?.plan_status),
    plan: tenant?.plan || null,
    planStatus: tenant?.plan_status || null
  };

  // No Stripe customer means nothing was ever bought — and the row may be a
  // live self-serve trial (plan 'pro' / status 'trialing', no subscription id),
  // which is not ours to touch.
  if (!tenant?.stripe_customer_id) return unchanged;

  let subscriptions = [];
  try {
    const list = await stripe.subscriptions.list({
      customer: tenant.stripe_customer_id,
      status: 'all',
      limit: 10
    });
    subscriptions = list?.data || [];
  } catch (err) {
    console.error('[billing.sync] Could not list subscriptions:', err.message);
    return unchanged;
  }

  const live = pickLiveSubscription(subscriptions);

  if (live) {
    const columns = tenantBillingFromSubscription(live, {
      priceIds,
      // An unrecognized price (ids rotated, or a custom price quoted to one
      // customer) must not silently downgrade a paying tenant to the cheapest
      // tier — keep whatever plan the row already names.
      fallbackPlan: tenant.plan || 'basic'
    });
    const drifted = Object.entries(columns).some(([key, value]) => tenant[key] !== value);
    if (drifted) {
      const { error } = await supabase.from('tenants').update(columns).eq('id', tenantId);
      if (error) {
        console.error('[billing.sync] Could not update tenant:', error.message);
        return unchanged;
      }
      console.log(
        `[billing.sync] Tenant ${tenantId} reconciled from Stripe → ${columns.plan} (${columns.plan_status})`
      );
    }
    return {
      subscribed: isLiveSubscriptionStatus(columns.plan_status),
      plan: columns.plan,
      planStatus: columns.plan_status
    };
  }

  // Stripe has no live subscription for this customer. Only write that down if
  // the row still claims one — otherwise this is a tenant who opened checkout
  // once and never finished, and their trial columns stay as they are.
  if (tenant.stripe_subscription_id) {
    const columns = tenantBillingForCancellation();
    await supabase.from('tenants').update(columns).eq('id', tenantId);
    console.log(`[billing.sync] Tenant ${tenantId} has no live subscription — marked canceled`);
    return { subscribed: false, plan: columns.plan, planStatus: columns.plan_status };
  }

  return { subscribed: false, plan: unchanged.plan, planStatus: unchanged.planStatus };
}

// The contract is tenant-scoped: the wrapper has already proved the caller owns
// tenantId. Without that, anyone who knew/guessed a tenantId could point that
// tenant's stripe_customer_id at a Stripe customer they control, trigger
// checkout sessions for a tenant they don't own, or (with 'sync') read back
// another tenant's billing state.
export default nodeRoute(contracts.billing.checkout, async (req, res, { data, supabase }) => {
  const { STRIPE_SECRET_KEY } = requireServerEnv('STRIPE_SECRET_KEY');
  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const PRICE_ID = process.env.STRIPE_PRICE_ID;
  const PRICE_IDS = {
    basic: process.env.STRIPE_PRICE_ID_BASIC || PRICE_ID,
    pro: process.env.STRIPE_PRICE_ID_PRO || PRICE_ID,
    premium: process.env.STRIPE_PRICE_ID_PREMIUM || process.env.STRIPE_PRICE_ID_ENTERPRISE || PRICE_ID,
  };
  const { planId, tenantId, email } = data;
  const action = data.action || 'checkout';

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, plan, plan_status, stripe_customer_id, stripe_subscription_id')
    .eq('id', tenantId)
    .maybeSingle();

  const billing = await reconcileTenantBilling({
    stripe,
    supabase,
    tenantId,
    tenant,
    priceIds: PRICE_IDS
  });

  if (action === 'sync') {
    return res.status(200).json({
      subscribed: billing.subscribed,
      plan: billing.plan || '',
      planStatus: billing.planStatus || ''
    });
  }

  const priceId = PRICE_IDS[planId];
  if (!priceId) {
    return res.status(400).json({ error: `Unknown planId: ${planId}` });
  }

  // Already paying for exactly this plan — which is where someone lands when a
  // stale row sent them to the pricing page by mistake. Selling it to them a
  // second time would open a second subscription and bill them twice; the
  // honest answer is "you already have this", with the row now corrected.
  if (billing.subscribed && billing.plan === planId) {
    return res.status(200).json({
      subscribed: true,
      plan: billing.plan,
      planStatus: billing.planStatus || ''
    });
  }

  const host = req.headers?.host || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = process.env.VITE_APP_URL || `${protocol}://${host}`;

  let customerId = tenant?.stripe_customer_id || null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: email || (tenant?.name?.includes('@') ? tenant.name : undefined),
      metadata: { tenant_id: tenantId },
    });
    customerId = customer.id;

    if (tenant) {
      await supabase
        .from('tenants')
        .update({ stripe_customer_id: customerId })
        .eq('id', tenantId);
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: tenantId,
    metadata: { tenant_id: tenantId },
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: { tenant_id: tenantId },
      // 14-day trial, no card required up front (Stripe's documented pattern
      // for this: payment_method_collection deferred to 'if_required', paired
      // with trial_settings so a trial that ends with no payment method on
      // file cancels instead of silently trying to charge nothing). The
      // subscription's status is 'trialing' for these 14 days — the webhook
      // stores that as-is on plan_status, and hasActivePlan() (apps/admin)
      // treats 'trialing' the same as 'active'.
      trial_period_days: 14,
      trial_settings: {
        end_behavior: { missing_payment_method: 'cancel' },
      },
    },
    payment_method_collection: 'if_required',
    success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/payment-cancel`,
    allow_promotion_codes: true,
  });

  return res.status(200).json({ url: session.url, sessionId: session.id });
});
