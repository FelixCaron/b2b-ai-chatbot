-- ---------------------------------------------------------------------------
-- Indexes for reading conversations back.
--
-- Until now `messages` was only ever written to (api/chat/index.js) and read
-- one session at a time inside a single request, so a sequential scan was
-- fine. The admin's Conversations view reads a tenant's recent messages and
-- groups them into conversations, which is a very different access pattern:
-- newest-first over one tenant, then everything belonging to one session.
--
-- Without these, both queries degrade linearly with total message volume
-- across every tenant on the instance — the busiest customer would slow the
-- view down for the quietest one.
-- ---------------------------------------------------------------------------

-- The Conversations list: a tenant's messages, newest first.
CREATE INDEX IF NOT EXISTS messages_tenant_created_idx
    ON public.messages (tenant_id, created_at DESC);

-- One conversation's transcript, in the order it was said. Also the shape
-- api/chat/index.js already uses when it pulls a session's recent history.
CREATE INDEX IF NOT EXISTS messages_tenant_session_created_idx
    ON public.messages (tenant_id, session_id, created_at);
