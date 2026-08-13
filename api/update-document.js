import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './lib/llm.js';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Patterns that identify noise paragraphs (GDPR, cookie banners, nav menus)
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

const MIN_CONTENT_WORDS = 25;

function cleanAndChunk(text, targetUrl = '', maxChunkLength = 800) {
  const rawParagraphs = text.split(/\n{2,}|\n(?=#{1,3} )/);

  const cleanParagraphs = rawParagraphs
    .map(p => p.trim())
    .filter(p => {
      if (!p || p.length < 30) return false;
      if (NOISE_PATTERNS.some(pattern => pattern.test(p))) return false;
      const linkCount = (p.match(/\[.*?\]\(https?:\/\//g) || []).length;
      const wordCount = p.split(/\s+/).filter(w => w.length > 2).length;
      if (linkCount > 5 && wordCount < 40) return false;
      if (wordCount < MIN_CONTENT_WORDS) return false;
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
      if (currentChunk.split(/\s+/).length >= MIN_CONTENT_WORDS) {
        chunks.push(currentChunk.trim());
        const words = currentChunk.split(/\s+/);
        overlapPrefix = words.slice(-20).join(' ');
      }
      currentChunk = overlapPrefix ? `... ${overlapPrefix}\n\n${para}` : para;
    }
  }
  if (currentChunk && currentChunk.split(/\s+/).length >= MIN_CONTENT_WORDS) {
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
    const { site_id, tenant_id, url, content } = await req.json();

    if (!site_id || !tenant_id || !url || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing fields: site_id, tenant_id, url, content' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const chunks = cleanAndChunk(content, url, 800);

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
          console.warn(`[update-document] Embedding batch starting at ${i} failed:`, embErr.message);
          allEmbeddings.push(...Array(batch.length).fill(FALLBACK_EMBEDDING));
        }
        if (i + BATCH_SIZE < chunks.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    // Remove old chunks
    await supabase.from('documents').delete().eq('site_id', site_id).eq('url', url);

    if (chunks.length > 0) {
      const records = chunks.map((chunk, i) => ({
        tenant_id,
        site_id,
        url,
        content: chunk,
        embedding: allEmbeddings[i] ?? FALLBACK_EMBEDDING
      }));

      const { error: insertErr } = await supabase.from('documents').insert(records);
      if (insertErr) throw insertErr;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
