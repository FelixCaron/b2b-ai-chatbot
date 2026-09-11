// ---------------------------------------------------------------------------
// @b2b-ai-chatbot/contracts — every Dorafi API described once.
//
// Each endpoint is a *product*: an address, an auth posture, a request shape, a
// response shape, and the errors a caller is expected to handle. The serverless
// handler in /api and the browser client in apps/*/src/lib/api both import the
// same definition, so neither side can drift from the other without the change
// being visible in one file.
//
// Zero dependencies and no build step on purpose: the Edge handlers, the Vite
// bundle and the plain-node test scripts all import this source directly.
// ---------------------------------------------------------------------------

export { ValidationError, f, optional, parseFields, safeParseFields } from './schema.js';
export { defineEndpoint, registry, AUTH } from './endpoint.js';
export { createApiClient } from './client.js';
export * from './plans.js';
export * from './stripe-billing.js';
export * from './niches.js';

import { registry } from './endpoint.js';

import chatEndpoints from './endpoints/chat.js';
import crawlerEndpoints from './endpoints/crawler.js';
import sitesEndpoints from './endpoints/sites.js';
import billingEndpoints from './endpoints/billing.js';
import opsEndpoints from './endpoints/ops.js';
import staffEndpoints from './endpoints/staff.js';

export * from './endpoints/chat.js';
export * from './endpoints/crawler.js';
export * from './endpoints/sites.js';
export * from './endpoints/billing.js';
export * from './endpoints/ops.js';
export * from './endpoints/staff.js';

/** Every endpoint, keyed by its dotted name ('crawler.scan', 'billing.portal'). */
export const endpoints = registry(
  chatEndpoints,
  crawlerEndpoints,
  sitesEndpoints,
  billingEndpoints,
  opsEndpoints,
  staffEndpoints
);

/** Grouped the way the product families are grouped on disk and in the UI. */
export const contracts = Object.freeze({
  chat: Object.freeze({
    send: endpoints['chat.send'],
    init: endpoints['chat.init'],
    theme: endpoints['chat.theme']
  }),
  crawler: Object.freeze({
    discover: endpoints['crawler.discover'],
    scan: endpoints['crawler.scan'],
    update: endpoints['crawler.update'],
    summarize: endpoints['crawler.summarize'],
    deleteSite: endpoints['crawler.deleteSite']
  }),
  sites: Object.freeze({
    claim: endpoints['sites.claim']
  }),
  billing: Object.freeze({
    checkout: endpoints['billing.checkout'],
    portal: endpoints['billing.portal'],
    webhook: endpoints['billing.webhook']
  }),
  staff: Object.freeze({
    listTenants: endpoints['staff.listTenants'],
    getTenant: endpoints['staff.getTenant'],
    updateTenantPlan: endpoints['staff.updateTenantPlan'],
    deleteSite: endpoints['staff.deleteSite'],
    deleteTenant: endpoints['staff.deleteTenant'],
    listAdmins: endpoints['staff.listAdmins'],
    addAdmin: endpoints['staff.addAdmin']
  })
});

export default contracts;
