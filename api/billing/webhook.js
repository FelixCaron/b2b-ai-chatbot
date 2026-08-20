// api/stripe-webhook.js
// Vercel Serverless Function â€” Handles Stripe webhook events
import Stripe from 'stripe';
import WebSocket from 'ws';
import { createServiceRoleClient, requireServerEnv } from '../../lib/server-config.js';

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

function getPlanFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_ID_STARTER) return 'starter';
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_ID) return 'basic';
  return 'basic';
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
        const tenantId = session.subscription_data?.metadata?.tenant_id 
          || session.metadata?.tenant_id;

        if (!tenantId) {
          console.warn('[stripe-webhook] No tenant_id in session metadata');
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanFromPriceId(priceId);
        const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();

        await supabase
          .from('tenants')
          .update({
            plan,
            plan_status: 'active',
            stripe_subscription_id: session.subscription,
            plan_expires_at: expiresAt,
          })
          .eq('id', tenantId);

        console.log(`[stripe-webhook] Tenant ${tenantId} upgraded to ${plan}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const tenantId = subscription.metadata?.tenant_id;

        if (!tenantId) {
          const { data: tenant } = await supabase
            .from('tenants')
            .select('id')
            .eq('stripe_customer_id', subscription.customer)
            .single();
          if (tenant) {
            await supabase
              .from('tenants')
              .update({ plan: 'free', plan_status: 'canceled', stripe_subscription_id: null })
              .eq('id', tenant.id);
          }
          break;
        }

        await supabase
          .from('tenants')
          .update({ plan: 'free', plan_status: 'canceled', stripe_subscription_id: null })
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
          .single();

        if (tenant) {
          await supabase
            .from('tenants')
            .update({ plan_status: 'past_due' })
            .eq('id', tenant.id);
          console.log(`[stripe-webhook] Tenant ${tenant.id} payment failed â€” marked past_due`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const tenantId = subscription.metadata?.tenant_id;
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanFromPriceId(priceId);
        const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();
        const status = subscription.status === 'active' ? 'active' : subscription.status;

        if (tenantId) {
          await supabase
            .from('tenants')
            .update({ plan, plan_status: status, plan_expires_at: expiresAt })
            .eq('id', tenantId);
        }
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
