-- Migration: 20260808000002_fix_schema_and_rpc.sql

-- 1. Ensure site_id column exists on documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

-- 2. Update Hybrid Search RPC function
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

-- 3. Public RPC wrappers for PGMQ Queue operations
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
