import { readFileSync } from 'fs';
import { resolve } from 'path';
import WebSocket from 'ws';

globalThis.WebSocket = WebSocket;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const envContent = readFileSync(resolve("apps/admin/.env.local"), "utf-8");
    for (const line of envContent.split("\n")) {
      const [key, ...vals] = line.trim().split("=");
      if (key && !key.startsWith("#")) process.env[key.trim()] = vals.join("=").trim();
    }
  } catch {}
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

import generateSummaryHandler from '../api/generate-summary.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testSummaryTrigger() {
  console.log("=== TESTING API/GENERATE-SUMMARY FOR ALL SITES IN DB ===");

  const { data: sites } = await supabase.from('sites').select('*').limit(5);
  if (!sites || sites.length === 0) {
    console.log("No sites found in DB.");
    return;
  }

  const site = sites[0];
  console.log(`Found Site: ${site.domain} (ID: ${site.id}, Tenant: ${site.tenant_id})`);

  const reqBody = {
    tenant_id: site.tenant_id,
    site_id: site.id,
    url: site.domain
  };

  const dummyReq = {
    method: 'POST',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => reqBody
  };

  const res = await generateSummaryHandler(dummyReq);
  const data = await res.json();

  console.log(`\nGenerate Summary Status: ${res.status}`);
  console.log(`Summary Result Data   :`, JSON.stringify(data, null, 2));

  // Check site_summaries table
  const { data: savedSum } = await supabase.from('site_summaries').select('*').eq('site_id', site.id).maybeSingle();
  console.log(`\nSaved Summary in site_summaries table:`, savedSum?.summary ? `"${savedSum.summary.substring(0, 150)}..."` : 'NONE');
}

testSummaryTrigger().catch(console.error);
