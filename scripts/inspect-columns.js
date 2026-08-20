import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

globalThis.WebSocket = WebSocket;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function inspectColumns() {
  const tables = ['tenants', 'sites', 'documents', 'leads', 'messages', 'usage'];
  for (const t of tables) {
    const { data, error } = await sb.from(t).select('*').limit(1);
    if (error) {
      console.log(`Table ${t}: error ${error.message}`);
    } else if (data && data[0]) {
      console.log(`Table ${t} columns:`, Object.keys(data[0]));
    } else {
      console.log(`Table ${t}: exists (empty)`);
    }
  }
}

inspectColumns();
