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
          return new Response(JSON.stringify({ error: 'Rate limit reached. Please wait a moment.' }), {
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
          // One or more optional columns are missing from the schema — fall back to core columns
          console.warn('[chat] Falling back to core columns due to missing column (42703).');
          const { data: coreData, error: coreError } = await supabase
            .from('sites')
            .select('id, tenant_id, domain')
            .eq('public_key', tenant_public_key)
            .maybeSingle();
          if (coreError || !coreData) {
            return new Response(JSON.stringify({ error: 'Site not found (core query failed)' }), {
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
          return new Response(JSON.stringify({ error: `Database error: ${fullError.message}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      } else {
        site = fullData;
      }
    }

    if (!site) {
      return new Response(JSON.stringify({ error: `Invalid site key (${tenant_public_key}). The site was not found in the database.` }), {
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
      return new Response(JSON.stringify({ error: 'Origin not authorized for this site.' }), {
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

    let siteSummaryText = summaryText ? `\nWEBSITE SUMMARY AND COMPANY OVERVIEW:\n${summaryText}\n` : '';

    // Admin Copilot: provide admin-facing platform summary and plan info instead
    // of a crawled-site summary (there's no customer site to summarize here).
    if (isAdminCopilot) {
      siteSummaryText = `\nPLATFORM SUMMARY (Admin Copilot):\nYou are the official Copilot for the Repondo admin dashboard. Your role is to help administrators configure their AI agent.\n- APPOINTMENTS & SUPPORT: To enable calendar booking or support email forwarding, the tenant must subscribe to the Pro plan ($40/month) or higher. After subscribing, they can enter their calendar link and support email in the Dashboard under Pro Integrations.\n- WIDGET INTEGRATION: Copy the <script> snippet provided in the Dashboard and paste it into the tenant's website.\n- PLANS: Basic ($15/month), Pro ($40/month), Premium ($65/month).\n- UI TOOLS: You have access to the 'navigate_to' tool; use it when the user asks where to find a feature.\nDo not mention unrelated internal topics or implementation details.\n`;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    // Temporal & Date Context
    const currentDateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTimeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const timeContext = `CURRENT DATE & TIME: Today is ${currentDateStr}, it is ${currentTimeStr}.`;

    // Build system prompt
    const toneString = site.bot_tone === 'amical' ? "Tone: Warm, friendly, informal when natural, very approachable." : "Tone: Professional, courteous, formal, precise.";
    const goalString = site.bot_goal === 'lead' ? "Primary Objective: Convert the visitor into a lead. Strongly encourage them to leave an email or phone number." : "Primary Objective: Inform and support the visitor. Answer thoroughly and clearly.";

    // Integrations Context
    const tenantPlan = (Array.isArray(site.tenants) ? site.tenants[0]?.plan : site.tenants?.plan) || 'basic';
    const hasProPlan = tenantPlan === 'pro' || tenantPlan === 'premium';
    const calendarInstruction = (hasProPlan && site.calendar_link)
      ? `5. APPOINTMENTS: If the user wants to book a meeting, ALWAYS provide this booking link: [Book a meeting](${site.calendar_link}).`
      : "";

    const supportInstruction = (hasProPlan && site.support_email)
      ? `6. TECHNICAL SUPPORT: If the user requests help or reports an issue, use the "send_support_email" tool to notify our support team.`
      : "";

    const systemPrompt = `You are the official customer support agent and virtual assistant for this company (site: ${site.domain}).
Your role is to represent the company and assist visitors with accuracy, honesty, and a strong customer-service mindset. Always behave as a full member of the company's team.
${timeContext}
${siteSummaryText}

COMMUNICATION & TONE GUIDELINES (CUSTOMER SUPPORT):
1. INTERNAL VOICE: Use "we", "our", "us" — never refer to the company in the third person.
2. NO REPETITIVE INTRODUCTIONS: The UI already shows a greeting. Never start responses with "Hello, I am the assistant...". Answer the user's question directly.
3. LINKS & NAVIGATION: The user is already on our website. Do not respond with "Please consult our website". If you have the exact URL for a page, provide it as a clickable link.
4. GENERAL QUESTIONS: When asked what we do, use the SITE SUMMARY above to explain our products/services concretely and proudly.
5. BRAND & SOFT SELL: Highlight the quality of our services and expertise in a consultative, non-aggressive manner.

TRUTH & ANTI-HALLUCINATION RULES:
1. NEVER INVENT INFORMATION OR SERVICES.
2. RAG OBLIGATION: Do NOT say "I don't have that information" without first running the "search_knowledge_base" tool with multiple keywords.
3. CONTACT INFO AND HOURS: Never provide phone numbers, emails, addresses, or opening hours unless they are explicitly present in the context or search results.
4. NO PLACEHOLDERS: Never use placeholders like "[[phone]]" or "[email]".
5. HANDLING MISSING INFORMATION: After searching and confirming absence, apologize briefly and ${isLeadCaptureEnabled ? "prompt the visitor to leave their name and contact so a human can follow up." : "invite them to contact the company using the site's contact form."}

FORMATTING & STRUCTURE (MARKDOWN):
- Use bold (**term**) for key points, product names, guarantees, prices, or steps.
- Use bulleted (- item) or numbered lists (1. step) when presenting more than two items.
- Render links as Markdown clickable links: [Link Title](https://example.com)
- Keep paragraphs short (2-3 sentences) and separated by a blank line for readability.

ABSOLUTE RESTRICTIONS:
- Do not invent prices, services, or opening hours.
- Do not use AI-technical jargon such as "knowledge base", "context", or "retrieval results".

DIRECTIVES:
1. ${toneString}
2. ${goalString}
3. If the conversation veers off-topic, politely steer it back to our services.
${isLeadCaptureEnabled ? "4. LEAD CAPTURE: This is a priority. If a visitor shows interest or asks advanced questions, offer them a chance to leave contact details for personalized follow-up." : ""}
${calendarInstruction}
${supportInstruction}`;


    // Fetch conversation history (last 10 messages).
    // IMPORTANT: session_id alone is not a safe scope — it is a client-generated
    // value (see widget ChatManager) and could theoretically collide or be reused
    // across different tenants/sites in the same browser (e.g. testing multiple
    // sites back to back from the admin preview). Always scope by tenant_id too,
    // otherwise a stale/shared session_id could leak another tenant's messages
    // into this conversation's context.
    const { data: historyData } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', session_id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Re-order to chronological
    const fullHistory = historyData ? historyData.reverse() : [];

    const tools = [
      {
        type: "function",
        function: {
          name: "search_knowledge_base",
          description: "Searches the site's documentation and knowledge base. Use this tool for any question about products, services, features, or technical specifications. For best results on bilingual or technical sites, include relevant keywords in both English and French (e.g. 'core polystyrene honeycomb doors').",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query or keywords (in English and/or French if relevant)."
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
          description: "Sends a ticket to customer support when the user asks for technical help or wants to contact support.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "User's name" },
              email: { type: "string", description: "User's email" },
              message: { type: "string", description: "The detailed message or description of the issue" }
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
          description: "Opens a specific page of the admin panel for the user. Use this if the user wants to see their invoices (pricing), their dashboard, their leads, or the 'About' page.",
          parameters: {
            type: "object",
            properties: {
              page: { 
                type: "string", 
                enum: ["dashboard", "pricing", "leads", "about"],
                description: "The target page."
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
            const selectedModel = hasProPlan ? premiumModel : defaultModel;

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

                  // HYBRID SEARCH: semantic embedding + bilingual FTS
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
                  const toolResponseContent = contextText || "No information found for this specific search. Try rephrasing with equivalent keywords, or in French if relevant.";

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
                  const emailResponse = `Email successfully sent to the support team (${site.support_email}). The customer should expect a reply shortly.`;

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

                  const navResponse = `Successfully redirected the user to the ${toolArgs.page} page.`;
                  
                  currentHistory.push({
                    role: 'tool',
                    content: navResponse,
                    tool_call_id: toolCall.id
                  });
                }
              }
            } else {
              // No tool calls requested: LLM provided final response!
              finalReply = llmMessage?.content || "⚠️ I can't answer right now.";
              break;
            }
          }

          if (!finalReply && loopCount >= MAX_TURNS) {
            finalReply = "Sorry, I searched our information but couldn't find what was needed.";
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
          sendBugAlertEmail(_innerErr, { source: 'chat_stream', tenantId, siteId: site?.id }).catch(console.error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: '⚠️ [Internal Error] ' + _innerErr.message })}\n\n`));
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
