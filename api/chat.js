import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './lib/llm.js';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Simple memory cache for basic Edge Rate Limiting (per isolate)
const rateLimitMap = new Map();

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
    const { message, tenant_public_key, session_id } = await req.json();

    if (!message || !tenant_public_key || !session_id) {
      return new Response(JSON.stringify({ error: 'Fields required: message, tenant_public_key, session_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // IP-based Rate Limiting (10 req / minute per IP)
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const now = Date.now();
    if (ip !== 'unknown') {
      const record = rateLimitMap.get(ip) || { count: 0, startTime: now };
      if (now - record.startTime > 60000) {
        record.count = 1;
        record.startTime = now;
      } else {
        record.count++;
        if (record.count > 10) {
          return new Response(JSON.stringify({ error: 'Limite de requêtes atteinte. Veuillez patienter.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      }
      rateLimitMap.set(ip, record);
      // Clean up map occasionally to prevent memory leaks in the isolate
      if (rateLimitMap.size > 10000) rateLimitMap.clear();
    }

    // Lookup site - fetch core columns (always exist) + optional personality cols
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, tenant_id, domain, enable_lead_capture, theme_primary_color, bot_goal, bot_tone')
      .eq('public_key', tenant_public_key)
      .maybeSingle();

    if (siteError) {
      console.error('[chat] Supabase site lookup error:', siteError.message, siteError.code);
      // If error is about missing columns (42703), try fetching without them
      if (siteError.code === '42703') {
        const { data: siteCore, error: coreSiteError } = await supabase
          .from('sites')
          .select('id, tenant_id, domain')
          .eq('public_key', tenant_public_key)
          .maybeSingle();
        if (coreSiteError || !siteCore) {
          return new Response(JSON.stringify({ error: 'Site non trouvé (core query failed)' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
        // Assign defaults for missing cols
        Object.assign(siteCore, { enable_lead_capture: false, bot_goal: 'support', bot_tone: 'professionnel' });
        // Continue with siteCore - reassign to site variable scope by falling through
        return handleChatRequest(req, siteCore, message, session_id, tenant_public_key, rateLimitMap);
      }
      return new Response(JSON.stringify({ error: `Erreur base de données: ${siteError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (!site) {
      return new Response(JSON.stringify({ error: `Clé de site invalide (${tenant_public_key}). Le site n'a pas été trouvé dans la base de données.` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const tenantId = site.tenant_id;
    // Domain locking: verify request origin matches site domain
    const origin = req.headers.get('origin') || req.headers.get('referer') || '';
    const isAdminOrigin = !origin || origin.includes('vercel.app') || origin.includes('localhost') || origin.includes('127.0.0.1');
    const siteDomainClean = site.domain ? site.domain.replace(/^https?:\/\//, '').replace(/^www\./, '') : '';
    const isDomainMatch = origin.includes(siteDomainClean) || (site.domain && origin.includes(site.domain));

    if (!isAdminOrigin && !isDomainMatch) {
      return new Response(JSON.stringify({ error: `Origin non autorisée (${origin}) pour le domaine ${site.domain}` }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    const isLeadCaptureEnabled = site.enable_lead_capture || false;

    // Save user message
    await supabase.from('messages').insert({
      tenant_id: tenantId,
      session_id,
      role: 'user',
      content: message
    });

    const apiKey = process.env.OPENROUTER_API_KEY;

    // Build system prompt
    const toneString = site.bot_tone === 'amical' ? "Ton: Chaleureux, amical, tutoiement autorisé si naturel, très bienveillant." : "Ton: Professionnel, courtois, vouvoiement obligatoire, précis.";
    const goalString = site.bot_goal === 'lead' ? "Objectif Principal: Convertir le visiteur en prospect. Incite fortement à laisser un email ou numéro." : "Objectif Principal: Informer et supporter le visiteur. Réponds de façon exhaustive et claire.";

    const systemPrompt = `Tu es l'assistant virtuel officiel du site web ${site.domain}. 
Ton rôle est de répondre avec précision aux visiteurs.

RÈGLE D'OR : TU NE DOIS JAMAIS INVENTER DE SERVICES OU D'INFORMATIONS. 
Dès qu'un utilisateur pose une question sur l'entreprise, un service, ou fait une demande (ex: réparation, achat), TU DOIS OBLIGATOIREMENT utiliser l'outil "search_knowledge_base" pour vérifier si nous offrons cela.
Si l'outil ne retourne aucune information sur le sujet (ou si tu ne l'as pas trouvé), tu DOIS répondre que notre entreprise n'offre pas ce service ou que tu ne possèdes pas cette information. N'improvise JAMAIS.

INTERDICTIONS ABSOLUES :
- INTERDIT d'inventer des services, des localisations, ou des prix.
- INTERDIT d'utiliser les mots : "base de connaissances", "base de données", "contexte".
- INTERDIT de parler à la 3ème personne ("ils", "leur site"). Utilise TOUJOURS "nous".

DIRECTIVES SPÉCIFIQUES :
1. ${toneString}
2. ${goalString}
3. LIMITES : Si l'utilisateur parle de quelque chose de complètement hors sujet par rapport à tes connaissances, recadre poliment la conversation.
${isLeadCaptureEnabled ? "4. CAPTURE DE PROSPECTS : Dès que le client s'intéresse à un de NOS vrais services, propose-lui de laisser son courriel pour être recontacté." : ""}`;

    // Fetch conversation history (last 10 messages)
    const { data: historyData } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', session_id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Re-order to chronological
    const fullHistory = historyData ? historyData.reverse() : [];

    const tools = [
      {
        type: "function",
        function: {
          name: "search_knowledge_base",
          description: "Recherche dans la base de connaissances et la documentation de l'entreprise. Utilise cet outil dès qu'un utilisateur pose une question sur un service, un prix, une caractéristique ou une information spécifique de l'entreprise.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Les mots-clés spécifiques à rechercher."
              }
            },
            required: ["query"]
          }
        }
      }
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const { generateChatResponse, extractLeadInfo } = await import('./lib/llm.js');
          
          // FIRST LLM CALL (Agentic Loop)
          let responseData = await generateChatResponse({ 
            systemPrompt, 
            messagesHistory: fullHistory, 
            apiKey, 
            tools 
          });

          if (responseData.error) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: responseData.error })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }

          const llmMessage = responseData.message;
          let finalReply = llmMessage?.content || '';

          // If the LLM wants to call a tool
          if (llmMessage?.tool_calls && llmMessage.tool_calls.length > 0) {
            const toolCall = llmMessage.tool_calls[0];
            
            if (toolCall.function.name === 'search_knowledge_base') {
              const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
              const toolQuery = toolArgs.query || message;

              // ── HYBRID SEARCH: Embedding sémantique + FTS bilingue ───────────────
              // 1. Générer l'embedding de la query (retrieval.query task pour Jina)
              // 2. Appeler match_documents_hybrid (RRF: cosine + FTS FR/EN)
              // 3. Fallback sur search_documents_fts si pas d'embedding
              // 4. Fallback textSearch basique si RPC indisponible
              let docs = [];
              let searchErr = null;
              let searchMethod = 'unknown';

              const queryEmbedding = await generateEmbedding(toolQuery, 'retrieval.query');

              if (queryEmbedding) {
                // Path A: Hybrid (semantic + FTS)
                const { data: hybridDocs, error: hybridErr } = await supabase.rpc('match_documents_hybrid', {
                  query_text: toolQuery,
                  query_embedding: queryEmbedding,
                  match_tenant_id: tenantId,
                  match_count: 5
                });
                if (!hybridErr) {
                  docs = hybridDocs || [];
                  searchMethod = 'hybrid (semantic + FTS)';
                } else {
                  console.warn('[chat] match_documents_hybrid failed, falling back to FTS:', hybridErr.message);
                  // Fallback B: FTS bilingue seul
                  const { data: ftsDocs, error: ftsErr } = await supabase.rpc('search_documents_fts', {
                    query_text: toolQuery,
                    match_tenant_id: tenantId,
                    match_count: 5
                  });
                  docs = ftsDocs || [];
                  searchErr = ftsErr;
                  searchMethod = 'FTS bilingue (fallback)';
                }
              } else {
                // Path B: FTS bilingue seul (pas d'embedding dispo)
                const { data: ftsDocs, error: ftsErr } = await supabase.rpc('search_documents_fts', {
                  query_text: toolQuery,
                  match_tenant_id: tenantId,
                  match_count: 5
                });
                if (!ftsErr) {
                  docs = ftsDocs || [];
                  searchMethod = 'FTS bilingue';
                } else {
                  // Path C: textSearch basique (dernier recours)
                  console.warn('[chat] search_documents_fts unavailable:', ftsErr.message);
                  const { data: fallbackDocs, error: fallbackErr } = await supabase
                    .from('documents')
                    .select('id, url, content')
                    .eq('tenant_id', tenantId)
                    .textSearch('fts', toolQuery, { type: 'websearch', config: 'french' })
                    .limit(5);
                  docs = fallbackDocs || [];
                  searchErr = fallbackErr;
                  searchMethod = 'textSearch basique (fallback)';
                }
              }

              console.log(`[chat] RAG search via ${searchMethod}: ${docs.length} docs`);

              // Stream tool badge to user
              const sources = Array.from(new Set(docs.map((d) => d.url)));
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    tool_call: {
                      name: 'search_knowledge_base',
                      keywords: toolQuery,
                      matched_chunks: docs.length,
                      sources: sources
                    }
                  })}\n\n`
                )
              );

              const contextText = docs.map((d) => d.content).join('\n---\n');
              const toolResponseContent = contextText || "Aucune information trouvée pour cette requête.";

              // Add tool call and tool response to history for the SECOND LLM CALL
              const secondPassHistory = [
                ...fullHistory,
                { role: 'assistant', content: "", tool_calls: llmMessage.tool_calls },
                { role: 'tool', content: toolResponseContent, tool_call_id: toolCall.id }
              ];

              const secondResponseData = await generateChatResponse({ 
                systemPrompt, 
                messagesHistory: secondPassHistory, 
                apiKey, 
                tools: null // Don't allow nested tool calls to prevent infinite loops
              });

              if (secondResponseData.error) {
                finalReply = secondResponseData.error;
              } else {
                finalReply = secondResponseData.message?.content || "⚠️ Je ne peux pas répondre pour le moment.";
              }
            }
          }

          // Stream out assistant response in smooth visual chunks
          const words = finalReply.split(' ');
          let accumulated = '';

          for (let i = 0; i < words.length; i++) {
            accumulated += (i === 0 ? '' : ' ') + words[i];
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: accumulated })}\n\n`));
            await new Promise((r) => setTimeout(r, 20));
          }

          // Save assistant message to Supabase
          await supabase.from('messages').insert({
            tenant_id: tenantId,
            session_id,
            role: 'assistant',
            content: finalReply
          });

          await supabase.rpc('increment_usage', { target_tenant_id: tenantId });

          // Lead Extraction Process
          if (isLeadCaptureEnabled) {
            try {
              const historyForExtraction = [...fullHistory, { role: 'assistant', content: finalReply }];
              const leadData = await extractLeadInfo({ messagesHistory: historyForExtraction, apiKey });
              
              if (leadData && (leadData.email || leadData.phone)) {
                // Stream tool_call event for Lead Capture
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      tool_call: {
                        name: 'capture_lead',
                        lead: leadData
                      }
                    })}\n\n`
                  )
                );

                const { data: existingLead } = await supabase.from('leads')
                  .select('id')
                  .eq('tenant_id', tenantId)
                  .eq('email', leadData.email)
                  .maybeSingle();

                if (!existingLead) {
                  await supabase.from('leads').insert({
                    tenant_id: tenantId,
                    name: leadData.name || null,
                    email: leadData.email || null,
                    phone: leadData.phone || null,
                    summary: leadData.summary || null
                  });
                }
              }
            } catch (e) {
              console.error('Lead extraction failed:', e);
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (_innerErr) {
          console.error(_innerErr);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: '⚠️ [Erreur Interne] ' + _innerErr.message })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
