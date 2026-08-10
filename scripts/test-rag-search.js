/**
 * test-rag-search.js
 *
 * Jeu de tests pour la fonction search_knowledge_base (RAG) basé sur delafontaine.ca.
 * Teste la qualité et la pertinence des résultats de recherche dans Supabase.
 *
 * Usage: node scripts/test-rag-search.js
 *
 * Pré-requis: node scripts/reingest-delafontaine.mjs doit avoir été exécuté.
 *
 * Contenu indexé (9 URLs, 23 chunks):
 *   / | /about-us/ | /products/doors/ | /products/frames/
 *   /products/speciality-products/ | /offer/ | /sustainability/ | /career/ | /portfolio/
 *   NOTE: /locations/, /contact/, /products/ → 0 chunks (pages trop légères côté Jina)
 */

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

const SUPABASE_URL = "https://xuvueegdokgiyedwvmkm.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TENANT_ID = "0610bdac-96ec-48b2-99f5-f743d203dacd";

// -------------------------------------------------------
// Test Suite
// -------------------------------------------------------
const TEST_CASES = [
  // ── GROUP A: Happy Path — contenu confirmé dans les chunks ────────────────────
  {
    label: "[A1] Portes acier (steel doors)",
    query: "steel doors",
    expectHits: 1,
    expectContent: "door",
  },
  {
    label: "[A2] Cadres acier (steel frames)",
    query: "steel frames",
    expectHits: 1,
    expectContent: "frame",
  },
  {
    label: "[A3] Portes résistantes au feu",
    query: "fire-rated",
    expectHits: 1,
    expectContent: "fire",
  },
  {
    label: "[A4] À propos — famille / histoire",
    query: "family business",
    expectHits: 1,
    expectContent: "family",
  },
  {
    label: "[A5] Fondé à Sherbrooke, présence mondiale",
    query: "Brodeur Street frames steel",
    expectHits: 1,
    expectContent: "Brodeur",
    expectUrl: "/about-us/",
  },
  {
    label: "[A6] Délais de livraison (leadtime)",
    query: "leadtime",
    expectHits: 1,
    expectContent: "leadtime",
    expectUrl: "/offer/",
  },
  {
    label: "[A7] Qualité / assurance qualité",
    query: "quality",
    expectHits: 1,
    expectContent: "quality",
  },
  {
    label: "[A8] Produits spéciaux — portes isolantes (polystyrène/uréthane)",
    query: "polystyrene",
    expectHits: 1,
    expectUrl: "/products/speciality-products/",
  },
  {
    label: "[A9] Durabilité / développement durable",
    query: "sustainability environmental",
    expectHits: 1,
    expectContent: "sustain",
    expectUrl: "/steel-doors-and-frames-sustainability/",
  },
  {
    label: "[A10] Carrière / emploi",
    query: "tailor-made innovation values",
    expectHits: 1,
    expectUrl: "/career/",
  },

  // ── GROUP B: Bilingue Cross-Lingual FR → EN (Semantic Vector Search) ──────────
  {
    label: "[B1] FR → EN: entreprise familiale (matchs sémantiques 'family business')",
    query: "entreprise familiale",
    expectHits: 1,
    expectUrl: "/about-us/",
  },
  {
    label: "[B2] FR → EN: portes acier coupe-feu (matchs sémantiques 'steel doors')",
    query: "portes acier coupe-feu",
    expectHits: 1,
    expectUrl: "/products/doors/",
  },

  // ── GROUP C: Négatifs stricts — Propreté du contexte RAG ─────────────────────
  {
    label: "[C1] Hors-sujet: prix / tarifs (aucun tarif/devis dans le contexte)",
    query: "prix tarifs devis",
    expectNoContent: ["tarifs", "pricing", "devis"],
  },
  {
    label: "[C2] Qualité chunks: zéro contenu RGPD/cookies dans le contexte",
    query: "Google Analytics cookie duration",
    expectNoContent: ["cookie", "cookieyes", "Duration", "VISITOR_INFO", "_gat"],
  },
  {
    label: "[C3] Hors-sujet total: pizza / restaurant (aucun bruit dans le contexte)",
    query: "pizza restaurant réservation table",
    expectNoContent: ["pizza", "restaurant", "réservation", "table"],
  },

  // ── GROUP D: Qualité des résultats ────────────────────────────────────────────
  {
    label: "[D1] Pas de bruit RGPD dans les résultats retournés",
    query: "steel doors products",
    expectHits: 1,
    expectNoContent: ["cookie", "cookieyes", "Duration", "VISITOR_INFO", "_gat"],
  },
  {
    label: "[D2] Pertinence — standards fabrication portes acier creux",
    query: "exceed hollow standards metal doors frames",
    expectHits: 1,
    expectUrl: "/offer/",
    expectContent: "exceed",
  },
];

// Load JINA_API_KEY from .env.local if not set
if (!process.env.JINA_API_KEY) {
  try {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const envContent = readFileSync(resolve("apps/admin/.env.local"), "utf-8");
    for (const line of envContent.split("\n")) {
      const [key, ...vals] = line.trim().split("=");
      if (key && !key.startsWith("#")) process.env[key.trim()] = vals.join("=").trim();
    }
  } catch {}
}

const JINA_API_KEY = process.env.JINA_API_KEY;

async function generateQueryEmbedding(text) {
  if (!JINA_API_KEY) return null;
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

// -------------------------------------------------------
// Search — mirrors chat.js exactly (Hybrid Vector + FTS)
// -------------------------------------------------------
async function searchKnowledgeBase(query) {
  const start = Date.now();
  let docs = [];
  let method = 'unknown';

  const queryEmbedding = await generateQueryEmbedding(query);

  if (queryEmbedding) {
    const { data: hybridDocs, error: hybridErr } = await supabase.rpc('match_documents_hybrid', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_tenant_id: TENANT_ID,
      match_count: 5
    });
    if (!hybridErr && hybridDocs) {
      docs = hybridDocs;
      method = 'match_documents_hybrid (Semantic Vector 768d + FTS) ✦';
    }
  }

  if (!docs.length) {
    const { data: rpcDocs } = await supabase.rpc('search_documents_fts', {
      query_text: query,
      match_tenant_id: TENANT_ID,
      match_count: 5
    });
    if (rpcDocs) {
      docs = rpcDocs;
      method = 'search_documents_fts RPC (FTS fallback)';
    }
  }

  return { docs, elapsed: Date.now() - start, method };
}

// -------------------------------------------------------
// Runner
// -------------------------------------------------------
async function runTests() {
  console.log("══════════════════════════════════════════════════════");
  console.log("  RAG SEARCH TEST SUITE — DE LA FONTAINE INC.");
  console.log(`  Tenant: ${TENANT_ID}`);
  console.log("══════════════════════════════════════════════════════\n");

  const { count: totalDocs } = await supabase
    .from('documents').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  const { data: urlRows } = await supabase
    .from('documents').select('url').eq('tenant_id', TENANT_ID);
  const uniqueUrls = [...new Set(urlRows?.map(d => d.url) || [])];

  console.log(`📦 Base: ${totalDocs} chunks | ${uniqueUrls.length} URLs indexées`);
  uniqueUrls.forEach(u => console.log(`   • ${u}`));
  console.log();

  let passed = 0, failed = 0;
  const failures = [];

  for (const tc of TEST_CASES) {
    const { docs, elapsed, method } = await searchKnowledgeBase(tc.query);

    let ok = true;
    const reasons = [];

    if (!tc.expectNone && tc.expectHits > 0 && docs.length < tc.expectHits) {
      ok = false;
      reasons.push(`attendu ≥ ${tc.expectHits} résultat(s), obtenu ${docs.length}`);
    }
    if (tc.expectNone && docs.length > 0) {
      ok = false;
      reasons.push(`attendu 0 résultats, obtenu ${docs.length}`);
    }
    if (tc.expectUrl && docs.length > 0) {
      if (!docs.some(d => d.url?.includes(tc.expectUrl))) {
        ok = false;
        reasons.push(`aucun résultat de l'URL '${tc.expectUrl}' (reçu: ${docs.map(d => d.url?.split('/').filter(Boolean).pop()).join(', ')})`);
      }
    }
    if (tc.expectContent && docs.length > 0) {
      if (!docs.some(d => d.content?.toLowerCase().includes(tc.expectContent.toLowerCase()))) {
        ok = false;
        reasons.push(`aucun chunk contenant '${tc.expectContent}'`);
      }
    }
    if (tc.expectNoContent && docs.length > 0) {
      for (const forbidden of tc.expectNoContent) {
        if (docs.some(d => d.content?.toLowerCase().includes(forbidden.toLowerCase()))) {
          ok = false;
          reasons.push(`chunk contenant du bruit interdit: '${forbidden}'`);
        }
      }
    }

    const status = ok ? "✅ PASS" : "❌ FAIL";
    const hits = docs.length > 0
      ? `${docs.length} résultat(s) [${docs[0].url?.split('/').filter(Boolean).pop() || 'root'}]`
      : `0 résultat(s)`;

    console.log(`${status} ${tc.label}`);
    console.log(`       "${tc.query}" → ${hits} | ${elapsed}ms | ${method}`);
    if (tc.note) console.log(`       ℹ️  ${tc.note}`);
    if (reasons.length) reasons.forEach(r => console.log(`       ⚠️  ${r}`));
    if (docs.length > 0 && ok && !tc.expectNone)
      console.log(`       └─ "${docs[0].content.substring(0, 90).replace(/\n/g, ' ')}..."`);
    console.log();

    ok ? passed++ : failed++;
    if (!ok) failures.push({ label: tc.label, reasons });

    await new Promise(r => setTimeout(r, 150));
  }

  console.log("══════════════════════════════════════════════════════");
  const total = TEST_CASES.length;
  const pct = Math.round((passed / total) * 100);
  console.log(`  RÉSULTATS: ${passed}/${total} tests passés (${pct}%)`);
  if (passed === total) {
    console.log("  🎉 TOUS LES TESTS PASSENT !");
  } else {
    console.log(`  ${failed} ÉCHEC(S):`);
    failures.forEach(f => {
      console.log(`    • ${f.label}`);
      f.reasons.forEach(r => console.log(`      → ${r}`));
    });
  }
  console.log("══════════════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
