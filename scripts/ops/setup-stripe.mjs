#!/usr/bin/env node
// scripts/ops/setup-stripe.mjs
//
// Idempotent Stripe resource setup: creates (or reuses) the three plan
// products/prices and the checkout webhook endpoint this product needs,
// instead of clicking through the Stripe dashboard by hand.
//
// Safe to re-run: every resource is looked up by a stable identifying field
// first (product name, price amount+interval on that product, webhook URL)
// and only created if genuinely missing, so running this twice — or against
// a second environment — never duplicates products, prices, or webhooks.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... VITE_APP_URL=https://your-admin-domain.example \
//     node scripts/ops/setup-stripe.mjs
//
// Prints the STRIPE_PRICE_ID_* and STRIPE_WEBHOOK_SECRET values to paste into
// your env (Vercel project settings, or infra/terraform/vercel/terraform.tfvars).
//
// See docs/setup/stripe.md for the manual fallback and what this script
// cannot do for you (creating the Stripe account itself, business
// verification before switching to live mode).

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY. Export it (test or live key) before running this script.');
  process.exit(1);
}

const APP_URL = process.env.VITE_APP_URL;
if (!APP_URL) {
  console.error('Missing VITE_APP_URL (e.g. https://your-admin-domain.example) — needed to register the webhook endpoint.');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// Source of truth for plan pricing — see ADR.md's pricing note. Amounts are
// in cents. Verified 2026-09-05 against the real Stripe test-mode account:
// the products already existed under the pre-rebrand "Chatbot ..." name, in
// CAD (not "Repondo ..." / USD, which is what this file originally assumed
// before that account was checked) — this file's job is to find-and-reuse
// whatever is really there by name+amount+currency+interval, so getting
// these three fields wrong means it creates unwanted duplicates instead of
// reusing the real products. If you rename the Stripe products to the
// current "Repondo" branding, update `name` here to match, or this script's
// lookup will stop finding them and create new ones alongside the old.
const PLANS = [
  { key: 'BASIC', name: 'Chatbot basic', amount: 1500, currency: 'cad', interval: 'month' },
  { key: 'PRO', name: 'Chatbot Pro', amount: 4000, currency: 'cad', interval: 'month' },
  { key: 'PREMIUM', name: 'Chatbot Premium', amount: 6500, currency: 'cad', interval: 'month' },
];

async function findProductByName(name) {
  const { data } = await stripe.products.search({
    query: `name:'${name}' AND active:'true'`,
  });
  return data[0] || null;
}

async function ensureProduct(name) {
  const existing = await findProductByName(name);
  if (existing) {
    console.log(`  product "${name}" already exists (${existing.id}) — reusing`);
    return existing;
  }
  const product = await stripe.products.create({ name });
  console.log(`  created product "${name}" (${product.id})`);
  return product;
}

async function findPriceForProduct(productId, amount, currency, interval) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  return (
    prices.data.find(
      (p) =>
        p.unit_amount === amount &&
        p.currency === currency &&
        p.recurring?.interval === interval
    ) || null
  );
}

async function ensurePrice(product, plan) {
  const existing = await findPriceForProduct(product.id, plan.amount, plan.currency, plan.interval);
  if (existing) {
    console.log(`  price for "${product.name}" already exists (${existing.id}) — reusing`);
    return existing;
  }
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.amount,
    currency: plan.currency,
    recurring: { interval: plan.interval },
  });
  console.log(`  created price for "${product.name}" (${price.id})`);
  return price;
}

async function ensureWebhook(url) {
  const { data } = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = data.find((w) => w.url === url);
  if (existing) {
    console.log(`  webhook endpoint for ${url} already exists (${existing.id}) — reusing`);
    console.log('  NOTE: the signing secret is only ever shown once at creation time.');
    console.log('  If you no longer have it saved, delete this endpoint in the Stripe');
    console.log('  dashboard and re-run this script to get a fresh one.');
    return { endpoint: existing, secret: null };
  }
  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: [
      'checkout.session.completed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_failed',
    ],
  });
  console.log(`  created webhook endpoint ${url} (${endpoint.id})`);
  return { endpoint, secret: endpoint.secret };
}

async function main() {
  console.log(`Setting up Stripe resources against ${STRIPE_SECRET_KEY.startsWith('sk_live') ? 'LIVE' : 'TEST'} mode...\n`);

  const envLines = [];

  for (const plan of PLANS) {
    console.log(`Plan: ${plan.name}`);
    const product = await ensureProduct(plan.name);
    const price = await ensurePrice(product, plan);
    envLines.push(`STRIPE_PRICE_ID_${plan.key}=${price.id}`);
  }

  console.log(`\nWebhook endpoint:`);
  const webhookUrl = `${APP_URL.replace(/\/$/, '')}/api/billing/webhook`;
  const { secret } = await ensureWebhook(webhookUrl);
  if (secret) envLines.push(`STRIPE_WEBHOOK_SECRET=${secret}`);

  console.log('\nDone. Env vars to set (Vercel project settings, or terraform.tfvars):\n');
  console.log(envLines.join('\n'));
}

main().catch((err) => {
  console.error('setup-stripe failed:', err.message);
  process.exit(1);
});
