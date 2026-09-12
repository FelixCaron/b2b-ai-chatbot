-- ===========================================================================
-- Backfill documents.created_at
-- ===========================================================================
-- The same hole as 20260907010000_backfill_sites_optional_columns, one table
-- over. 20260905000000_consolidated_schema.sql declares `documents` with
-- CREATE TABLE IF NOT EXISTS ... created_at TIMESTAMPTZ DEFAULT NOW(), but
-- production's `documents` predates that migration (it was created before the
-- migrations existed), so the statement silently no-opped and the column never
-- reached the live table. Probing the live schema through PostgREST:
--
--   id ✓  tenant_id ✓  site_id ✓  url ✓  content ✓  metadata ✓  embedding ✓
--   chunk_index ✓  created_at ✗
--
-- What it broke, for every customer, permanently: both client reads of a
-- document's chunks (the Additional Information box and the page editor) sort
-- by created_at, and PostgREST answers a missing column by failing the WHOLE
-- query with 42703 — the SELECT included. So the box could never load its own
-- content and said "could not read what you saved here" to everyone, forever.
-- The retry added in apps/admin/src/lib/db-retry.js only dropped chunk_index,
-- because chunk_index was the column we suspected; created_at was missing too,
-- and the fallback query named it as well, so both attempts failed.
--
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS is a no-op wherever the consolidated
-- CREATE TABLE did reach the table, and — unlike that statement — actually
-- lands on one that predates it.
--
-- Existing rows: Postgres fills them with the DEFAULT (one timestamp, evaluated
-- once, no table rewrite on PG11+). That timestamp is "when this migration
-- ran", not when the chunk was written — genuinely unrecoverable — but it is a
-- stable, non-null ordering key, which is all any reader asks of it. Chunk
-- order itself comes from chunk_index (migration 20260909060000), which those
-- rows do carry once anything re-saves them.
-- ===========================================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Rows that somehow arrived with a NULL (a column added in an older Postgres,
-- or inserted while the default was absent) get one now, so ordering never has
-- to reason about NULLs.
UPDATE public.documents SET created_at = NOW() WHERE created_at IS NULL;

COMMENT ON COLUMN public.documents.created_at IS
  'When the chunk was written. Backfilled 12 Sep 2026 for rows that predate the column; use chunk_index for a page''s internal chunk order, not this.';
