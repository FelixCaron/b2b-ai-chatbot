// api/create-portal-session.js
// Vercel Serverless Function — Creates a Stripe Billing Portal Session
import Stripe from 'stripe';
import WebSocket from 'ws';
import { contracts } from '@b2b-ai-chatbot/contracts';
import { nodeRoute } from '../_lib/http.js';
import { requireServerEnv } from '../_lib/server-config.js';

if (typeof globalThis !== 'undefined' && !globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

// The contract is tenant-scoped: the wrapper has already proved the caller owns
// tenantId. Without that, anyone who knows/guesses a tenantId could open the
// Stripe billing portal for a DIFFERENT tenant's customer — viewing invoices,
// changing payment methods, or cancelling their subscription.
export default nodeRoute(contracts.billing.portal, async (req, res, { data, supabase }) => {
  const { STRIPE_SECRET_KEY } = requireServerEnv('STRIPE_SECRET_KEY');
  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const { tenantId } = data;

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
});
