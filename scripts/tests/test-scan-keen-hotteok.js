import { readFileSync } from 'fs';
import { resolve } from 'path';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  try {
    const envContent = readFileSync(resolve("apps/admin/.env.local"), "utf-8");
    for (const line of envContent.split("\n")) {
      const [key, ...vals] = line.trim().split("=");
      if (key && !key.startsWith("#")) process.env[key.trim()] = vals.join("=").trim();
    }
  } catch {}
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function testScanKeenHotteok() {
  console.log("=== TESTING API/START-SCAN FOR KEEN-HOTTEOK ===");

  // Find site or create temp test site
  const { data: site } = await supabase.from('sites').select('*').eq('domain', 'keen-hotteok-e04bd5.netlify.app').maybeSingle();
  let siteId = site?.id;
  let tenantId = site?.tenant_id;

  if (!siteId) {
    const { data: tenant } = await supabase.from('tenants').insert({ name: 'Test Keen Hotteok' }).select().single();
    tenantId = tenant.id;
    const { data: newSite } = await supabase.from('sites').insert({ tenant_id: tenantId, domain: 'keen-hotteok-e04bd5.netlify.app' }).select().single();
    siteId = newSite.id;
  }

  console.log(`Site ID: ${siteId} | Tenant ID: ${tenantId}`);

  const startScanModule = await import('../../api/start-scan.js');
  const startScanHandler = startScanModule.default;

  const reqBody = {
    site_id: siteId,
    tenant_id: tenantId,
    url: 'https://keen-hotteok-e04bd5.netlify.app/'
  };

  const dummyReq = {
    method: 'POST',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => reqBody
  };

  const res = await startScanHandler(dummyReq);
  const resData = await res.json();

  console.log(`\nScan Result Status: ${res.status}`);
  console.log(`Scan Result Data  :`, resData);

  // Check saved documents in DB
  const { count, data: docs } = await supabase
    .from('documents')
    .select('id, url, content', { count: 'exact' })
    .eq('site_id', siteId);

  console.log(`\nSaved Documents Count in DB: ${count}`);
  if (docs && docs.length > 0) {
    console.log(`Sample Document snippet: "${docs[0].content.substring(0, 150).replace(/\n+/g, ' ')}..."`);
  }
}

testScanKeenHotteok().catch(console.error);
