-- =============================================================================
-- MIGRATION: 20260819000001_complete_schema_catchup.sql
-- PURPOSE : Idempotent catch-up migration — brings any Supabase instance fully
--           up to date with the complete schema expected by the application.
--           Safe to run multiple times (all statements use IF NOT EXISTS /
--           CREATE OR REPLACE / ALTER … ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgmq CASCADE;

-- ---------------------------------------------------------------------------
-- 1. TENANTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    TEXT        NOT NULL,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    plan                    TEXT        DEFAULT 'free',
    plan_status             TEXT        DEFAULT 'free',
    plan_expires_at         TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure new columns exist on older instances
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_status             TEXT DEFAULT 'free';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at         TIMESTAMPTZ;

ALTER TABLE tenants ALTER COLUMN plan SET DEFAULT 'free';

CREATE INDEX IF NOT EXISTS tenants_stripe_customer_id_idx ON tenants(stripe_customer_id);

-- RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on tenants" ON tenants;
CREATE POLICY "Allow all on tenants" ON tenants FOR ALL USING (true);

-- ---------------------------------------------------------------------------
-- 2. SITES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sites (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID        REFERENCES tenants(id) ON DELETE CASCADE,
    domain              TEXT        NOT NULL,
    public_key          UUID        DEFAULT gen_random_uuid() UNIQUE,
    enable_lead_capture BOOLEAN     DEFAULT FALSE,
    theme_primary_color TEXT        DEFAULT '#6366f1',
    bot_goal            TEXT        DEFAULT 'support',
    bot_tone            TEXT        DEFAULT 'professionnel',
    support_email       TEXT,
    calendar_link       TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all optional columns exist
ALTER TABLE sites ADD COLUMN IF NOT EXISTS enable_lead_capture BOOLEAN     DEFAULT FALSE;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS theme_primary_color TEXT        DEFAULT '#6366f1';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS bot_goal            TEXT        DEFAULT 'support';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS bot_tone            TEXT        DEFAULT 'professionnel';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS support_email       TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS calendar_link       TEXT;

COMMENT ON COLUMN sites.support_email  IS 'Email address to receive support requests from the chatbot';
COMMENT ON COLUMN sites.calendar_link  IS 'Booking link (Calendly, Cal.com…) provided by the chatbot for appointments';
COMMENT ON COLUMN sites.bot_goal       IS 'lead | support';
COMMENT ON COLUMN sites.bot_tone       IS 'amical | professionnel';

-- RLS
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on sites" ON sites;
CREATE POLICY "Allow all on sites" ON sites FOR ALL USING (true);

-- ---------------------------------------------------------------------------
-- 3. DOCUMENTS  (knowledge base chunks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        REFERENCES tenants(id) ON DELETE CASCADE,
    site_id     UUID        REFERENCES sites(id)   ON DELETE CASCADE,
    url         TEXT        NOT NULL,
    content     TEXT        NOT NULL,
    metadata    JSONB       DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Vector & FTS columns
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata  JSONB DEFAULT '{}'::jsonb;

-- French FTS (generated)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (to_tsvector('french', content)) STORED;

-- English FTS (generated) — bilingual support
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fts_en tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Indexes
CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx ON documents USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS fts_idx    ON documents USING GIN (fts);
CREATE INDEX IF NOT EXISTS fts_en_idx ON documents USING GIN (fts_en);

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on documents" ON documents;
CREATE POLICY "Allow all on documents" ON documents FOR ALL USING (true);

-- ---------------------------------------------------------------------------
-- 4. MESSAGES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        REFERENCES tenants(id),
    session_id  TEXT        NOT NULL,
    role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on messages" ON messages;
CREATE POLICY "Allow all on messages" ON messages FOR ALL USING (true);

-- ---------------------------------------------------------------------------
-- 5. LEADS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        REFERENCES tenants(id),
    site_id     UUID        REFERENCES sites(id) ON DELETE CASCADE,
    name        TEXT,
    email       TEXT,
    phone       TEXT,
    summary     TEXT,
    metadata    JSONB       DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure new columns exist on older instances
ALTER TABLE leads ADD COLUMN IF NOT EXISTS site_id  UUID  REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS summary  TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on leads" ON leads;
CREATE POLICY "Allow all on leads" ON leads FOR ALL USING (true);

-- ---------------------------------------------------------------------------
-- 6. USAGE  (atomic message/lead counters)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage (
    tenant_id       UUID    PRIMARY KEY REFERENCES tenants(id),
    messages_count  INT     DEFAULT 0,
    leads_count     INT     DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on usage" ON usage;
CREATE POLICY "Allow all on usage" ON usage FOR ALL USING (true);

-- ---------------------------------------------------------------------------
-- 7. SITE SUMMARIES  (AI-generated business overview for RAG context)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_summaries (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id     UUID        NOT NULL REFERENCES sites(id)   ON DELETE CASCADE,
    summary     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT site_summaries_tenant_site_unique UNIQUE (tenant_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_site_summaries_site_id   ON site_summaries(site_id);
CREATE INDEX IF NOT EXISTS idx_site_summaries_tenant_id ON site_summaries(tenant_id);

-- RLS
ALTER TABLE site_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on site_summaries" ON site_summaries;
CREATE POLICY "Allow all on site_summaries" ON site_summaries FOR ALL USING (true);

-- ---------------------------------------------------------------------------
-- 8. USAGE COUNTERS  (daily quota tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_counters (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    usage_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
    messages_count  INTEGER     DEFAULT 0 NOT NULL,
    scans_count     INTEGER     DEFAULT 0 NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_counters_tenant_date_uq ON usage_counters (tenant_id, usage_date);

-- RLS
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on usage_counters" ON usage_counters;
CREATE POLICY "Allow all on usage_counters" ON usage_counters FOR ALL USING (true);

-- ---------------------------------------------------------------------------
-- 9. SCAN JOBS  (crawler tracking & audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scan_jobs (
    id                  BIGSERIAL   PRIMARY KEY,
    tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id             UUID        REFERENCES sites(id) ON DELETE CASCADE,
    url                 TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'queued', -- queued | running | failed | done
    pages_discovered    INTEGER     DEFAULT 0,
    pages_indexed       INTEGER     DEFAULT 0,
    error_message       TEXT,
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scan_jobs_tenant_idx ON scan_jobs (tenant_id);

-- RLS
ALTER TABLE scan_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on scan_jobs" ON scan_jobs;
CREATE POLICY "Allow all on scan_jobs" ON scan_jobs FOR ALL USING (true);

-- ---------------------------------------------------------------------------
-- 10. PGMQ QUEUE
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pgmq.meta WHERE queue_name = 'ingestion_queue'
    ) THEN
        PERFORM pgmq.create('ingestion_queue');
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pgmq_send(queue_name text, msg jsonb)
RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pgmq.send(queue_name, msg);
$$;

CREATE OR REPLACE FUNCTION public.pgmq_read(queue_name text, vt integer, qty integer)
RETURNS TABLE (msg_id bigint, read_ct integer, enqueued_at timestamp with time zone, vt timestamp with time zone, message jsonb)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT msg_id, read_ct, enqueued_at, vt, message FROM pgmq.read(queue_name, vt, qty);
$$;

CREATE OR REPLACE FUNCTION public.pgmq_delete(queue_name text, msg_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pgmq.delete(queue_name, msg_id);
$$;

-- ---------------------------------------------------------------------------
-- 11. RPC FUNCTIONS
-- ---------------------------------------------------------------------------

-- Increment message usage counter
CREATE OR REPLACE FUNCTION public.increment_usage(target_tenant_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO usage (tenant_id, messages_count, leads_count, updated_at)
  VALUES (target_tenant_id, 1, 0, NOW())
  ON CONFLICT (tenant_id)
  DO UPDATE SET messages_count = usage.messages_count + 1, updated_at = NOW();
END;
$$;

-- Increment lead usage counter
CREATE OR REPLACE FUNCTION public.increment_lead_usage(target_tenant_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO usage (tenant_id, messages_count, leads_count, updated_at)
  VALUES (target_tenant_id, 0, 1, NOW())
  ON CONFLICT (tenant_id)
  DO UPDATE SET leads_count = usage.leads_count + 1, updated_at = NOW();
END;
$$;

-- Hybrid semantic + full-text search (Reciprocal Rank Fusion)
CREATE OR REPLACE FUNCTION match_documents_hybrid(
    query_text        TEXT,
    query_embedding   vector(768),
    match_tenant_id   UUID,
    match_count       INT     DEFAULT 5,
    full_text_weight  FLOAT   DEFAULT 1.0,
    semantic_weight   FLOAT   DEFAULT 1.0,
    rrf_k             INT     DEFAULT 60
) RETURNS TABLE (id UUID, content TEXT, url TEXT) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH semantic_search AS (
        SELECT documents.id,
               RANK() OVER (ORDER BY documents.embedding <=> query_embedding) AS rank
        FROM documents
        WHERE documents.tenant_id::text = match_tenant_id::text
        ORDER BY documents.embedding <=> query_embedding
        LIMIT 100
    ),
    keyword_search AS (
        SELECT documents.id,
               RANK() OVER (
                 ORDER BY GREATEST(
                   ts_rank_cd(documents.fts,    plainto_tsquery('french',  query_text)),
                   ts_rank_cd(documents.fts_en, plainto_tsquery('english', query_text))
                 ) DESC
               ) AS rank
        FROM documents
        WHERE documents.tenant_id::text = match_tenant_id::text
          AND (
            documents.fts    @@ plainto_tsquery('french',  query_text)
            OR
            documents.fts_en @@ plainto_tsquery('english', query_text)
          )
        ORDER BY GREATEST(
          ts_rank_cd(documents.fts,    plainto_tsquery('french',  query_text)),
          ts_rank_cd(documents.fts_en, plainto_tsquery('english', query_text))
        ) DESC
        LIMIT 100
    )
    SELECT d.id, d.content, d.url
    FROM documents d
    JOIN (
        SELECT
            COALESCE(s.id, k.id) AS id,
            (COALESCE(semantic_weight / (rrf_k + s.rank), 0.0) +
             COALESCE(full_text_weight / (rrf_k + k.rank), 0.0)) AS score
        FROM semantic_search s
        FULL OUTER JOIN keyword_search k ON s.id = k.id
    ) ranked ON ranked.id = d.id
    ORDER BY ranked.score DESC
    LIMIT match_count;
END;
$$;

-- Bilingual FTS-only search (fallback when no embedding available)
CREATE OR REPLACE FUNCTION search_documents_fts(
    query_text      TEXT,
    match_tenant_id UUID,
    match_count     INT DEFAULT 5
) RETURNS TABLE (id UUID, content TEXT, url TEXT, rank FLOAT) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.content,
        d.url,
        GREATEST(
          ts_rank_cd(d.fts,    plainto_tsquery('french',  query_text)),
          ts_rank_cd(d.fts_en, plainto_tsquery('english', query_text))
        )::FLOAT AS rank
    FROM documents d
    WHERE d.tenant_id::text = match_tenant_id::text
      AND (
        d.fts    @@ plainto_tsquery('french',  query_text)
        OR
        d.fts_en @@ plainto_tsquery('english', query_text)
      )
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS tenants_owner_user_id_idx ON public.tenants(owner_user_id);

CREATE OR REPLACE FUNCTION public.current_user_owns_tenant(target_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = target_tenant_id AND owner_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_owns_tenant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_owns_tenant(UUID) TO anon, authenticated;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenant owner access" ON public.tenants;
CREATE POLICY "Tenant owner access" ON public.tenants FOR ALL TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Allow all on sites" ON public.sites;
DROP POLICY IF EXISTS "Tenant owner access" ON public.sites;
CREATE POLICY "Tenant owner access" ON public.sites FOR ALL TO authenticated USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on documents" ON public.documents;
DROP POLICY IF EXISTS "Tenant owner access" ON public.documents;
CREATE POLICY "Tenant owner access" ON public.documents FOR ALL TO authenticated USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on messages" ON public.messages;
DROP POLICY IF EXISTS "Tenant owner access" ON public.messages;
CREATE POLICY "Tenant owner access" ON public.messages FOR ALL TO authenticated USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on leads" ON public.leads;
DROP POLICY IF EXISTS "Tenant owner access" ON public.leads;
CREATE POLICY "Tenant owner access" ON public.leads FOR ALL TO authenticated USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on usage" ON public.usage;
DROP POLICY IF EXISTS "Tenant owner access" ON public.usage;
CREATE POLICY "Tenant owner access" ON public.usage FOR ALL TO authenticated USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on site_summaries" ON public.site_summaries;
DROP POLICY IF EXISTS "Tenant owner access" ON public.site_summaries;
CREATE POLICY "Tenant owner access" ON public.site_summaries FOR ALL TO authenticated USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on usage_counters" ON public.usage_counters;
DROP POLICY IF EXISTS "Tenant owner access" ON public.usage_counters;
CREATE POLICY "Tenant owner access" ON public.usage_counters FOR ALL TO authenticated USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on scan_jobs" ON public.scan_jobs;
DROP POLICY IF EXISTS "Tenant owner access" ON public.scan_jobs;
CREATE POLICY "Tenant owner access" ON public.scan_jobs FOR ALL TO authenticated USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));
