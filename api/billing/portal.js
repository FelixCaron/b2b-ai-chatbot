// api/create-portal-session.js
// Vercel Serverless Function â€” Creates a Stripe Billing Portal Session
import Stripe from 'stripe';
import WebSocket from 'ws';
import { createServiceRoleClient, requireServerEnv } from '../../lib/server-config.js';

if (typeof globalThis !== 'undefined' && !globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { STRIPE_SECRET_KEY } = requireServerEnv('STRIPE_SECRET_KEY');
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const { tenantId } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const supabase = createServiceRoleClient();

    const { data: tenant } = await supabase
      .from('tenants')
      .select('stripe_customer_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.stripe_customer_id) {
      return res.status(400).json({ error: 'No Stripe customer found for this tenant' });
    }

    const host = req.headers?.host || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = process.env.VITE_APP_URL || `${protocol}://${host}`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: baseUrl,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('[create-portal-session] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
