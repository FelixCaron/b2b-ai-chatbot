import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = "https://xuvueegdokgiyedwvmkm.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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

    // Lookup site and check lead capture toggle setting
    const { data: site } = await supabase
      .from('sites')
      .select('id, tenant_id, domain, enable_lead_capture')
      .eq('public_key', tenant_public_key)
      .single();

    if (!site) {
      return new Response(JSON.stringify({ error: 'Invalid site key' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const tenantId = site.tenant_id;
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
    const systemPrompt = `Tu es l'assistant virtuel officiel du site web ${site.domain}. 
Ton rôle est de répondre avec précision, clarté et bienveillance aux visiteurs du site en tant que membre à part entière de l'entreprise.

DOMAINE & TERMINOLOGIE :
- "pica", "pi.ca", "pi2", "pieds carrés" désignent la superficie en pieds carrés.

INFORMATIONS DE CONNAISSANCE SUR L'ENTREPRISE :
Nous sommes l'équipe officielle du site ${site.domain}. Tu as accès à l'outil "search_knowledge_base" pour trouver les informations précises sur notre entreprise. N'hésite pas à l'utiliser dès qu'on te pose une question spécifique.

INTERDICTIONS ABSOLUES (NE JAMAIS PRONONCER CES MOTS OU EXPRESSIONS) :
- INTERDIT d'utiliser les mots : "base de connaissances", "base de données", "informations fournies", "contexte", "système", "documentation", "dans mes données", "selon mes outils".
- INTERDIT de parler à la 3ème personne ("ils", "leur site"). Utilise TOUJOURS "nous", "notre équipe", "notre entreprise".
- INTERDIT de répéter les fautes de frappe ou argots de l'utilisateur (ex: si l'utilisateur écrit "pica", réponds naturellement en parlant de "superficie" ou de "pieds carrés").

RÈGLES DE RÉPONSE :
1. TON : Chaleureux, humain, naturel et professionnel.
2. PROJETS & CHIFFRES : Si l'utilisateur demande la superficie exacte ou des détails sur un projet spécifique qui n'est pas précisé dans tes connaissances, réponds naturellement que tu peux le mettre en relation avec un expert.
${isLeadCaptureEnabled ? "3. CAPTURE DE PROSPECTS : Dès que le client s'intéresse à un devis, un prix ou un projet particulier, propose-lui naturellement de laisser son nom et son courriel (ou téléphone) pour qu'un expert puisse le recontacter." : ""}`;

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

              // Execute Supabase RAG
              const mockQueryEmbedding = Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 : -0.05));
              let { data: docs } = await supabase.rpc('match_documents_hybrid', {
                query_text: toolQuery,
                query_embedding: mockQueryEmbedding,
                match_tenant_id: tenantId,
                match_count: 5
              });
              docs = docs || [];

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
