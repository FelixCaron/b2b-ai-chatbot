-- ---------------------------------------------------------------------------
-- Closing the loop on an unanswered question.
--
-- missing_info (20260909020000) tells an owner exactly what their site didn't
-- cover, but there was no way to say "handled". The count of unanswered
-- questions on the dashboard was therefore permanent: it could only ever go
-- up, whether or not the owner had already written the missing content,
-- decided the question was out of scope, or answered it in the knowledge base
-- by hand. A number that never goes down stops being read.
--
-- Two ways to resolve one, both explicit:
--   'added'   — the owner supplied the missing information (it is now in the
--               site's Additional Information knowledge, see
--               apps/admin/src/lib/knowledge-notes.js), so the assistant can
--               answer this next time.
--   'ignored' — out of scope, spam, or a question the owner doesn't want to
--               answer. Not a gap to keep reporting.
--
-- NULL means unresolved, which is what every existing row is: no backfill,
-- and nothing is retroactively declared handled.
-- ---------------------------------------------------------------------------

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS missing_info_status TEXT;

DO $$
BEGIN
  ALTER TABLE public.messages
      ADD CONSTRAINT messages_missing_info_status_values
      CHECK (missing_info_status IS NULL OR missing_info_status IN ('added', 'ignored'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The dashboard's "questions unanswered" figure is exactly this set: flagged
-- and not yet resolved. Partial index so that count stays cheap as history
-- grows and as resolved rows accumulate.
CREATE INDEX IF NOT EXISTS idx_messages_unresolved_gaps
    ON public.messages(tenant_id)
    WHERE answer_status IN ('no_match', 'failed') AND missing_info_status IS NULL;
