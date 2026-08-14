import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const envContent = readFileSync(resolve("apps/admin/.env.local"), "utf-8");
    for (const line of envContent.split("\n")) {
      const [key, ...vals] = line.trim().split("=");
      if (key && !key.startsWith("#")) process.env[key.trim()] = vals.join("=").trim();
    }
  } catch {}
}

const SUPABASE_URL = process.env.SUPABASE_URL || "https://xuvueegdokgiyedwvmkm.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function inspect() {
  console.log("=== INSPECTION DES SITES ET DOCUMENTS DANS SUPABASE ===");

  const { data: sites, error: siteErr } = await supabase
    .from('sites')
    .select('id, tenant_id, domain, public_key, bot_goal, bot_tone');

  if (siteErr) {
    console.error("Erreur lecture sites:", siteErr);
    return;
  }

  console.log(`Nombre total de sites enregistrés: ${sites?.length}`);

  for (const s of sites || []) {
    const { count: docCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', s.id);

    const { data: summaryData } = await supabase
      .from('site_summaries')
      .select('summary')
      .eq('site_id', s.id)
      .maybeSingle();

    const { data: docSummary } = await supabase
      .from('documents')
      .select('content')
      .eq('site_id', s.id)
      .ilike('url', '%#site-summary')
      .maybeSingle();

    const hasSummary = summaryData?.summary || docSummary?.content ? "OUI" : "NON";

    console.log(`\n• Domaine: ${s.domain}`);
    console.log(`  Tenant ID : ${s.tenant_id}`);
    console.log(`  Site ID   : ${s.id}`);
    console.log(`  Public Key: ${s.public_key}`);
    console.log(`  Docs (chunks) indexés: ${docCount}`);
    console.log(`  Résumé de site présent: ${hasSummary}`);
  }
}

inspect().catch(console.error);
