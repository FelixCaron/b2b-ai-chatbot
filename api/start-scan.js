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

/**
 * Split text into semantic paragraphs, filter noise, then chunk by max size with overlap.
 * Works for both French and English content.
 */
function cleanAndChunk(text, targetUrl = '', maxChunkLength = 800) {
  // 1. Strip cookie banner / consent blocks upfront
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

  // Split into paragraphs/sections by double newlines or markdown headers
  const rawParagraphs = cleanText.split(/\n{2,}|\n(?=#{1,3} )/);

  const cleanParagraphs = rawParagraphs
    .map(p => p.trim())
    .filter(p => {
      if (!p || p.length < 5) return false;
      // Filter paragraphs matching noise patterns
      if (NOISE_PATTERNS.some(pattern => pattern.test(p))) return false;
      // Filter paragraphs that are mostly list items of links (nav menus)
      const linkCount = (p.match(/\[.*?\]\(https?:\/\//g) || []).length;
      const wordCount = p.split(/\s+/).filter(w => w.length > 1).length;
      if (linkCount > 4 && wordCount < 30) return false;
      return true;
    });

  // Now chunk the clean paragraphs respecting max size and adding semantic overlap
  const chunks = [];
  let currentChunk = '';
  let overlapPrefix = '';

  for (const para of cleanParagraphs) {
    if (!currentChunk) {
      currentChunk = overlapPrefix ? `... ${overlapPrefix}\n\n${para}` : para;
    } else if ((currentChunk + '\n\n' + para).length <= maxChunkLength) {
      currentChunk += '\n\n' + para;
    } else {
      // Current chunk is full, flush it if it has at least 8 words
      if (currentChunk.split(/\s+/).length >= 8) {
        chunks.push(currentChunk.trim());
        const words = currentChunk.split(/\s+/);
        overlapPrefix = words.slice(-20).join(' ');
      }
      currentChunk = overlapPrefix ? `... ${overlapPrefix}\n\n${para}` : para;
    }
  }
  if (currentChunk && currentChunk.split(/\s+/).length >= 8) {
    chunks.push(currentChunk.trim());
  }

  // Prepend metadata (source URL) to each chunk content for better context
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

    const AUTH_WALL_REGEX = /\/(login|signin|sign-in|sinscrire|s-inscrire|register|account|my-account|mon-compte|connexion|se-connecter|log-in|user-login|members|espace-client|client-portal|dashboard|admin)($|\/|\?|#)/i;
    const AUTH_CONTENT_REGEX = /(please log in|sign in to access|connexion requise|veuillez vous connecter|accès réservé|connectez-vous|password required|mot de passe requis|authentification requise|member login|espace client|espace membre)/i;

    const u = new URL(targetUrl);
    const isAuthUrl = AUTH_WALL_REGEX.test(u.pathname);

    // Single source of truth: Jina Reader API for clean LLM-ready markdown
    const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
      headers: { 
        'Accept': 'text/plain', 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (jinaRes.status === 401 || jinaRes.status === 403 || isAuthUrl) {
      return new Response(
        JSON.stringify({ success: true, is_protected: true, chunks_count: 0, message: '🔒 Page protégée par connexion / Auth Wall' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (!jinaRes.ok) {
      return new Response(JSON.stringify({ error: `Impossible de lire la page via Jina Reader (Status ${jinaRes.status})` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const pageText = await jinaRes.text();

    if (AUTH_CONTENT_REGEX.test(pageText) && pageText.length < 500) {
      return new Response(
        JSON.stringify({ success: true, is_protected: true, chunks_count: 0, message: '🔒 Page protégée (Formulaire de connexion détecté)' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (!pageText || pageText.length < 50) {
      return new Response(JSON.stringify({ success: true, is_empty: true, chunks_count: 0, message: 'Contenu insuffisant retourné par la page' }), {
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
