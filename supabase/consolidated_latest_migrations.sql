-- ==============================================================================
-- CONSOLIDATED SUPABASE SCHEMA UPDATE (2026-08-16)
-- Run this in the Supabase Cloud SQL Editor to bring your schema 100% up to date.
-- ==============================================================================

-- 1. Tenants Subscription & Status Columns
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- 2. Leads Scoped Columns
ALTER TABLE leads ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 3. Site Summaries Table (ADR 013: AI Business Overview Context)
CREATE TABLE IF NOT EXISTS site_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, site_id)
);
ALTER TABLE site_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on site_summaries" ON site_summaries;
CREATE POLICY "Allow all on site_summaries" ON site_summaries FOR ALL USING (true);

-- 4. Usage Counters Table (Daily Quotas & Audit)
CREATE TABLE IF NOT EXISTS usage_counters (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  messages_count INTEGER DEFAULT 0 NOT NULL,
  scans_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS usage_counters_tenant_date_uq ON usage_counters (tenant_id, usage_date);
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on usage_counters" ON usage_counters;
CREATE POLICY "Allow all on usage_counters" ON usage_counters FOR ALL USING (true);

-- 5. Scan Jobs Table (Crawler Tracking & Logs)
CREATE TABLE IF NOT EXISTS scan_jobs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, running, failed, done
  pages_discovered INTEGER DEFAULT 0,
  pages_indexed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS scan_jobs_tenant_idx ON scan_jobs (tenant_id);
ALTER TABLE scan_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on scan_jobs" ON scan_jobs;
CREATE POLICY "Allow all on scan_jobs" ON scan_jobs FOR ALL USING (true);
