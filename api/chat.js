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

    // Vector query document knowledge base
    const mockQueryEmbedding = Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 : -0.05));
    const { data: docs } = await supabase.rpc('match_documents_hybrid', {
      query_text: message,
      query_embedding: mockQueryEmbedding,
      match_tenant_id: tenantId,
      match_count: 4
    });

    const contextText = (docs || []).map((d) => d.content).join('\n---\n');

    const apiKey = process.env.OPENROUTER_API_KEY;

    // Build system prompt
    const systemPrompt = `Tu es l'assistant virtuel professionnel et courtois du site web ${site.domain}. 
Ton rôle est de répondre avec précision, clarté et bienveillance aux visiteurs du site.

INFORMATIONS DE CONNAISSANCE EXTRACTES DU SITE WEB :
${contextText || "Aucune documentation spécifique trouvée."}

DIRECTIVES :
1. Sois très chaleureux, concis et serviable.
2. Basant tes réponses prioritairement sur le contexte fourni ci-dessus.
3. Si l'information exacte n'est pas présente, réponds poliment en restant en lien avec l'activité générale du site ${site.domain}.
${isLeadCaptureEnabled ? "4. CRUCIAL: Si l'utilisateur pose une question complexe, exprime un besoin spécifique ou souhaite un devis, refuse poliment de donner une réponse définitive et demande-lui naturellement son nom et son adresse email (ou téléphone) pour qu'un expert puisse le recontacter rapidement avec une solution sur-mesure." : ""}`;

    // Fetch conversation history (last 10 messages)
    const { data: historyData } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', session_id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Re-order to chronological
    const fullHistory = historyData ? historyData.reverse() : [];

    let finalReply = '';

    try {
      const { generateChatResponse } = await import('./lib/llm.js');
      finalReply = await generateChatResponse({ systemPrompt, messagesHistory: fullHistory, apiKey });
    } catch (_gErr) {
      console.error('OpenRouter API call error:', _gErr);
      finalReply = `⚠️ [Erreur Inattendue Backend] ${_gErr.message}`;
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Stream out in smooth visual chunks
        const words = finalReply.split(' ');
        let accumulated = '';

        for (let i = 0; i < words.length; i++) {
          accumulated += (i === 0 ? '' : ' ') + words[i];
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: accumulated })}\n\n`));
          // Brief pause for realistic streaming feel
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
            const { extractLeadInfo } = await import('./lib/llm.js');
            const historyForExtraction = [...fullHistory, { role: 'assistant', content: finalReply }];
            const leadData = await extractLeadInfo({ messagesHistory: historyForExtraction, apiKey });
            
            if (leadData && (leadData.email || leadData.phone)) {
              // Ensure we don't insert duplicate leads per session
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
