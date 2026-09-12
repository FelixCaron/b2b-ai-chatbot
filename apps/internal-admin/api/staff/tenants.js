// GET /api/staff/tenants — list every tenant with plan/status/usage, its
//   sites (domain, parked flag, widget install signal) and their count.
// GET /api/staff/tenants?id=<uuid> — one tenant's detail (sites, usage,
//   leads, scan jobs).
// PATCH /api/staff/tenants?id=<uuid> — manual plan/plan_status override
//   (support actions: granting a plan for a demo/VIP, fixing a Stripe sync
//   glitch). Writes the DB directly, does NOT touch Stripe — an accepted
//   trade-off for a support override, not a Stripe management tool.
// DELETE /api/staff/tenants?id=<uuid> — cascade-delete a tenant (e.g. a
//   spam/test signup, or a GDPR deletion request) and everything under it.
//   Relies on the child tables' ON DELETE CASCADE FKs rather than a bespoke
//   RPC (contrast api/staff/sites.js's delete_site_cascade) — there's no
//   per-row bookkeeping to return, just the tenants row itself to remove.
//
// The id is a query param, not a path segment (no api/staff/tenants/[id].js)
// — confirmed live 2026-09-05 that this Vercel project's zero-config api/
// builder wasn't building ANY bracket-segment route (tested two independent
// ones, tenants/[id].js and sites/[id].js — both fell through to the SPA's
// index.html regardless of two unrelated-looking fixes tried first). Rather
// than keep chasing why, this sidesteps bracket segments entirely — a
// pattern already proven working by every flat route in this app.
//
// requireStaff() is the entire security model here — see
// api/lib/server-config.js for why that's safe even with a service-role
// client.
import { requireStaff, recordStaffAction } from '../lib/server-config.js';

/** Run a query whose table or function may not exist on this database yet.
 *  Returns `{ data, available }` instead of throwing, so one panel that is a
 *  migration behind cannot take the whole tenant page down with it. */
async function softQuery(query) {
  try {
    const { data, error } = await query;
    if (error) throw error;
    return { data: data || [], available: true };
  } catch (err) {
    console.warn('[staff/tenants] optional panel unavailable:', err.message);
    return { data: [], available: false };
  }
}

const VALID_PLANS = ['free', 'basic', 'pro', 'premium'];
const VALID_STATUSES = ['free', 'active', 'trialing', 'past_due', 'canceled'];

export default async function handler(req, res) {
  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireStaff(req));
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message || 'Unauthorized' });
  }

  const tenantId = req.query?.id;

  if (req.method === 'DELETE') {
    if (!tenantId) {
      return res.status(400).json({ error: '?id= is required for DELETE' });
    }
    try {
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('id', tenantId)
        .maybeSingle();
      if (tenantError) throw tenantError;
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      // No RPC needed here (unlike delete_site_cascade) — every child table's
      // tenant_id FK is already ON DELETE CASCADE (see the consolidated
      // schema migration), so one delete on `tenants` removes its sites,
      // documents, messages, leads, usage_counters, scan_jobs, and site
      // summaries in the same transaction. owner_user_id is ON DELETE
      // RESTRICT the other way round (deleting the auth user while a tenant
      // still references it is blocked) — it does not stop this delete.
      const { error: deleteError } = await supabase.from('tenants').delete().eq('id', tenantId);
      if (deleteError) throw deleteError;

      await recordStaffAction(supabase, {
        actor: user,
        tenantId,
        action: 'tenant.deleted',
        details: { name: tenant.name },
        reason: typeof req.query?.reason === 'string' ? req.query.reason.trim().slice(0, 500) || null : null,
      });

      return res.status(200).json({ tenant_id: tenant.id, name: tenant.name });
    } catch (err) {
      console.error('[staff/tenants] DELETE error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PATCH') {
    if (!tenantId) {
      return res.status(400).json({ error: '?id= is required for PATCH' });
    }
    const { plan, plan_status } = req.body || {};
    const patch = {};
    if (plan !== undefined) {
      if (!VALID_PLANS.includes(plan)) {
        return res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(', ')}` });
      }
      patch.plan = plan;
    }
    if (plan_status !== undefined) {
      if (!VALID_STATUSES.includes(plan_status)) {
        return res.status(400).json({ error: `plan_status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      patch.plan_status = plan_status;
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nothing to update — pass plan and/or plan_status' });
    }

    try {
      // Read first so the audit entry can say what it changed from, not just
      // what it changed to.
      const { data: before } = await supabase
        .from('tenants')
        .select('plan, plan_status')
        .eq('id', tenantId)
        .maybeSingle();

      const { data, error } = await supabase
        .from('tenants')
        .update(patch)
        .eq('id', tenantId)
        .select('id, name, plan, plan_status')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Tenant not found' });

      await recordStaffAction(supabase, {
        actor: user,
        tenantId,
        action: 'tenant.plan_overridden',
        details: Object.fromEntries(
          Object.entries(patch).map(([field, to]) => [field, { from: before?.[field] ?? null, to }])
        ),
        reason: typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) || null : null,
      });

      return res.status(200).json({ tenant: data });
    } catch (err) {
      console.error('[staff/tenants] PATCH error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (tenantId) {
    try {
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id, name, plan, plan_status, plan_expires_at, trial_ends_at, stripe_customer_id, stripe_subscription_id, created_at, owner_user_id')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantError) throw tenantError;
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      const [{ data: sites, error: sitesError }, { data: usageCounters, error: usageCountersError }, { data: leadsCountRows, error: leadsError }, { data: scanJobs, error: scanJobsError }, { data: summaries, error: summariesError }, supportTickets, staffActions] =
        await Promise.all([
          supabase
            .from('sites')
            .select('id, domain, public_key, bot_goal, bot_tone, theme_primary_color, support_email, calendar_link, enable_lead_capture, is_active, widget_last_seen_at, created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false }),
          supabase
            .from('usage_counters')
            .select('usage_date, messages_count, scans_count')
            .eq('tenant_id', tenantId)
            .order('usage_date', { ascending: false })
            .limit(30),
          supabase.from('leads').select('id').eq('tenant_id', tenantId),
          supabase
            .from('scan_jobs')
            .select('id, site_id, url, status, pages_discovered, pages_indexed, error_message, created_at, updated_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(20),
          // The assistant's own words, per site: what it greets visitors
          // with and the summary it answers from. Staff edit these through
          // api/staff/sites.js (PATCH), so the console has to be able to
          // show what is there now.
          supabase
            .from('site_summaries')
            .select('site_id, summary, welcome_message, ui_status_title, ui_status_online, ui_input_placeholder, language, updated_at')
            .eq('tenant_id', tenantId),
          // Both of these are best-effort: a console that 500s because one
          // optional panel's table or function isn't there yet is worse than
          // one that renders without that panel. support_tickets arrived in
          // 20260909040000 and list_staff_actions in 20260912020000 — a
          // deployment that is mid-migration still gets a working page.
          softQuery(
            supabase
              .from('support_tickets')
              .select('id, site_id, name, email, message, delivered, delivery_error, created_at')
              .eq('tenant_id', tenantId)
              .order('created_at', { ascending: false })
              .limit(25)
          ),
          softQuery(supabase.rpc('list_staff_actions', { p_tenant_id: tenantId, p_limit: 25 })),
        ]);

      if (sitesError) throw sitesError;
      if (usageCountersError) throw usageCountersError;
      if (leadsError) throw leadsError;
      if (scanJobsError) throw scanJobsError;
      if (summariesError) throw summariesError;

      return res.status(200).json({
        tenant,
        sites: sites || [],
        site_summaries: summaries || [],
        usage_counters: usageCounters || [],
        leads_count: (leadsCountRows || []).length,
        scan_jobs: scanJobs || [],
        support_tickets: supportTickets.data || [],
        support_tickets_available: supportTickets.available,
        staff_actions: staffActions.data || [],
        staff_actions_available: staffActions.available,
      });
    } catch (err) {
      console.error('[staff/tenants] detail error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const [{ data: tenants, error: tenantsError }, { data: sites, error: sitesError }, { data: usage, error: usageError }] =
      await Promise.all([
        supabase
          .from('tenants')
          .select('id, name, plan, plan_status, plan_expires_at, trial_ends_at, stripe_customer_id, stripe_subscription_id, created_at')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('sites').select('id, tenant_id, domain, is_active, widget_last_seen_at'),
        supabase.from('usage').select('tenant_id, messages_count, leads_count'),
      ]);

    if (tenantsError) throw tenantsError;
    if (sitesError) throw sitesError;
    if (usageError) throw usageError;

    // The sites themselves ride along, not just their count: the console rolls
    // them up into one widget status per tenant with the shared helper
    // (resolveTenantWidgetStatus in @b2b-ai-chatbot/contracts), which needs
    // each site's own install signal and parked flag. Derived there rather
    // than here so this app's serverless functions keep their zero
    // cross-boundary imports — see api/lib/server-config.js's header for why
    // that rule exists.
    const sitesByTenant = new Map();
    for (const site of sites || []) {
      const list = sitesByTenant.get(site.tenant_id);
      if (list) list.push(site);
      else sitesByTenant.set(site.tenant_id, [site]);
    }
    const usageByTenant = new Map((usage || []).map((u) => [u.tenant_id, u]));

    const result = (tenants || []).map((tenant) => {
      const tenantSites = sitesByTenant.get(tenant.id) || [];
      return {
        ...tenant,
        sites: tenantSites,
        site_count: tenantSites.length,
        messages_count: usageByTenant.get(tenant.id)?.messages_count || 0,
        leads_count: usageByTenant.get(tenant.id)?.leads_count || 0,
      };
    });

    return res.status(200).json({ tenants: result });
  } catch (err) {
    console.error('[staff/tenants] list error:', err);
    return res.status(500).json({ error: err.message });
  }
}
