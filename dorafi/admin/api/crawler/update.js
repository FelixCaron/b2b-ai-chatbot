import { contracts } from '@b2b-ai-chatbot/contracts';
import { createClient } from '@supabase/supabase-js';
import { edgeRoute } from '../lib/http.js';
import { generateEmbedding } from '../lib/llm.js';
import { requireSiteOwnership } from '../lib/server-config.js';

export const config = {
  runtime: 'edge',
};

const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY;

const supabase = (VITE_SUPABASE_URL && SERVICE_ROLE_KEY) ? createClient(VITE_SUPABASE_URL, SERVICE_ROLE_KEY) : null;

// A hand-edited page is deliberately NOT run through the scraper's usual
// noise/word-count filters (see api/crawler/scan.js's own cleanAndChunk).
// Those exist to strip cookie banners and nav junk out of raw scraped HTML;
// run over text an operator already wrote on purpose, they silently drop
// anything "too short" or link-heavy, which is exactly the kind of short
// correction someone editing a page is most likely to make — the edit would
// look like it "didn't save" because the save produced zero chunks. This
// only ever splits by length, so whatever was typed is what gets stored,
// verbatim.
function chunkEditedContent(text, targetUrl = '', maxChunkLength = 800) {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];

  const paragraphs = trimmed.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const merged = [];
  let current = '';
  for (const para of (paragraphs.length > 0 ? paragraphs : [trimmed])) {
    if (!current) {
      current = para;
    } else if ((current + '\n\n' + para).length <= maxChunkLength) {
      current += '\n\n' + para;
    } else {
      merged.push(current);
      current = para;
    }
  }
  if (current) merged.push(current);

  // A single paragraph longer than maxChunkLength (no blank-line breaks at
  // all) still needs to be split, or it becomes one oversized chunk.
  const sized = merged.flatMap((chunk) => {
    if (chunk.length <= maxChunkLength) return [chunk];
    const pieces = [];
    for (let i = 0; i < chunk.length; i += maxChunkLength) {
      pieces.push(chunk.slice(i, i + maxChunkLength));
    }
    return pieces;
  });

  return sized.map((chunk) => (targetUrl ? `[Source URL: ${targetUrl}]\n${chunk}` : chunk));
}


export default edgeRoute(contracts.crawler.update, async (req, { data, json }) => {
  const { site_id, tenant_id, url, content } = data;

  // The contract's tenant auth already proved the caller owns tenant_id; this
  // additionally proves the site itself lives in that tenant, so nothing can be
  // written into somebody else's site row.
  await requireSiteOwnership(req, tenant_id, site_id);

  const chunks = chunkEditedContent(content, url, 800);

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
      // Which chunk of this page this is. Without it a reader has nothing
      // to sort by (every chunk of one save shares a created_at), and the
      // text comes back out of order — see migration 20260909060000.
      chunk_index: i,
      embedding: allEmbeddings[i] ?? FALLBACK_EMBEDDING
    }));

    const { error: insertErr } = await supabase.from('documents').insert(records);
    if (insertErr) throw insertErr;
  }

  return json({ success: true });
});
