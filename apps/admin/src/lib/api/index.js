// ---------------------------------------------------------------------------
// The API surface the admin app talks to, grouped by product.
//
// Components call `api.crawler.scan({ ... })`, never `fetch('/api/...')`. The
// URL, the method, the auth header and the payload shape all come from the
// contract, so renaming a field or moving a route is a one-file change here
// rather than a search across the component tree.
//
// Every function resolves to the client's envelope:
//   { ok: true, status, data } | { ok: false, status, error, issues? }
// ---------------------------------------------------------------------------

import { contracts } from '@b2b-ai-chatbot/contracts';
import { callEndpoint, endpointUrl, streamRequestInit } from './client';

export const chat = {
  /** The SSE stream is driven by fetch-event-source at the call site; this
   *  hands it the URL, headers and body the contract says to use. */
  streamInit: (payload) => streamRequestInit(contracts.chat.send, payload),
  endpointUrl: () => endpointUrl(contracts.chat.send),
  init: (payload) => callEndpoint(contracts.chat.init, payload),
  theme: (payload) => callEndpoint(contracts.chat.theme, payload)
};

export const crawler = {
  discover: (payload) => callEndpoint(contracts.crawler.discover, payload),
  scan: (payload) => callEndpoint(contracts.crawler.scan, payload),
  update: (payload) => callEndpoint(contracts.crawler.update, payload),
  summarize: (payload) => callEndpoint(contracts.crawler.summarize, payload),
  deleteSite: (payload) => callEndpoint(contracts.crawler.deleteSite, payload)
};

export const sites = {
  createClaim: (payload) => callEndpoint(contracts.sites.claim, { action: 'create', ...payload }),
  redeemClaim: () => callEndpoint(contracts.sites.claim, { action: 'redeem' })
};

export const billing = {
  checkout: (payload) => callEndpoint(contracts.billing.checkout, { action: 'checkout', ...payload }),
  /** Reconcile the tenant's billing columns with Stripe. Same route as
   *  checkout (one function, two actions — see the contract). */
  sync: (payload) => callEndpoint(contracts.billing.checkout, { action: 'sync', ...payload }),
  portal: (payload) => callEndpoint(contracts.billing.portal, payload)
};

export const api = { chat, crawler, sites, billing };

export { contracts, callEndpoint, endpointUrl, streamRequestInit };
export default api;
