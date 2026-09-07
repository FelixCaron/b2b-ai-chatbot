import { contracts } from '@b2b-ai-chatbot/contracts';
import { edgeRoute } from '../lib/http.js';
import { requireSiteOwnership } from '../lib/server-config.js';

export const config = {
  runtime: 'edge',
};

// The contract is tenant-scoped, so the wrapper has already proved the caller
// owns tenant_id before we get here — there is no "unauthenticated fallback".
// Skipping that check previously meant any authenticated user could delete any
// site by guessing/knowing its id (IDOR). delete_site_cascade re-checks that
// the site really belongs to the tenant, so a stray site_id deletes nothing.
export default edgeRoute(contracts.crawler.deleteSite, async (req, { data, supabase, json }) => {
  const { site_id, tenant_id } = data;

  // The wrapper proved the caller owns the tenant; this proves the site is in
  // it, so a site id belonging to somebody else is refused as 403 here rather
  // than surfacing as a failed RPC.
  await requireSiteOwnership(req, tenant_id, site_id);

  // Single atomic transaction: either everything (documents, site_summaries,
  // leads, scan_jobs, and the site row itself) is deleted, or nothing is —
  // no more partial deletes from swallowed per-table errors.
  const { data: deleted, error } = await supabase.rpc('delete_site_cascade', {
    p_site_id: site_id,
    p_tenant_id: tenant_id
  });

  if (error) {
    console.error('[delete-site] Cascade delete failed:', error);
    return json({ error: error.message || 'Failed to delete site' }, 500);
  }

  return json({
    success: true,
    site_id,
    deleted: deleted || null
  });
});
