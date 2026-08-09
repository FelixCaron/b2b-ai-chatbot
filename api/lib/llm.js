// LLM Abstraction Layer
// OpenRouter Provider Integration

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.0-flash-lite:free';

export async function generateChatResponse({ systemPrompt, messagesHistory, apiKey }) {
  const openRouterKey = process.env.OPENROUTER_API_KEY || apiKey;

  if (!openRouterKey) {
    return "⚠️ [Erreur Système IA] Aucune clé d'environnement (OPENROUTER_API_KEY) n'est configurée.";
  }

  try {
    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...messagesHistory.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
    ];

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
        messages: openAiMessages,
        temperature: 0.7
      })
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return text;
    } else {
      const errText = await res.text();
      return `⚠️ [Erreur OpenRouter ${res.status}]\n${errText}`;
    }
  } catch (err) {
    return `⚠️ [Erreur Connexion OpenRouter] ${err.message}`;
  }

  return "⚠️ [Erreur IA] Impossible d'obtenir une réponse de l'IA.";
}

export async function extractLeadInfo({ messagesHistory, apiKey }) {
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

