// POST /api/staff/knowledge/reindex?site_id=<uuid> — re-read one or more of
// a customer's pages, on their request.
//
// The other half of "your bot is quoting something out of date": the page is
// still live, its content simply changed. Re-indexing needs the real crawl
// pipeline — Jina Reader, the chunker, the embedding call, the usage counter
// (api/crawler/scan.js) — which lives in the product's own Vercel project,
// not this one. Rather than grow a second copy of that pipeline here (it
// would drift, and the drift would show up as subtly different answers from
// the same page), this route forwards to it, once per URL, server-to-server:
//
//   * The staff member's own bearer token is forwarded, not a shared secret.
//     The product API accepts it because requireTenantOwnership() has a
//     narrow staff branch (see api/lib/server-config.js) — so the same
//     allow-list that guards this console is what authorises the crawl, and
//     the product API logs the staff identity too.
//   * Server-to-server rather than from the browser: the console and the
//     product are separate origins and separate deployments, so the base URL
//     is deployment configuration (APP_API_BASE_URL), not something a page
//     should be guessing.
//   * Sequentially, not in parallel: this spends the customer's scan quota
//     and hits a third-party fetcher. A staff member re-indexing a handful
//     of pages must not look like a burst of traffic.
//
// Without APP_API_BASE_URL set this route says so plainly (503) instead of
// half-working: everything else in the console keeps working, and the fix is
// one environment variable.
import { requireStaff, recordStaffAction } from '../../lib/server-config.js';

const MAX_URLS = 25;
const MAX_REASON_LENGTH = 500;

function readAuthorizationHeader(req) {
  if (typeof req.headers?.get === 'function') return req.headers.get('authorization');
  return req.headers?.authorization;
}

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

  const baseUrl = process.env.APP_API_BASE_URL?.trim()?.replace(/\/$/, '');
  if (!baseUrl) {
    return res.status(503).json({
      error: 'Re-indexing is not configured: set APP_API_BASE_URL (the product deployment this console should call, e.g. https://app.example.com) in this project’s environment.',
    });
  }

  const siteId = req.query?.site_id;
  if (!siteId) return res.status(400).json({ error: '?site_id= is required' });

  const urls = Array.isArray(req.body?.urls) ? req.body.urls.filter((u) => typeof u === 'string' && u.trim()) : [];
  const reason = String(req.body?.reason || '').trim().slice(0, MAX_REASON_LENGTH);

  if (urls.length === 0) return res.status(400).json({ error: 'Pass at least one url to re-index.' });
  if (urls.length > MAX_URLS) {
    return res.status(400).json({ error: `Too many urls in one request (max ${MAX_URLS}) — re-indexing spends the tenant's scan quota.` });
  }
  if (!reason) {
    return res.status(400).json({
      error: 'A reason is required — this re-crawls pages in a customer account, spends their scan quota, and is recorded against your name.',
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

    const authorization = readAuthorizationHeader(req);
    const results = [];

    for (const url of urls) {
      try {
        const response = await fetch(`${baseUrl}/api/crawler/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization },
          body: JSON.stringify({ site_id: siteId, tenant_id: site.tenant_id, url }),
        });
        const body = await response.json().catch(() => ({}));
        results.push({
          url,
          ok: response.ok && body?.success !== false,
          status: response.status,
          chunks_count: body?.chunks_count ?? 0,
          // The scan route reports these two as successes with zero chunks;
          // passing them through keeps "we re-read it and it was empty"
          // distinguishable from "it failed".
          is_empty: body?.is_empty === true,
          is_protected: body?.is_protected === true,
          error: response.ok ? undefined : body?.error || `HTTP ${response.status}`,
        });
      } catch (err) {
        results.push({ url, ok: false, status: 0, chunks_count: 0, error: err.message });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;

    await recordStaffAction(supabase, {
      actor: user,
      tenantId: site.tenant_id,
      siteId,
      action: 'knowledge.pages_reindexed',
      details: {
        domain: site.domain,
        requested: urls.length,
        succeeded,
        failed: results.filter((r) => !r.ok).map((r) => ({ url: r.url, error: r.error })),
      },
      reason,
    });

    return res.status(200).json({ results, succeeded, requested: urls.length });
  } catch (err) {
    console.error('[staff/knowledge/reindex] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
