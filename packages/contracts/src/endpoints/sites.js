// The workspace-transfer product: how a guest's work follows them into an account.
import { defineEndpoint, AUTH } from '../endpoint.js';
import { f, optional } from '../schema.js';

/**
 * POST /api/sites/claim — one address, two actions, because they are two halves
 * of the same transaction and share every guard. `action` selects which.
 */
export const sitesClaim = defineEndpoint({
  name: 'sites.claim',
  summary: "File (create) or execute (redeem) a guest workspace's claim on a real account.",
  method: 'POST',
  path: '/api/sites/claim',
  auth: AUTH.USER,
  runtime: 'edge',
  request: {
    action: f.oneOf(['create', 'redeem']),
    // create only — redeem deliberately takes no ids at all: the only input it
    // trusts is the verified email on the caller's own token.
    guest_tenant_id: optional(f.uuid()),
    site_id: optional(f.uuid()),
    email: optional(f.email())
  },
  response: {
    // create
    claim_id: optional(f.uuid()),
    // redeem
    status: optional(f.oneOf([
      'transferred', 'at_limit', 'duplicate_domain',
      'not_found', 'already_redeemed', 'expired', 'stale'
    ])),
    domain: optional(f.string({ min: 0 })),
    tenant_id: optional(f.uuid()),
    site_id: optional(f.uuid()),
    existing_site_id: optional(f.uuid()),
    plan: optional(f.string({ min: 0 })),
    limit: optional(f.number({ min: 0, integer: true })),
    site_count: optional(f.number({ min: 0, integer: true }))
  },
  errors: {
    400: "Unknown action — expected 'create' or 'redeem'",
    401: 'Authentication required',
    403: 'The caller does not own the guest tenant being claimed'
  }
});

export default [sitesClaim];
