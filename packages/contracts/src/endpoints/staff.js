// The internal-admin products (apps/internal-admin), deployed as their own
// Vercel project. Staff-only: requireStaff() is the whole security model.
import { defineEndpoint, AUTH } from '../endpoint.js';
import { f, optional } from '../schema.js';
import { BOT_GOALS, BOT_TONES, MAX_SUMMARY_LENGTH, MAX_LABEL_LENGTH } from '../bot-settings.js';

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
    site_summaries: optional(f.arrayOf(f.any())),
    leads: optional(f.arrayOf(f.any())),
    usage: optional(f.any()),
    support_tickets: optional(f.arrayOf(f.any())),
    staff_actions: optional(f.arrayOf(f.any()))
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
    plan_status: optional(f.oneOf(['free', 'active', 'trialing', 'past_due', 'canceled'])),
    // Optional here, unlike the bot edits: a plan override is often its own
    // explanation (a demo, a Stripe sync glitch). When given it lands in the
    // same audit trail.
    reason: optional(f.string({ min: 0, max: 500 }))
  },
  response: {
    tenant: f.any()
  },
  errors: {
    400: 'Nothing to update, or an unknown plan/plan_status value'
  }
});

export const staffUpdateSite = defineEndpoint({
  // Support editing a customer's assistant for them, which is most of what
  // "can you help us with the bot" turns out to mean. Two tables behind one
  // call: `sites` (how it behaves) and `site_summaries` (what it says and
  // answers from) — the split the dashboard itself uses.
  //
  // `reason` is required, not optional politeness: the write lands in
  // someone else's account and is recorded against the staff member's name
  // in internal.staff_audit.
  name: 'staff.updateSite',
  summary: "Edit a tenant's assistant on their behalf: behaviour, wording, and the summary it answers from. Requires a reason; every change is audited.",
  method: 'PATCH',
  path: '/api/staff/sites?id',
  auth: AUTH.STAFF,
  runtime: 'nodejs',
  request: {
    id: f.uuid(),
    reason: f.string({ min: 1, max: 500 }),
    bot_goal: optional(f.oneOf(BOT_GOALS)),
    bot_tone: optional(f.oneOf(BOT_TONES)),
    theme_primary_color: optional(f.string({ max: 7 })),
    enable_lead_capture: optional(f.boolean()),
    support_email: optional(f.string({ min: 0, max: 200 })),
    calendar_link: optional(f.string({ min: 0, max: 200 })),
    is_active: optional(f.boolean()),
    summary: optional(f.string({ min: 0, max: MAX_SUMMARY_LENGTH })),
    welcome_message: optional(f.string({ min: 0, max: MAX_LABEL_LENGTH })),
    ui_status_title: optional(f.string({ min: 0, max: MAX_LABEL_LENGTH })),
    ui_status_online: optional(f.string({ min: 0, max: MAX_LABEL_LENGTH })),
    ui_input_placeholder: optional(f.string({ min: 0, max: MAX_LABEL_LENGTH }))
  },
  response: {
    site: f.any(),
    summary: optional(f.any()),
    // Fields the database refused to keep, because the tenant's plan does
    // not include them (enforce_pro_features clamps them silently). Reported
    // so the console can say so rather than showing a saved value that isn't.
    clamped: optional(f.arrayOf(f.string()))
  },
  errors: {
    400: 'No reason given, nothing to update, or a field failed validation',
    409: "The site has no summary row yet, or the plan's site limit refused a re-activation"
  }
});

export const staffListSitePages = defineEndpoint({
  name: 'staff.listSitePages',
  summary: "The pages a site's assistant answers from, folded up from document chunks.",
  method: 'GET',
  path: '/api/staff/knowledge?site_id',
  auth: AUTH.STAFF,
  runtime: 'nodejs',
  request: {
    site_id: f.uuid()
  },
  response: {
    site_id: f.uuid(),
    domain: optional(f.string()),
    pages: f.arrayOf(f.any()),
    truncated: optional(f.boolean())
  }
});

export const staffRemoveSitePages = defineEndpoint({
  name: 'staff.removeSitePages',
  summary: 'Forget indexed pages on a customer’s request. Requires a reason; audited.',
  method: 'POST',
  path: '/api/staff/knowledge/remove?site_id',
  auth: AUTH.STAFF,
  runtime: 'nodejs',
  request: {
    site_id: f.uuid(),
    urls: f.arrayOf(f.string({ min: 1 }), { max: 200 }),
    reason: f.string({ min: 1, max: 500 })
  },
  response: {
    removed_urls: f.arrayOf(f.string()),
    removed_chunks: f.number({ min: 0, integer: true })
  },
  errors: {
    400: 'No urls, too many urls, or no reason given'
  }
});

export const staffReindexSitePages = defineEndpoint({
  name: 'staff.reindexSitePages',
  summary: "Re-read pages whose content changed, through the product's own crawl pipeline. Requires a reason; audited; spends the tenant's scan quota.",
  method: 'POST',
  path: '/api/staff/knowledge/reindex?site_id',
  auth: AUTH.STAFF,
  runtime: 'nodejs',
  request: {
    site_id: f.uuid(),
    urls: f.arrayOf(f.string({ min: 1 }), { max: 25 }),
    reason: f.string({ min: 1, max: 500 })
  },
  response: {
    results: f.arrayOf(f.any()),
    succeeded: f.number({ min: 0, integer: true }),
    requested: f.number({ min: 0, integer: true })
  },
  errors: {
    400: 'No urls, too many urls, or no reason given',
    503: 'APP_API_BASE_URL is not set on this deployment, so the crawl pipeline cannot be reached'
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
    id: f.uuid(),
    // A DELETE carries its whole payload in the query string (see
    // client.js), so this rides there rather than in a body.
    reason: optional(f.string({ min: 0, max: 500 }))
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
    id: f.uuid(),
    reason: optional(f.string({ min: 0, max: 500 }))
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
  staffUpdateSite,
  staffListSitePages,
  staffRemoveSitePages,
  staffReindexSitePages,
  staffDeleteSite,
  staffDeleteTenant,
  staffListAdmins,
  staffAddAdmin
];
