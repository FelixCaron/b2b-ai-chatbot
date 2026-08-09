-- Migration: 20260808000000_init_schema.sql
-- Extensions required
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgmq CASCADE;

-- TENANTS & SITES
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    stripe_customer_id TEXT,
    plan TEXT DEFAULT 'free',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    domain TEXT NOT NULL, -- e.g., 'example.com'
    public_key UUID DEFAULT gen_random_uuid() UNIQUE, -- Used by Widget
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- KNOWLEDGE BASE (Documents & Chunks)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (to_tsvector('french', content)) STORED;

CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx ON documents USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS fts_idx ON documents USING GIN (fts);

-- USAGE & BILLING (Atomic tracking)
CREATE TABLE IF NOT EXISTS usage (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
    messages_count INT DEFAULT 0,
    leads_count INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSATIONS & LEADS
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    name TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies (STRICT ISOLATION)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Hybrid Search RPC (Reciprocal Rank Fusion - RRF)
CREATE OR REPLACE FUNCTION match_documents_hybrid(
    query_text TEXT,
    query_embedding vector(768),
    match_tenant_id UUID,
    match_count INT DEFAULT 5,
    full_text_weight FLOAT DEFAULT 1.0,
    semantic_weight FLOAT DEFAULT 1.0,
    rrf_k INT DEFAULT 60
) RETURNS TABLE (id UUID, content TEXT, url TEXT) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH semantic_search AS (
        SELECT documents.id, RANK() OVER (ORDER BY documents.embedding <=> query_embedding) AS rank
        FROM documents WHERE tenant_id = match_tenant_id
        ORDER BY documents.embedding <=> query_embedding LIMIT 100
    ),
    keyword_search AS (
        SELECT documents.id, RANK() OVER (ORDER BY ts_rank_cd(documents.fts, websearch_to_tsquery('french', query_text)) DESC) AS rank
        FROM documents WHERE tenant_id = match_tenant_id AND documents.fts @@ websearch_to_tsquery('french', query_text)
        ORDER BY ts_rank_cd(documents.fts, websearch_to_tsquery('french', query_text)) DESC LIMIT 100
    )
    SELECT
        d.id, d.content, d.url
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
