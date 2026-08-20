import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function wipeDatabase() {
  console.log("Wiping all demo/test data from Supabase Cloud database...");

  const { error: e1 } = await supabase.from("documents").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: e2 } = await supabase.from("site_summaries").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: e3 } = await supabase.from("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: e4 } = await supabase.from("leads").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: e5 } = await supabase.from("sites").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: e6 } = await supabase.from("usage").delete().neq("tenant_id", "00000000-0000-0000-0000-000000000000");
  const { error: e7 } = await supabase.from("tenants").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  if (e1 || e2 || e3 || e4 || e5 || e6 || e7) {
    console.error("Errors during cleanup:", { e1, e2, e3, e4, e5, e6, e7 });
  } else {
    console.log("✓ Database wiped cleanly! All tenants, sites, documents, summaries, and leads removed.");
  }
}

wipeDatabase();
