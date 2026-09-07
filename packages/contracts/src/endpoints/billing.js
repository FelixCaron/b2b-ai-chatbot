// The billing products: Stripe checkout, the customer portal, and the webhook.
import { defineEndpoint, AUTH } from '../endpoint.js';
import { f, optional } from '../schema.js';

/** POST /api/billing/checkout — start a Stripe Checkout session for a plan. */
export const billingCheckout = defineEndpoint({
  name: 'billing.checkout',
  summary: 'Open a Stripe Checkout session for a plan and return its URL.',
  method: 'POST',
  path: '/api/billing/checkout',
  auth: AUTH.TENANT,
  runtime: 'nodejs',
  request: {
    planId: f.string({ min: 1, max: 64 }),
    tenantId: f.uuid(),
    email: optional(f.email())
  },
  response: {
    url: f.url({ requireProtocol: true }),
    sessionId: f.string()
  },
  errors: {
    400: 'planId and tenantId are required, or planId is unknown',
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
