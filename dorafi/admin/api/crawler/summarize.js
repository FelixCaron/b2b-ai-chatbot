import { contracts } from '@b2b-ai-chatbot/contracts';
import { edgeRoute } from '../_lib/http.js';
import { createServiceRoleClient, requireSiteOwnership } from '../_lib/server-config.js';
import { assertSafeExternalUrl } from '../_lib/url-security.js';
import { persistSiteSummary } from '../_lib/site-summary.js';

export const config = {
  runtime: 'edge',
};

export default edgeRoute(contracts.crawler.summarize, async (req, { data, json }) => {
  const { tenant_id, site_id, url, raw_content } = data;

  const supabase = createServiceRoleClient();

  // The contract's tenant auth already proved the caller owns tenant_id; this
  // additionally proves the site itself lives in that tenant.
  await requireSiteOwnership(req, tenant_id, site_id);

  let targetUrl = url;
  if (!targetUrl) {
    const { data: siteData } = await supabase.from('sites').select('domain').eq('id', site_id).maybeSingle();
    if (siteData) targetUrl = siteData.domain;
  }
  if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }
  targetUrl = assertSafeExternalUrl(targetUrl).href;

  let websiteContent = raw_content || '';

  // If raw content is not provided, fetch via Jina Reader
  if (!websiteContent && targetUrl) {
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
        headers: {
          'Accept': 'text/plain',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (jinaRes.ok) {
        websiteContent = await jinaRes.text();
      }
    } catch (e) {
      console.warn('[generate-summary] Fetch error:', e.message);
    }
  }

  // If still no direct content, gather documents chunks from database for this site
  if (!websiteContent || websiteContent.length < 100) {
    const { data: docs } = await supabase
      .from('documents')
      .select('content')
      .eq('site_id', site_id)
      .limit(15);

    if (docs && docs.length > 0) {
      websiteContent = docs.map(d => d.content).join('\n\n');
    }
  }

  if (!websiteContent || websiteContent.length < 50) {
    return json({ error: 'Insufficient content to generate a summary.' }, 400);
  }

  const summaryText = await persistSiteSummary({
    supabase,
    tenantId: tenant_id,
    siteId: site_id,
    targetUrl: targetUrl || 'Website',
    content: websiteContent,
    apiKey: process.env.OPENROUTER_API_KEY
  });

  if (!summaryText) {
    return json({ error: 'Failed to generate the summary with the AI model.' }, 500);
  }

  return json({
    success: true,
    summary: summaryText
  });
});

