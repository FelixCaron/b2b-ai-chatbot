// GET /api/staff/tenants — list every tenant with plan/status/usage/site count.
// GET /api/staff/tenants?id=<uuid> — one tenant's detail (sites, usage,
//   leads, scan jobs).
// PATCH /api/staff/tenants?id=<uuid> — manual plan/plan_status override
//   (support actions: granting a plan for a demo/VIP, fixing a Stripe sync
//   glitch). Writes the DB directly, does NOT touch Stripe — an accepted
//   trade-off for a support override, not a Stripe management tool.
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
import { requireStaff } from '../lib/server-config.js';

const VALID_PLANS = ['basic', 'pro', 'premium'];
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
      const { data, error } = await supabase
        .from('tenants')
        .update(patch)
        .eq('id', tenantId)
        .select('id, name, plan, plan_status')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Tenant not found' });

      // Not a full audit log (see docs/INTEGRATION_REVIEW.md's gap list) — a
      // console line is at least a durable-in-Vercel's-log-retention record
      // of who overrode what, until real audit logging exists.
      console.log(`[staff/tenants] ${user.email} set tenant ${tenantId} ->`, patch);

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
        .select('id, name, plan, plan_status, plan_expires_at, stripe_customer_id, stripe_subscription_id, created_at, owner_user_id')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantError) throw tenantError;
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      const [{ data: sites, error: sitesError }, { data: usageCounters, error: usageCountersError }, { data: leadsCountRows, error: leadsError }, { data: scanJobs, error: scanJobsError }] =
        await Promise.all([
          supabase
            .from('sites')
            .select('id, domain, public_key, enable_lead_capture, created_at')
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
        ]);

      if (sitesError) throw sitesError;
      if (usageCountersError) throw usageCountersError;
      if (leadsError) throw leadsError;
      if (scanJobsError) throw scanJobsError;

      return res.status(200).json({
        tenant,
        sites: sites || [],
        usage_counters: usageCounters || [],
        leads_count: (leadsCountRows || []).length,
        scan_jobs: scanJobs || [],
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
          .select('id, name, plan, plan_status, plan_expires_at, stripe_customer_id, created_at')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('sites').select('id, tenant_id'),
        supabase.from('usage').select('tenant_id, messages_count, leads_count'),
      ]);

    if (tenantsError) throw tenantsError;
    if (sitesError) throw sitesError;
    if (usageError) throw usageError;

    const siteCountByTenant = new Map();
    for (const site of sites || []) {
      siteCountByTenant.set(site.tenant_id, (siteCountByTenant.get(site.tenant_id) || 0) + 1);
    }
    const usageByTenant = new Map((usage || []).map((u) => [u.tenant_id, u]));

    const result = (tenants || []).map((tenant) => ({
      ...tenant,
      site_count: siteCountByTenant.get(tenant.id) || 0,
      messages_count: usageByTenant.get(tenant.id)?.messages_count || 0,
      leads_count: usageByTenant.get(tenant.id)?.leads_count || 0,
    }));

    return res.status(200).json({ tenants: result });
  } catch (err) {
    console.error('[staff/tenants] list error:', err);
    return res.status(500).json({ error: err.message });
  }
}
