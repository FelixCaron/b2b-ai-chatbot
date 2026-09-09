// api/create-checkout-session.js
// Vercel Serverless Function — Creates a Stripe Checkout Session for subscription
import Stripe from 'stripe';
import WebSocket from 'ws';
import { contracts } from '@b2b-ai-chatbot/contracts';
import { nodeRoute } from '../lib/http.js';
import { requireServerEnv } from '../lib/server-config.js';

if (typeof globalThis !== 'undefined' && !globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

// The contract is tenant-scoped: the wrapper has already proved the caller owns
// tenantId. Without that, anyone who knows/guesses a tenantId could point that
// tenant's stripe_customer_id at a Stripe customer they control, or trigger
// checkout sessions for a tenant they don't own.
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

  const priceId = PRICE_IDS[planId];
  if (!priceId) {
    return res.status(400).json({ error: `Unknown planId: ${planId}` });
  }

  const host = req.headers?.host || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = process.env.VITE_APP_URL || `${protocol}://${host}`;

  let customerId = null;

  const { data: tenant } = await supabase
    .from('tenants')
    .select('stripe_customer_id, name')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenant?.stripe_customer_id) {
    customerId = tenant.stripe_customer_id;
  } else {
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
