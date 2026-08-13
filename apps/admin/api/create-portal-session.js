// api/create-portal-session.js
// Vercel Serverless Function — Creates a Stripe Billing Portal Session
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

if (typeof globalThis !== 'undefined' && !globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const DEFAULT_SUPABASE_URL = "https://xuvueegdokgiyedwvmkm.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tenantId } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY
    );

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
