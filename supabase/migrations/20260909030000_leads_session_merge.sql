-- ---------------------------------------------------------------------------
-- One lead per conversation, not one lead per extraction call.
--
-- Lead extraction (api/lib/llm.js extractLeadInfo) re-runs over the whole
-- transcript on every message while lead capture is on, and the chat loop
-- (api/chat/index.js) dedup'd purely by whichever contact field that
-- extraction happened to return: email if present, else phone. A visitor who
-- gives an email early and a phone number later produces two extractions
-- that never match each other — the phone-only one has no email to search
-- on, so it never finds the email-only row already sitting there — leaving
-- two rows for what was one visitor, one conversation.
--
-- session_id ties a lead back to the conversation that produced it, so the
-- app can look up "does *this* conversation already have a lead row" first
-- and merge into it, before ever falling back to matching by contact field.
-- Nullable/unindexed-unique on purpose: historical rows predate this column,
-- and a visitor can still legitimately return in a new session and be
-- merged by email/phone as before.
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_tenant_session
    ON public.leads(tenant_id, session_id)
    WHERE session_id IS NOT NULL;
