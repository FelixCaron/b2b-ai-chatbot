import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// Maximum messages per tenant quota limit (configurable)
const MAX_MESSAGES_PER_PLAN: Record<string, number> = {
  free: 1000,
  pro: 50000,
  enterprise: 1000000
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openrouter/free";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, tenant_public_key, session_id } = await req.json();

    if (!message || !tenant_public_key || !session_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: message, tenant_public_key, session_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY") || "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. DOMAIN LOCKING
    const originHeader = req.headers.get("origin") || req.headers.get("referer") || "";

    const { data: site, error: siteErr } = await supabase
      .from("sites")
      .select("id, tenant_id, domain, tenants(plan)")
      .eq("public_key", tenant_public_key)
      .single();

    if (siteErr || !site) {
      return new Response(
        JSON.stringify({ error: "Invalid tenant public key" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify domain origin (Allow localhost and 127.0.0.1 for local widget testing)
    const isLocalhost = originHeader.includes("localhost") || originHeader.includes("127.0.0.1");
    if (!isLocalhost && originHeader && !originHeader.includes(site.domain)) {
      return new Response(
        JSON.stringify({ error: `Domain locked. Origin '${originHeader}' does not match registered domain '${site.domain}'` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = site.tenant_id;
    const plan = (site.tenants as any)?.plan || "free";
    const quotaLimit = MAX_MESSAGES_PER_PLAN[plan] || 1000;

    // 2. QUOTA CHECK
    const { data: usage } = await supabase
      .from("usage")
      .select("messages_count")
      .eq("tenant_id", tenantId)
      .single();

    const currentCount = usage?.messages_count || 0;
    if (currentCount >= quotaLimit) {
      return new Response(
        JSON.stringify({ error: "Tenant message quota limit exceeded for plan" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. SAVE USER MESSAGE
    await supabase.from("messages").insert({
      tenant_id: tenantId,
      session_id,
      role: "user",
      content: message
    });

    // 4. FETCH CONVERSATION HISTORY
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("tenant_id", tenantId)
      .eq("session_id", session_id)
      .order("created_at", { ascending: true })
      .limit(10);

    const openAiHistory = (history || []).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content
    }));

    // 5. TOOL DEFINITIONS & EXECUTION
    const tools = [
      {
        type: "function",
        function: {
          name: "search_knowledge_base",
          description: "Search the company knowledge base for facts, pricing, documentation, and answers.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query for knowledge base" }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "capture_lead",
          description: "Save customer lead contact details when they offer their name, email, or phone number.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Lead customer full name" },
              email: { type: "string", description: "Lead customer email address" },
              phone: { type: "string", description: "Lead customer phone number" }
            }
          }
        }
      }
    ];

    async function handleToolCall(name: string, args: any): Promise<any> {
      if (name === "search_knowledge_base") {
        const queryText = args.query || message;
        let queryEmbedding: number[] = Array(768).fill(0);
        if (openRouterApiKey) {
          try {
            const embedRes = await fetch("https://openrouter.ai/api/v1/embeddings", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${openRouterApiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "openai/text-embedding-3-small",
                input: queryText
              })
            });
            if (embedRes.ok) {
              const data = await embedRes.json();
              if (data?.data?.[0]?.embedding) {
                queryEmbedding = data.data[0].embedding.slice(0, 768);
              }
            }
          } catch (_e) {
            console.warn("Embedding query generation fallback warning");
          }
        }

        const { data: docs } = await supabase.rpc("match_documents_hybrid", {
          query_text: queryText,
          query_embedding: queryEmbedding,
          match_tenant_id: tenantId,
          match_count: 5
        });

        return { results: docs || [] };
      } else if (name === "capture_lead") {
        const { name: leadName, email, phone } = args;
        await supabase.from("leads").insert({
          tenant_id: tenantId,
          name: leadName || null,
          email: email || null,
          phone: phone || null
        });

        await supabase.rpc("increment_lead_usage", { target_tenant_id: tenantId })
          .catch(async () => {
            await supabase.from("usage").update({ updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
          });

        return { success: true, message: "Lead captured successfully" };
      }
      return { error: "Unknown function tool" };
    }

    // System instruction
    const systemMessage = {
      role: "system",
      content: "Tu es l'assistant virtuel officiel et membre à part entière de l'entreprise. DIRECTIVES STRICTES: 1. Parle TOUJOURS à la première personne du pluriel ('nous', 'notre équipe'). 2. NE MENTIONNE JAMAIS que tu utilises un 'contexte', 'base de données' ou 'outil'. Agis comme si tu savais ces choses naturellement. 3. Sois très chaleureux et professionnel. Si le client souhaite être recontacté ou donne ses coordonnées, utilise l'outil capture_lead. Pour répondre aux questions sur le site, utilise l'outil search_knowledge_base sans dire à l'utilisateur que tu lances une recherche."
    };

    const conversationMessages = [systemMessage, ...openAiHistory];

    // 6. OPENROUTER API CALL
    const encoder = new TextEncoder();
    let accumulatedAssistantText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // First pass: non-streaming call to check for tool calls or direct answer
          const initialRes = await fetch(OPENROUTER_BASE_URL, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openRouterApiKey}`,
              "HTTP-Referer": "https://admin-seven-alpha-37.vercel.app",
              "X-Title": "B2B AI Chatbot",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: DEFAULT_MODEL,
              messages: conversationMessages,
              tools: tools,
              temperature: 0.7
            })
          });

          if (!initialRes.ok) {
            const errText = await initialRes.text();
            throw new Error(`OpenRouter API error (${initialRes.status}): ${errText}`);
          }

          const responseData = await initialRes.json();
          const choice = responseData.choices?.[0];
          const choiceMessage = choice?.message;

          if (choiceMessage?.tool_calls && choiceMessage.tool_calls.length > 0) {
            // Process tool calls
            for (const toolCall of choiceMessage.tool_calls) {
              const fnName = toolCall.function.name;
              let fnArgs = {};
              try {
                fnArgs = JSON.parse(toolCall.function.arguments || "{}");
              } catch (_e) {}

              controller.enqueue(encoder.encode(`event: tool_start\ndata: ${JSON.stringify({ tool: fnName })}\n\n`));
              const toolResult = await handleToolCall(fnName, fnArgs);
              controller.enqueue(encoder.encode(`event: tool_end\ndata: ${JSON.stringify({ tool: fnName, output: toolResult })}\n\n`));

              // Append assistant tool call and tool result to conversation
              conversationMessages.push(choiceMessage);
              conversationMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(toolResult)
              });
            }

            // Second pass for final response after tool execution
            const followUpRes = await fetch(OPENROUTER_BASE_URL, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${openRouterApiKey}`,
                "HTTP-Referer": "https://admin-seven-alpha-37.vercel.app",
                "X-Title": "B2B AI Chatbot",
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: DEFAULT_MODEL,
                messages: conversationMessages,
                temperature: 0.7
              })
            });

            if (followUpRes.ok) {
              const followData = await followUpRes.json();
              accumulatedAssistantText = followData.choices?.[0]?.message?.content || "";
            }
          } else {
            accumulatedAssistantText = choiceMessage?.content || "";
          }

          // Stream back content in visual chunks for widget smooth rendering
          if (accumulatedAssistantText) {
            const words = accumulatedAssistantText.split(" ");
            let accumulated = "";
            for (let i = 0; i < words.length; i++) {
              accumulated += (i === 0 ? "" : " ") + words[i];
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: accumulated })}\n\n`));
              await new Promise((r) => setTimeout(r, 15));
            }
          }

          // 7. SAVE AI ASSISTANT MESSAGE & UPDATE USAGE
          if (accumulatedAssistantText) {
            await supabase.from("messages").insert({
              tenant_id: tenantId,
              session_id,
              role: "assistant",
              content: accumulatedAssistantText
            });

            const { error: incErr } = await supabase.rpc("increment_usage", { target_tenant_id: tenantId });
            if (incErr) {
              await supabase.from("usage").update({
                messages_count: currentCount + 1,
                updated_at: new Date().toISOString()
              }).eq("tenant_id", tenantId);
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err: any) {
          console.error("Chat stream error:", err);
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

