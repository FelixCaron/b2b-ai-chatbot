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

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runRealConversationTest() {
  console.log("==========================================================================");
  console.log("  TEST CONVERSATION RÉELLE (REAL E2E CHAT SIMULATION ON DELAFONTAINE.CA)");
  console.log("==========================================================================\n");

  // Fetch all sites for delafontaine.ca and select the one with most chunks
  const { data: sites } = await supabase
    .from('sites')
    .select('id, tenant_id, domain, public_key')
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

  if (!bestSite) {
    console.error("❌ Aucun site trouvé pour delafontaine.ca !");
    process.exit(1);
  }

  console.log(`📌 Site sélectionné : ${bestSite.domain}`);
  console.log(`🔑 Public Key     : ${bestSite.public_key}`);
  console.log(`🏢 Tenant ID       : ${bestSite.tenant_id}`);
  console.log(`📦 Chunks indexés  : ${maxChunks}\n`);

  // Ensure site summary exists
  const { data: summaryCheck } = await supabase
    .from('site_summaries')
    .select('summary')
    .eq('site_id', bestSite.id)
    .maybeSingle();

  if (!summaryCheck) {
    console.log("ℹ️ Génération initiale du résumé de site...");
    const { generateWebsiteSummary } = await import('../api/lib/llm.js');
    const { data: sampleDocs } = await supabase
      .from('documents')
      .select('content')
      .eq('site_id', bestSite.id)
      .limit(15);

    const fullContent = sampleDocs?.map(d => d.content).join('\n\n') || '';
    const generated = await generateWebsiteSummary({
      content: fullContent,
      targetUrl: `https://${bestSite.domain}`,
      apiKey: process.env.OPENROUTER_API_KEY
    });

    if (generated) {
      await supabase.from('site_summaries').upsert({
        tenant_id: bestSite.tenant_id,
        site_id: bestSite.id,
        summary: generated,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,site_id' });
      console.log("✅ Résumé généré et sauvegardé avec succès !");
    }
  }

  // Import chat handler AFTER env vars are set
  const handlerModule = await import('../api/chat.js');
  const chatHandler = handlerModule.default;

  const sessionId = "real_conv_" + Date.now();

  const CONVERSATION_STEPS = [
    {
      userMsg: "Bonjour, pouvez-vous me présenter De La Fontaine et vos domaines d'expertise ?",
      description: "Question 1: Vue d'ensemble (prompt système avec résumé)"
    },
    {
      userMsg: "Quels types de portes isolantes proposez-vous pour les bâtiments commerciaux ?",
      description: "Question 2: Spécification produit (déclenche search_knowledge_base)"
    },
    {
      userMsg: "Est-ce que vos portes en acier sont certifiées coupe-feu ?",
      description: "Question 3: Certification coupe-feu (déclenche search_knowledge_base)"
    },
    {
      userMsg: "Où se trouve votre siège social et sur quels marchés êtes-vous présents ?",
      description: "Question 4: Présence & usines (déclenche search_knowledge_base)"
    }
  ];

  for (let i = 0; i < CONVERSATION_STEPS.length; i++) {
    const step = CONVERSATION_STEPS[i];
    console.log(`--------------------------------------------------------------------------`);
    console.log(`💬 TOUR ${i + 1} | ${step.description}`);
    console.log(`👤 VISITEUR: "${step.userMsg}"`);

    const reqBody = {
      message: step.userMsg,
      tenant_public_key: bestSite.public_key,
      session_id: sessionId
    };

    const dummyReq = {
      method: 'POST',
      headers: new Map([
        ['content-type', 'application/json'],
        ['origin', 'https://delafontaine.ca']
      ]),
      json: async () => reqBody
    };

    dummyReq.headers.get = (name) => {
      if (name.toLowerCase() === 'origin') return 'https://delafontaine.ca';
      if (name.toLowerCase() === 'content-type') return 'application/json';
      return null;
    };

    const res = await chatHandler(dummyReq);
    if (!res.body) {
      console.error("❌ Pas de stream retourné par api/chat.js", await res.json());
      continue;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let toolCallsReceived = [];
    let finalText = "";

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      if (value) {
        const chunkStr = decoder.decode(value);
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace(/^data: /, '').trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.tool_call) {
                toolCallsReceived.push(parsed.tool_call);
              }
              if (parsed.text) {
                finalText = parsed.text;
              }
            } catch (_e) {}
          }
        }
      }
    }

    console.log(`🛠️ Appels d'outil dans ce tour : ${toolCallsReceived.length}`);
    for (const tc of toolCallsReceived) {
      console.log(`   └─ Outil: ${tc.name} | Mots-clés: "${tc.keywords}" | Chunks trouvés: ${tc.matched_chunks}`);
      if (tc.sources?.length) {
        console.log(`      Sources lues (${tc.sources.length}) : ${tc.sources.slice(0, 3).join(', ')}`);
      }
    }

    console.log(`🤖 CHATBOT: "${finalText.replace(/\n+/g, ' ')}"`);
    console.log();
  }

  console.log("==========================================================================");
  console.log("  FIN DU TEST DE CONVERSATION RÉELLE");
  console.log("==========================================================================\n");
}

runRealConversationTest().catch(console.error);
