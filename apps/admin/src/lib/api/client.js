// The admin app's transport: the shared contract client from
// @b2b-ai-chatbot/contracts, bound to this app's Supabase session.
//
// Everything about how a call is made — URL, method, auth header, payload
// split, request validation, the { ok, status, data, error } envelope — lives
// in the package, so the admin SPA and the staff console cannot drift apart on
// it. All this file supplies is "how do I get a bearer token here".
import { createApiClient } from '@b2b-ai-chatbot/contracts';
import { authenticatedHeaders } from '../supabase';

const client = createApiClient({
  getAuthHeaders: authenticatedHeaders,
  // Contract drift is a development-time signal, never a user-facing failure.
  checkResponses: Boolean(import.meta.env?.DEV)
});

export const { callEndpoint, endpointUrl, streamRequestInit } = client;
export default client;
