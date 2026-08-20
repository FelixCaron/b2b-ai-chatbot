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

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function cleanDbSummaries() {
  console.log("=== CLEANING DB SITE SUMMARIES FROM SYSTEM META NOISE ===");

  const { data: summaries } = await supabase.from('site_summaries').select('*');
  if (!summaries || summaries.length === 0) {
    console.log("No summaries to clean.");
    return;
  }

  for (const s of summaries) {
    if (s.summary && (s.summary.includes('User Safety') || s.summary.includes('Safety:'))) {
      const cleaned = s.summary
        .replace(/^User Safety:\s*safe\s*/gi, '')
        .replace(/User Safety:\s*safe\s*$/gi, '')
        .replace(/^Safety:\s*safe\s*/gi, '')
        .replace(/Safety:\s*safe\s*$/gi, '')
        .replace(/^\*\*User Safety:\*\*\s*safe\s*/gi, '')
        .replace(/\*\*User Safety:\*\*\s*safe\s*$/gi, '')
        .trim();

      await supabase.from('site_summaries').update({ summary: cleaned }).eq('id', s.id);
      console.log(`Cleaned summary ID ${s.id} for site ${s.site_id}`);
    }
  }

  console.log("Clean completed successfully.");
}

cleanDbSummaries().catch(console.error);
