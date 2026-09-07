// Scheduled maintenance.
import { defineEndpoint, AUTH } from '../endpoint.js';
import { f } from '../schema.js';

/** GET /api/cron/cleanup — sweep abandoned guest tenants and anonymous accounts. */
export const cronCleanup = defineEndpoint({
  name: 'cron.cleanup',
  summary: 'Delete guest tenants and anonymous auth accounts abandoned for more than 24h.',
  method: 'GET',
  path: '/api/cron/cleanup',
  auth: AUTH.CRON,
  runtime: 'nodejs',
  request: {},
  response: {
    success: f.boolean(),
    deleted_tenants: f.number({ min: 0, integer: true }),
    deleted_users: f.number({ min: 0, integer: true })
  }
});

export default [cronCleanup];
