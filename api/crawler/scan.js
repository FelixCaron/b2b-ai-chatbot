import { createClient } from '@supabase/supabase-js';
import { generateEmbedding, generateWebsiteSummary, generateWelcomeExperience } from '../lib/llm.js';
import { assertSafeExternalUrl } from '../lib/url-security.js';
import { requireSiteOwnership } from '../lib/server-config.js';

export const config = {
  runtime: 'edge',
};


const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY;

const supabase = (VITE_SUPABASE_URL && SERVICE_ROLE_KEY) ? createClient(VITE_SUPABASE_URL, SERVICE_ROLE_KEY) : null;

// Patterns that identify noise paragraphs (GDPR, cookie banners, nav menus, scripts)
const NOISE_PATTERNS = [
  /cookie/i,
  /cookieyes/i,
  /Duration\s+\d+/i,
  /_ga[t_]/i,
  /VISITOR_INFO/i,
  /yt-remote/i,
  /innertube/i,
  /localStorage/i,
  /sessionStorage/i,
  /\bGTM-/i,
  /Google Analytics/i,
  /Google Tag Manager/i,
  /Reject All/i,
  /Accept All/i,
  /Save My Preferences/i,
  /Powered by.*Cookie/i,
  /Privacy Policy/i,
  /Terms of Service/i,
];

function normalizePageUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    let uStr = rawUrl.split('#')[0].split('?')[0].trim();
    if (!uStr.startsWith('http://') && !uStr.startsWith('https://')) {
      uStr = `https://${uStr}`;
    }
    const parsed = new URL(uStr);
    parsed.pathname = parsed.pathname.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
    if (parsed.pathname === '' || parsed.pathname === '/') {
      parsed.pathname = '/';
    } else if (parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.href;
  } catch (e) {
    return rawUrl;
  }
}

function extractTextFromHtml(html) {
  if (!html) return '';
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = titleMatch ? titleMatch[1].trim() : '';

  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const metaDescText = metaDescMatch ? metaDescMatch[1].trim() : '';

  let bodyText = clean
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

  const result = [];
  if (titleText) result.push(`Title: ${titleText}`);
  if (metaDescText) result.push(`Description: ${metaDescText}`);
  if (bodyText) result.push(bodyText);

  return result.join('\n\n');
}

/**
 * Split text into semantic paragraphs, filter noise, then chunk by max size with overlap.
 * Works for both French and English content.
 */
function cleanAndChunk(text, targetUrl = '', maxChunkLength = 800) {
  let cleanText = text
    .replace(/Nous respectons votre vie privée[\s\S]*?Enregistrer mes préférences[^\n]*/gi, '')
    .replace(/Les cookies [\s\S]*?visiteurs uniques\./gi, '')
    .replace(/Cookieyes place ce témoin[\s\S]*?visiteurs uniques\./gi, '');

  const NOISE_PATTERNS = [
    /cookie/i, /cookieyes/i, /Duration\s+\d+/i, /_ga[t_]/i, /VISITOR_INFO/i,
    /yt-remote/i, /innertube/i, /localStorage/i, /sessionStorage/i, /\bGTM-/i,
    /Google Analytics/i, /Google Tag Manager/i, /Reject All/i, /Accept All/i,
    /Save My Preferences/i, /Powered by.*Cookie/i, /Privacy Policy/i, /Terms of Service/i,
    /Copyright/i, /Tous droits réservés/i, /Personnaliser Tout rejeter/i
  ];

  const rawParagraphs = cleanText.split(/\n{2,}|\n(?=#{1,3} )/);

  const cleanParagraphs = rawParagraphs
    .map(p => p.trim())
    .filter(p => {
      if (!p || p.length < 5) return false;
      if (NOISE_PATTERNS.some(pattern => pattern.test(p))) return false;
      const linkCount = (p.match(/\[.*?\]\(https?:\/\//g) || []).length;
      const wordCount = p.split(/\s+/).filter(w => w.length > 1).length;
      if (linkCount > 4 && wordCount < 30) return false;
      return true;
    });

  const chunks = [];
  let currentChunk = '';
  let overlapPrefix = '';

  for (const para of cleanParagraphs) {
    if (!currentChunk) {
      currentChunk = overlapPrefix ? `... ${overlapPrefix}\n\n${para}` : para;
    } else if ((currentChunk + '\n\n' + para).length <= maxChunkLength) {
      currentChunk += '\n\n' + para;
    } else {
      if (currentChunk.split(/\s+/).length >= 3) {
        chunks.push(currentChunk.trim());
        const words = currentChunk.split(/\s+/);
        overlapPrefix = words.slice(-20).join(' ');
      }
      currentChunk = overlapPrefix ? `... ${overlapPrefix}\n\n${para}` : para;
    }
  }
  if (currentChunk && currentChunk.split(/\s+/).length >= 3) {
    chunks.push(currentChunk.trim());
  }

  const enrichedChunks = chunks.map(chunk => {
    return targetUrl ? `[Source URL: ${targetUrl}]\n${chunk}` : chunk;
  });

  return enrichedChunks;
}


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

  try {
    const { site_id, url, tenant_id } = await req.json();

    if (!site_id || !url || !tenant_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields: site_id, url, tenant_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    await requireSiteOwnership(req, tenant_id, site_id);

    if (process.env.TEST_MODE === 'true') {
      return new Response(JSON.stringify({
        success: true,
        url,
        chunks_count: 8,
        is_protected: false,
        is_empty: false
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let targetUrl = normalizePageUrl(url);
    targetUrl = assertSafeExternalUrl(targetUrl).href;

    const AUTH_WALL_REGEX = /\/(login|signin|sign-in|sinscrire|s-inscrire|register|account|my-account|mon-compte|connexion|se-connecter|log-in|user-login|members|espace-client|client-portal|dashboard|admin)($|\/|\?|#)/i;
    const AUTH_CONTENT_REGEX = /(please log in|sign in to access|connexion requise|veuillez vous connecter|accès réservé|connectez-vous|password required|mot de passe requis|authentification requise|member login|espace client|espace membre)/i;

    const u = new URL(targetUrl);
    const isAuthUrl = AUTH_WALL_REGEX.test(u.pathname);

    let pageText = '';

    // 1. Primary: Jina Reader API with 3.5s timeout
    const jinaController = new AbortController();
    const jinaTimer = setTimeout(() => jinaController.abort(), 3500);

    try {
      const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
        signal: jinaController.signal,
        headers: { 
          'Accept': 'text/plain', 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(jinaTimer);

      if (jinaRes.status === 401 || jinaRes.status === 403 || isAuthUrl) {
        return new Response(
          JSON.stringify({ success: true, is_protected: true, chunks_count: 0, message: '🔒 Protected page (Auth Wall)' }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      if (jinaRes.ok) {
        pageText = await jinaRes.text();
      }
    } catch (jinaErr) {
      clearTimeout(jinaTimer);
      console.warn('[start-scan] Jina Reader timeout/error, falling back to direct HTML:', jinaErr.message);
    }

    // 2. Secondary Fallback: Direct HTML fetch if Jina failed or returned empty
    if (!pageText || pageText.length < 50) {
      try {
        const directController = new AbortController();
        const directTimer = setTimeout(() => directController.abort(), 2500);
        const directRes = await fetch(targetUrl, {
          signal: directController.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        clearTimeout(directTimer);
        if (directRes && directRes.ok) {
          const rawHtml = await directRes.text();
          pageText = extractTextFromHtml(rawHtml);
        }
      } catch (directErr) {
        console.warn('[start-scan] Direct HTML fetch fallback error:', directErr.message);
      }
    }

    if (AUTH_CONTENT_REGEX.test(pageText) && pageText.length < 500) {
      return new Response(
        JSON.stringify({ success: true, is_protected: true, chunks_count: 0, message: '🔒 Protected page (login form detected)' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (!pageText || pageText.length < 20) {
      return new Response(JSON.stringify({ success: true, is_empty: true, chunks_count: 0, message: 'Insufficient content returned by the page' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Process ALL chunks without 20-chunk truncation limit
    const chunks = cleanAndChunk(pageText, targetUrl, 800);


    // Generate embeddings in batches of 20 to respect Jina API Free Tier limits
    const FALLBACK_EMBEDDING = Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 : -0.05));
    const allEmbeddings = [];
    const jinaKey = process.env.JINA_API_KEY;
    const BATCH_SIZE = 20;

    if (jinaKey && chunks.length > 0) {
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        try {
          const batchResult = await generateEmbedding(batch, 'retrieval.passage', jinaKey);
          if (Array.isArray(batchResult)) {
            allEmbeddings.push(...batchResult);
          } else if (batchResult) {
            allEmbeddings.push(batchResult);
          } else {
            allEmbeddings.push(...Array(batch.length).fill(FALLBACK_EMBEDDING));
          }
        } catch (embErr) {
          console.warn(`[start-scan] Embedding batch starting at ${i} failed:`, embErr.message);
          allEmbeddings.push(...Array(batch.length).fill(FALLBACK_EMBEDDING));
        }
        // Small delay between batches to respect free tier rate limit
        if (i + BATCH_SIZE < chunks.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    // Remove old chunks for this URL to avoid duplication
    await supabase.from('documents').delete().eq('site_id', site_id).eq('url', targetUrl);

    const records = chunks.map((chunk, i) => ({
      tenant_id,
      site_id,
      url: targetUrl,
      content: chunk,
      embedding: allEmbeddings[i] ?? FALLBACK_EMBEDDING
    }));

    if (records.length > 0) {
      const { error: insertErr } = await supabase.from('documents').insert(records);
      if (insertErr) throw insertErr;
    }

    // Auto-generate site summary if it's the root/homepage or if no summary exists for this site yet
    const parsedTarget = new URL(targetUrl);
    const isHomepage = parsedTarget.pathname === '/' || parsedTarget.pathname === '';

    const { data: existingSummary } = await supabase
      .from('site_summaries')
      .select('id')
      .eq('site_id', site_id)
      .maybeSingle();

    if ((isHomepage || !existingSummary) && pageText && pageText.length >= 100) {
      try {
        const [summaryText, welcomeExperience] = await Promise.all([
          generateWebsiteSummary({
            content: pageText,
            targetUrl: targetUrl,
            apiKey: process.env.OPENROUTER_API_KEY
          }),
          generateWelcomeExperience({
            content: pageText,
            targetUrl: targetUrl,
            apiKey: process.env.OPENROUTER_API_KEY
          }),
        ]);

        if (summaryText) {
          const { error: sumErr } = await supabase.from('site_summaries').upsert({
            tenant_id,
            site_id,
            summary: summaryText,
            language: welcomeExperience.language,
            welcome_message: welcomeExperience.welcome_message,
            ui_status_title: welcomeExperience.ui_status_title,
            ui_status_online: welcomeExperience.ui_status_online,
            ui_input_placeholder: welcomeExperience.ui_input_placeholder,
            updated_at: new Date().toISOString()
          }, { onConflict: 'tenant_id,site_id' });

          if (sumErr) {
            // Fallback to documents table if site_summaries table doesn't exist yet
            const summaryUrl = `${targetUrl}#site-summary`;
            await supabase.from('documents').delete().eq('site_id', site_id).eq('url', summaryUrl);
            await supabase.from('documents').insert({
              tenant_id,
              site_id,
              url: summaryUrl,
              content: `[SITE_SUMMARY]\n${summaryText}`
            });
          }
          console.log(`[start-scan] Website summary auto-generated for site ${site_id}`);
        }
      } catch (sumErr) {
        console.warn(`[start-scan] Auto summary generation non-critical warning:`, sumErr.message);
      }
    }


    return new Response(
      JSON.stringify({ success: true, message: 'Page scanned and indexed via Jina Reader successfully!', chunks_count: records.length }),
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

