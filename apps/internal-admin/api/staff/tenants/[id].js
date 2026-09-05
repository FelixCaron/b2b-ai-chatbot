// GET /api/staff/tenants/:id — one tenant's detail for the staff drill-down
// view: sites, recent daily usage, lead count, recent scan jobs, billing
// fields. Read-only, staff-gated (requireStaff) — see
// api/lib/server-config.js.
import { requireStaff } from '../../lib/server-config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let supabase;
  try {
    ({ supabase } = await requireStaff(req));
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message || 'Unauthorized' });
  }

  const tenantId = req.query?.id || req.url?.split('/').pop();
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant id is required' });
  }

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
    console.error('[staff/tenants/:id] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
