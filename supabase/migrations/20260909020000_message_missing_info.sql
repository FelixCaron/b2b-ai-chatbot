-- ---------------------------------------------------------------------------
-- What, specifically, was missing.
--
-- answer_status (20260908010000) says a question went unanswered, but not
-- what to do about it — and the heuristic behind it (every knowledge-base
-- search came back empty) misses the common real case: a vector search has
-- no similarity floor, so it always returns its nearest neighbors even when
-- none of them are actually relevant, and the assistant answers from
-- irrelevant context instead of admitting the gap. That undercounts
-- no_match badly.
--
-- Rather than tune a similarity threshold into the retrieval SQL (which
-- would also change what the LLM sees when *composing* answers, a much
-- larger blast radius), the model is made the judge of its own answer: a new
-- flag_unanswered_question tool call (api/chat/index.js) lets it flag a
-- question as unanswered directly, in its own words, whenever it recognizes
-- — with the full conversation in view — that nothing it found actually
-- answers the question. missing_info carries that description verbatim, so
-- the owner sees exactly what content to add instead of just "no_match".
-- ---------------------------------------------------------------------------

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS missing_info TEXT;

DO $$
BEGIN
  ALTER TABLE public.messages
      ADD CONSTRAINT messages_missing_info_requires_status
      CHECK (
        missing_info IS NULL
        OR answer_status IN ('no_match', 'failed')
      );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
