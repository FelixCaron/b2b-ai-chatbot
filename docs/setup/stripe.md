# Stripe setup

Stripe handles the three subscription plans (Basic/Pro/Premium — see `ADR.md`'s pricing
note) via Checkout + the Billing Portal. `api/billing/checkout.js`, `portal.js`, and
`webhook.js` are the three integration points.

## Scripted (preferred)

```bash
export STRIPE_SECRET_KEY=sk_test_...          # test mode first, always
export VITE_APP_URL=https://your-admin-domain.example

npm run setup:stripe
```

This creates-or-reuses the 3 products, their monthly prices, and the checkout webhook
endpoint (pointed at `$VITE_APP_URL/api/billing/webhook`), looking each one up by name/
amount/URL first so re-running the script never duplicates resources. It prints the
`STRIPE_PRICE_ID_BASIC` / `STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_PREMIUM` /
`STRIPE_WEBHOOK_SECRET` values to paste into your env.

**The webhook signing secret is only ever shown once, at creation.** If you lose it,
delete the endpoint in the Stripe dashboard and re-run the script to get a fresh one —
don't try to recover an old secret.

## What you still have to do manually

1. **Create the Stripe account itself** and complete business verification before
   switching from test to live mode (see `TODO.md` — this product is still in test/sandbox
   mode as of this writing).
2. **Decide on tax.** `Pricing.jsx` currently shows tax-exclusive prices. If GST/QST (or
   your relevant sales tax) applies, enable Stripe Tax in the dashboard before going live.
3. **Re-run `npm run setup:stripe` against your live key** once verified, with a
   `VITE_APP_URL` pointed at your real production domain — this creates a second,
   independent set of live-mode products/prices/webhook (test and live mode are fully
   separate in Stripe), and gives you a fresh `STRIPE_WEBHOOK_SECRET` for the live
   endpoint.

## Manual fallback

Dashboard → Product catalog → New product (repeat for Basic/Pro/Premium, monthly
recurring price) → Developers → Webhooks → Add endpoint (`.../api/billing/webhook`,
events: `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.payment_failed`) → copy the signing secret.
