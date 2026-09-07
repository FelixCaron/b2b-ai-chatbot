// ---------------------------------------------------------------------------
// The API surface the staff console talks to, grouped by product.
//
// Components call `api.staff.listTenants()`, never `fetch('/api/staff/...')`.
// The URL, the method, the auth header and the payload shape all come from the
// contract, so renaming a field or moving a route is a one-file change here
// rather than a search across the component tree.
//
// Every function resolves to the client's envelope:
//   { ok: true, status, data } | { ok: false, status, error, issues? }
// A failed call also carries the server's own body as `data`, which is where
// these components read their error text from.
// ---------------------------------------------------------------------------

import { contracts } from '@b2b-ai-chatbot/contracts';
import { callEndpoint, endpointUrl } from './client';

export const staff = {
  listTenants: () => callEndpoint(contracts.staff.listTenants),
  getTenant: (payload) => callEndpoint(contracts.staff.getTenant, payload),
  updateTenantPlan: (payload) => callEndpoint(contracts.staff.updateTenantPlan, payload),
  deleteSite: (payload) => callEndpoint(contracts.staff.deleteSite, payload),
  listAdmins: () => callEndpoint(contracts.staff.listAdmins),
  addAdmin: (payload) => callEndpoint(contracts.staff.addAdmin, payload)
};

export const api = { staff };

export { contracts, callEndpoint, endpointUrl };
export default api;
