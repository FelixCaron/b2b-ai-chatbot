-- ---------------------------------------------------------------------------
-- Record whether the assistant could actually answer.
--
-- The product's whole promise is that the assistant knows the business, and
-- until now nothing anywhere recorded when it didn't. An owner could read a
-- transcript and see a weak answer, but there was no way to ask "which
-- questions are we failing?" — which is the question that tells them what
-- content to add.
--
-- This is written from evidence the agentic loop already has, not from a
-- second LLM call grading the first:
--
--   answered  the reply was produced normally, and either no knowledge-base
--             search was needed (a greeting, a thank-you) or at least one
--             search came back with documents.
--   no_match  every search the loop ran returned nothing. The assistant still
--             replied — from the business summary, or by saying it didn't
--             know — but the site had no content on the subject. This is the
--             content gap an owner can act on.
--   failed    the loop hit its turn limit without producing a reply, or the
--             model errored and the visitor got a fallback string.
--
-- NULL means "not recorded": every message written before this migration, and
-- every visitor message (only assistant rows carry a status).
-- ---------------------------------------------------------------------------

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS answer_status TEXT;

DO $$
BEGIN
  ALTER TABLE public.messages
      ADD CONSTRAINT messages_answer_status_check
      CHECK (
        answer_status IS NULL
        OR (role = 'assistant' AND answer_status IN ('answered', 'no_match', 'failed'))
      );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The Conversations view's "needs attention" filter: a tenant's unanswered
-- messages, newest first. Partial, because the rows worth finding are the
-- rare ones — an index over every 'answered' row would be mostly dead weight.
CREATE INDEX IF NOT EXISTS messages_tenant_unanswered_idx
    ON public.messages (tenant_id, created_at DESC)
    WHERE answer_status IN ('no_match', 'failed');
