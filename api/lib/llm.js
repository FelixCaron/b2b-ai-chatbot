// LLM Abstraction Layer
// OpenRouter Provider Integration

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'openrouter/free';

// Jina Embeddings — jina-embeddings-v3
const JINA_EMBEDDINGS_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_EMBEDDINGS_MODEL = 'jina-embeddings-v3';

/**
 * MODE DE TEST DELAFONTAINE : 
 * Permet d'économiser 100% des crédits IA (OpenRouter & Jina) en dev/test.
 * Actif par défaut. Pour passer en production avec les vraies API, définir TEST_MODE=false.
 */
export const TEST_MODE = process.env.TEST_MODE !== 'false';

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

export async function generateChatResponse({ systemPrompt, messagesHistory, apiKey, tools = null }) {
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
    return { error: "⚠️ [Erreur Système IA] Aucune clé d'environnement (OPENROUTER_API_KEY) n'est configurée." };
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
      model: DEFAULT_OPENROUTER_MODEL,
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
        'X-Title': 'B2B AI Chatbot',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqBody)
    });

    if (res.ok) {
      const data = await res.json();
      return { message: data.choices?.[0]?.message };
    } else {
      const errText = await res.text();
      return { error: `⚠️ [Erreur OpenRouter ${res.status}]\n${errText}` };
    }
  } catch (err) {
    return { error: `⚠️ [Erreur Connexion OpenRouter] ${err.message}` };
  }

  return { error: "⚠️ [Erreur IA] Impossible d'obtenir une réponse de l'IA." };
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
  const prompt = `Tu es un extracteur de données CRM très précis. Voici la transcription d'une conversation entre un visiteur et notre assistant IA.
Ta tâche est d'extraire les coordonnées du visiteur et de rédiger un court résumé de son besoin.

TRANSCRIPTION:
${transcript}

Instructions:
1. "name": Le nom du visiteur s'il l'a donné, sinon "".
2. "email": L'email du visiteur s'il l'a donné, sinon "".
3. "phone": Le numéro de téléphone s'il l'a donné, sinon "".
4. "summary": Un résumé très concis (1 à 2 phrases max) du besoin ou de la question principale du visiteur pour qu'un agent commercial comprenne le contexte d'un coup d'oeil. S'il n'y a pas de besoin clair, "".

Réponds STRICTEMENT en format JSON brut, sans backticks, sans markdown:
{"name": "...", "email": "...", "phone": "...", "summary": "..."}
`;

  try {
    const res = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://admin-seven-alpha-37.vercel.app',
        'X-Title': 'B2B AI Chatbot',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: DEFAULT_OPENROUTER_MODEL,
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
      org_name: "Portes Delafontaine"
    };
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY || apiKey;
  if (!openRouterKey) return null;

  const prompt = `Analyze this website HTML snippet for ${targetUrl}. Extract:
1. The exact primary brand accent hex color code (e.g. #2563eb, #e11d48, #059669, #7c3aed, etc.). Look for theme-color meta tags, CSS primary color variables, inline styles, or logo colors.
2. The clean official company name.

Respond strictly in raw JSON format, without backticks: {"primary_color": "#hex", "org_name": "Name"}`;

  try {
    const res = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://admin-seven-alpha-37.vercel.app',
        'X-Title': 'B2B AI Chatbot',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: DEFAULT_OPENROUTER_MODEL,
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

  const prompt = `Tu es un expert en synthèse d'entreprise B2B. Voici le contenu brut extrait du site web ${targetUrl}.
Rédige un résumé clair, structuré et concis (3 à 5 paragraphes max) présentable à un assistant virtuel.

Le résumé doit impérativement inclure :
1. La présentation générale de l'entreprise / organisation (domaine d'activité principal).
2. Les produits, services ou prestations phares proposés.
3. Le public cible / les clients types.
4. Les points forts, valeurs ou avantages concurrentiels clés.
5. Les informations de contact ou localisation si disponibles.

CONSIGNE STRICTE : Sois factuel et direct. N'ajoute AUCUN préambule, ni métadonnée système (ne commence PAS par "Voici le résumé" et n'ajoute pas de ligne "User Safety: safe"). Rédige uniquement le texte du résumé en français sous forme de texte structuré et naturel.`;

  try {
    const res = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://admin-seven-alpha-37.vercel.app',
        'X-Title': 'B2B AI Chatbot',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-lite-001',
        messages: [{ role: 'user', content: `${prompt}\n\nContenu du site web :\n${content.slice(0, 12000)}` }],
        temperature: 0.3
      })
    });

    if (res.ok) {
      const data = await res.json();
      let summaryText = data.choices?.[0]?.message?.content?.trim();
      if (summaryText) {
        summaryText = summaryText
          .replace(/^User Safety:\s*safe\s*/gi, '')
          .replace(/User Safety:\s*safe\s*$/gi, '')
          .replace(/^Safety:\s*safe\s*/gi, '')
          .replace(/Safety:\s*safe\s*$/gi, '')
          .replace(/^\*\*User Safety:\*\*\s*safe\s*/gi, '')
          .replace(/\*\*User Safety:\*\*\s*safe\s*$/gi, '')
          .replace(/^(Voici le résumé|Voici une synthèse|Résumé du site|Présentation de l'entreprise)\s*:\s*/gi, '')
          .trim();
        return summaryText || null;
      }
    }
  } catch (e) {
    console.warn('OpenRouter summary generation error:', e);
  }

  return null;
}




