import { ChatRequestSchema, StartScanSchema, LeadSchema } from "../packages/shared/dist/index.js";

console.log("==========================================");
console.log("RUNNING SCHEMAS & CONTRACTS VERIFICATION");
console.log("==========================================");

let passed = 0;
let failed = 0;

// TEST 1: Valid ChatRequestSchema
try {
  ChatRequestSchema.parse({
    message: "Bonjour, quels sont vos tarifs?",
    tenant_public_key: "11111111-2222-3333-4444-555555555555",
    session_id: "sess_12345"
  });
  console.log("✓ Valid ChatRequestSchema passed");
  passed++;
} catch (err) {
  console.error("❌ Valid ChatRequestSchema failed:", err);
  failed++;
}

// TEST 2: Valid StartScanSchema
try {
  StartScanSchema.parse({
    site_id: "11111111-2222-3333-4444-555555555555",
    tenant_id: "22222222-3333-4444-5555-666666666666",
    url: "https://example.com"
  });
  console.log("✓ Valid StartScanSchema passed");
  passed++;
} catch (err) {
  console.error("❌ Valid StartScanSchema failed:", err);
  failed++;
}

// TEST 3: Valid LeadSchema
try {
  LeadSchema.parse({
    name: "Jean Dupont",
    email: "jean@example.com",
    phone: "+33612345678"
  });
  console.log("✓ Valid LeadSchema passed");
  passed++;
} catch (err) {
  console.error("❌ Valid LeadSchema failed:", err);
  failed++;
}

// TEST 4: Invalid ChatRequestSchema (missing message)
try {
  ChatRequestSchema.parse({
    tenant_public_key: "11111111-2222-3333-4444-555555555555"
  });
  console.error("❌ Invalid ChatRequestSchema should have thrown");
  failed++;
} catch (err) {
  console.log("✓ Invalid ChatRequestSchema properly rejected");
  passed++;
}

console.log("==========================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("==========================================");

if (failed > 0) {
  process.exit(1);
}
