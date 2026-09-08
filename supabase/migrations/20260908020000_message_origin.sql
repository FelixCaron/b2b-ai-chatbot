-- ---------------------------------------------------------------------------
-- Which site, and which page, a conversation happened on.
--
-- messages carried tenant_id and session_id and nothing else about where a
-- visitor was standing when they asked. For a tenant with one site that was
-- merely incomplete; for one with several it made the Conversations view
-- unable to answer "which of my websites is this about?", and it hid the most
-- useful thing about an unanswered question — the page the visitor was
-- reading when they had to ask it.
--
-- ON DELETE SET NULL, not CASCADE: deleting a website should not erase the
-- record of what customers asked before it went away. The conversation still
-- belongs to the tenant, which is what every query scopes by.
--
-- Note for migration 20260905030000's claim_guest_site: that function
-- deliberately does not move a guest's messages to the claiming tenant, and
-- cited "messages has no site_id" as part of why. The column exists now, but
-- the decision stands on its own reasoning — those are the guest's own test
-- conversations with a draft assistant, not the new owner's customer history
-- — so the function is left alone. A guest's messages keep the guest's
-- tenant_id and are swept with that tenant 24h later; nothing reads messages
-- by site_id without also scoping to tenant_id.
-- ---------------------------------------------------------------------------

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL;

-- The address the widget was loaded on, without query string or fragment
-- (api/chat/index.js strips both, and drops the value entirely unless its
-- hostname matches the site's own domain — it arrives from the visitor's
-- browser and is not trusted as given).
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS page_url TEXT;

-- Per-site conversation reads, newest first.
CREATE INDEX IF NOT EXISTS messages_site_created_idx
    ON public.messages (site_id, created_at DESC)
    WHERE site_id IS NOT NULL;
