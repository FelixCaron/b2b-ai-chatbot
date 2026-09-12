// POST /api/staff/knowledge/remove?site_id=<uuid> — forget one or more
// pages, on the customer's request.
//
// "Your bot keeps quoting a page we took down" has, until now, been a
// walk-the-customer-through-it phone call. Deleting the chunks is the whole
// fix: the retriever only ever sees `documents` rows (api/lib/rag-engine.js),
// so a removed page stops being quotable immediately, with no re-index.
//
// A POST rather than a DELETE: the contract client puts a DELETE's whole
// payload in the query string, and neither a list of URLs nor the mandatory
// reason belongs in a URL.
import { requireStaff, recordStaffAction } from '../../lib/server-config.js';

const MAX_URLS = 200;
const MAX_REASON_LENGTH = 500;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireStaff(req));
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message || 'Unauthorized' });
  }

  const siteId = req.query?.site_id;
  if (!siteId) return res.status(400).json({ error: '?site_id= is required' });

  const urls = Array.isArray(req.body?.urls) ? req.body.urls.filter((u) => typeof u === 'string' && u.trim()) : [];
  const reason = String(req.body?.reason || '').trim().slice(0, MAX_REASON_LENGTH);

  if (urls.length === 0) return res.status(400).json({ error: 'Pass at least one url to remove.' });
  if (urls.length > MAX_URLS) return res.status(400).json({ error: `Too many urls in one request (max ${MAX_URLS}).` });
  if (!reason) {
    return res.status(400).json({
      error: 'A reason is required — this deletes content from a customer account and is recorded against your name.',
    });
  }

  try {
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, tenant_id, domain')
      .eq('id', siteId)
      .maybeSingle();
    if (siteError) throw siteError;
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const { data: deleted, error } = await supabase
      .from('documents')
      .delete()
      .eq('site_id', siteId)
      .eq('tenant_id', site.tenant_id)
      .in('url', urls)
      .select('id, url');
    if (error) throw error;

    const removedChunks = (deleted || []).length;
    const removedUrls = [...new Set((deleted || []).map((row) => row.url))];

    await recordStaffAction(supabase, {
      actor: user,
      tenantId: site.tenant_id,
      siteId,
      action: 'knowledge.pages_removed',
      details: { domain: site.domain, urls: removedUrls, chunks: removedChunks },
      reason,
    });

    return res.status(200).json({ removed_urls: removedUrls, removed_chunks: removedChunks });
  } catch (err) {
    console.error('[staff/knowledge/remove] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
