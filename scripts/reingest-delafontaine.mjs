/**
 * reingest-delafontaine.mjs
 *
 * Script de ré-ingestion complet pour delafontaine.ca
 * Utilise directement la logique de start-scan.js (cleanAndChunk) +
 * embeddings réels via Jina (jina-embeddings-v2-base-multilingual, 768 dims).
 *
 * Usage: node scripts/reingest-delafontaine.mjs
 * Pré-requis: JINA_API_KEY dans l'env (ou dans apps/admin/.env.local)
 */

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { readFileSync } from "fs";
import { resolve } from "path";

globalThis.WebSocket = WebSocket;

// Load JINA_API_KEY from .env.local if not set
if (!process.env.JINA_API_KEY) {
  try {
    const envPath = resolve("apps/admin/.env.local");
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const [key, ...vals] = line.trim().split("=");
      if (key && !key.startsWith("#")) {
        process.env[key.trim()] = vals.join("=").trim();
      }
    }
  } catch {}
}

const SUPABASE_URL = "https://xuvueegdokgiyedwvmkm.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TENANT_ID = "0610bdac-96ec-48b2-99f5-f743d203dacd";
const SITE_ID   = "89c72e40-a204-4fc0-925e-27348d84ae6e";

const JINA_API_KEY = process.env.JINA_API_KEY;

const PAGES_TO_INGEST = [
  "https://delafontaine.ca/",
  "https://delafontaine.ca/about-us/",
  "https://delafontaine.ca/products/",
  "https://delafontaine.ca/products/doors/",
  "https://delafontaine.ca/products/frames/",
  "https://delafontaine.ca/products/speciality-products/",
  "https://delafontaine.ca/offer/",
  "https://delafontaine.ca/steel-doors-and-frames-sustainability/",
  "https://delafontaine.ca/locations/",
  "https://delafontaine.ca/career/",
  "https://delafontaine.ca/contact/",
  "https://delafontaine.ca/portfolio/",
];

// ── Noise filter + chunker (same as api/start-scan.js) ──────────────────────
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
  const cleanParagraphs = rawParagraphs.map(p => p.trim()).filter(p => {
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

  return chunks.map(chunk => targetUrl ? `[Source URL: ${targetUrl}]\n${chunk}` : chunk);
}

// ── Jina Embeddings ──────────────────────────────────────────────────────────
const FALLBACK_EMBEDDING = Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 : -0.05));

async function generateEmbeddings(texts, task = 'retrieval.passage') {
  if (!JINA_API_KEY || texts.length === 0) return null;
  try {
    const res = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${JINA_API_KEY}` },
      body: JSON.stringify({ model: 'jina-embeddings-v3', task, dimensions: 768, input: texts })
    });
    if (!res.ok) {
      console.error(`  [Jina] Error ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    return data.data?.map(d => d.embedding) || null;
  } catch (e) {
    console.error('  [Jina] fetch error:', e.message);
    return null;
  }
}

// ── Page ingestion ────────────────────────────────────────────────────────────
async function ingestPage(url) {
  process.stdout.write(`  Fetching ${url.replace('https://delafontaine.ca', '')} ... `);

  const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
    headers: { 'Accept': 'text/plain', 'User-Agent': 'Mozilla/5.0' }
  });

  if (!jinaRes.ok) { console.log(`❌ Jina ${jinaRes.status}`); return { success: false, chunks: 0 }; }

  const pageText = await jinaRes.text();
  if (!pageText || pageText.length < 50) { console.log('❌ Empty'); return { success: false, chunks: 0 }; }

  const chunks = cleanAndChunk(pageText, 800);
  const chunkSlice = chunks.slice(0, 20);

  if (chunkSlice.length === 0) {
    console.log('⚠️  0 chunks utiles (page trop légère)');
    return { success: true, chunks: 0 };
  }

  // Generate embeddings in a single batch call
  const embeddings = await generateEmbeddings(chunkSlice, 'retrieval.passage');
  const embeddingMode = embeddings ? `✦ ${JINA_API_KEY ? 'Jina AI' : 'mock'}` : '⚠️  mock';

  // Delete old chunks
  await supabase.from('documents').delete().eq('site_id', SITE_ID).eq('url', url);

  const records = chunkSlice.map((chunk, i) => ({
    tenant_id: TENANT_ID,
    site_id: SITE_ID,
    url,
    content: chunk,
    embedding: embeddings?.[i] ?? FALLBACK_EMBEDDING
  }));

  const { error: insertErr } = await supabase.from('documents').insert(records);
  if (insertErr) { console.log(`❌ Insert: ${insertErr.message}`); return { success: false, chunks: 0 }; }

  console.log(`✓  ${records.length} chunks [${embeddingMode}]`);
  return { success: true, chunks: records.length };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log("════════════════════════════════════════════════════════");
  console.log("  RE-INGESTION: delafontaine.ca");
  console.log(`  Tenant: ${TENANT_ID}`);
  console.log(`  Embeddings: ${JINA_API_KEY ? `✦ Jina AI (jina-embeddings-v2-base-multilingual)` : '⚠️  Mock (JINA_API_KEY manquante)'}`);
  console.log("════════════════════════════════════════════════════════\n");

  let totalChunks = 0, successCount = 0, failCount = 0;

  for (const url of PAGES_TO_INGEST) {
    const result = await ingestPage(url);
    if (result.success) { successCount++; totalChunks += result.chunks; }
    else { failCount++; }
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log("\n════════════════════════════════════════════════════════");
  console.log(`  DONE: ${successCount}/${PAGES_TO_INGEST.length} pages | ${totalChunks} chunks`);
  if (failCount > 0) console.log(`  ⚠️  ${failCount} pages failed`);
  console.log("════════════════════════════════════════════════════════\n");

  // Verification
  const { count } = await supabase
    .from('documents').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  const { data: urls } = await supabase
    .from('documents').select('url').eq('tenant_id', TENANT_ID);
  const uniqueUrls = [...new Set(urls?.map(d => d.url) || [])];

  console.log(`✓ Verified: ${count} total chunks across ${uniqueUrls.length} URLs`);
  uniqueUrls.forEach(u => console.log(`  • ${u}`));
}

run().catch(console.error);
