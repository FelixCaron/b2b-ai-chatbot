// GET /api/staff/knowledge?site_id=<uuid> — what the assistant actually
// knows about this site, page by page.
//
// The single most common support question about a wrong answer is "where is
// it getting that from?", and until now the only way to answer it was to
// open the customer's own dashboard, which staff cannot do. `documents` is
// one row per chunk, so this folds them back into the pages a human thinks
// in: one entry per URL, with how many chunks it produced, how many of those
// have an embedding (a chunk without one is keyword-searchable but never
// enters semantic ranking — see api/crawler/scan.js), and when it was last
// indexed.
//
// Read-only. The two write actions live next door, one file each, because
// each needs its own reason and its own audit entry:
// knowledge/remove.js and knowledge/reindex.js.
import { requireStaff } from '../lib/server-config.js';

// A site with more indexed chunks than this is not a page list any human
// reads top to bottom; the response says it was truncated rather than
// quietly returning a prefix.
const MAX_CHUNKS_SCANNED = 5000;

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

  const siteId = req.query?.site_id;
  if (!siteId) return res.status(400).json({ error: '?site_id= is required' });

  try {
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, tenant_id, domain')
      .eq('id', siteId)
      .maybeSingle();
    if (siteError) throw siteError;
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const { data: chunks, error: chunksError } = await supabase
      .from('documents')
      .select('url, embedding, created_at')
      // Both keys, always (CLAUDE.md's tenant-isolation rule): site_id alone
      // would be enough here, but "documents queries ALWAYS enforce
      // tenant_id" is the rule precisely so no query has to be audited for
      // whether it was the exception.
      .eq('site_id', siteId)
      .eq('tenant_id', site.tenant_id)
      .limit(MAX_CHUNKS_SCANNED + 1);
    if (chunksError) throw chunksError;

    const rows = chunks || [];
    const truncated = rows.length > MAX_CHUNKS_SCANNED;

    const byUrl = new Map();
    for (const chunk of rows.slice(0, MAX_CHUNKS_SCANNED)) {
      const page = byUrl.get(chunk.url) || { url: chunk.url, chunks: 0, embedded: 0, last_indexed_at: null };
      page.chunks += 1;
      if (chunk.embedding) page.embedded += 1;
      if (!page.last_indexed_at || (chunk.created_at && chunk.created_at > page.last_indexed_at)) {
        page.last_indexed_at = chunk.created_at;
      }
      byUrl.set(chunk.url, page);
    }

    const pages = [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));

    return res.status(200).json({ site_id: siteId, domain: site.domain, pages, truncated });
  } catch (err) {
    console.error('[staff/knowledge] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
