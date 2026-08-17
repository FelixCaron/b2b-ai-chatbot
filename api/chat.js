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

    const isAdminCopilot = (tenant_public_key === 'b2b00000-0000-4000-a000-000000000000');

    // Lookup site - fetch core columns (always exist) + optional personality cols
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, tenant_id, domain, enable_lead_capture, theme_primary_color, bot_goal, bot_tone, support_email, calendar_link, tenants(plan)')
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
    const isDomainMatch = isAdminCopilot || origin.includes(siteDomainClean) || (site.domain && origin.includes(site.domain));

    if (!isAdminOrigin && !isDomainMatch) {
      return new Response(JSON.stringify({ error: `Origin non autorisée (${origin}) pour le domaine ${site.domain}` }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    const isLeadCaptureEnabled = site.enable_lead_capture || false;

    // Save user message (Skip if Copilot to avoid filling the DB with internal logs, or let it save to the mock ID if it doesn't crash)
    if (!isAdminCopilot) {
      await supabase.from('messages').insert({
        tenant_id: tenantId,
        session_id,
        role: 'user',
        content: message
      });
    }

    // Fetch site summary from site_summaries if available, with fallback to documents table (#site-summary)
    let summaryText = null;

    try {
      const { data: summaryRecord } = await supabase
        .from('site_summaries')
        .select('summary')
        .eq('site_id', site.id)
        .maybeSingle();

      if (summaryRecord?.summary) {
        summaryText = summaryRecord.summary;
      }
    } catch (e) {
      console.warn('[chat] site_summaries fetch warning:', e.message);
    }

    if (!summaryText) {
      try {
        const { data: docSummary } = await supabase
          .from('documents')
          .select('content')
          .eq('site_id', site.id)
          .ilike('url', '%#site-summary')
          .maybeSingle();

        if (docSummary?.content) {
          summaryText = docSummary.content.replace(/^\[SITE_SUMMARY\]\n/, '');
        }
      } catch (e) {
        console.warn('[chat] docSummary fetch warning:', e.message);
      }
    }

    // Ultimate fallback: if no explicit AI summary exists yet, load top indexed documents as business summary
    if (!summaryText) {
      try {
        const { data: topDocs } = await supabase
          .from('documents')
          .select('content')
          .eq('tenant_id', tenantId)
          .limit(3);

        if (topDocs && topDocs.length > 0) {
          summaryText = topDocs.map(d => d.content).join('\n\n').slice(0, 3000);
        }
      } catch (e) {
        console.warn('[chat] topDocs fallback warning:', e.message);
      }
    }

    let siteSummaryText = summaryText ? `\nRÉSUMÉ DU SITE WEB ET APERÇU DE L'ENTREPRISE :\n${summaryText}\n` : '';

    if (isAdminCopilot) {
      siteSummaryText = `\nRÉSUMÉ DE LA PLATEFORME (Copilot Admin) :
Tu es le Copilot officiel du tableau de bord de B2B AI Chatbot. Ta mission est d'aider les administrateurs à configurer leur propre agent IA.
- **Prise de Rendez-vous (Calendar) & Support** : Pour configurer un agenda (Google Calendar, Calendly, Cal.com) ou le transfert d'emails de support, l'utilisateur doit souscrire au plan "Pro Appointment & Support" (80$/mois). Une fois abonné, il peut entrer son lien d'agenda et son email de support dans la section "Pro Integrations" du tableau de bord (Dashboard).
- **Intégration du Widget** : L'utilisateur doit copier la balise <script> fournie dans son Dashboard et la coller dans son site web.
- **Plans** : Free (Gratuit), Pro (80$/mois), Enterprise.
- **Outils d'UI** : Tu as accès à l'outil 'navigate_to'. N'hésite pas à l'utiliser si l'utilisateur demande où trouver une fonctionnalité.
Ne mentionne jamais de portes coupe-feu ou d'autres sujets sans rapport.\n`;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    // Temporal & Date Context
    const currentDateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTimeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const timeContext = `CONTEXTE TEMPOREL ACTUEL : Nous sommes le ${currentDateStr}, il est ${currentTimeStr}.`;

    // Build system prompt
    const toneString = site.bot_tone === 'amical' ? "Ton: Chaleureux, amical, tutoiement autorisé si naturel, très bienveillant." : "Ton: Professionnel, courtois, vouvoiement obligatoire, précis.";
    const goalString = site.bot_goal === 'lead' ? "Objectif Principal: Convertir le visiteur en prospect. Incite fortement à laisser un email ou numéro." : "Objectif Principal: Informer et supporter le visiteur. Réponds de façon exhaustive et claire.";

    // Integrations Context
    const hasProPlan = site.tenants?.plan === 'pro' || site.tenants?.plan === 'enterprise';
    const calendarInstruction = (hasProPlan && site.calendar_link) 
      ? `5. PRISE DE RENDEZ-VOUS : Si l'utilisateur souhaite prendre rendez-vous, fournis TOUJOURS ce lien de réservation : [Prendre rendez-vous](${site.calendar_link}).`
      : "";
      
    const supportInstruction = (hasProPlan && site.support_email)
      ? `6. SUPPORT TECHNIQUE : Si l'utilisateur demande de l'aide ou a un problème, utilise l'outil "send_support_email" pour alerter notre équipe de support.`
      : "";

    const systemPrompt = `Tu es l'agent de service client et l'assistant virtuel officiel de l'entreprise (site web: ${site.domain}). 
Ton rôle est de représenter l'entreprise et d'accompagner les visiteurs avec précision, honnêteté et un sens aigu du service client. Tu dois toujours te comporter comme un membre à part entière de l'équipe.
${timeContext}
${siteSummaryText}

RÈGLES DE COMMUNICATION ET POSTURE (SERVICE CLIENT) :
1. POSTURE INTERNE : Tu fais partie de l'entreprise. Utilise TOUJOURS "nous", "notre", "nos". Ne dis JAMAIS "ils", "leur site" ou "l'entreprise" à la troisième personne.
2. PAS DE PRÉSENTATION RÉPÉTITIVE : L'interface affiche DÉJÀ ton message d'accueil. Ne commence JAMAIS tes réponses par "Bonjour, je suis l'assistant...". Réponds DIRECTEMENT à la question posée.
3. LIENS ET NAVIGATION : L'utilisateur est DÉJÀ sur notre site web. Ne dis JAMAIS "Veuillez consulter notre site web" ou "Allez sur notre site". Si tu as l'information, donne-la. Si tu as l'URL précise d'une page (trouvée via la recherche), donne le lien direct sous forme cliquable.
4. RÉPONSES AUX QUESTIONS GÉNÉRALES : Si l'utilisateur demande ce que nous faisons, utilise IMPÉRATIVEMENT le RÉSUMÉ DU SITE ci-dessus pour expliquer concrètement nos produits/services, en te positionnant comme un représentant fier de son entreprise.
5. VALORISATION DE LA MARQUE ET VENTE SUBTILE : Mets toujours poliment en valeur la qualité de nos services et l'expertise de notre marque. Agis comme un ambassadeur enthousiaste de l'entreprise. Propose naturellement nos solutions aux besoins du client de façon consultative, sans jamais être agressif ou insistant, pour conserver une image de marque premium.

RÈGLES D'OR DE VÉRITÉ ET ANTI-HALLUCINATION :
1. TU NE DOIS JAMAIS INVENTER D'INFORMATIONS OU DE SERVICES.
2. OBLIGATION STRICTE DE RECHERCHE RAG : Il est STRICTEMENT INTERDIT de dire "Je n'ai pas cette information" SANS AVOIR D'ABORD EXÉCUTÉ l'outil "search_knowledge_base" avec plusieurs mots-clés.
3. COORDONNÉES ET HORAIRES STRICTS : Ne donne JAMAIS de numéro de téléphone, courriel, adresse ou heures d'ouverture s'ils ne sont pas EXPLICITEMENT dans le contexte ou la recherche.
4. INTERDICTION DES PLACEHOLDERS : AUCUN crochet ou texte de remplacement ("[[numéro]]", "[email]").
5. GESTION DES INFORMATIONS MANQUANTES : APRÈS avoir cherché et confirmé que l'info est absente, sois un bon agent de service client : excuse-toi poliment et ${isLeadCaptureEnabled ? "propose IMMÉDIATEMENT à l'utilisateur de laisser son nom et son numéro de téléphone ou courriel pour qu'un conseiller humain le recontacte rapidement." : "invite-le à nous contacter via la page de contact ou le formulaire du site."}

RÈGLES DE FORMATAGE ET STRUCTURE (MARKDOWN) :
1. UTILISE UN MARKDOWN ÉLÉGANT ET STRUCTURÉ :
   - Mets en GRAS (**terme**) les points clés, noms de produits, garanties, tarifs ou étapes importantes.
   - Utilise des LISTES À PUCES (- élément) ou NUMÉROTÉES (1. étape) dès que tu présentes plus de 2 éléments, options ou services pour aérer la réponse.
   - Formate TOUS les liens web sous forme de liens cliquables Markdown : [Titre du lien](https://url-exacte).
   - Rédige des paragraphes courts (2 à 3 phrases maximum) séparés par un saut de ligne double pour une lisibilité mobile et desktop optimale.

INTERDICTIONS ABSOLUES :
- INTERDIT d'inventer des prix, des services ou des horaires.
- INTERDIT d'utiliser le jargon technique IA : ne dis JAMAIS "base de connaissances", "base de données", "contexte", "résultat de recherche" ou "données fournies".

DIRECTIVES SPÉCIFIQUES :
1. ${toneString}
2. ${goalString}
3. RECADRAGE : Si la conversation dévie hors-sujet, recadre poliment vers nos prestations, avec diplomatie.
${isLeadCaptureEnabled ? "4. CAPTURE DE PROSPECTS : C'est une priorité. Dès qu'un client montre de l'intérêt pour un service ou pose une question pointue, propose-lui de laisser ses coordonnées pour une prise en charge personnalisée." : ""}
${calendarInstruction}
${supportInstruction}`;


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
          description: "Recherche dans la documentation et la base de connaissances du site. Utilise cet outil pour toute question sur les produits, services, caractéristiques ou spécifications techniques. Pour des résultats optimaux sur des sites bilingues ou techniques, inclus les termes clés pertinents en anglais et en français (ex: 'core polystyrene honeycomb doors').",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "La requête ou les mots-clés de recherche (en français et/ou anglais si pertinent)."
              }
            },
            required: ["query"]
          }
        }
      }
    ];

    if (hasProPlan && site.support_email) {
      tools.push({
        type: "function",
        function: {
          name: "send_support_email",
          description: "Envoie un ticket au service d'assistance client lorsque l'utilisateur demande de l'aide technique ou veut contacter le support.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nom de l'utilisateur" },
              email: { type: "string", description: "Email de l'utilisateur" },
              message: { type: "string", description: "Le message détaillé ou la description du problème" }
            },
            required: ["name", "email", "message"]
          }
        }
      });
    }

    if (isAdminCopilot) {
      tools.push({
        type: "function",
        function: {
          name: "navigate_to",
          description: "Ouvre une page spécifique du panneau d'administration pour l'utilisateur. Utilise ceci si l'utilisateur veut voir ses factures (pricing), son tableau de bord (dashboard), ses prospects (leads), ou la page 'A propos' (about).",
          parameters: {
            type: "object",
            properties: {
              page: { 
                type: "string", 
                enum: ["dashboard", "pricing", "leads", "about"],
                description: "La page cible."
              }
            },
            required: ["page"]
          }
        }
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const { generateChatResponse, extractLeadInfo } = await import('./lib/llm.js');
          
          // MULTI-TURN AGENTIC LOOP (True Reasoning Loop)
          // Allows up to MAX_TURNS iterations of tool calls & query reformulations
          const MAX_TURNS = 4;
          let currentHistory = [...fullHistory];
          let finalReply = '';
          let loopCount = 0;

          while (loopCount < MAX_TURNS) {
            loopCount++;

            // Use GPT Luna across all plans for optimal response speed & accuracy
            const selectedModel = 'openai/gpt-5.6-luna';

            const responseData = await generateChatResponse({ 
              systemPrompt, 
              messagesHistory: currentHistory, 
              apiKey, 
              tools,
              model: selectedModel
            });

            if (responseData.error) {
              finalReply = responseData.error;
              break;
            }

            const llmMessage = responseData.message;

            // If the LLM requested tool calls
            if (llmMessage?.tool_calls && llmMessage.tool_calls.length > 0) {
              // Append assistant tool_calls message to current conversation state
              currentHistory.push({
                role: 'assistant',
                content: llmMessage.content || '',
                tool_calls: llmMessage.tool_calls
              });

              for (const toolCall of llmMessage.tool_calls) {
                if (toolCall.function.name === 'search_knowledge_base') {
                  const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                  const toolQuery = toolArgs.query || message;

                  // ── HYBRID SEARCH: Embedding sémantique + FTS bilingue ───────────────
                  let docs = [];
                  let searchMethod = 'unknown';

                  const queryEmbedding = await generateEmbedding(toolQuery, 'retrieval.query');

                  if (queryEmbedding) {
                    const { data: hybridDocs, error: hybridErr } = await supabase.rpc('match_documents_hybrid', {
                      query_text: toolQuery,
                      query_embedding: queryEmbedding,
                      match_tenant_id: tenantId,
                      match_count: 10
                    });
                    if (!hybridErr && hybridDocs) {
                      docs = hybridDocs;
                      searchMethod = 'hybrid (semantic + FTS)';
                    }
                  }

                  if (!docs.length) {
                    const { data: rpcDocs, error: rpcErr } = await supabase.rpc('search_documents_fts', {
                      query_text: toolQuery,
                      match_tenant_id: tenantId,
                      match_count: 10
                    });
                    if (!rpcErr && rpcDocs) {
                      docs = rpcDocs;
                      searchMethod = 'FTS bilingue';
                    } else {
                      const { data: fallbackDocs } = await supabase
                        .from('documents')
                        .select('id, url, content')
                        .eq('tenant_id', tenantId)
                        .textSearch('fts', toolQuery, { type: 'websearch', config: 'french' })
                        .limit(10);
                      docs = fallbackDocs || [];
                      searchMethod = 'textSearch basique (fallback)';
                    }
                  }

                  console.log(`[chat] Loop #${loopCount} search "${toolQuery}" via ${searchMethod}: ${docs.length} docs`);

                  // Stream tool badge to user interface in real-time
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
                  const toolResponseContent = contextText || "Aucune information trouvée pour cette recherche spécifique. Essaye de reformuler avec des mots-clés équivalents ou en anglais si pertinent.";

                  // Append tool result to currentHistory for next reasoning loop
                  currentHistory.push({
                    role: 'tool',
                    content: toolResponseContent,
                    tool_call_id: toolCall.id
                  });
                } else if (toolCall.function.name === 'send_support_email') {
                  const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                  console.log(`[chat] Loop #${loopCount} send_support_email:`, toolArgs);
                  
                  // Stream tool badge to UI
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        tool_call: {
                          name: 'send_support_email',
                          recipient: site.support_email
                        }
                      })}\n\n`
                    )
                  );

                  // Mock email sending. In production, use Resend/Nodemailer here.
                  const emailResponse = `Email envoyé avec succès à l'équipe de support (${site.support_email}). Le client doit s'attendre à une réponse sous peu.`;

                  currentHistory.push({
                    role: 'tool',
                    content: emailResponse,
                    tool_call_id: toolCall.id
                  });
                } else if (toolCall.function.name === 'navigate_to') {
                  const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                  
                  // Stream tool badge to UI
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        tool_call: {
                          name: 'navigate_to',
                          page: toolArgs.page
                        }
                      })}\n\n`
                    )
                  );

                  const navResponse = `L'utilisateur a été redirigé avec succès vers la page ${toolArgs.page}.`;
                  
                  currentHistory.push({
                    role: 'tool',
                    content: navResponse,
                    tool_call_id: toolCall.id
                  });
                }
              }
            } else {
              // No tool calls requested: LLM provided final response!
              finalReply = llmMessage?.content || "⚠️ Je ne peux pas répondre pour le moment.";
              break;
            }
          }

          if (!finalReply && loopCount >= MAX_TURNS) {
            finalReply = "Désolé, j'ai recherché dans nos informations mais je n'ai pas pu trouver les éléments nécessaires.";
          }

          // Stream out assistant response in smooth visual chunks
          const words = finalReply.split(' ');
          let accumulated = '';

          for (let i = 0; i < words.length; i++) {
            accumulated += (i === 0 ? '' : ' ') + words[i];
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: accumulated })}\n\n`));
            await new Promise((r) => setTimeout(r, 8));
          }

          // Save assistant message to Supabase
          if (!isAdminCopilot) {
            await supabase.from('messages').insert({
              tenant_id: tenantId,
              session_id,
              role: 'assistant',
              content: finalReply
            });

            await supabase.rpc('increment_usage', { target_tenant_id: tenantId });
          }

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
