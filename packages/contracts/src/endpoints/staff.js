// The internal-admin products (dorafi/staff), deployed as their own
// Vercel project. Staff-only: requireStaff() is the whole security model.
import { defineEndpoint, AUTH } from '../endpoint.js';
import { f, optional } from '../schema.js';

export const staffListTenants = defineEndpoint({
  name: 'staff.listTenants',
  summary: 'Every tenant with plan, status, usage and site count.',
  method: 'GET',
  path: '/api/staff/tenants',
  auth: AUTH.STAFF,
  runtime: 'nodejs',
  request: {},
  response: {
    tenants: f.arrayOf(f.any())
  }
});

export const staffGetTenant = defineEndpoint({
  name: 'staff.getTenant',
  summary: "One tenant's detail: sites, usage, leads, scan jobs.",
  method: 'GET',
  path: '/api/staff/tenants?id',
  auth: AUTH.STAFF,
  runtime: 'nodejs',
  request: {
    id: f.uuid()
  },
  response: {
    tenant: f.any(),
    sites: optional(f.arrayOf(f.any())),
    leads: optional(f.arrayOf(f.any())),
    usage: optional(f.any())
  }
});

export const staffUpdateTenantPlan = defineEndpoint({
  name: 'staff.updateTenantPlan',
  // `plan` is *which tier* the tenant is on (what features/limits apply);
  // `plan_status` is the Stripe subscription lifecycle state of that tier
  // (whether it's currently paid-and-active, lapsed, etc). A tenant that's
  // never subscribed is plan 'free' / plan_status 'free' — both values stay
  // in lockstep in that case, but diverge the moment they subscribe (e.g.
  // plan 'pro' / plan_status 'past_due' after a failed card charge).
  summary: 'Support override of a tenant plan (tier) and/or plan_status (billing state). Writes the database only — never Stripe.',
  method: 'PATCH',
  path: '/api/staff/tenants?id',
  auth: AUTH.STAFF,
  runtime: 'nodejs',
  request: {
    id: f.uuid(),
    plan: optional(f.oneOf(['free', 'basic', 'pro', 'premium'])),
    plan_status: optional(f.oneOf(['free', 'active', 'trialing', 'past_due', 'canceled']))
  },
  response: {
    tenant: f.any()
  },
  errors: {
    400: 'Nothing to update, or an unknown plan/plan_status value'
  }
});

export const staffDeleteSite = defineEndpoint({
  name: 'staff.deleteSite',
  summary: 'Cascade-delete a site from the staff console.',
  method: 'DELETE',
  path: '/api/staff/sites?id',
  auth: AUTH.STAFF,
  runtime: 'nodejs',
  request: {
    id: f.uuid()
  },
  response: {
    success: f.boolean()
  }
});

export const staffDeleteTenant = defineEndpoint({
  name: 'staff.deleteTenant',
  summary: 'Cascade-delete a tenant (and everything under it) from the staff console.',
  method: 'DELETE',
  path: '/api/staff/tenants?id',
  auth: AUTH.STAFF,
  runtime: 'nodejs',
  request: {
    id: f.uuid()
  },
  response: {
    tenant_id: f.uuid(),
    name: f.string()
  }
});

export const staffListAdmins = defineEndpoint({
  name: 'staff.listAdmins',
  summary: 'The staff allow-list.',
  method: 'GET',
  path: '/api/staff/admins',
  auth: AUTH.STAFF,
  runtime: 'nodejs',
  request: {},
  response: {
    admins: f.arrayOf(f.any())
  }
});

export const staffAddAdmin = defineEndpoint({
  name: 'staff.addAdmin',
  summary: 'Add an address to the staff allow-list, creating a Supabase Auth account for it first if none exists yet.',
  method: 'POST',
  path: '/api/staff/admins',
  auth: AUTH.STAFF,
  runtime: 'nodejs',
  request: {
    email: f.email()
  },
  response: {
    admin: f.any(),
    created: optional(f.boolean())
  }
});

export default [
  staffListTenants,
  staffGetTenant,
  staffUpdateTenantPlan,
  staffDeleteSite,
  staffDeleteTenant,
  staffListAdmins,
  staffAddAdmin
];
