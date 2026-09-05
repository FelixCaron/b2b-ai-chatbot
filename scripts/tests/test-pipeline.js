import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { ChatRequestSchema, StartScanSchema, LeadSchema } from "../../packages/shared/dist/index.js";

globalThis.WebSocket = WebSocket;

const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!VITE_SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('VITE_SUPABASE_URL and SUPABASE_SECRET_KEY are required');

const supabase = createClient(VITE_SUPABASE_URL, SERVICE_ROLE_KEY);

async function runTests() {
  console.log("==========================================");
  console.log("RUNNING COMPREHENSIVE PIPELINE VERIFICATION");
  console.log("==========================================");

  let passed = 0;
  let failed = 0;

  // TEST 1: Zod Schemas
  try {
    console.log("\n[TEST 1] Testing Shared Zod Schemas...");
    const validChat = ChatRequestSchema.parse({
      message: "Bonjour, quels sont vos tarifs?",
      tenant_public_key: "11111111-2222-3333-4444-555555555555",
      session_id: "sess_12345"
    });
    const validScan = StartScanSchema.parse({
      site_id: "11111111-2222-3333-4444-555555555555",
      tenant_id: "22222222-3333-4444-5555-666666666666",
      url: "https://example.com"
    });
    const validLead = LeadSchema.parse({
      name: "Jean Dupont",
      email: "jean@example.com",
      phone: "+33612345678"
    });
    console.log("âœ“ Shared Zod Schemas validation PASSED");
    passed++;
  } catch (err) {
    console.error("âŒ Shared Zod Schemas FAILED:", err);
    failed++;
  }

  // TEST 2: Tenant & Site Creation in Supabase Cloud
  let tenantId = "";
  let siteId = "";
  let publicKey = "";
  try {
    console.log("\n[TEST 2] Testing Tenant & Site Database Creation...");
    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .insert({ name: "Test Enterprise Tenant", plan: "pro" })
      .select()
      .single();

    if (tErr) throw tErr;
    tenantId = tenant.id;

    // Initialize usage row
    await supabase.from("usage").insert({ tenant_id: tenantId, messages_count: 0, leads_count: 0 });

    const { data: site, error: sErr } = await supabase
      .from("sites")
      .insert({ tenant_id: tenantId, domain: "example.com" })
      .select()
      .single();

    if (sErr) throw sErr;
    siteId = site.id;
    publicKey = site.public_key;

    console.log(`âœ“ Tenant created (ID: ${tenantId})`);
    console.log(`âœ“ Site created (ID: ${siteId}, Public Key: ${publicKey})`);
    passed++;
  } catch (err) {
    console.error("âŒ Database Tenant/Site insertion FAILED:", err);
    failed++;
  }

  // TEST 3: Inserting Document Vector & FTS Content
  let docId = "";
  try {
    console.log("\n[TEST 3] Testing Document & Vector Embedding Insertion...");
    // Create mock 768-dim vector embedding
    const mockEmbedding = Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 : -0.05));

    const { data: doc, error: dErr } = await supabase
      .from("documents")
      .insert({
        tenant_id: tenantId,
        site_id: siteId,
        url: "https://example.com/pricing",
        content: "Nos services SaaS dÃ©marrent Ã  49â‚¬ par mois. Contactez notre Ã©quipe commerciale pour un devis personnalisÃ©.",
        embedding: mockEmbedding
      })
      .select()
      .single();

    if (dErr) throw dErr;
    docId = doc.id;
    console.log(`âœ“ Document inserted successfully (ID: ${docId})`);
    passed++;
  } catch (err) {
    console.error("âŒ Document Insertion FAILED:", err);
    failed++;
  }

  // TEST 4: Hybrid Search RPC (Reciprocal Rank Fusion - RRF)
  try {
    console.log("\n[TEST 4] Testing Reciprocal Rank Fusion RPC (match_documents_hybrid)...");
    const mockQueryEmbedding = Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 : -0.05));

    const { data: rrfResults, error: rrfErr } = await supabase.rpc("match_documents_hybrid", {
      query_text: "tarifs",
      query_embedding: mockQueryEmbedding,
      match_tenant_id: tenantId,
      match_count: 5
    });

    if (rrfErr) throw rrfErr;

    console.log(`âœ“ Hybrid Search RPC returned ${rrfResults.length} matching document(s):`);
    rrfResults.forEach((r, idx) => {
      console.log(`   [Result ${idx + 1}] ID: ${r.id} | URL: ${r.url} | Content: ${r.content.substring(0, 60)}...`);
    });
    if (rrfResults.length > 0) {
      passed++;
    } else {
      console.error("âŒ Hybrid Search returned 0 results");
      failed++;
    }
  } catch (err) {
    console.error("âŒ Hybrid Search RPC FAILED:", err);
    failed++;
  }

  // TEST 5: PGMQ Queue Ingestion Check
  try {
    console.log("\n[TEST 5] Testing PGMQ Queue Ingestion Message Send/Read...");
    const { data: sendRes, error: sendErr } = await supabase.rpc("pgmq_send", {
      queue_name: "ingestion_queue",
      msg: { site_id: siteId, tenant_id: tenantId, url: "https://example.com/about" }
    });

    if (sendErr) throw sendErr;
    console.log(`âœ“ Enqueued test task into PGMQ (msg_id: ${sendRes})`);

    const { data: readRes, error: readErr } = await supabase.rpc("pgmq_read", {
      queue_name: "ingestion_queue",
      vt: 30,
      qty: 1
    });

    if (readErr) throw readErr;
    console.log(`âœ“ Read message from PGMQ ingestion_queue successfully:`, readRes[0]?.message);

    if (readRes[0]?.msg_id) {
      await supabase.rpc("pgmq_delete", {
        queue_name: "ingestion_queue",
        msg_id: readRes[0].msg_id
      });
      console.log(`âœ“ Deleted test message from PGMQ`);
    }

    passed++;
  } catch (err) {
    console.error("âŒ PGMQ Queue Test FAILED:", err);
    failed++;
  }

  console.log("\n==========================================");
  console.log(`TEST RESULTS: ${passed} / 5 TESTS PASSED`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
