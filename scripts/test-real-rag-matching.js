import { readFileSync } from 'fs';
import { resolve } from 'path';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const envContent = readFileSync(resolve("apps/admin/.env.local"), "utf-8");
    for (const line of envContent.split("\n")) {
      const [key, ...vals] = line.trim().split("=");
      if (key && !key.startsWith("#")) process.env[key.trim()] = vals.join("=").trim();
    }
  } catch {}
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JINA_API_KEY = process.env.JINA_API_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !JINA_API_KEY) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and JINA_API_KEY are required');

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function generateQueryEmbedding(text) {
  try {
    const res = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${JINA_API_KEY}` },
      body: JSON.stringify({ model: 'jina-embeddings-v3', task: 'retrieval.query', dimensions: 768, input: [text] })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

async function testRealRAG() {
  console.log("==========================================================================");
  console.log("  TEST DE RECHERCHE RAG RÉELLE SUR DELAFONTAINE.CA (553 CHUNKS INDEXÉS)");
  console.log("==========================================================================\n");

  // Get site with highest chunks
  const { data: sites } = await supabase
    .from('sites')
    .select('id, tenant_id, domain')
    .eq('domain', 'delafontaine.ca');

  let bestSite = null;
  let maxChunks = -1;

  for (const s of sites || []) {
    const { count } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', s.id);

    if (count > maxChunks) {
      maxChunks = count;
      bestSite = s;
    }
  }

  console.log(`📌 Domaine: ${bestSite.domain}`);
  console.log(`🏢 Tenant ID: ${bestSite.tenant_id}`);
  console.log(`📦 Nombre de documents indexés en base: ${maxChunks} chunks\n`);

  const REAL_USER_QUESTIONS = [
    "Quels types de portes métalliques fabriquez-vous ?",
    "Avez-vous des cadres en acier isolants ?",
    "Quelle est la résistance au feu (fire rating) de vos portes ?",
    "Quel est le délai de livraison (leadtime) pour vos commandes ?",
    "Où est située l'usine principale à Sherbrooke ?",
    "Faites-vous des portes pour les hôpitaux et les écoles ?",
    "Proposez-vous des déclarations environnementales (EPD / LEED) ?",
    "Avez-vous des portes en acier inoxydable (stainless steel) ?",
    "Qui est le président ou la direction de De La Fontaine ?",
    "Avez-vous des succursales aux États-Unis ?"
  ];

  let totalHits = 0;

  for (let i = 0; i < REAL_USER_QUESTIONS.length; i++) {
    const q = REAL_USER_QUESTIONS[i];
    const start = Date.now();

    const queryEmbedding = await generateQueryEmbedding(q);
    let docs = [];
    let method = 'unknown';

    if (queryEmbedding) {
      const { data: hybridDocs, error: hybridErr } = await supabase.rpc('match_documents_hybrid', {
        query_text: q,
        query_embedding: queryEmbedding,
        match_tenant_id: bestSite.tenant_id,
        match_count: 5
      });
      if (!hybridErr && hybridDocs) {
        docs = hybridDocs;
        method = 'match_documents_hybrid (Vector 768d + FTS)';
      }
    }

    if (!docs.length) {
      const { data: rpcDocs } = await supabase.rpc('search_documents_fts', {
        query_text: q,
        match_tenant_id: bestSite.tenant_id,
        match_count: 5
      });
      if (rpcDocs && rpcDocs.length > 0) {
        docs = rpcDocs;
        method = 'search_documents_fts RPC';
      }
    }

    const elapsed = Date.now() - start;
    const statusIcon = docs.length > 0 ? '✅' : '❌';
    if (docs.length > 0) totalHits++;

    console.log(`${statusIcon} Q${i + 1}: "${q}"`);
    console.log(`   ├─ Documents retournés : ${docs.length} chunk(s) | Temps : ${elapsed}ms | Méthode : ${method}`);

    if (docs.length > 0) {
      const topUrl = docs[0].url || 'Inconnu';
      const snippet = docs[0].content?.substring(0, 140).replace(/\n+/g, ' ');
      console.log(`   ├─ Top Source URL      : ${topUrl}`);
      console.log(`   └─ Extraît de contenu  : "${snippet}..."`);
    } else {
      console.log(`   └─ ⚠️ AUCUN DOCUMENT RETOURNÉ !`);
    }
    console.log();
  }

  console.log("==========================================================================");
  console.log(`  BASSIN DE TEST RAG COMPLET: ${totalHits} / ${REAL_USER_QUESTIONS.length} questions ont retourné des documents pertinents.`);
  console.log("==========================================================================\n");
}

testRealRAG().catch(console.error);
