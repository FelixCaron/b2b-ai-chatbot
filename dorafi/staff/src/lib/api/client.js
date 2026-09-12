// The staff console's transport: the shared contract client from
// @b2b-ai-chatbot/contracts, bound to this app's Supabase session. Same
// transport as dorafi/admin — see that file, and the package, for the details.
import { createApiClient } from '@b2b-ai-chatbot/contracts';
import { authenticatedHeaders } from '../supabase';

const client = createApiClient({
  getAuthHeaders: authenticatedHeaders,
  checkResponses: Boolean(import.meta.env?.DEV)
});

export const { callEndpoint, endpointUrl, streamRequestInit } = client;
export default client;
