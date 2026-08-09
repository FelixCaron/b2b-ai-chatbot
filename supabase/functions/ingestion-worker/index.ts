import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper: Split long markdown into text chunks (~800 characters)
function chunkText(text: string, maxLength = 800): string[] {
  const paragraphs = text.split("\n\n");
  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    if ((currentChunk + "\n\n" + para).length > maxLength) {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = para;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
    }
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY") || "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let jobData: { msg_id?: number; site_id: string; tenant_id: string; url: string } | null = null;

    // Check payload passed directly or pop from PGMQ queue
    const bodyText = await req.text();
    if (bodyText) {
      try {
        const body = JSON.parse(bodyText);
        if (body.url && body.tenant_id && body.site_id) {
          jobData = body;
        }
      } catch (_e) {
        // payload was empty or non-JSON, pop from queue
      }
    }

    if (!jobData) {
      // Read from PGMQ queue
      const { data: qMsgs, error: qErr } = await supabase.rpc("pgmq_read", {
        queue_name: "ingestion_queue",
        vt: 30,
        qty: 1
      });

      if (qErr || !qMsgs || qMsgs.length === 0) {
        return new Response(
          JSON.stringify({ status: "idle", message: "No messages in ingestion_queue" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const qMsg = qMsgs[0];
      jobData = {
        msg_id: qMsg.msg_id,
        site_id: qMsg.message.site_id,
        tenant_id: qMsg.message.tenant_id,
        url: qMsg.message.url
      };
    }

    console.log(`Processing ingestion for URL: ${jobData.url}`);

    // Fetch cleaned markdown from Jina Reader API
    const jinaRes = await fetch(`https://r.jina.ai/${jobData.url}`, {
      headers: { Accept: "text/plain" }
    });

    if (!jinaRes.ok) {
      throw new Error(`Jina Reader API failed with status ${jinaRes.status}`);
    }

    const rawMarkdown = await jinaRes.text();
    const chunks = chunkText(rawMarkdown);

    console.log(`Generated ${chunks.length} chunks for ${jobData.url}`);

    const recordsToInsert = [];

    for (const chunk of chunks) {
      let embedding: number[] | null = null;
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
              input: chunk
            })
          });

          if (embedRes.ok) {
            const data = await embedRes.json();
            if (data?.data?.[0]?.embedding) {
              embedding = data.data[0].embedding.slice(0, 768);
            }
          }
        } catch (embedErr) {
          console.warn("Embedding generation fallback warning:", embedErr);
        }
      }

      recordsToInsert.push({
        tenant_id: jobData.tenant_id,
        site_id: jobData.site_id,
        url: jobData.url,
        content: chunk,
        embedding: embedding
      });
    }

    // Insert extracted document chunks into Supabase documents table
    const { error: insertErr } = await supabase.from("documents").insert(recordsToInsert);

    if (insertErr) {
      throw new Error(`Database insertion error: ${insertErr.message}`);
    }

    // Delete message from PGMQ if msg_id exists
    if (jobData.msg_id) {
      await supabase.rpc("pgmq_delete", {
        queue_name: "ingestion_queue",
        msg_id: jobData.msg_id
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        url: jobData.url,
        chunks_processed: chunks.length
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Ingestion worker error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
