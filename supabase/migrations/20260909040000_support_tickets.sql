-- ---------------------------------------------------------------------------
-- Support tickets: a persisted record independent of whether the email
-- actually left the building.
--
-- send_support_email (api/chat/index.js, api/lib/email.js) was
-- email-or-nothing: on success nothing is kept anywhere but the tenant's
-- inbox, and on failure (no RESEND_API_KEY, unverified sending domain,
-- Resend rejecting the send, ...) the only trace was a console.error in an
-- ephemeral Edge log the tenant can never see. A tenant whose visitor says
-- "I asked for help and never heard back" had no way to tell "the bot never
-- called the tool" from "the tool ran but the email never arrived" — both
-- looked identical from the dashboard: nothing.
--
-- Persisting every attempt, delivered or not, makes that diagnosable from
-- the product itself instead of guesswork: a row here means the assistant
-- did call the tool; `delivered = false` on it means the request reached us
-- but the outbound email failed (almost always a Resend/domain config
-- issue, not a code bug) — the tenant can see the request itself and follow
-- up manually even when delivery failed.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id     UUID        REFERENCES public.sites(id) ON DELETE CASCADE,
    session_id  TEXT,
    name        TEXT,
    email       TEXT,
    message     TEXT,
    delivered   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_id ON public.support_tickets(tenant_id);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant owner access" ON public.support_tickets;
CREATE POLICY "Tenant owner access" ON public.support_tickets
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));
