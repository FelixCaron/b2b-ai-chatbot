-- =============================================================================
-- MIGRATION: 20260909070000_fix_grant_staff_admin_ambiguous_column.sql
-- PURPOSE  : grant_staff_admin (20260905010000_staff_admin_management.sql)
--            fails every call with:
--              ERROR: column reference "user_id" is ambiguous
--              DETAIL: It could refer to either a PL/pgSQL variable or a
--                      table column.
--            Reproduced locally: `RETURNS TABLE (user_id UUID, ...)` on a
--            plpgsql function implicitly declares `user_id` as an OUT
--            parameter/variable in the function's own namespace. Postgres's
--            default `plpgsql.variable_conflict` setting is `error`, and it
--            applies to identifier lists that name table columns without
--            being genuine expressions — `ON CONFLICT (user_id)` here — not
--            just to unqualified references inside a SELECT list (those were
--            already qualified with `s.`/`au.` and were never the problem).
--            `list_staff_admins` and `find_auth_user_by_email` don't hit this:
--            the first is a plain SQL function (no plpgsql variable scope at
--            all), and the second has no ON CONFLICT clause.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.grant_staff_admin(target_email TEXT, granted_by TEXT DEFAULT NULL)
RETURNS TABLE (user_id UUID, email TEXT, created_at TIMESTAMPTZ, added_by TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = internal, public
AS $$
-- Tells the parser to resolve a bare identifier that names both a table
-- column and a plpgsql variable/OUT-parameter in favor of the column —
-- the correct call here, since every such identifier in this function
-- (ON CONFLICT (user_id)) is a column reference, never meant to read the
-- OUT parameter.
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_email TEXT;
BEGIN
  SELECT au.user_id, au.email INTO v_user_id, v_email
  FROM public.find_auth_user_by_email(target_email) au;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No account found for %. They need to sign in once (magic link) before they can be granted staff access.', target_email;
  END IF;

  INSERT INTO internal.staff_admins (user_id, email, added_by)
  VALUES (v_user_id, v_email, granted_by)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT s.user_id, s.email, s.created_at, s.added_by
  FROM internal.staff_admins s
  WHERE s.user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_staff_admin(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_staff_admin(TEXT, TEXT) TO service_role;
