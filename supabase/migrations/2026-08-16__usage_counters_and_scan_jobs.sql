-- usage_counters: simple daily usage summary
CREATE TABLE IF NOT EXISTS usage_counters (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) ON DELETE CASCADE,
  usage_date date not null,
  messages_count integer default 0 not null,
  scans_count integer default 0 not null,
  created_at timestamptz default now()
);
CREATE UNIQUE INDEX IF NOT EXISTS usage_counters_tenant_date_uq ON usage_counters (tenant_id, usage_date);

-- scan_jobs: record scan jobs for quotas & audit
CREATE TABLE IF NOT EXISTS scan_jobs (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) ON DELETE CASCADE,
  site_id uuid,
  url text not null,
  status text not null default 'queued', -- queued, running, failed, done
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
CREATE INDEX IF NOT EXISTS scan_jobs_tenant_idx ON scan_jobs (tenant_id);
