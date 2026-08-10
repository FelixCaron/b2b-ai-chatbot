import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    const { site_id, tenant_id, url, content } = await req.json();

    if (!site_id || !tenant_id || !url || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing fields: site_id, tenant_id, url, content' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const chunks = chunkText(content, 800);
    const mockEmbedding = Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 : -0.05));

    // Remove old chunks
    await supabase.from('documents').delete().eq('site_id', site_id).eq('url', url);

    if (chunks.length > 0) {
      const records = chunks.slice(0, 20).map((chunk) => ({
        tenant_id,
        site_id,
        url,
        content: chunk,
        embedding: mockEmbedding
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
