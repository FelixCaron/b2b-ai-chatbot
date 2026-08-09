import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

const SUPABASE_URL = "https://xuvueegdokgiyedwvmkm.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function wipeDatabase() {
  console.log("Wiping all demo/test data from Supabase Cloud database...");

  await supabase.from("documents").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("leads").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("sites").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("usage").delete().neq("tenant_id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("tenants").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("✓ Database wiped cleanly! All test data removed.");
}

wipeDatabase();
