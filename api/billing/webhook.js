// api/billing/webhook.js
// Vercel Serverless Function — Handles Stripe webhook events.
//
// This is one half of how a tenant's billing columns get written; the other is
// the reconcile path in api/billing/checkout.js, which asks Stripe the same
// question when nobody told us. Both map a subscription onto the row through
// the same helper (tenantBillingFromSubscription, in @b2b-ai-chatbot/contracts)
// so the two can't answer differently.
//
// Two failure modes this file has already had, both of which left a paying
// customer's row reading 'trialing' and the dashboard's install gate sending
// them back to the pricing page:
//
//   1. `subscription.current_period_end` moved onto the subscription's ITEMS in
//      Stripe's 2025 API versions. Reading it off the subscription yielded
//      undefined, `new Date(undefined * 1000).toISOString()` threw RangeError,
//      and the handler 500'd BEFORE the update — so every purchase silently
//      failed to activate. The period end is bookkeeping; it is now read
//      defensively and never blocks the plan write.
//   2. `customer.subscription.*` events were looked up by tenant metadata only.
//      A subscription created any way other than our own Checkout (by hand in
//      the Stripe dashboard, say) carries no metadata, so nothing was written.
//      Every branch now falls back to the Stripe customer, then the
//      subscription id.
import Stripe from 'stripe';
import WebSocket from 'ws';
import {
  tenantBillingForCancellation,
  tenantBillingFromSubscription
} from '@b2b-ai-chatbot/contracts';
import { createServiceRoleClient, requireServerEnv } from '../lib/server-config.js';

if (typeof globalThis !== 'undefined' && !globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  if (req.rawBody) return req.rawBody;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function priceIdsFromEnv() {
  const fallback = process.env.STRIPE_PRICE_ID;
  return {
    basic: process.env.STRIPE_PRICE_ID_BASIC || fallback,
    pro: process.env.STRIPE_PRICE_ID_PRO || fallback,
    premium: process.env.STRIPE_PRICE_ID_PREMIUM || process.env.STRIPE_PRICE_ID_ENTERPRISE || fallback
  };
}

/**
 * Which tenant a subscription belongs to, in order of how much we trust it:
 * the metadata our own Checkout writes, then the Stripe customer on the row,
 * then the subscription id itself. Only the first exists for subscriptions we
 * created; the other two are what make a subscription created or changed
 * anywhere else (the Stripe dashboard, the billing portal) land on a tenant.
 */
async function resolveTenantId(supabase, subscription) {
  const fromMetadata = subscription?.metadata?.tenant_id;
  if (fromMetadata) return fromMetadata;

  const customerId =
    typeof subscription?.customer === 'string' ? subscription.customer : subscription?.customer?.id;
  if (customerId) {
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (subscription?.id) {
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}

/** Write a subscription onto its tenant. Shared by every subscription event so
 *  they cannot disagree about what 'active' means. */
async function applySubscription(supabase, tenantId, subscription) {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .maybeSingle();

  const columns = tenantBillingFromSubscription(subscription, {
    priceIds: priceIdsFromEnv(),
    // An unrecognized price must never downgrade a paying tenant to the
    // cheapest tier — keep the plan the row already names.
    fallbackPlan: tenant?.plan || 'basic'
  });

  const { error } = await supabase.from('tenants').update(columns).eq('id', tenantId);
  if (error) throw new Error(`tenant update failed: ${error.message}`);

  console.log(
    `[stripe-webhook] Tenant ${tenantId} → ${columns.plan} (status: ${columns.plan_status}, sub: ${columns.stripe_subscription_id})`
  );
  return columns;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error('[stripe-webhook] Missing signature or webhook secret');
    return res.status(400).json({ error: 'Missing signature' });
  }

  let event;
  let stripe;
  try {
    const { STRIPE_SECRET_KEY } = requireServerEnv('STRIPE_SECRET_KEY');
    stripe = new Stripe(STRIPE_SECRET_KEY);
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  console.log(`[stripe-webhook] Processing event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (!session.subscription) {
          console.warn('[stripe-webhook] checkout.session.completed carried no subscription');
          break;
        }
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        // client_reference_id and the session metadata are ours; resolveTenantId
        // covers everything else (customer, subscription id).
        const tenantId =
          session.subscription_data?.metadata?.tenant_id ||
          session.metadata?.tenant_id ||
          session.client_reference_id ||
          (await resolveTenantId(supabase, subscription));

        if (!tenantId) {
          console.warn('[stripe-webhook] checkout.session.completed: no tenant could be resolved');
          break;
        }

        // Checkout completing does not mean billing started: a 14-day trial
        // (api/billing/checkout.js) leaves the subscription 'trialing' for
        // those 14 days. Stripe's real status is stored as-is — hasActivePlan()
        // (apps/admin) treats trialing the same as active, so this doesn't lock
        // the tenant out during the trial.
        await applySubscription(supabase, tenantId, subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const tenantId = await resolveTenantId(supabase, subscription);

        if (!tenantId) {
          console.warn('[stripe-webhook] subscription.deleted: no tenant could be resolved');
          break;
        }

        await supabase
          .from('tenants')
          .update(tenantBillingForCancellation())
          .eq('id', tenantId);

        console.log(`[stripe-webhook] Tenant ${tenantId} subscription canceled`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const { data: tenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (tenant) {
          await supabase
            .from('tenants')
            .update({ plan_status: 'past_due' })
            .eq('id', tenant.id);
          console.log(`[stripe-webhook] Tenant ${tenant.id} payment failed — marked past_due`);
        }
        break;
      }

      // Created as well as updated: a subscription started anywhere other than
      // our own Checkout (the Stripe dashboard, an invoice, the billing portal)
      // only ever announces itself through these, and it is still a customer
      // who is paying for a plan.
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const tenantId = await resolveTenantId(supabase, subscription);

        if (!tenantId) {
          console.warn(`[stripe-webhook] ${event.type}: no tenant could be resolved`);
          break;
        }

        await applySubscription(supabase, tenantId, subscription);
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[stripe-webhook] Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
