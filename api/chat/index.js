import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../lib/llm.js';
import { sendLeadEmail, sendBugAlertEmail } from '../lib/email.js';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = (SUPABASE_URL && SERVICE_ROLE_KEY) ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

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

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
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
          return new Response(JSON.stringify({ error: 'Limite de requÃƒÂªtes atteinte. Veuillez patienter.' }), {
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
          // One or more optional columns are missing from the schema ââ‚¬” fall back to core columns
          console.warn('[chat] Falling back to core columns due to missing column (42703).');
          const { data: coreData, error: coreError } = await supabase
            .from('sites')
            .select('id, tenant_id, domain')
            .eq('public_key', tenant_public_key)
            .maybeSingle();
          if (coreError || !coreData) {
            return new Response(JSON.stringify({ error: 'Site non trouvÃƒÂ© (core query failed)' }), {
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
          return new Response(JSON.stringify({ error: `Erreur base de donnÃƒÂ©es: ${fullError.message}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      } else {
        site = fullData;
      }
    }

    if (!site) {
      return new Response(JSON.stringify({ error: `Clé de site invalide (${tenant_public_key}). Le site n'a pas été trouvé dans la base de données.` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const tenantId = site.tenant_id;
    // Strict Domain Locking: verify request origin strictly matches client's registered domain
    const origin = requestOrigin(req);
    const siteDomainClean = normalizedHostname(site.domain);
    const originHostname = origin ? normalizedHostname(origin) : '';
    const isDomainMatch = originHostname && (originHostname === siteDomainClean || originHostname.endsWith(`.${siteDomainClean}`));

    let isOriginAuthorized = isAdminCopilot || isDomainMatch;

    // If request does NOT come from the client's registered domain (e.g. preview from admin or dev),
    // require an authenticated session token belonging to the tenant owner.
    // This strictly prevents attackers from using localhost or random domains to abuse public keys and drain credits.
    if (!isOriginAuthorized) {
      const authorization = typeof req.headers?.get === 'function' ? req.headers.get('authorization') : req.headers?.authorization;
      const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (token) {
        try {
          const { data: { user }, error: userError } = await supabase.auth.getUser(token);
          if (user && !userError) {
            const { data: ownerTenant } = await supabase
              .from('tenants')
              .select('id')
              .eq('id', tenantId)
              .eq('owner_user_id', user.id)
              .maybeSingle();

            if (ownerTenant) {
              isOriginAuthorized = true; // Authenticated owner preview authorized
            }
          }
        } catch (authErr) {
          console.warn('[chat auth validation] error:', authErr.message);
        }
      }
    }

    if (!isOriginAuthorized) {
      return new Response(JSON.stringify({ error: 'Origin non autorisée pour ce site.' }), {
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

    let siteSummaryText = summaryText ? `\nRÃƒâ€°SUMÃƒâ€° DU SITE WEB ET APERÃƒâ€¡U DE L'ENTREPRISE :\n${summaryText}\n` : '';

    if (isAdminCopilot) {
      siteSummaryText = `\nRÃƒâ€°SUMÃƒâ€° DE LA PLATEFORME (Copilot Admin) :
Tu es le Copilot officiel du tableau de bord de B2B AI Chatbot. Ta mission est d'aider les administrateurs ÃƒÂ  configurer leur propre agent IA.
- **Prise de Rendez-vous (Calendar) & Support** : Pour configurer un agenda (Google Calendar, Calendly, Cal.com) ou le transfert d'emails de support, l'utilisateur doit souscrire au plan "Pro Appointment & Support" (80$/mois). Une fois abonnÃƒÂ©, il peut entrer son lien d'agenda et son email de support dans la section "Pro Integrations" du tableau de bord (Dashboard).
- **IntÃƒÂ©gration du Widget** : L'utilisateur doit copier la balise <script> fournie dans son Dashboard et la coller dans son site web.
- **Plans** : Free (Gratuit), Pro (80$/mois), Enterprise.
- **Outils d'UI** : Tu as accÃƒÂ¨s ÃƒÂ  l'outil 'navigate_to'. N'hÃƒÂ©site pas ÃƒÂ  l'utiliser si l'utilisateur demande oÃƒÂ¹ trouver une fonctionnalitÃƒÂ©.
Ne mentionne jamais de portes coupe-feu ou d'autres sujets sans rapport.\n`;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    // Temporal & Date Context
    const currentDateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTimeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const timeContext = `CONTEXTE TEMPOREL ACTUEL : Nous sommes le ${currentDateStr}, il est ${currentTimeStr}.`;

    // Build system prompt
    const toneString = site.bot_tone === 'amical' ? "Ton: Chaleureux, amical, tutoiement autorisÃƒÂ© si naturel, trÃƒÂ¨s bienveillant." : "Ton: Professionnel, courtois, vouvoiement obligatoire, prÃƒÂ©cis.";
    const goalString = site.bot_goal === 'lead' ? "Objectif Principal: Convertir le visiteur en prospect. Incite fortement ÃƒÂ  laisser un email ou numÃƒÂ©ro." : "Objectif Principal: Informer et supporter le visiteur. RÃƒÂ©ponds de faÃƒÂ§on exhaustive et claire.";

    // Integrations Context
    const hasProPlan = site.tenants?.site.tenants?.plan === 'pro' || site.tenants?.site.tenants?.plan === 'enterprise';
    const calendarInstruction = (hasProPlan && site.calendar_link) 
      ? `5. PRISE DE RENDEZ-VOUS : Si l'utilisateur souhaite prendre rendez-vous, fournis TOUJOURS ce lien de rÃƒÂ©servation : [Prendre rendez-vous](${site.calendar_link}).`
      : "";
      
    const supportInstruction = (hasProPlan && site.support_email)
      ? `6. SUPPORT TECHNIQUE : Si l'utilisateur demande de l'aide ou a un problÃƒÂ¨me, utilise l'outil "send_support_email" pour alerter notre ÃƒÂ©quipe de support.`
      : "";

    const systemPrompt = `Tu es l'agent de service client et l'assistant virtuel officiel de l'entreprise (site web: ${site.domain}). 
Ton rÃƒÂ´le est de reprÃƒÂ©senter l'entreprise et d'accompagner les visiteurs avec prÃƒÂ©cision, honnÃƒÂªtetÃƒÂ© et un sens aigu du service client. Tu dois toujours te comporter comme un membre ÃƒÂ  part entiÃƒÂ¨re de l'ÃƒÂ©quipe.
${timeContext}
${siteSummaryText}

RÃƒË†GLES DE COMMUNICATION ET POSTURE (SERVICE CLIENT) :
1. POSTURE INTERNE : Tu fais partie de l'entreprise. Utilise TOUJOURS "nous", "notre", "nos". Ne dis JAMAIS "ils", "leur site" ou "l'entreprise" ÃƒÂ  la troisiÃƒÂ¨me personne.
2. PAS DE PRÃƒâ€°SENTATION RÃƒâ€°PÃƒâ€°TITIVE : L'interface affiche DÃƒâ€°JÃƒâ‚¬ ton message d'accueil. Ne commence JAMAIS tes rÃƒÂ©ponses par "Bonjour, je suis l'assistant...". RÃƒÂ©ponds DIRECTEMENT ÃƒÂ  la question posÃƒÂ©e.
3. LIENS ET NAVIGATION : L'utilisateur est DÃƒâ€°JÃƒâ‚¬ sur notre site web. Ne dis JAMAIS "Veuillez consulter notre site web" ou "Allez sur notre site". Si tu as l'information, donne-la. Si tu as l'URL prÃƒÂ©cise d'une page (trouvÃƒÂ©e via la recherche), donne le lien direct sous forme cliquable.
4. RÃƒâ€°PONSES AUX QUESTIONS GÃƒâ€°NÃƒâ€°RALES : Si l'utilisateur demande ce que nous faisons, utilise IMPÃƒâ€°RATIVEMENT le RÃƒâ€°SUMÃƒâ€° DU SITE ci-dessus pour expliquer concrÃƒÂ¨tement nos produits/services, en te positionnant comme un reprÃƒÂ©sentant fier de son entreprise.
5. VALORISATION DE LA MARQUE ET VENTE SUBTILE : Mets toujours poliment en valeur la qualitÃƒÂ© de nos services et l'expertise de notre marque. Agis comme un ambassadeur enthousiaste de l'entreprise. Propose naturellement nos solutions aux besoins du client de faÃƒÂ§on consultative, sans jamais ÃƒÂªtre agressif ou insistant, pour conserver une image de marque premium.

RÃƒË†GLES D'OR DE VÃƒâ€°RITÃƒâ€° ET ANTI-HALLUCINATION :
1. TU NE DOIS JAMAIS INVENTER D'INFORMATIONS OU DE SERVICES.
2. OBLIGATION STRICTE DE RECHERCHE RAG : Il est STRICTEMENT INTERDIT de dire "Je n'ai pas cette information" SANS AVOIR D'ABORD EXÃƒâ€°CUTÃƒâ€° l'outil "search_knowledge_base" avec plusieurs mots-clÃƒÂ©s.
3. COORDONNÃƒâ€°ES ET HORAIRES STRICTS : Ne donne JAMAIS de numÃƒÂ©ro de tÃƒÂ©lÃƒÂ©phone, courriel, adresse ou heures d'ouverture s'ils ne sont pas EXPLICITEMENT dans le contexte ou la recherche.
4. INTERDICTION DES PLACEHOLDERS : AUCUN crochet ou texte de remplacement ("[[numÃƒÂ©ro]]", "[email]").
5. GESTION DES INFORMATIONS MANQUANTES : APRÃƒË†S avoir cherchÃƒÂ© et confirmÃƒÂ© que l'info est absente, sois un bon agent de service client : excuse-toi poliment et ${isLeadCaptureEnabled ? "propose IMMÃƒâ€°DIATEMENT ÃƒÂ  l'utilisateur de laisser son nom et son numÃƒÂ©ro de tÃƒÂ©lÃƒÂ©phone ou courriel pour qu'un conseiller humain le recontacte rapidement." : "invite-le ÃƒÂ  nous contacter via la page de contact ou le formulaire du site."}

RÃƒË†GLES DE FORMATAGE ET STRUCTURE (MARKDOWN) :
1. UTILISE UN MARKDOWN Ãƒâ€°LÃƒâ€°GANT ET STRUCTURÃƒâ€° :
   - Mets en GRAS (**terme**) les points clÃƒÂ©s, noms de produits, garanties, tarifs ou ÃƒÂ©tapes importantes.
   - Utilise des LISTES Ãƒâ‚¬ PUCES (- ÃƒÂ©lÃƒÂ©ment) ou NUMÃƒâ€°ROTÃƒâ€°ES (1. ÃƒÂ©tape) dÃƒÂ¨s que tu prÃƒÂ©sentes plus de 2 ÃƒÂ©lÃƒÂ©ments, options ou services pour aÃƒÂ©rer la rÃƒÂ©ponse.
   - Formate TOUS les liens web sous forme de liens cliquables Markdown : [Titre du lien](https://url-exacte).
   - RÃƒÂ©dige des paragraphes courts (2 ÃƒÂ  3 phrases maximum) sÃƒÂ©parÃƒÂ©s par un saut de ligne double pour une lisibilitÃƒÂ© mobile et desktop optimale.

INTERDICTIONS ABSOLUES :
- INTERDIT d'inventer des prix, des services ou des horaires.
- INTERDIT d'utiliser le jargon technique IA : ne dis JAMAIS "base de connaissances", "base de donnÃƒÂ©es", "contexte", "rÃƒÂ©sultat de recherche" ou "donnÃƒÂ©es fournies".

DIRECTIVES SPÃƒâ€°CIFIQUES :
1. ${toneString}
2. ${goalString}
3. RECADRAGE : Si la conversation dÃƒÂ©vie hors-sujet, recadre poliment vers nos prestations, avec diplomatie.
${isLeadCaptureEnabled ? "4. CAPTURE DE PROSPECTS : C'est une prioritÃƒÂ©. DÃƒÂ¨s qu'un client montre de l'intÃƒÂ©rÃƒÂªt pour un service ou pose une question pointue, propose-lui de laisser ses coordonnÃƒÂ©es pour une prise en charge personnalisÃƒÂ©e." : ""}
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
          description: "Recherche dans la documentation et la base de connaissances du site. Utilise cet outil pour toute question sur les produits, services, caractÃƒÂ©ristiques ou spÃƒÂ©cifications techniques. Pour des rÃƒÂ©sultats optimaux sur des sites bilingues ou techniques, inclus les termes clÃƒÂ©s pertinents en anglais et en franÃƒÂ§ais (ex: 'core polystyrene honeycomb doors').",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "La requÃƒÂªte ou les mots-clÃƒÂ©s de recherche (en franÃƒÂ§ais et/ou anglais si pertinent)."
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
              message: { type: "string", description: "Le message dÃƒÂ©taillÃƒÂ© ou la description du problÃƒÂ¨me" }
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
          description: "Ouvre une page spÃƒÂ©cifique du panneau d'administration pour l'utilisateur. Utilise ceci si l'utilisateur veut voir ses factures (pricing), son tableau de bord (dashboard), ses prospects (leads), ou la page 'A propos' (about).",
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
          const { generateChatResponse, extractLeadInfo } = await import('../lib/llm.js');
          
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
            const defaultModel = process.env.DEFAULT_MODEL || 'openai/gpt-5.6-luna';
            const premiumModel = process.env.PREMIUM_MODEL || 'anthropic/claude-3.5-sonnet';
            const selectedModel = (site.tenants?.plan === 'pro' || site.tenants?.plan === 'enterprise') ? premiumModel : defaultModel;

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

                  // â”â‚¬â”â‚¬ HYBRID SEARCH: Embedding sÃƒÂ©mantique + FTS bilingue â”â‚¬â”â‚¬â”â‚¬â”â‚¬â”â‚¬â”â‚¬â”â‚¬â”â‚¬â”â‚¬â”â‚¬â”â‚¬â”â‚¬â”â‚¬â”â‚¬â”â‚¬
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
                  const toolResponseContent = contextText || "Aucune information trouvÃƒÂ©e pour cette recherche spÃƒÂ©cifique. Essaye de reformuler avec des mots-clÃƒÂ©s ÃƒÂ©quivalents ou en anglais si pertinent.";

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
                  const emailResponse = `Email envoyÃƒÂ© avec succÃƒÂ¨s ÃƒÂ  l'ÃƒÂ©quipe de support (${site.support_email}). Le client doit s'attendre ÃƒÂ  une rÃƒÂ©ponse sous peu.`;

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

                  const navResponse = `L'utilisateur a ÃƒÂ©tÃƒÂ© redirigÃƒÂ© avec succÃƒÂ¨s vers la page ${toolArgs.page}.`;
                  
                  currentHistory.push({
                    role: 'tool',
                    content: navResponse,
                    tool_call_id: toolCall.id
                  });
                }
              }
            } else {
              // No tool calls requested: LLM provided final response!
              finalReply = llmMessage?.content || "âÅ¡Â Ã¯Â¸Â Je ne peux pas rÃƒÂ©pondre pour le moment.";
              break;
            }
          }

          if (!finalReply && loopCount >= MAX_TURNS) {
            finalReply = "DÃƒÂ©solÃƒÂ©, j'ai recherchÃƒÂ© dans nos informations mais je n'ai pas pu trouver les ÃƒÂ©lÃƒÂ©ments nÃƒÂ©cessaires.";
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
                  
                  if (hasProPlan) {
                    // Fire and forget email
                    sendLeadEmail(leadData, site).catch(console.error);
                  }
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
            sendBugAlertEmail(_innerErr, { source: 'chat_stream', tenantId, siteId }).catch(console.error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: 'âÅ¡Â Ã¯Â¸Â [Erreur Interne] ' + _innerErr.message })}\n\n`));
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
    sendBugAlertEmail(err, { source: 'chat_init' }).catch(console.error);
      return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
