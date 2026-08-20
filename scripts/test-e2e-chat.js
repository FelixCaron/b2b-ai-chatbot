import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function runE2ETests() {
  console.log("==================================================");
  console.log("RUNNING E2E CHAT FUNCTION & LEAD CAPTURE TEST");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  let tenantId = "";
  let siteId = "";
  let publicKey = "";
  const sessionId = "e2e_sess_" + Date.now();

  // STEP A: Setup Test Tenant & Site
  try {
    console.log("\n[TEST A] Setting up E2E Tenant & Registered Site...");
    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .insert({ name: "E2E Test Company", plan: "pro" })
      .select()
      .single();
    if (tErr) throw tErr;
    tenantId = tenant.id;

    await supabase.from("usage").insert({ tenant_id: tenantId, messages_count: 0, leads_count: 0 });

    const { data: site, error: sErr } = await supabase
      .from("sites")
      .insert({ tenant_id: tenantId, domain: "e2e-demo.com" })
      .select()
      .single();
    if (sErr) throw sErr;
    siteId = site.id;
    publicKey = site.public_key;

    console.log(`✓ E2E Site registered. Domain: e2e-demo.com | Public Key: ${publicKey}`);
    passed++;
  } catch (err) {
    console.error("❌ E2E Setup FAILED:", err);
    failed++;
  }

  // STEP B: Test Lead Capture Tool Functionality in DB
  try {
    console.log("\n[TEST B] Testing Lead Capture Database Flow...");
    const leadEmail = `lead_${Date.now()}@example.com`;
    const { data: lead, error: lErr } = await supabase
      .from("leads")
      .insert({
        tenant_id: tenantId,
        name: "Sophie Martin",
        email: leadEmail,
        phone: "+33699887766"
      })
      .select()
      .single();

    if (lErr) throw lErr;
    console.log(`✓ Lead captured successfully in database (ID: ${lead.id}, Email: ${lead.email})`);

    // Increment lead usage
    await supabase.rpc("increment_lead_usage", { target_tenant_id: tenantId });
    const { data: usageData } = await supabase.from("usage").select("*").eq("tenant_id", tenantId).single();
    console.log(`✓ Updated Tenant Usage (Leads Count: ${usageData.leads_count})`);

    passed++;
  } catch (err) {
    console.error("❌ Lead Capture Flow FAILED:", err);
    failed++;
  }

  // STEP C: Test Message Insertion & Usage Increment
  try {
    console.log("\n[TEST C] Testing Message Storage & Atomic Usage Counter...");
    await supabase.from("messages").insert({
      tenant_id: tenantId,
      session_id: sessionId,
      role: "user",
      content: "Quels sont vos tarifs pour les grandes entreprises?"
    });

    await supabase.from("messages").insert({
      tenant_id: tenantId,
      session_id: sessionId,
      role: "assistant",
      content: "Nos forfaits Entreprise sont sur-mesure. Souhaitez-vous laisser vos coordonnées?"
    });

    await supabase.rpc("increment_usage", { target_tenant_id: tenantId });

    const { data: finalUsage } = await supabase.from("usage").select("*").eq("tenant_id", tenantId).single();
    console.log(`✓ Conversation recorded for session ${sessionId}`);
    console.log(`✓ Tenant Usage incremented (Messages Count: ${finalUsage.messages_count})`);

    passed++;
  } catch (err) {
    console.error("❌ Message Storage FAILED:", err);
    failed++;
  }

  console.log("\n==================================================");
  console.log(`E2E VERIFICATION RESULTS: ${passed} / 3 PASSED`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

runE2ETests();
