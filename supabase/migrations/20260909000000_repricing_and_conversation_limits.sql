-- ===========================================================================
-- Repricing (2026-09-09) and real conversation-quota enforcement
-- ===========================================================================
-- Two independent changes, bundled because the second only makes sense once
-- the first exists:
--
--   1. New site limits per plan slug: basic 1 (unchanged), pro 2 -> 1,
--      premium 10 -> 3. Mirrors packages/contracts/src/plans.js, the single
--      source of truth for these numbers — see that file's header comment.
--      Plan *slugs* do not change (they're wired through Stripe env vars,
--      the webhook, and every trigger below); only what each slug is worth
--      and is marketed as changes.
--
--   2. "Messages / month" was pricing-page copy with nothing behind it: no
--      trigger, no check, anywhere. A Basic tenant already had unlimited
--      messages in practice. Conversations/month replaces it as the metered
--      resource, and this time it's real: a new `conversations` table (one
--      row per tenant+session_id, the same grouping Conversations already
--      uses — see messages.session_id / useConversations.js) and a
--      register_conversation() RPC that blocks a *new* conversation once the
--      current calendar month's count hits the plan's limit. An existing
--      conversation already in the table is always allowed to continue —
--      the limit gates starting new ones, not finishing ones already
--      underway. api/chat/index.js calls this before doing any LLM work, so
--      a blocked new conversation costs nothing.
--
--      Calendar-month granularity (not the tenant's exact Stripe billing
--      cycle) is a deliberate simplification, same tradeoff usage_counters
--      already made with day-level granularity instead of cycle-aware
--      tracking.
--
-- Idempotent, like every migration in this folder: safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. UPDATED PLAN -> SITE LIMIT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_site_limit(p_plan TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_plan, 'basic'))
    WHEN 'premium' THEN 3
    WHEN 'pro'     THEN 1
    ELSE 1
  END;
$$;

-- ---------------------------------------------------------------------------
-- 2. PLAN -> CONVERSATION LIMIT (monthly)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_conversation_limit(p_plan TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_plan, 'basic'))
    WHEN 'premium' THEN 5000
    WHEN 'pro'     THEN 1500
    ELSE 300
  END;
$$;

REVOKE ALL ON FUNCTION public.plan_conversation_limit(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_conversation_limit(TEXT) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. CONVERSATIONS — one row per tenant+session_id, first message wins
--    Deliberately a dedicated table rather than `count(distinct session_id)`
--    over `messages`: messages carries no uniqueness on session_id and a
--    distinct scan over it gets more expensive every month, where this table
--    only ever holds one row per conversation ever started.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
    id          BIGSERIAL   PRIMARY KEY,
    tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id     UUID        REFERENCES public.sites(id) ON DELETE SET NULL,
    session_id  TEXT        NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.conversations IS
  'One row per tenant+session_id, written by register_conversation() the first time a session sends a message. Powers the plan''s monthly conversation quota; not a copy of message content (see messages for that).';

CREATE UNIQUE INDEX IF NOT EXISTS conversations_tenant_session_uq
  ON public.conversations (tenant_id, session_id);

CREATE INDEX IF NOT EXISTS conversations_tenant_started_idx
  ON public.conversations (tenant_id, started_at);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant owner access" ON public.conversations;
CREATE POLICY "Tenant owner access" ON public.conversations
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id)) WITH CHECK (public.current_user_owns_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- 4. REGISTER (AND GATE) A CONVERSATION
--    SECURITY DEFINER, service_role only — api/chat/index.js calls this with
--    the service-role client before doing any LLM work. An advisory lock
--    keyed on the tenant serializes concurrent requests for the same tenant,
--    closing the check-then-insert race two conversations starting in the
--    same instant would otherwise hit (both reading the count before either
--    insert lands). The lock is released automatically when the calling
--    transaction ends.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_conversation(p_tenant_id UUID, p_session_id TEXT, p_site_id UUID)
RETURNS TABLE(allowed BOOLEAN, conversation_count INT, conversation_limit INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan  TEXT;
  v_limit INT;
  v_count INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text));

  -- Already registered this session: always allowed to continue, regardless
  -- of where the monthly count now stands.
  IF EXISTS (
    SELECT 1 FROM public.conversations
     WHERE tenant_id = p_tenant_id AND session_id = p_session_id
  ) THEN
    RETURN QUERY SELECT TRUE, 0, 0;
    RETURN;
  END IF;

  SELECT plan INTO v_plan FROM public.tenants WHERE id = p_tenant_id;
  v_limit := public.plan_conversation_limit(v_plan);

  SELECT count(*) INTO v_count
    FROM public.conversations
   WHERE tenant_id = p_tenant_id
     AND started_at >= date_trunc('month', now());

  IF v_count >= v_limit THEN
    RETURN QUERY SELECT FALSE, v_count, v_limit;
    RETURN;
  END IF;

  INSERT INTO public.conversations (tenant_id, session_id, site_id)
  VALUES (p_tenant_id, p_session_id, p_site_id);

  RETURN QUERY SELECT TRUE, v_count + 1, v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.register_conversation(UUID, TEXT, UUID) FROM PUBLIC;
-- service_role only: api/chat/index.js is the only caller, and it has
-- already verified (via isOriginAuthorized) that the request is either from
-- the site's own domain or an authenticated owner preview before this runs.
-- Exposing this to anon/authenticated would let any caller who knows a
-- tenant_id spend that tenant's conversation quota directly.
GRANT EXECUTE ON FUNCTION public.register_conversation(UUID, TEXT, UUID) TO service_role;
