-- Migration: 20260808000003_fix_rrf_cast.sql

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
        SELECT documents.id, RANK() OVER (ORDER BY ts_rank_cd(documents.fts, websearch_to_tsquery('french', query_text)) DESC) AS rank
        FROM documents WHERE documents.tenant_id::text = match_tenant_id::text AND documents.fts @@ websearch_to_tsquery('french', query_text)
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
