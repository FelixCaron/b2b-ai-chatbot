// api/create-checkout-session.js
// Vercel Serverless Function — Creates a Stripe Checkout Session for subscription
import Stripe from 'stripe';
import WebSocket from 'ws';

if (typeof globalThis !== 'undefined' && !globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_ID = process.env.STRIPE_PRICE_ID;

const PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_ID_STARTER || PRICE_ID,
  pro: process.env.STRIPE_PRICE_ID_PRO || PRICE_ID,
  basic: PRICE_ID,
};

const DEFAULT_SUPABASE_URL = "https://xuvueegdokgiyedwvmkm.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { planId, tenantId, email } = req.body || {};

    if (!planId || !tenantId) {
      return res.status(400).json({ error: 'planId and tenantId are required' });
    }

    const priceId = PRICE_IDS[planId];
    if (!priceId) {
      return res.status(400).json({ error: `Unknown planId: ${planId}` });
    }

    const host = req.headers?.host || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = process.env.VITE_APP_URL || `${protocol}://${host}`;

    let customerId = null;

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY
    );

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
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: { tenant_id: tenantId },
      },
      success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment-cancel`,
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[create-checkout-session] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
