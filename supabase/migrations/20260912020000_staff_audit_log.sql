-- =============================================================================
-- MIGRATION: 20260912020000_staff_audit_log.sql
-- PURPOSE  : A durable record of what staff did inside a customer's account.
--
-- Until now the only trace of a staff action was a console.log in an
-- ephemeral Vercel log — see docs/INTEGRATION_REVIEW.md, which lists audit
-- logging as an open gap, and the comment in api/staff/tenants.js that says
-- as much at the point where it overrides someone's plan. That was already
-- thin for plan overrides and deletions; it is untenable now that staff can
-- edit a customer's assistant on their behalf (its objective, its tone, the
-- words it greets visitors with, the summary it answers from). "Who changed
-- the welcome message on our site?" must have an answer that outlives a log
-- retention window.
--
-- Same isolation pattern as internal.staff_admins (see
-- 20260905010000_staff_admin_management.sql): the table lives in the
-- `internal` schema, which is deliberately absent from config.toml's
-- [api].schemas, so PostgREST has no route to it at all — not with an anon
-- key, not with any authenticated user's JWT, regardless of grants or RLS.
-- SECURITY DEFINER bridge functions in `public`, granted to service_role
-- only, are the one way server code reaches it. A customer therefore cannot
-- read (or rewrite) the log of what was done to their account, and neither
-- can a staff member's own browser session.
--
-- Idempotent, like every migration in this folder: safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS internal.staff_audit (
    id           BIGSERIAL   PRIMARY KEY,
    actor_email  TEXT        NOT NULL,
    actor_id     UUID,
    -- Kept as a plain column, NOT a foreign key to public.tenants: the log of
    -- a tenant's deletion must survive the tenant row it describes. A cascade
    -- here would erase exactly the record an incident review needs.
    tenant_id    UUID,
    site_id      UUID,
    action       TEXT        NOT NULL,
    -- What actually changed, as {field: {from, to}} — enough to answer "who
    -- set this value" without diffing two backups.
    details      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    -- Why. The staff console requires one for an edit made on a customer's
    -- behalf; support actions that are their own explanation (a cascade
    -- delete of a spam signup) may leave it NULL.
    reason       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Defense in depth, exactly as internal.staff_admins does it: RLS on with
-- zero policies denies every role except the RLS-bypassing service role, so
-- even a future mistake that exposed the `internal` schema to PostgREST
-- would not hand this table to anyone.
ALTER TABLE internal.staff_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS staff_audit_tenant_idx  ON internal.staff_audit (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_audit_created_idx ON internal.staff_audit (created_at DESC);

COMMENT ON TABLE internal.staff_audit IS
  'Append-only record of staff actions taken inside customer accounts (plan overrides, deletions, bot edits). Written only through public.record_staff_action().';

-- Writes one entry. Returns the id so a caller can reference it, and never
-- raises for a bad tenant id — an audit write must not be the thing that
-- fails a support action that already succeeded.
CREATE OR REPLACE FUNCTION public.record_staff_action(
  p_actor_email TEXT,
  p_action      TEXT,
  p_actor_id    UUID  DEFAULT NULL,
  p_tenant_id   UUID  DEFAULT NULL,
  p_site_id     UUID  DEFAULT NULL,
  p_details     JSONB DEFAULT '{}'::jsonb,
  p_reason      TEXT  DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = internal, public
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO internal.staff_audit (actor_email, actor_id, tenant_id, site_id, action, details, reason)
  VALUES (p_actor_email, p_actor_id, p_tenant_id, p_site_id, p_action, COALESCE(p_details, '{}'::jsonb), p_reason)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_staff_action(TEXT, TEXT, UUID, UUID, UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_staff_action(TEXT, TEXT, UUID, UUID, UUID, JSONB, TEXT) TO service_role;

-- Reads a tenant's trail, newest first, for the console's tenant page.
CREATE OR REPLACE FUNCTION public.list_staff_actions(p_tenant_id UUID, p_limit INT DEFAULT 25)
RETURNS TABLE (
  id          BIGINT,
  actor_email TEXT,
  action      TEXT,
  details     JSONB,
  reason      TEXT,
  site_id     UUID,
  created_at  TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = internal, public
AS $$
  SELECT id, actor_email, action, details, reason, site_id, created_at
  FROM internal.staff_audit
  WHERE p_tenant_id IS NULL OR tenant_id = p_tenant_id
  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.list_staff_actions(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_staff_actions(UUID, INT) TO service_role;
