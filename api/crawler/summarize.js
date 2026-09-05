import { generateWebsiteSummary, generateWelcomeExperience } from '../lib/llm.js';
import { createServiceRoleClient, requireSiteOwnership } from '../lib/server-config.js';
import { assertSafeExternalUrl } from '../lib/url-security.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      }
    });
  }

  const supabase = createServiceRoleClient();


  try {
    const { tenant_id, site_id, url, raw_content } = await req.json();

    await requireSiteOwnership(req, tenant_id, site_id);

    if (!tenant_id || !site_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields: tenant_id, site_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

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
      return new Response(JSON.stringify({ error: 'Insufficient content to generate a summary.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const [summaryText, welcomeExperience] = await Promise.all([
      generateWebsiteSummary({
        content: websiteContent,
        targetUrl: targetUrl || 'Website',
        apiKey: process.env.OPENROUTER_API_KEY
      }),
      generateWelcomeExperience({
        content: websiteContent,
        targetUrl: targetUrl || 'Website',
        apiKey: process.env.OPENROUTER_API_KEY
      }),
    ]);

    if (!summaryText) {
      return new Response(JSON.stringify({ error: 'Failed to generate the summary with the AI model.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Try upserting into site_summaries table first
    let summarySaved = false;
    let upsertData = null;

    try {
      const { data, error: upsertErr } = await supabase
        .from('site_summaries')
        .upsert({
          tenant_id,
          site_id,
          summary: summaryText,
          language: welcomeExperience.language,
          welcome_message: welcomeExperience.welcome_message,
          ui_status_title: welcomeExperience.ui_status_title,
          ui_status_online: welcomeExperience.ui_status_online,
          ui_input_placeholder: welcomeExperience.ui_input_placeholder,
          updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id,site_id' })
        .select()
        .maybeSingle();

      if (!upsertErr) {
        summarySaved = true;
        upsertData = data;
      }
    } catch (e) {
      console.warn('[generate-summary] site_summaries upsert warning:', e.message);
    }

    // Fallback: If site_summaries table is not ready, persist in documents table under url='site_summary'
    if (!summarySaved) {
      const summaryUrl = `${targetUrl || ''}#site-summary`;
      await supabase.from('documents').delete().eq('site_id', site_id).eq('url', summaryUrl);
      const { data: docRecord } = await supabase.from('documents').insert({
        tenant_id,
        site_id,
        url: summaryUrl,
        content: `[SITE_SUMMARY]\n${summaryText}`
      }).select().maybeSingle();

      upsertData = docRecord;
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: summaryText,
        record: upsertData
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

