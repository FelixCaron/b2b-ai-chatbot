import { contracts } from '@b2b-ai-chatbot/contracts';
import { createClient } from '@supabase/supabase-js';
import { edgeRoute } from '../lib/http.js';
import { generateEmbedding } from '../lib/llm.js';
import { assertSafeExternalUrl } from '../lib/url-security.js';
import { requireSiteOwnership } from '../lib/server-config.js';
import { persistSiteSummary } from '../lib/site-summary.js';

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


export default edgeRoute(contracts.crawler.scan, async (req, { data, json }) => {
  const { site_id, url, tenant_id } = data;

  // The contract's tenant auth already proved the caller owns tenant_id; this
  // additionally proves the site itself lives in that tenant, so nothing can be
  // indexed into somebody else's site row.
  await requireSiteOwnership(req, tenant_id, site_id);

  if (process.env.TEST_MODE === 'true') {
    return json({
      success: true,
      url,
      chunks_count: 8,
      is_protected: false,
      is_empty: false
    });
  }

  let targetUrl = normalizePageUrl(url);
  targetUrl = assertSafeExternalUrl(targetUrl).href;

  const AUTH_WALL_REGEX = /\/(login|signin|sign-in|sinscrire|s-inscrire|register|account|my-account|mon-compte|connexion|se-connecter|log-in|user-login|members|espace-client|client-portal|dashboard|admin)($|\/|\?|#)/i;
  const AUTH_CONTENT_REGEX = /(please log in|sign in to access|connexion requise|veuillez vous connecter|accès réservé|connectez-vous|password required|mot de passe requis|authentification requise|member login|espace client|espace membre)/i;

  const u = new URL(targetUrl);
  const isAuthUrl = AUTH_WALL_REGEX.test(u.pathname);

  let pageText = '';

  // 1. Primary: Jina Reader API — its headless-browser render is what lets
  // client-rendered pages (React/Vue/etc. SPAs, no server-side rendering)
  // yield real content at all instead of falling to the near-empty
  // <div id="root"> the direct-HTML fallback below would see. 3.5s cut this
  // off before a cache-miss render finished on ordinary pages (observed:
  // ~3.6s render vs. a cached ~0.5s one), silently dropping to that mostly
  // content-less fallback — 8s gives a cold render room to finish.
  const jinaController = new AbortController();
  const jinaTimer = setTimeout(() => jinaController.abort(), 8000);

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
      return json({ success: true, is_protected: true, chunks_count: 0, message: '🔒 Protected page (Auth Wall)' });
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
    return json({ success: true, is_protected: true, chunks_count: 0, message: '🔒 Protected page (login form detected)' });
  }

  if (!pageText || pageText.length < 20) {
    return json({ success: true, is_empty: true, chunks_count: 0, message: 'Insufficient content returned by the page' });
  }

  // Process ALL chunks without 20-chunk truncation limit
  const chunks = cleanAndChunk(pageText, targetUrl, 800);


  // Generate embeddings in batches of 20 to respect Jina API Free Tier limits.
  //
  // A chunk whose embedding generation fails is stored with embedding = NULL,
  // never a made-up vector. A fabricated constant vector used to be inserted
  // here instead: it made the chunk look successfully indexed while its
  // "meaning" in vector space was pure noise, unrelated to its actual content
  // — match_documents_hybrid (see the consolidated schema migration) would
  // then rank it by a meaningless distance and could surface it, or bury a
  // genuinely relevant chunk, for reasons that had nothing to do with the
  // query. NULL degrades gracefully instead: Postgres sorts NULL distances
  // last in the semantic branch, so the chunk simply falls out of semantic
  // ranking, while the FTS branch (generated straight from `content`, not
  // from the embedding) still finds it by keyword. Nothing is silently lost;
  // it just isn't silently pretended to be something it isn't.
  const allEmbeddings = [];
  const jinaKey = process.env.JINA_API_KEY;
  const BATCH_SIZE = 20;
  let embeddingFailures = 0;

  if (jinaKey && chunks.length > 0) {
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      try {
        const batchResult = await generateEmbedding(batch, 'retrieval.passage', jinaKey);
        if (Array.isArray(batchResult)) {
          allEmbeddings.push(...batchResult.map((v) => v ?? null));
          embeddingFailures += batchResult.filter((v) => !v).length;
        } else if (batchResult) {
          allEmbeddings.push(batchResult);
        } else {
          allEmbeddings.push(...Array(batch.length).fill(null));
          embeddingFailures += batch.length;
        }
      } catch (embErr) {
        console.warn(`[start-scan] Embedding batch starting at ${i} failed:`, embErr.message);
        allEmbeddings.push(...Array(batch.length).fill(null));
        embeddingFailures += batch.length;
      }
      // Small delay between batches to respect free tier rate limit
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  } else if (chunks.length > 0) {
    // No Jina key configured at all: every chunk is FTS-only until one is set.
    embeddingFailures = chunks.length;
  }

  // Remove old chunks for this URL to avoid duplication
  await supabase.from('documents').delete().eq('site_id', site_id).eq('url', targetUrl);

  const records = chunks.map((chunk, i) => ({
    tenant_id,
    site_id,
    url: targetUrl,
    content: chunk,
    // Position within the page, so it can be read back in the order it
    // was written (migration 20260909060000).
    chunk_index: i,
    embedding: allEmbeddings[i] ?? null
  }));

  if (records.length > 0) {
    const { error: insertErr } = await supabase.from('documents').insert(records);
    if (insertErr) throw insertErr;
  }

  // Truthful outcome: a page can be fully indexed, partially degraded (some
  // chunks are keyword-only), or entirely degraded (no semantic search at
  // all for this page) — three different states that "success" used to
  // flatten into one.
  const embeddingDegraded = records.length > 0 && embeddingFailures > 0;
  const embeddingFullyDegraded = records.length > 0 && embeddingFailures >= records.length;
  const resultMessage = embeddingFullyDegraded
    ? 'Page indexed, but semantic search could not be generated for it — it is only reachable by keyword search until the next scan.'
    : embeddingDegraded
      ? `Page indexed. ${embeddingFailures} of ${records.length} chunk(s) are keyword-search only (semantic embedding failed for them).`
      : 'Page scanned and indexed via Jina Reader successfully!';

  // Auto-generate site summary if it's the root/homepage or if no summary exists for this site yet
  const parsedTarget = new URL(targetUrl);
  const isHomepage = parsedTarget.pathname === '/' || parsedTarget.pathname === '';

  const { data: existingSummary } = await supabase
    .from('site_summaries')
    .select('id, welcome_message')
    .eq('site_id', site_id)
    .maybeSingle();

  // Also (re)generate when a summary row exists but never got a localized
  // welcome experience — a site scanned before that feature shipped, or
  // whose first generation attempt failed, would otherwise be stuck showing
  // the widget's English fallback forever, on every language of site, since
  // nothing else ever revisits an existing row.
  const missingWelcomeExperience = existingSummary && !existingSummary.welcome_message;

  if ((isHomepage || !existingSummary || missingWelcomeExperience) && pageText && pageText.length >= 100) {
    try {
      const summaryText = await persistSiteSummary({
        supabase,
        tenantId: tenant_id,
        siteId: site_id,
        targetUrl,
        content: pageText,
        apiKey: process.env.OPENROUTER_API_KEY
      });
      if (summaryText) {
        console.log(`[start-scan] Website summary auto-generated for site ${site_id}`);
      }
    } catch (sumErr) {
      console.warn(`[start-scan] Auto summary generation non-critical warning:`, sumErr.message);
    }
  }


  return json({
    success: true,
    message: resultMessage,
    chunks_count: records.length,
    embedding_degraded: embeddingDegraded
  });
});

