-- =============================================================================
-- MIGRATION: 20260905010000_staff_admin_management.sql
-- PURPOSE  : Lets the internal staff console manage internal.staff_admins
--            itself (list current staff, grant access to a new teammate by
--            email) instead of needing a manual SQL insert every time — see
--            apps/internal-admin/api/staff/admins.js.
--
--            Same isolation pattern as public.is_staff_admin() (see the
--            consolidated migration's section 16): internal.staff_admins and
--            auth.users are both in schemas PostgREST never exposes, so these
--            SECURITY DEFINER bridge functions in `public`, restricted to
--            service_role only, are the only way server code can read or
--            write either — never reachable by an anon/authenticated session,
--            including one belonging to an existing staff member.
-- =============================================================================

-- Looks up an existing Supabase Auth account by email. Returns no rows if
-- nobody has signed in with that email yet — the caller (grant_staff_admin)
-- turns that into a clear error rather than silently doing nothing, since a
-- staff_admins row without a real auth.users id would be meaningless (the
-- table's user_id column references auth.users(id)).
CREATE OR REPLACE FUNCTION public.find_auth_user_by_email(target_email TEXT)
RETURNS TABLE (user_id UUID, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, public
AS $$
  SELECT id, auth.users.email
  FROM auth.users
  WHERE lower(auth.users.email) = lower(target_email)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_auth_user_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_auth_user_by_email(TEXT) TO service_role;

-- Lists everyone currently granted staff access, for the console's staff page.
CREATE OR REPLACE FUNCTION public.list_staff_admins()
RETURNS TABLE (user_id UUID, email TEXT, created_at TIMESTAMPTZ, added_by TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = internal, public
AS $$
  SELECT user_id, email, created_at, added_by
  FROM internal.staff_admins
  ORDER BY created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_staff_admins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_staff_admins() TO service_role;

-- Grants staff access to whoever already has a Supabase Auth account under
-- target_email. Raises (rather than silently no-op'ing) if no such account
-- exists yet — they need to sign in via magic link once first, same
-- requirement as the migration's own seed comment already documented.
-- Idempotent: granting someone who's already staff just returns their
-- existing row instead of erroring.
CREATE OR REPLACE FUNCTION public.grant_staff_admin(target_email TEXT, granted_by TEXT DEFAULT NULL)
RETURNS TABLE (user_id UUID, email TEXT, created_at TIMESTAMPTZ, added_by TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = internal, public
AS $$
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
