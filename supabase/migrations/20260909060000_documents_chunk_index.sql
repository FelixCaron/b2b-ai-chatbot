-- ---------------------------------------------------------------------------
-- Put a page's chunks back in the order they were written.
--
-- A page (or an owner's Additional Information) is stored as several rows in
-- `documents`, and nothing recorded which row came first. Readers ordered by
-- created_at — but every chunk of one save is written in a single INSERT, so
-- they all carry the *same* now(): a complete tie, and Postgres is free to
-- return a tie in any order, which changes as rows are rewritten.
--
-- That was not just a display quirk. The Additional Information flow reads
-- its chunks back, joins them, and rewrites the whole document (the owner
-- appending one more answer, api/crawler/update.js deleting and re-inserting)
-- — so a scrambled read got saved back as the new true order, and the
-- owner's text degraded a little more with every answer they added.
--
-- chunk_index is that missing order. Existing rows keep NULL: their original
-- order is genuinely unrecoverable, so readers sort NULLs last and fall back
-- to (created_at, id) — arbitrary, but at least *stable* — and any re-save of
-- a page repopulates it properly, so old rows heal the first time they are
-- touched.
-- ---------------------------------------------------------------------------

ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS chunk_index INTEGER;

-- The one read this exists for: "every chunk of this page, in order".
CREATE INDEX IF NOT EXISTS documents_site_url_chunk_idx
    ON public.documents (site_id, url, chunk_index);
