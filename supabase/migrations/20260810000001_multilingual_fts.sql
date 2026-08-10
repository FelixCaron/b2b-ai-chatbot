-- Migration: 20260810000001_multilingual_fts.sql
-- Add English FTS column + update hybrid search to support bilingual content
-- Safe to apply on production: only ADDs columns and replaces functions (no data loss)

-- Add English FTS column (generated, like the existing French one)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fts_en tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Index the new English FTS column
CREATE INDEX IF NOT EXISTS fts_en_idx ON documents USING GIN (fts_en);

-- Update Hybrid Search RPC to use BOTH French and English FTS
-- This handles bilingual sites (e.g. delafontaine.ca in English, or any French site)
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
        FROM documents WHERE documents.tenant_id::text = match_tenant_id::text
        ORDER BY documents.embedding <=> query_embedding LIMIT 100
    ),
    keyword_search AS (
        -- Search in BOTH French and English FTS columns, take the best rank
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
        ) DESC LIMIT 100
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

-- Also add a simpler bilingual FTS function for the chat.js fallback (no embeddings needed)
CREATE OR REPLACE FUNCTION search_documents_fts(
    query_text TEXT,
    match_tenant_id UUID,
    match_count INT DEFAULT 5
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
