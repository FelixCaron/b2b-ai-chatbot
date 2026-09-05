// LLM Abstraction Layer
// OpenRouter Provider Integration

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-5.6-luna';

// Jina Embeddings — jina-embeddings-v3
const JINA_EMBEDDINGS_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_EMBEDDINGS_MODEL = 'jina-embeddings-v3';

/**
 * MODE DE TEST DELAFONTAINE : 
 * Désactivé par défaut (Mode Production actif).
 */
export const TEST_MODE = false;

function generateMockVector(text) {
  const str = String(text || '');
  const vec = new Array(768).fill(0);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  for (let i = 0; i < 768; i++) {
    vec[i] = Math.sin(hash + i) * 0.1;
  }
  return vec;
}

/**
 * Génère un embedding vectoriel pour un texte ou un batch de textes.
 */
export async function generateEmbedding(input, task = 'retrieval.passage', apiKey = null) {
  if (TEST_MODE) {
    console.log('[TEST_MODE Delafontaine] Embedding simulé (0 crédit utilisé).');
    const isArray = Array.isArray(input);
    if (isArray) {
      return input.map(item => generateMockVector(item));
    }
    return generateMockVector(input);
  }

  const jinaKey = process.env.JINA_API_KEY || apiKey;
  if (!jinaKey) {
    console.warn('[Embedding] JINA_API_KEY manquante — embedding désactivé.');
    return null;
  }

  const isArray = Array.isArray(input);
  const inputs = isArray ? input : [input];

  try {
    const res = await fetch(JINA_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jinaKey}`
      },
      body: JSON.stringify({
        model: JINA_EMBEDDINGS_MODEL,
        task,
        dimensions: 768,
        input: inputs
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Embedding] Jina API error ${res.status}:`, err);
      return null;
    }

    const data = await res.json();
    const embeddings = data.data?.map(d => d.embedding) || [];

    if (embeddings.length === 0) return null;
    return isArray ? embeddings : embeddings[0];
  } catch (err) {
    console.error('[Embedding] Jina fetch error:', err.message);
    return null;
  }
}

export async function generateChatResponse({ systemPrompt, messagesHistory, apiKey, tools = null, model = DEFAULT_OPENROUTER_MODEL }) {
  if (TEST_MODE) {
    console.log('[TEST_MODE Delafontaine] Réponse Chatbot simulée (0 crédit utilisé).');
    
    // Détecter si un outil a déjà été exécuté dans l'historique
    const hasToolExecuted = messagesHistory.some(m => m.role === 'tool');

    // Étape 1 : Si les outils sont actifs et pas encore exécutés, simuler le déclenchement de la recherche
    if (tools && tools.length > 0 && !hasToolExecuted) {
      return {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_delafontaine_' + Date.now(),
              type: 'function',
              function: {
                name: 'search_knowledge_base',
                arguments: JSON.stringify({ query: 'portes et cadres en acier delafontaine' })
              }
            }
          ]
        }
      };
    }

    // Étape 2 : Réponse structurée basée sur les Portes Delafontaine
    const lastUserMsg = [...messagesHistory].reverse().find(m => m.role === 'user')?.content || '';
    
    let mockReply = "Bonjour ! Bienvenue chez **DELAFONTAINE**, votre chef de file en fabrication de portes et cadres en acier architectural de haute performance.\n\n" +
      "Nos produits phares comprennent :\n" +
      "• **Portes Coupe-Feu (20 à 180 min)** : Certifiées UL/ULC pour une protection maximale.\n" +
      "• **Portes Acoustiques (STC 35 à 55)** : Isolation acoustique certifiée pour écoles, hôpitaux et édifices publics.\n" +
      "• **Portes en Acier Inoxydable (304 / 316)** : Durabilité extrême en milieu corrosif ou stérile.\n\n" +
      "Avez-vous besoin d'une spécification technique particulière ou souhaitez-vous obtenir une soumission personnalisée ?";

    if (/prix|tarif|soumission|devis|cost|quote/i.test(lastUserMsg)) {
      mockReply = "Pour obtenir une soumission précise concernant vos portes et cadres en acier **DELAFONTAINE**, nos conseillers évaluent vos plans selon le degré coupe-feu et l'indice acoustique requis.\n\n" +
        "Laissez-nous simplement votre nom et courriel ci-dessous, ou contactez-nous sans frais au **1-800-363-2244** ou par courriel à **info@delafontaine.com**. Un expert vous répondra en moins de 24h !";
    } else if (/contact|adresse|téléphone|phone|courriel|email/i.test(lastUserMsg)) {
      mockReply = "Voici les coordonnées de l'équipe **DELAFONTAINE** :\n" +
        "• **Téléphone sans frais** : 1-800-363-2244\n" +
        "• **Courriel** : info@delafontaine.com\n" +
        "• **Siège social** : Sherbrooke, Québec, Canada\n\n" +
        "Souhaitez-vous que je vous mette en relation directement avec un représentant commercial ?";
    }

    return {
      message: {
        role: 'assistant',
        content: mockReply
      }
    };
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY || apiKey;

  if (!openRouterKey) {
    return { error: "⚠️ [AI System Error] No environment key configured (OPENROUTER_API_KEY)." };
  }

  try {
    const openAiMessages = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
    
    for (const m of messagesHistory) {
      if (m.role === 'assistant') {
        openAiMessages.push({ role: 'assistant', content: m.content || "", tool_calls: m.tool_calls });
      } else if (m.role === 'tool') {
        openAiMessages.push({ role: 'tool', content: m.content, tool_call_id: m.tool_call_id });
      } else {
        openAiMessages.push({ role: 'user', content: m.content });
      }
    }

    const reqBody = {
      model,
      messages: openAiMessages,
      temperature: 0.7
    };

    if (tools && tools.length > 0) {
      reqBody.tools = tools;
    }

    const res = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://admin-seven-alpha-37.vercel.app',
        'X-Title': 'Repondo',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqBody)
    });

    if (res.ok) {
      const data = await res.json();
      return { message: data.choices?.[0]?.message };
    } else {
      const errText = await res.text();
      return { error: `⚠️ [OpenRouter Error ${res.status}]\n${errText}` };
    }
  } catch (err) {
    return { error: `⚠️ [OpenRouter Connection Error] ${err.message}` };
  }

  return { error: "⚠️ [AI Error] Could not get a response from the AI." };
}

export async function extractLeadInfo({ messagesHistory, apiKey }) {
  if (TEST_MODE) {
    console.log('[TEST_MODE Delafontaine] Extraction lead simulée.');
    return {
      name: "Client Test Delafontaine",
      email: "contact@test-delafontaine.ca",
      phone: "818-555-0144",
      summary: "Demande de soumission pour portes coupe-feu et cadres métalliques."
    };
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY || apiKey;
  if (!openRouterKey) return null;

  const transcript = messagesHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  const prompt = `You are a highly precise CRM data extractor. Below is the transcript of a conversation between a visitor and our AI assistant.
Your task is to extract the visitor's contact details and write a short summary of their need.

TRANSCRIPT:
${transcript}

Instructions:
1. "name": The visitor's name if they gave it, otherwise "".
2. "email": The visitor's email if they gave it, otherwise "".
3. "phone": The visitor's phone number if they gave it, otherwise "".
4. "summary": A very concise summary (1-2 sentences max) of the visitor's need or main question, so a sales rep can understand the context at a glance. If there's no clear need, "".

Respond STRICTLY in raw JSON format, without backticks, without markdown:
{"name": "...", "email": "...", "phone": "...", "summary": "..."}
`;

  try {
    const res = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://admin-seven-alpha-37.vercel.app',
        'X-Title': 'Repondo',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.6-luna',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
  } catch (e) {
    console.warn('OpenRouter lead extraction error:', e);
  }

  return null;
}

export async function extractThemeColors({ htmlSnippet, targetUrl, apiKey }) {
  if (TEST_MODE) {
    console.log('[TEST_MODE Delafontaine] Extraction thèmes simulée.');
    return {
      primary_color: "#1e3a8a",
      theme_mode: "light",
      background_color: "#ffffff",
      text_color: "#0f172a",
      org_name: "Portes Delafontaine"
    };
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY || apiKey;
  if (!openRouterKey) return null;

  const prompt = `Analyze this website HTML snippet for ${targetUrl}.
Extract the visual brand identity and color palette:
1. "primary_color": The exact primary brand accent hex color (e.g. #2563eb, #e11d48, #059669, #7c3aed, etc.). Look for theme-color meta tags, CSS primary color variables, buttons, brand accent, or logo color.
2. "theme_mode": "light" or "dark" (Is the website background predominantly light/white or dark/black?). Most business websites are "light".
3. "background_color": The dominant panel background hex (e.g. "#ffffff" for light mode, "#0f172a" or "#18181b" for dark mode).
4. "text_color": The main text hex color (e.g. "#0f172a" or "#1e293b" for light mode, "#f8fafc" for dark mode).
5. "org_name": The clean official company name.

Respond strictly in raw JSON format, without markdown or backticks:
{"primary_color": "#hex", "theme_mode": "light", "background_color": "#ffffff", "text_color": "#0f172a", "org_name": "Company Name"}`;

  try {
    const res = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://admin-seven-alpha-37.vercel.app',
        'X-Title': 'Repondo',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.6-luna',
        messages: [{ role: 'user', content: `${prompt}\n\nHTML Snippet:\n${htmlSnippet}` }],
        temperature: 0.1
      })
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
  } catch (e) {
    console.warn('OpenRouter theme extraction error:', e);
  }

  return null;
}

export async function generateWebsiteSummary({ content, targetUrl, apiKey }) {
  if (TEST_MODE) {
    console.log('[TEST_MODE Delafontaine] Résumé de site simulé.');
    return "DELAFONTAINE est un chef de file mondial dans la conception et la fabrication de portes et cadres en acier de haute qualité pour les marchés commercial, industriel et institutionnel. Fondée au Québec, l'entreprise propose des solutions sur mesure telles que des portes acoustiques (STC), coupe-feu (UL/ULC), en acier inoxydable et à haute efficacité énergétique.\n\nSes produits s'adressent aux architectes, entrepreneurs généraux et gestionnaires d'immeubles recherchant durabilité, conformité rigoureuse et finition architecturale de premier plan.\n\nPour toute demande de soumission ou d'information technique, l'équipe est joignable via info@delafontaine.com ou par téléphone sans frais au 1-800-363-2244.";
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY || apiKey;
  if (!openRouterKey) return null;

  const prompt = `You are a B2B business-summary expert. Below is the raw content extracted from the website ${targetUrl}.
Write a clear, structured, concise summary (3-5 paragraphs max) suitable for a virtual assistant to use as context.

The summary must include:
1. A general presentation of the company/organization (main line of business).
2. The flagship products, services, or offerings.
3. The target audience / typical customers.
4. Key strengths, values, or competitive advantages.
5. Contact information or location if available.

STRICT INSTRUCTION: Be factual and direct. Do NOT add any preamble or system metadata (do NOT start with "Here is the summary" and do not add a "User Safety: safe" line). Write only the summary text itself, as clear, natural, structured prose in English.`;

  try {
    const res = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://admin-seven-alpha-37.vercel.app',
        'X-Title': 'Repondo',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.6-luna',
        messages: [{ role: 'user', content: `${prompt}\n\nWebsite content:\n${content.slice(0, 12000)}` }],
        temperature: 0.3
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[generateWebsiteSummary] OpenRouter error ${res.status}:`, errText);
      throw new Error(`OpenRouter API Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    if (data.error) {
      console.error('[generateWebsiteSummary] OpenRouter JSON error:', data.error);
      throw new Error(`OpenRouter JSON Error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    let summaryText = data.choices?.[0]?.message?.content?.trim();
    if (!summaryText) {
      throw new Error('Empty or unexpected OpenRouter response.');
    }

    summaryText = summaryText
      .replace(/^User Safety:\s*safe\s*/gi, '')
      .replace(/User Safety:\s*safe\s*$/gi, '')
      .replace(/^Safety:\s*safe\s*/gi, '')
      .replace(/Safety:\s*safe\s*$/gi, '')
      .replace(/^\*\*User Safety:\*\*\s*safe\s*/gi, '')
      .replace(/\*\*User Safety:\*\*\s*safe\s*$/gi, '')
      .replace(/^(Here is the summary|Here's the summary|Summary of the site|Company overview|Voici le résumé|Voici une synthèse|Résumé du site|Présentation de l'entreprise)\s*:\s*/gi, '')
      .trim();

    return summaryText;

  } catch (e) {
    console.error('[generateWebsiteSummary] Fatal error:', e);
    throw e; // No fallback
  }
}

const WELCOME_EXPERIENCE_FALLBACK = {
  language: 'en',
  welcome_message: 'Hello! How can I help you today?',
  ui_status_title: 'Virtual Assistant',
  ui_status_online: 'Online',
  ui_input_placeholder: 'Ask a question...',
};

/**
 * Detects the language the scanned site's own content is written in, and
 * generates the widget's localized first-impression text in that language:
 * the greeting shown before a visitor says anything, plus the small chrome
 * labels around it (header title, status line, input placeholder) — kept
 * separate from generateWebsiteSummary(), which stays in English on purpose
 * (that summary only ever feeds the model's own context, never shown to a
 * visitor directly, and changing its language isn't part of this).
 *
 * Deliberately generated once per site (called from the same scan/summarize
 * pipeline as generateWebsiteSummary(), see api/crawler/scan.js and
 * summarize.js) and cached on site_summaries, not regenerated per visitor —
 * an LLM call on every widget load would add real latency and cost to every
 * page view for text that doesn't change between visits.
 */
export async function generateWelcomeExperience({ content, targetUrl, apiKey }) {
  if (TEST_MODE) {
    console.log('[TEST_MODE Delafontaine] Welcome experience simulée.');
    return {
      language: 'fr',
      welcome_message: "Bonjour ! Je suis l'assistant virtuel de Portes Delafontaine. Comment puis-je vous aider avec votre projet de portes en acier aujourd'hui ?",
      ui_status_title: 'Assistant Delafontaine',
      ui_status_online: 'En ligne',
      ui_input_placeholder: 'Posez votre question...',
    };
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY || apiKey;
  if (!openRouterKey) return WELCOME_EXPERIENCE_FALLBACK;

  const prompt = `Below is raw content extracted from the website ${targetUrl}. Two things:

1. Detect the primary language this content is actually written in (an ISO 639-1 code, e.g. "en", "fr", "es", "de", "pt").
2. In THAT language, write the small set of text a chat widget embedded on this site needs before a visitor has said anything:
   - "welcome_message": a short, natural, friendly first message (1-2 sentences) from the assistant, specific enough to this business that it doesn't read as generic boilerplate — e.g. naming what it can help with (products, support, booking, etc. — whatever fits this site).
   - "ui_status_title": the widget header title (equivalent to "Virtual Assistant" — can reference the brand name if natural).
   - "ui_status_online": the short status line under it (equivalent to "Online").
   - "ui_input_placeholder": the message input's placeholder text (equivalent to "Ask a question...").

Respond strictly in raw JSON, no markdown or backticks:
{"language": "xx", "welcome_message": "...", "ui_status_title": "...", "ui_status_online": "...", "ui_input_placeholder": "..."}`;

  try {
    const res = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://admin-seven-alpha-37.vercel.app',
        'X-Title': 'Repondo',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.6-luna',
        messages: [{ role: 'user', content: `${prompt}\n\nWebsite content:\n${content.slice(0, 8000)}` }],
        temperature: 0.4
      })
    });

    if (!res.ok) {
      console.error(`[generateWelcomeExperience] OpenRouter error ${res.status}:`, await res.text());
      return WELCOME_EXPERIENCE_FALLBACK;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return WELCOME_EXPERIENCE_FALLBACK;

    const parsed = JSON.parse(match[0]);
    return {
      language: parsed.language || WELCOME_EXPERIENCE_FALLBACK.language,
      welcome_message: parsed.welcome_message || WELCOME_EXPERIENCE_FALLBACK.welcome_message,
      ui_status_title: parsed.ui_status_title || WELCOME_EXPERIENCE_FALLBACK.ui_status_title,
      ui_status_online: parsed.ui_status_online || WELCOME_EXPERIENCE_FALLBACK.ui_status_online,
      ui_input_placeholder: parsed.ui_input_placeholder || WELCOME_EXPERIENCE_FALLBACK.ui_input_placeholder,
    };
  } catch (e) {
    // Never block a scan on this — a missing localized welcome falls back
    // to the same English defaults the widget always used before this
    // feature existed, not an error surfaced to the tenant.
    console.warn('[generateWelcomeExperience] error, using fallback:', e.message);
    return WELCOME_EXPERIENCE_FALLBACK;
  }
}




