import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

globalThis.WebSocket = WebSocket;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function testSql() {
  const sqlCommands = [
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;`,
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'active';`,
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id);`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS metadata JSONB;`,
    `CREATE TABLE IF NOT EXISTS site_summaries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, site_id)
    );`,
    `CREATE TABLE IF NOT EXISTS usage_counters (
      id bigserial primary key,
      tenant_id uuid not null references tenants(id) ON DELETE CASCADE,
      usage_date date not null,
      messages_count integer default 0 not null,
      scans_count integer default 0 not null,
      created_at timestamptz default now()
    );`,
    `CREATE TABLE IF NOT EXISTS scan_jobs (
      id bigserial primary key,
      tenant_id uuid not null references tenants(id) ON DELETE CASCADE,
      site_id uuid,
      url text not null,
      status text not null default 'queued',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );`
  ];

  // Try RPC sql/exec/exec_sql
  for (const rpcName of ['exec_sql', 'execute_sql', 'sql', 'run_sql']) {
    try {
      const { data, error } = await sb.rpc(rpcName, { sql: sqlCommands[0] });
      if (!error) {
        console.log(`RPC ${rpcName} works!`);
      } else {
        console.log(`RPC ${rpcName}: ${error.message}`);
      }
    } catch (e) {
      console.log(`RPC ${rpcName} ex: ${e.message}`);
    }
  }
}

testSql();
