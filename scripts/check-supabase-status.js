import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

globalThis.WebSocket = WebSocket;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function verifySupabase() {
  console.log("=== SUPABASE SCHEMA & TABLES STATUS CHECK ===");
  const tables = [
    { name: 'tenants', columns: ['id', 'name', 'plan', 'plan_status', 'stripe_subscription_id', 'created_at'] },
    { name: 'sites', columns: ['id', 'tenant_id', 'domain', 'public_key', 'primary_color', 'welcome_message', 'bot_goal', 'bot_tone', 'is_active', 'created_at'] },
    { name: 'documents', columns: ['id', 'tenant_id', 'site_id', 'url', 'content', 'embedding', 'fts', 'fts_en'] },
    { name: 'leads', columns: ['id', 'tenant_id', 'site_id', 'session_id', 'name', 'email', 'phone', 'metadata'] },
    { name: 'site_summaries', columns: ['id', 'tenant_id', 'site_id', 'summary'] },
    { name: 'usage_counters', columns: ['id', 'tenant_id', 'usage_date', 'messages_count', 'scans_count'] },
    { name: 'scan_jobs', columns: ['id', 'tenant_id', 'site_id', 'url', 'status'] }
  ];

  for (const t of tables) {
    try {
      const { data, error } = await sb.from(t.name).select(t.columns.join(',')).limit(1);
      if (error) {
        console.error(`❌ Table [${t.name}]: FAILED ->`, error.message);
      } else {
        console.log(`✓ Table [${t.name}]: OK (all requested columns verified)`);
      }
    } catch (e) {
      console.error(`❌ Table [${t.name}]: Exception ->`, e.message);
    }
  }

  // Check RPCs
  console.log("\n=== RPC FUNCTIONS STATUS CHECK ===");
  try {
    const { data: rpcData, error: rpcErr } = await sb.rpc('search_documents_fts', {
      query_text: 'test',
      match_tenant_id: '00000000-0000-0000-0000-000000000000',
      match_count: 1
    });
    if (rpcErr && !rpcErr.message.includes('00000000')) {
      console.error('❌ RPC search_documents_fts:', rpcErr.message);
    } else {
      console.log('✓ RPC search_documents_fts: OK');
    }
  } catch (e) {
    console.error('❌ RPC search_documents_fts exception:', e.message);
  }

  try {
    const mockVec = Array(768).fill(0.01);
    const { data: rrfData, error: rrfErr } = await sb.rpc('match_documents_hybrid', {
      query_text: 'test',
      query_embedding: mockVec,
      match_tenant_id: '00000000-0000-0000-0000-000000000000',
      match_count: 1
    });
    if (rrfErr && !rrfErr.message.includes('00000000')) {
      console.error('❌ RPC match_documents_hybrid:', rrfErr.message);
    } else {
      console.log('✓ RPC match_documents_hybrid: OK');
    }
  } catch (e) {
    console.error('❌ RPC match_documents_hybrid exception:', e.message);
  }

  console.log("\nSupabase check finished.");
}

verifySupabase();
