-- =============================================================================
-- MIGRATION: 20260905000000_consolidated_schema.sql
-- PURPOSE  : Single, final-state schema migration replacing the 9 incremental
--            migrations that built up between 2026-08-08 and 2026-08-25 (init
--            schema, multilingual FTS, Stripe billing, site summaries,
--            integrations, the complete-schema catch-up, tenant ownership +
--            strict RLS, and atomic site delete). Those files are removed —
--            this one is a straight merge of their net effect, verified
--            statement-by-statement against the originals, not a schema
--            redesign. It also folds in what was previously
--            `supabase/consolidated_latest_migrations.sql` (a partial, stale
--            hand-rolled consolidation) and adds the one thing that file was
--            still missing: `delete_site_cascade`.
--
--            This is a RESET migration, not an upgrade path: it goes straight
--            to the final RLS policies instead of replaying the historical
--            "allow all" -> "tenant owner" transition. Point an EXISTING
--            database at this by resetting it first (`supabase db reset`, or
--            drop and recreate the database) — do not run this against a
--            database that already has the old migrations applied under
--            their original names, since the migration history won't match.
--
--            Idempotent: every statement uses IF NOT EXISTS / CREATE OR
--            REPLACE / DROP POLICY IF EXISTS, so it is also safe to re-run.
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
    owner_user_id           UUID        REFERENCES auth.users(id) ON DELETE RESTRICT,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    plan                    TEXT        DEFAULT 'free',
    plan_status             TEXT        DEFAULT 'free',
    plan_expires_at         TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN tenants.plan IS 'Current subscription plan: basic, pro, premium';
COMMENT ON COLUMN tenants.plan_status IS 'Stripe subscription status: free, active, trialing, canceled, past_due';
COMMENT ON COLUMN tenants.stripe_customer_id IS 'Stripe Customer ID (cus_...)';
COMMENT ON COLUMN tenants.stripe_subscription_id IS 'Stripe Subscription ID (sub_...)';
COMMENT ON COLUMN tenants.plan_expires_at IS 'UTC timestamp of when the current billing period ends';

CREATE INDEX IF NOT EXISTS tenants_stripe_customer_id_idx ON tenants(stripe_customer_id);
CREATE INDEX IF NOT EXISTS tenants_owner_user_id_idx ON tenants(owner_user_id);

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

COMMENT ON COLUMN sites.support_email IS 'Email address to receive support requests from the chatbot';
COMMENT ON COLUMN sites.calendar_link IS 'Booking link (Calendly, Cal.com…) provided by the chatbot for appointments';
COMMENT ON COLUMN sites.bot_goal IS 'lead | support';
COMMENT ON COLUMN sites.bot_tone IS 'amical | professionnel';

-- ---------------------------------------------------------------------------
-- 3. DOCUMENTS (knowledge base chunks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        REFERENCES tenants(id) ON DELETE CASCADE,
    site_id     UUID        REFERENCES sites(id)   ON DELETE CASCADE,
    url         TEXT        NOT NULL,
    content     TEXT        NOT NULL,
    metadata    JSONB       DEFAULT '{}'::jsonb,
    embedding   vector(768),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- French + English full-text search (generated columns, bilingual support)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (to_tsvector('french', content)) STORED;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fts_en tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx ON documents USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS fts_idx    ON documents USING GIN (fts);
CREATE INDEX IF NOT EXISTS fts_en_idx ON documents USING GIN (fts_en);

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

-- ---------------------------------------------------------------------------
-- 6. USAGE (atomic message/lead counters, one row per tenant, all-time)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage (
    tenant_id       UUID    PRIMARY KEY REFERENCES tenants(id),
    messages_count  INT     DEFAULT 0,
    leads_count     INT     DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 7. SITE SUMMARIES (AI-generated business overview used as RAG context)
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

-- ---------------------------------------------------------------------------
-- 8. USAGE COUNTERS (daily quota tracking, per tenant per day)
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

-- ---------------------------------------------------------------------------
-- 9. SCAN JOBS (crawler tracking & audit)
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

-- ---------------------------------------------------------------------------
-- 10. PGMQ QUEUE + wrapper RPCs (PostgREST cannot call the pgmq schema directly)
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
-- 11. USAGE RPCS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_usage(target_tenant_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO usage (tenant_id, messages_count, leads_count, updated_at)
  VALUES (target_tenant_id, 1, 0, NOW())
  ON CONFLICT (tenant_id)
  DO UPDATE SET messages_count = usage.messages_count + 1, updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_lead_usage(target_tenant_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO usage (tenant_id, messages_count, leads_count, updated_at)
  VALUES (target_tenant_id, 0, 1, NOW())
  ON CONFLICT (tenant_id)
  DO UPDATE SET leads_count = usage.leads_count + 1, updated_at = NOW();
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. SEARCH RPCS (hybrid semantic + bilingual full-text, RRF-ranked)
-- ---------------------------------------------------------------------------
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
-- 13. TENANT OWNERSHIP HELPER (used by every RLS policy below)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_owns_tenant(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = target_tenant_id AND owner_user_id = auth.uid()
  );
$$;

-- TEXT overload: some call sites compare tenant_id as text
CREATE OR REPLACE FUNCTION public.current_user_owns_tenant(target_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id::text = target_tenant_id AND owner_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_owns_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_owns_tenant(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_owns_tenant(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_owns_tenant(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 14. ATOMIC, OWNERSHIP-CHECKED CASCADE DELETE FOR SITES
--     Runs the whole delete in one transaction inside a SECURITY DEFINER
--     function, so a failure partway through rolls back instead of leaving
--     orphaned rows. usage_counters is intentionally NOT touched here — it's
--     a tenant-level daily aggregate with no site_id column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_site_cascade(p_site_id UUID, p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_exists BOOLEAN;
  v_documents_deleted INT;
  v_summaries_deleted INT;
  v_leads_deleted INT;
  v_scan_jobs_deleted INT;
BEGIN
  IF p_site_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'delete_site_cascade requires both site_id and tenant_id';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.sites WHERE id = p_site_id AND tenant_id = p_tenant_id
  ) INTO v_site_exists;

  IF NOT v_site_exists THEN
    RAISE EXCEPTION 'Site % not found for tenant %', p_site_id, p_tenant_id;
  END IF;

  WITH deleted AS (DELETE FROM public.documents WHERE site_id = p_site_id RETURNING 1)
    SELECT count(*) INTO v_documents_deleted FROM deleted;

  WITH deleted AS (DELETE FROM public.site_summaries WHERE site_id = p_site_id RETURNING 1)
    SELECT count(*) INTO v_summaries_deleted FROM deleted;

  WITH deleted AS (DELETE FROM public.leads WHERE site_id = p_site_id RETURNING 1)
    SELECT count(*) INTO v_leads_deleted FROM deleted;

  WITH deleted AS (DELETE FROM public.scan_jobs WHERE site_id = p_site_id RETURNING 1)
    SELECT count(*) INTO v_scan_jobs_deleted FROM deleted;

  DELETE FROM public.sites WHERE id = p_site_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'site_id', p_site_id,
    'tenant_id', p_tenant_id,
    'documents_deleted', v_documents_deleted,
    'site_summaries_deleted', v_summaries_deleted,
    'leads_deleted', v_leads_deleted,
    'scan_jobs_deleted', v_scan_jobs_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_site_cascade(UUID, UUID) FROM PUBLIC;
-- Granted to anon/authenticated because guest (anonymous-auth) tenants must be
-- able to delete their own sites too; the API route always verifies tenant
-- ownership (requireSiteOwnership) before calling this function, and the
-- function re-checks ownership itself.
GRANT EXECUTE ON FUNCTION public.delete_site_cascade(UUID, UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 15. ROW LEVEL SECURITY — strict per-tenant isolation on every tenant table
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_jobs      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant owner access" ON public.tenants;
CREATE POLICY "Tenant owner access" ON public.tenants
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Tenant owner access" ON public.sites;
CREATE POLICY "Tenant owner access" ON public.sites
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Tenant owner access" ON public.documents;
CREATE POLICY "Tenant owner access" ON public.documents
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Tenant owner access" ON public.messages;
CREATE POLICY "Tenant owner access" ON public.messages
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Tenant owner access" ON public.leads;
CREATE POLICY "Tenant owner access" ON public.leads
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Tenant owner access" ON public.usage;
CREATE POLICY "Tenant owner access" ON public.usage
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Tenant owner access" ON public.site_summaries;
CREATE POLICY "Tenant owner access" ON public.site_summaries
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Tenant owner access" ON public.usage_counters;
CREATE POLICY "Tenant owner access" ON public.usage_counters
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Tenant owner access" ON public.scan_jobs;
CREATE POLICY "Tenant owner access" ON public.scan_jobs
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- 16. INTERNAL SCHEMA — staff-only, cross-tenant access for apps/internal-admin
--
--     This schema is deliberately NOT listed in supabase/config.toml's
--     [api].schemas (which stays ["public", "graphql_public"]), so nothing in
--     it is reachable through the PostgREST Data API at all — not via anon
--     key, not via an authenticated user's JWT, regardless of grants or RLS.
--     That's a stronger guarantee than "RLS in public and hope the policy is
--     right": a bug in the tenant-isolation policies above (section 15) has
--     no path to this data, because the access mechanism is entirely
--     different. RLS is still enabled here too, with zero policies (deny-all)
--     as defense-in-depth — only the service-role key (used exclusively in
--     server-side API code, same as everywhere else in this product) can
--     read this table.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS internal;

CREATE TABLE IF NOT EXISTS internal.staff_admins (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    added_by    TEXT
);

ALTER TABLE internal.staff_admins ENABLE ROW LEVEL SECURITY;
-- No policies created on purpose: with RLS enabled and zero policies, every
-- role except the RLS-bypassing service role is denied by default.

-- Best-effort seed: grants staff access to whichever of these accounts
-- already exist in auth.users, matched by email. Safe to re-run — ON
-- CONFLICT DO NOTHING means it never duplicates or overwrites a manual grant.
-- Add more addresses here (or insert directly into internal.staff_admins)
-- as the internal team grows.
INSERT INTO internal.staff_admins (user_id, email, added_by)
SELECT id, email, 'seed:20260905000000_consolidated_schema'
FROM auth.users
WHERE lower(email) IN ('caron.felix2@gmail.com')
ON CONFLICT (user_id) DO NOTHING;

-- Bridge RPC: because `internal` is not in the PostgREST-exposed schema list,
-- supabase-js cannot query internal.staff_admins directly even with the
-- service-role key — PostgREST simply has no route for it, by config, not by
-- permission. This function lives in `public` (which IS exposed) purely so
-- server-side code can ask "is this user staff?" over the normal REST/RPC
-- path, without ever exposing the staff_admins table itself as a queryable
-- resource. Execute is restricted to service_role only — never granted to
-- anon/authenticated — so this is unreachable from any tenant-facing or
-- guest session even by calling the RPC directly.
CREATE OR REPLACE FUNCTION public.is_staff_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = internal, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM internal.staff_admins WHERE user_id = check_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff_admin(UUID) TO service_role;
