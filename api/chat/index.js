import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../../lib/llm.js';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Simple memory cache for basic Edge Rate Limiting (per isolate)
const rateLimitMap = new Map();

function normalizedHostname(value) {
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function requestOrigin(req) {
  const rawOrigin = req.headers.get('origin') || req.headers.get('referer');
  if (!rawOrigin) return null;
  try {
    return new URL(rawOrigin).origin;
  } catch {
    return null;
  }
}

function isAllowedAdminOrigin(origin) {
  if (!origin) return false;
  const configuredOrigins = [process.env.ADMIN_ALLOWED_ORIGINS, process.env.VITE_APP_URL]
    .filter(Boolean)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredOrigins.some((value) => {
    try { return new URL(value).origin === origin; } catch { return false; }
  })) return true;

  return process.env.VERCEL_ENV !== 'production'
    && ['http://localhost:3000', 'http://127.0.0.1:3000'].includes(origin);
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
          return new Response(JSON.stringify({ error: 'Limite de requÃªtes atteinte. Veuillez patienter.' }), {
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
    // If the full query fails due to a missing column (42703), fall back to core columns only
    let site = null;
    {
      const { data: fullData, error: fullError } = await supabase
        .from('sites')
        .select('id, tenant_id, domain, enable_lead_capture, theme_primary_color, bot_goal, bot_tone, support_email, calendar_link, tenants(plan)')
        .eq('public_key', tenant_public_key)
        .maybeSingle();

      if (fullError) {
        console.error('[chat] Supabase site lookup error:', fullError.message, fullError.code);
        if (fullError.code === '42703') {
          // One or more optional columns are missing from the schema â€” fall back to core columns
          console.warn('[chat] Falling back to core columns due to missing column (42703).');
          const { data: coreData, error: coreError } = await supabase
            .from('sites')
            .select('id, tenant_id, domain')
            .eq('public_key', tenant_public_key)
            .maybeSingle();
          if (coreError || !coreData) {
            return new Response(JSON.stringify({ error: 'Site non trouvÃ© (core query failed)' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          }
          // Inject safe defaults for missing optional columns
          site = Object.assign(coreData, {
            enable_lead_capture: false,
            bot_goal: 'support',
            bot_tone: 'professionnel',
            theme_primary_color: null,
            support_email: null,
            calendar_link: null,
            tenants: null
          });
        } else {
          return new Response(JSON.stringify({ error: `Erreur base de donnÃ©es: ${fullError.message}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      } else {
        site = fullData;
      }
    }

    if (!site) {
      return new Response(JSON.stringify({ error: `ClÃ© de site invalide (${tenant_public_key}). Le site n'a pas Ã©tÃ© trouvÃ© dans la base de donnÃ©es.` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const tenantId = site.tenant_id;
    // Domain locking: verify request origin matches site domain
    const origin = requestOrigin(req);
    const siteDomainClean = normalizedHostname(site.domain);
    const originHostname = origin ? normalizedHostname(origin) : '';
    const isDomainMatch = originHostname && originHostname === siteDomainClean;
    const canUseAdminOrigin = isAdminCopilot && isAllowedAdminOrigin(origin);

    if (!isDomainMatch && !canUseAdminOrigin) {
      return new Response(JSON.stringify({ error: 'Origin non autorisÃ©e pour ce site.' }), {
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

    let siteSummaryText = summaryText ? `\nRÃ‰SUMÃ‰ DU SITE WEB ET APERÃ‡U DE L'ENTREPRISE :\n${summaryText}\n` : '';

    if (isAdminCopilot) {
      siteSummaryText = `\nRÃ‰SUMÃ‰ DE LA PLATEFORME (Copilot Admin) :
Tu es le Copilot officiel du tableau de bord de B2B AI Chatbot. Ta mission est d'aider les administrateurs Ã  configurer leur propre agent IA.
- **Prise de Rendez-vous (Calendar) & Support** : Pour configurer un agenda (Google Calendar, Calendly, Cal.com) ou le transfert d'emails de support, l'utilisateur doit souscrire au plan "Pro Appointment & Support" (80$/mois). Une fois abonnÃ©, il peut entrer son lien d'agenda et son email de support dans la section "Pro Integrations" du tableau de bord (Dashboard).
- **IntÃ©gration du Widget** : L'utilisateur doit copier la balise <script> fournie dans son Dashboard et la coller dans son site web.
- **Plans** : Free (Gratuit), Pro (80$/mois), Enterprise.
- **Outils d'UI** : Tu as accÃ¨s Ã  l'outil 'navigate_to'. N'hÃ©site pas Ã  l'utiliser si l'utilisateur demande oÃ¹ trouver une fonctionnalitÃ©.
Ne mentionne jamais de portes coupe-feu ou d'autres sujets sans rapport.\n`;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    // Temporal & Date Context
    const currentDateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTimeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const timeContext = `CONTEXTE TEMPOREL ACTUEL : Nous sommes le ${currentDateStr}, il est ${currentTimeStr}.`;

    // Build system prompt
    const toneString = site.bot_tone === 'amical' ? "Ton: Chaleureux, amical, tutoiement autorisÃ© si naturel, trÃ¨s bienveillant." : "Ton: Professionnel, courtois, vouvoiement obligatoire, prÃ©cis.";
    const goalString = site.bot_goal === 'lead' ? "Objectif Principal: Convertir le visiteur en prospect. Incite fortement Ã  laisser un email ou numÃ©ro." : "Objectif Principal: Informer et supporter le visiteur. RÃ©ponds de faÃ§on exhaustive et claire.";

    // Integrations Context
    const hasProPlan = site.tenants?.plan === 'pro' || site.tenants?.plan === 'enterprise';
    const calendarInstruction = (hasProPlan && site.calendar_link) 
      ? `5. PRISE DE RENDEZ-VOUS : Si l'utilisateur souhaite prendre rendez-vous, fournis TOUJOURS ce lien de rÃ©servation : [Prendre rendez-vous](${site.calendar_link}).`
      : "";
      
    const supportInstruction = (hasProPlan && site.support_email)
      ? `6. SUPPORT TECHNIQUE : Si l'utilisateur demande de l'aide ou a un problÃ¨me, utilise l'outil "send_support_email" pour alerter notre Ã©quipe de support.`
      : "";

    const systemPrompt = `Tu es l'agent de service client et l'assistant virtuel officiel de l'entreprise (site web: ${site.domain}). 
Ton rÃ´le est de reprÃ©senter l'entreprise et d'accompagner les visiteurs avec prÃ©cision, honnÃªtetÃ© et un sens aigu du service client. Tu dois toujours te comporter comme un membre Ã  part entiÃ¨re de l'Ã©quipe.
${timeContext}
${siteSummaryText}

RÃˆGLES DE COMMUNICATION ET POSTURE (SERVICE CLIENT) :
1. POSTURE INTERNE : Tu fais partie de l'entreprise. Utilise TOUJOURS "nous", "notre", "nos". Ne dis JAMAIS "ils", "leur site" ou "l'entreprise" Ã  la troisiÃ¨me personne.
2. PAS DE PRÃ‰SENTATION RÃ‰PÃ‰TITIVE : L'interface affiche DÃ‰JÃ€ ton message d'accueil. Ne commence JAMAIS tes rÃ©ponses par "Bonjour, je suis l'assistant...". RÃ©ponds DIRECTEMENT Ã  la question posÃ©e.
3. LIENS ET NAVIGATION : L'utilisateur est DÃ‰JÃ€ sur notre site web. Ne dis JAMAIS "Veuillez consulter notre site web" ou "Allez sur notre site". Si tu as l'information, donne-la. Si tu as l'URL prÃ©cise d'une page (trouvÃ©e via la recherche), donne le lien direct sous forme cliquable.
4. RÃ‰PONSES AUX QUESTIONS GÃ‰NÃ‰RALES : Si l'utilisateur demande ce que nous faisons, utilise IMPÃ‰RATIVEMENT le RÃ‰SUMÃ‰ DU SITE ci-dessus pour expliquer concrÃ¨tement nos produits/services, en te positionnant comme un reprÃ©sentant fier de son entreprise.
5. VALORISATION DE LA MARQUE ET VENTE SUBTILE : Mets toujours poliment en valeur la qualitÃ© de nos services et l'expertise de notre marque. Agis comme un ambassadeur enthousiaste de l'entreprise. Propose naturellement nos solutions aux besoins du client de faÃ§on consultative, sans jamais Ãªtre agressif ou insistant, pour conserver une image de marque premium.

RÃˆGLES D'OR DE VÃ‰RITÃ‰ ET ANTI-HALLUCINATION :
1. TU NE DOIS JAMAIS INVENTER D'INFORMATIONS OU DE SERVICES.
2. OBLIGATION STRICTE DE RECHERCHE RAG : Il est STRICTEMENT INTERDIT de dire "Je n'ai pas cette information" SANS AVOIR D'ABORD EXÃ‰CUTÃ‰ l'outil "search_knowledge_base" avec plusieurs mots-clÃ©s.
3. COORDONNÃ‰ES ET HORAIRES STRICTS : Ne donne JAMAIS de numÃ©ro de tÃ©lÃ©phone, courriel, adresse ou heures d'ouverture s'ils ne sont pas EXPLICITEMENT dans le contexte ou la recherche.
4. INTERDICTION DES PLACEHOLDERS : AUCUN crochet ou texte de remplacement ("[[numÃ©ro]]", "[email]").
5. GESTION DES INFORMATIONS MANQUANTES : APRÃˆS avoir cherchÃ© et confirmÃ© que l'info est absente, sois un bon agent de service client : excuse-toi poliment et ${isLeadCaptureEnabled ? "propose IMMÃ‰DIATEMENT Ã  l'utilisateur de laisser son nom et son numÃ©ro de tÃ©lÃ©phone ou courriel pour qu'un conseiller humain le recontacte rapidement." : "invite-le Ã  nous contacter via la page de contact ou le formulaire du site."}

RÃˆGLES DE FORMATAGE ET STRUCTURE (MARKDOWN) :
1. UTILISE UN MARKDOWN Ã‰LÃ‰GANT ET STRUCTURÃ‰ :
   - Mets en GRAS (**terme**) les points clÃ©s, noms de produits, garanties, tarifs ou Ã©tapes importantes.
   - Utilise des LISTES Ã€ PUCES (- Ã©lÃ©ment) ou NUMÃ‰ROTÃ‰ES (1. Ã©tape) dÃ¨s que tu prÃ©sentes plus de 2 Ã©lÃ©ments, options ou services pour aÃ©rer la rÃ©ponse.
   - Formate TOUS les liens web sous forme de liens cliquables Markdown : [Titre du lien](https://url-exacte).
   - RÃ©dige des paragraphes courts (2 Ã  3 phrases maximum) sÃ©parÃ©s par un saut de ligne double pour une lisibilitÃ© mobile et desktop optimale.

INTERDICTIONS ABSOLUES :
- INTERDIT d'inventer des prix, des services ou des horaires.
- INTERDIT d'utiliser le jargon technique IA : ne dis JAMAIS "base de connaissances", "base de donnÃ©es", "contexte", "rÃ©sultat de recherche" ou "donnÃ©es fournies".

DIRECTIVES SPÃ‰CIFIQUES :
1. ${toneString}
2. ${goalString}
3. RECADRAGE : Si la conversation dÃ©vie hors-sujet, recadre poliment vers nos prestations, avec diplomatie.
${isLeadCaptureEnabled ? "4. CAPTURE DE PROSPECTS : C'est une prioritÃ©. DÃ¨s qu'un client montre de l'intÃ©rÃªt pour un service ou pose une question pointue, propose-lui de laisser ses coordonnÃ©es pour une prise en charge personnalisÃ©e." : ""}
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
          description: "Recherche dans la documentation et la base de connaissances du site. Utilise cet outil pour toute question sur les produits, services, caractÃ©ristiques ou spÃ©cifications techniques. Pour des rÃ©sultats optimaux sur des sites bilingues ou techniques, inclus les termes clÃ©s pertinents en anglais et en franÃ§ais (ex: 'core polystyrene honeycomb doors').",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "La requÃªte ou les mots-clÃ©s de recherche (en franÃ§ais et/ou anglais si pertinent)."
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
              message: { type: "string", description: "Le message dÃ©taillÃ© ou la description du problÃ¨me" }
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
          description: "Ouvre une page spÃ©cifique du panneau d'administration pour l'utilisateur. Utilise ceci si l'utilisateur veut voir ses factures (pricing), son tableau de bord (dashboard), ses prospects (leads), ou la page 'A propos' (about).",
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
          const { generateChatResponse, extractLeadInfo } = await import('../../lib/llm.js');
          
          // MULTI-TURN AGENTIC LOOP (True Reasoning Loop)
          // Allows up to MAX_TURNS iterations of tool calls & query reformulations
          const MAX_TURNS = 4;
          let currentHistory = [...fullHistory];
          
          if (isAdminCopilot) {
            currentHistory.push({ role: 'user', content: message });
          }

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

                  // â”€â”€ HYBRID SEARCH: Embedding sÃ©mantique + FTS bilingue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                  const toolResponseContent = contextText || "Aucune information trouvÃ©e pour cette recherche spÃ©cifique. Essaye de reformuler avec des mots-clÃ©s Ã©quivalents ou en anglais si pertinent.";

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
                  const emailResponse = `Email envoyÃ© avec succÃ¨s Ã  l'Ã©quipe de support (${site.support_email}). Le client doit s'attendre Ã  une rÃ©ponse sous peu.`;

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

                  const navResponse = `L'utilisateur a Ã©tÃ© redirigÃ© avec succÃ¨s vers la page ${toolArgs.page}.`;
                  
                  currentHistory.push({
                    role: 'tool',
                    content: navResponse,
                    tool_call_id: toolCall.id
                  });
                }
              }
            } else {
              // No tool calls requested: LLM provided final response!
              finalReply = llmMessage?.content || "âš ï¸ Je ne peux pas rÃ©pondre pour le moment.";
              break;
            }
          }

          if (!finalReply && loopCount >= MAX_TURNS) {
            finalReply = "DÃ©solÃ©, j'ai recherchÃ© dans nos informations mais je n'ai pas pu trouver les Ã©lÃ©ments nÃ©cessaires.";
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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: 'âš ï¸ [Erreur Interne] ' + _innerErr.message })}\n\n`));
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
