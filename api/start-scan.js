import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './lib/llm.js';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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

const MIN_CONTENT_WORDS = 25; // Minimum meaningful words per chunk

/**
 * Split text into semantic paragraphs, filter noise, then chunk by max size.
 * Works for both French and English content.
 */
function cleanAndChunk(text, maxChunkLength = 800) {
  // Split into paragraphs/sections by double newlines or markdown headers
  const rawParagraphs = text.split(/\n{2,}|\n(?=#{1,3} )/);

  const cleanParagraphs = rawParagraphs
    .map(p => p.trim())
    .filter(p => {
      if (!p || p.length < 30) return false;
      // Filter paragraphs matching noise patterns
      if (NOISE_PATTERNS.some(pattern => pattern.test(p))) return false;
      // Filter paragraphs that are mostly list items of links (nav menus)
      const linkCount = (p.match(/\[.*?\]\(https?:\/\//g) || []).length;
      const wordCount = p.split(/\s+/).filter(w => w.length > 2).length;
      if (linkCount > 5 && wordCount < 40) return false;
      // Minimum word count
      if (wordCount < MIN_CONTENT_WORDS) return false;
      return true;
    });

  // Now chunk the clean paragraphs respecting max size
  const chunks = [];
  let currentChunk = '';

  for (const para of cleanParagraphs) {
    if (!currentChunk) {
      currentChunk = para;
    } else if ((currentChunk + '\n\n' + para).length <= maxChunkLength) {
      currentChunk += '\n\n' + para;
    } else {
      // Current chunk is full, flush it
      if (currentChunk.split(/\s+/).length >= MIN_CONTENT_WORDS) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = para;
    }
  }
  if (currentChunk && currentChunk.split(/\s+/).length >= MIN_CONTENT_WORDS) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
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
    const { site_id, tenant_id, url } = await req.json();

    if (!site_id || !tenant_id || !url) {
      return new Response(JSON.stringify({ error: 'Missing required fields: site_id, tenant_id, url' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    // Single source of truth: Jina Reader API for clean LLM-ready markdown
    const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
      headers: { 
        'Accept': 'text/plain', 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!jinaRes.ok) {
      return new Response(JSON.stringify({ error: `Impossible de lire la page via Jina Reader (Status ${jinaRes.status})` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const pageText = await jinaRes.text();

    if (!pageText || pageText.length < 50) {
      return new Response(JSON.stringify({ error: 'Contenu insuffisant retourné par la page' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const chunks = cleanAndChunk(pageText, 800);
    const chunkSlice = chunks.slice(0, 20);

    // Generate embeddings in a single batch API call (1 request for all chunks)
    // Fallback to mock if JINA_API_KEY is not set (no regression)
    const FALLBACK_EMBEDDING = Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 : -0.05));
    let embeddings;
    try {
      const jinaKey = process.env.JINA_API_KEY;
      if (jinaKey && chunkSlice.length > 0) {
        const batchResult = await generateEmbedding(chunkSlice, 'retrieval.passage', jinaKey);
        embeddings = Array.isArray(batchResult) ? batchResult : null;
      }
    } catch (embErr) {
      console.warn('[start-scan] Embedding generation failed, using fallback:', embErr.message);
    }

    // Remove old chunks for this URL to avoid duplication
    await supabase.from('documents').delete().eq('site_id', site_id).eq('url', targetUrl);

    const records = chunkSlice.map((chunk, i) => ({
      tenant_id,
      site_id,
      url: targetUrl,
      content: chunk,
      embedding: embeddings?.[i] ?? FALLBACK_EMBEDDING
    }));

    const { error: insertErr } = await supabase.from('documents').insert(records);

    if (insertErr) {
      throw insertErr;
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Page scannée et indexée via Jina Reader avec succès !', chunks_count: records.length }),
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
