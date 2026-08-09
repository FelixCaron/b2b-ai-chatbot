import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = "https://xuvueegdokgiyedwvmkm.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function cleanHtmlToText(html) {
  let text = html
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
    .replace(/<nav[^>]*>([\s\S]*?)<\/nav>/gi, '')
    .replace(/<footer[^>]*>([\s\S]*?)<\/footer>/gi, '')
    .replace(/<header[^>]*>([\s\S]*?)<\/header>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

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

    let pageText = '';

    // 1. Try fetching via Jina Reader API first
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
        headers: { 'Accept': 'text/plain', 'User-Agent': 'Mozilla/5.0' }
      });
      if (jinaRes.ok) {
        pageText = await jinaRes.text();
      }
    } catch (_jErr) {}

    // 2. Direct HTML fetch fallback if Jina fails or returns empty
    if (!pageText || pageText.length < 100) {
      try {
        const directRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml'
          }
        });
        if (directRes.ok) {
          const html = await directRes.text();
          pageText = cleanHtmlToText(html);
        }
      } catch (_dErr) {}
    }

    if (!pageText || pageText.length === 0) {
      return new Response(JSON.stringify({ error: 'Impossible de lire le contenu de cette page' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const chunks = chunkText(pageText, 800);
    const mockEmbedding = Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 : -0.05));

    // Delete existing documents for this URL to avoid duplicates
    await supabase.from('documents').delete().eq('site_id', site_id).eq('url', targetUrl);

    const records = chunks.slice(0, 15).map((chunk) => ({
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
      JSON.stringify({ success: true, message: 'Page scannée et indexée dans Supabase !', chunks_count: records.length }),
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
