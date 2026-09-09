-- ===========================================================================
-- Read-only conversation-quota check — lets the widget hide itself
-- ===========================================================================
-- register_conversation() (migration 20260909000000) is the actual gate:
-- called from api/chat/index.js when a visitor sends a message, it both
-- decides and records. It cannot be reused to decide whether to even *show*
-- the widget on page load, though — calling it there would consume a
-- conversation slot on every page view, before anyone has said anything.
--
-- This is the same decision, side-effect-free: no insert, no advisory lock
-- (a moment of staleness here just means the widget shows for one extra
-- pageview around the exact instant the limit is crossed — cosmetic, not a
-- quota leak, since register_conversation() still enforces the real limit
-- when a message is actually sent).
--
-- api/chat/init.js calls this with the widget's session_id and, if it comes
-- back TRUE, tells the widget to hide itself entirely (apps/widget/src/
-- main.js) rather than show a launcher that can't start a conversation. A
-- session that already has a slot (mid-conversation visitor) always gets
-- FALSE — hiding the widget on a returning visitor who is already talking to
-- it would cut them off mid-conversation, which is exactly what
-- register_conversation() deliberately never does either.
--
-- Idempotent, like every migration in this folder: safe to re-run.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.conversation_quota_reached(p_tenant_id UUID, p_session_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan  TEXT;
  v_limit INT;
  v_count INT;
BEGIN
  -- Already has a slot this month (or p_session_id is NULL, which can never
  -- match a NOT NULL column — falls through to the count check below, same
  -- as any other session-less/new visitor): always allowed.
  IF EXISTS (
    SELECT 1 FROM public.conversations
     WHERE tenant_id = p_tenant_id AND session_id = p_session_id
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT plan INTO v_plan FROM public.tenants WHERE id = p_tenant_id;
  v_limit := public.plan_conversation_limit(v_plan);

  SELECT count(*) INTO v_count
    FROM public.conversations
   WHERE tenant_id = p_tenant_id
     AND started_at >= date_trunc('month', now());

  RETURN v_count >= v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.conversation_quota_reached(UUID, TEXT) FROM PUBLIC;
-- service_role only: api/chat/init.js is the only caller, using the same
-- service-role client as api/chat/index.js. Exposing this to anon/
-- authenticated would let any caller who knows a tenant_id probe how close
-- that tenant is to its conversation limit.
GRANT EXECUTE ON FUNCTION public.conversation_quota_reached(UUID, TEXT) TO service_role;
