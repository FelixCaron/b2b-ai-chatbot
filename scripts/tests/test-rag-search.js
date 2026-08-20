/**
 * test-rag-search.js
 *
 * Jeu de tests pour la fonction search_knowledge_base (RAG) basÃ© sur delafontaine.ca.
 * Teste la qualitÃ© et la pertinence des rÃ©sultats de recherche dans Supabase.
 *
 * Usage: node scripts/test-rag-search.js
 *
 * PrÃ©-requis: node scripts/reingest-delafontaine.mjs doit avoir Ã©tÃ© exÃ©cutÃ©.
 *
 * Contenu indexÃ© (9 URLs, 23 chunks):
 *   / | /about-us/ | /products/doors/ | /products/frames/
 *   /products/speciality-products/ | /offer/ | /sustainability/ | /career/ | /portfolio/
 *   NOTE: /locations/, /contact/, /products/ â†’ 0 chunks (pages trop lÃ©gÃ¨res cÃ´tÃ© Jina)
 */

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TENANT_ID = "0610bdac-96ec-48b2-99f5-f743d203dacd";

// -------------------------------------------------------
// Test Suite
// -------------------------------------------------------
const TEST_CASES = [
  // â”€â”€ GROUP A: Happy Path â€” contenu confirmÃ© dans les chunks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    label: "[A3] Portes rÃ©sistantes au feu",
    query: "fire-rated",
    expectHits: 1,
    expectContent: "fire",
  },
  {
    label: "[A4] Ã€ propos â€” famille / histoire",
    query: "family business",
    expectHits: 1,
    expectContent: "family",
  },
  {
    label: "[A5] FondÃ© Ã  Sherbrooke, prÃ©sence mondiale",
    query: "Brodeur Street frames steel",
    expectHits: 1,
    expectContent: "Brodeur",
    expectUrl: "/about-us/",
  },
  {
    label: "[A6] DÃ©lais de livraison (leadtime)",
    query: "leadtime",
    expectHits: 1,
    expectContent: "leadtime",
    expectUrl: "/offer/",
  },
  {
    label: "[A7] QualitÃ© / assurance qualitÃ©",
    query: "quality",
    expectHits: 1,
    expectContent: "quality",
  },
  {
    label: "[A8] Produits spÃ©ciaux â€” portes isolantes (polystyrÃ¨ne/urÃ©thane)",
    query: "polystyrene",
    expectHits: 1,
    expectUrl: "/products/speciality-products/",
  },
  {
    label: "[A9] DurabilitÃ© / dÃ©veloppement durable",
    query: "sustainability environmental",
    expectHits: 1,
    expectContent: "sustain",
    expectUrl: "/steel-doors-and-frames-sustainability/",
  },
  {
    label: "[A10] CarriÃ¨re / emploi",
    query: "tailor-made innovation values",
    expectHits: 1,
    expectUrl: "/career/",
  },

  // â”€â”€ GROUP B: Bilingue Cross-Lingual FR â†’ EN (Semantic Vector Search) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    label: "[B1] FR â†’ EN: entreprise familiale (matchs sÃ©mantiques 'family business')",
    query: "entreprise familiale",
    expectHits: 1,
    expectUrl: "/about-us/",
  },
  {
    label: "[B2] FR â†’ EN: portes acier coupe-feu (matchs sÃ©mantiques 'steel doors')",
    query: "portes acier coupe-feu",
    expectHits: 1,
    expectUrl: "/products/doors/",
  },

  // â”€â”€ GROUP C: NÃ©gatifs stricts â€” PropretÃ© du contexte RAG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    label: "[C1] Hors-sujet: prix / tarifs (aucun tarif/devis dans le contexte)",
    query: "prix tarifs devis",
    expectNoContent: ["tarifs", "pricing", "devis"],
  },
  {
    label: "[C2] QualitÃ© chunks: zÃ©ro contenu RGPD/cookies dans le contexte",
    query: "Google Analytics cookie duration",
    expectNoContent: ["cookie", "cookieyes", "Duration", "VISITOR_INFO", "_gat"],
  },
  {
    label: "[C3] Hors-sujet total: pizza / restaurant (aucun bruit dans le contexte)",
    query: "pizza restaurant rÃ©servation table",
    expectNoContent: ["pizza", "restaurant", "rÃ©servation", "table"],
  },

  // â”€â”€ GROUP D: QualitÃ© des rÃ©sultats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    label: "[D1] Pas de bruit RGPD dans les rÃ©sultats retournÃ©s",
    query: "steel doors products",
    expectHits: 1,
    expectNoContent: ["cookie", "cookieyes", "Duration", "VISITOR_INFO", "_gat"],
  },
  {
    label: "[D2] Pertinence â€” standards fabrication portes acier creux",
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
// Search â€” mirrors chat.js exactly (Hybrid Vector + FTS)
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
      method = 'match_documents_hybrid (Semantic Vector 768d + FTS) âœ¦';
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
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("  RAG SEARCH TEST SUITE â€” DE LA FONTAINE INC.");
  console.log(`  Tenant: ${TENANT_ID}`);
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n");

  const { count: totalDocs } = await supabase
    .from('documents').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  const { data: urlRows } = await supabase
    .from('documents').select('url').eq('tenant_id', TENANT_ID);
  const uniqueUrls = [...new Set(urlRows?.map(d => d.url) || [])];

  console.log(`ðŸ“¦ Base: ${totalDocs} chunks | ${uniqueUrls.length} URLs indexÃ©es`);
  uniqueUrls.forEach(u => console.log(`   â€¢ ${u}`));
  console.log();

  let passed = 0, failed = 0;
  const failures = [];

  for (const tc of TEST_CASES) {
    const { docs, elapsed, method } = await searchKnowledgeBase(tc.query);

    let ok = true;
    const reasons = [];

    if (!tc.expectNone && tc.expectHits > 0 && docs.length < tc.expectHits) {
      ok = false;
      reasons.push(`attendu â‰¥ ${tc.expectHits} rÃ©sultat(s), obtenu ${docs.length}`);
    }
    if (tc.expectNone && docs.length > 0) {
      ok = false;
      reasons.push(`attendu 0 rÃ©sultats, obtenu ${docs.length}`);
    }
    if (tc.expectUrl && docs.length > 0) {
      if (!docs.some(d => d.url?.includes(tc.expectUrl))) {
        ok = false;
        reasons.push(`aucun rÃ©sultat de l'URL '${tc.expectUrl}' (reÃ§u: ${docs.map(d => d.url?.split('/').filter(Boolean).pop()).join(', ')})`);
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

    const status = ok ? "âœ… PASS" : "âŒ FAIL";
    const hits = docs.length > 0
      ? `${docs.length} rÃ©sultat(s) [${docs[0].url?.split('/').filter(Boolean).pop() || 'root'}]`
      : `0 rÃ©sultat(s)`;

    console.log(`${status} ${tc.label}`);
    console.log(`       "${tc.query}" â†’ ${hits} | ${elapsed}ms | ${method}`);
    if (tc.note) console.log(`       â„¹ï¸  ${tc.note}`);
    if (reasons.length) reasons.forEach(r => console.log(`       âš ï¸  ${r}`));
    if (docs.length > 0 && ok && !tc.expectNone)
      console.log(`       â””â”€ "${docs[0].content.substring(0, 90).replace(/\n/g, ' ')}..."`);
    console.log();

    ok ? passed++ : failed++;
    if (!ok) failures.push({ label: tc.label, reasons });

    await new Promise(r => setTimeout(r, 150));
  }

  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  const total = TEST_CASES.length;
  const pct = Math.round((passed / total) * 100);
  console.log(`  RÃ‰SULTATS: ${passed}/${total} tests passÃ©s (${pct}%)`);
  if (passed === total) {
    console.log("  ðŸŽ‰ TOUS LES TESTS PASSENT !");
  } else {
    console.log(`  ${failed} Ã‰CHEC(S):`);
    failures.forEach(f => {
      console.log(`    â€¢ ${f.label}`);
      f.reasons.forEach(r => console.log(`      â†’ ${r}`));
    });
  }
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n");

  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
