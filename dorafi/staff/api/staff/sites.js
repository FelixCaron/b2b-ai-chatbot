// DELETE /api/staff/sites?id=<uuid> — staff-assisted site deletion (e.g. a
// tenant asks for a broken/test site removed and can't do it themselves).
// Reuses the same atomic, cascade-checked RPC the tenant-facing delete-site
// flow uses (supabase/migrations — delete_site_cascade, see its own comment
// for why it's one transaction rather than delete-each-table-and-swallow-
// errors). Staff-gated (requireStaff) — see api/lib/server-config.js.
//
// id is a query param, not a path segment — see api/staff/tenants.js's
// header comment for why: this Vercel project doesn't build bracket-segment
// (`[id].js`) routes, confirmed live 2026-09-05 on two independent examples.
import { requireStaff } from '../lib/server-config.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireStaff(req));
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message || 'Unauthorized' });
  }

  const siteId = req.query?.id;
  if (!siteId) {
    return res.status(400).json({ error: '?id= is required' });
  }

  try {
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, tenant_id, domain')
      .eq('id', siteId)
      .maybeSingle();
    if (siteError) throw siteError;
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const { data, error } = await supabase.rpc('delete_site_cascade', {
      p_site_id: site.id,
      p_tenant_id: site.tenant_id,
    });
    if (error) throw error;

    console.log(`[staff/sites] ${user.email} deleted site ${site.domain} (${siteId}) for tenant ${site.tenant_id}`);

    return res.status(200).json({ deleted: data });
  } catch (err) {
    console.error('[staff/sites] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
