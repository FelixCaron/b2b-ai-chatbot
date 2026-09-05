// GET /api/staff/tenants — list every tenant with plan/status/usage/site
// count, for the staff dashboard's tenant list. Read-only: no other verbs
// are supported. requireStaff() is the entire security model here — see
// api/lib/server-config.js for why that's safe even with a service-role
// client.
import { requireStaff } from '../lib/server-config.js';

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
    console.error('[staff/tenants] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
