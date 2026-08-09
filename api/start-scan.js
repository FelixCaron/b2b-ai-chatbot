import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = "https://xuvueegdokgiyedwvmkm.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function chunkText(text, maxLength = 800) {
  const words = text.split(' ');
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;

  for (const word of words) {
    currentChunk.push(word);
    currentLength += word.length + 1;
    if (currentLength >= maxLength) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
      currentLength = 0;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
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

    const chunks = chunkText(pageText, 800);
    const mockEmbedding = Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 : -0.05));

    // Remove old chunks for this URL to avoid duplication
    await supabase.from('documents').delete().eq('site_id', site_id).eq('url', targetUrl);

    const records = chunks.slice(0, 20).map((chunk) => ({
      tenant_id,
      site_id,
      url: targetUrl,
      content: chunk,
      embedding: mockEmbedding
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
