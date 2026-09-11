// The billing products: Stripe checkout, the customer portal, and the webhook.
import { defineEndpoint, AUTH } from '../endpoint.js';
import { f, optional } from '../schema.js';

/**
 * POST /api/billing/checkout — a tenant's subscription, in the two directions
 * it moves. `action` selects which:
 *
 *   'checkout' (default) — open a Stripe Checkout session for `planId`.
 *   'sync'               — ask Stripe what this tenant's subscription actually
 *                          is and write it onto the tenant row.
 *
 * 'sync' exists because the tenant's billing columns were only ever written by
 * the Stripe webhook, which made a delivery that never arrives (wrong endpoint
 * secret, test-vs-live mode, a handler that 500s, a subscription created by
 * hand in the Stripe dashboard with no tenant metadata) indistinguishable from
 * "this customer never paid" — and the dashboard then locks a paying customer
 * out of their own install code. Stripe is the source of truth; anything that
 * gates on a plan can now go and read it instead of waiting to be told.
 *
 * Both actions live on this one route on purpose: bracket-segment routes do not
 * build in this project and a new file under /api counts against the Vercel
 * Hobby function cap (same reasoning as /api/sites/claim's two actions).
 */
export const billingCheckout = defineEndpoint({
  name: 'billing.checkout',
  summary: "Open a Stripe Checkout session for a plan, or reconcile the tenant's billing state from Stripe.",
  method: 'POST',
  path: '/api/billing/checkout',
  auth: AUTH.TENANT,
  runtime: 'nodejs',
  request: {
    tenantId: f.uuid(),
    action: optional(f.oneOf(['checkout', 'sync'])),
    // Required for 'checkout', meaningless for 'sync'.
    planId: optional(f.string({ min: 1, max: 64 })),
    email: optional(f.email())
  },
  response: {
    // checkout — absent when the tenant already subscribes to this plan.
    url: optional(f.url({ requireProtocol: true })),
    sessionId: optional(f.string()),
    // sync, and checkout's already-subscribed answer: the tenant's billing
    // state as Stripe reports it, after it has been written to the row.
    subscribed: optional(f.boolean()),
    plan: optional(f.string({ min: 0 })),
    planStatus: optional(f.string({ min: 0 }))
  },
  errors: {
    400: 'tenantId is required; planId is required and must be known for a checkout',
    401: 'Authentication required',
    403: 'The caller does not own this tenant'
  }
});

/** POST /api/billing/portal — a Stripe Billing Portal session for the tenant. */
export const billingPortal = defineEndpoint({
  name: 'billing.portal',
  summary: 'Open the Stripe Billing Portal for a tenant that already has a customer.',
  method: 'POST',
  path: '/api/billing/portal',
  auth: AUTH.TENANT,
  runtime: 'nodejs',
  request: {
    tenantId: f.uuid()
  },
  response: {
    url: f.url({ requireProtocol: true })
  },
  errors: {
    400: 'tenantId is required, or the tenant has no Stripe customer',
    401: 'Authentication required',
    403: 'The caller does not own this tenant'
  }
});

/**
 * POST /api/billing/webhook — Stripe → us. Authenticated by Stripe's own
 * signature over the raw body, which is why the request has no schema of ours:
 * the body must reach the handler byte-for-byte unparsed or the signature check
 * cannot run.
 */
export const billingWebhook = defineEndpoint({
  name: 'billing.webhook',
  summary: 'Stripe subscription lifecycle events. Signature-verified over the raw body.',
  method: 'POST',
  path: '/api/billing/webhook',
  auth: AUTH.WEBHOOK,
  runtime: 'nodejs',
  request: {},
  response: {
    received: f.boolean()
  },
  errors: {
    400: 'Signature verification failed'
  }
});

export default [billingCheckout, billingPortal, billingWebhook];
