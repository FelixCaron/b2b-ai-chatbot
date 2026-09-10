-- ===========================================================================
-- Harden SECURITY DEFINER function grants (2026-09-10)
-- ===========================================================================
-- A SECURITY DEFINER function runs with its owner's privileges, so it bypasses
-- RLS. The only thing standing between such a function and an arbitrary caller
-- is the EXECUTE grant. Most sensitive functions in this schema were already
-- locked down with `REVOKE ALL ... FROM PUBLIC` + an explicit grant
-- (current_user_owns_tenant, claim_guest_site, register_conversation,
-- conversation_quota_reached, the staff bridges, ...). A handful were not, and
-- kept Postgres's default EXECUTE-to-PUBLIC privilege, which PostgREST exposes
-- to the `anon` and `authenticated` roles — i.e. callable straight from the
-- browser with only the publishable key, RLS bypassed.
--
-- This migration closes every remaining gap. It is additive and idempotent
-- (REVOKE/GRANT and CREATE OR REPLACE are all re-runnable), changes no table,
-- and only ever TIGHTENS access — every legitimate caller was verified first
-- (see per-function notes). Nothing here removes behavior a client could later
-- ask for; it removes reach no caller was supposed to have.
--
-- Verified callers (so the tightening breaks nothing):
--   delete_site_cascade  -> apps/admin/src/hooks/useWorkspace.js   (authenticated tenant owner, incl. anonymous-auth guests, whose role is 'authenticated')
--                        -> api/crawler/delete-site.js             (service_role; also the owner, via AUTH.TENANT + requireSiteOwnership)
--                        -> apps/internal-admin/api/staff/sites.js (service_role; staff delete OTHER tenants' sites)
--                        -> apps/internal-admin/api/staff/tenants.js (service_role)
--   increment_usage      -> api/chat/index.js                      (service_role; SUPABASE_SECRET_KEY)
--   increment_lead_usage -> server-side only
--   pgmq_send/read/delete -> server-side / internal SQL only; no publishable-key caller
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. delete_site_cascade — add a real caller-ownership check.
--
-- Before: the function only verified the site and tenant_id were consistent
-- with EACH OTHER (`sites WHERE id = p_site_id AND tenant_id = p_tenant_id`),
-- never that the CALLER owns the tenant. Granted to anon/authenticated, that
-- let any holder of the publishable key cascade-delete any tenant's site
-- (documents, site_summaries, leads, scan_jobs, the site row) straight from
-- the browser via supabase.rpc(), bypassing the API route's ownership check.
-- The old code comment claimed "the function re-checks ownership itself" — it
-- did not; this makes that true.
--
-- The guard allows the call when the caller owns the tenant (tenant owners and
-- anonymous-auth guests, both role 'authenticated' with a matching auth.uid())
-- OR when the caller is the trusted server (service_role: the crawler delete
-- route and the staff tooling, which run their own ownership/staff checks
-- first). auth.uid()/auth.role() read the request JWT claims and are unaffected
-- by SECURITY DEFINER, exactly as current_user_owns_tenant already relies on.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_site_cascade(p_site_id UUID, p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_exists BOOLEAN;
  v_documents_deleted INT;
  v_summaries_deleted INT;
  v_leads_deleted INT;
  v_scan_jobs_deleted INT;
BEGIN
  IF p_site_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'delete_site_cascade requires both site_id and tenant_id';
  END IF;

  -- Authorization: caller must own the tenant, or be the trusted server.
  IF NOT (public.current_user_owns_tenant(p_tenant_id) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Not authorized to delete site % for tenant %', p_site_id, p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.sites WHERE id = p_site_id AND tenant_id = p_tenant_id
  ) INTO v_site_exists;

  IF NOT v_site_exists THEN
    RAISE EXCEPTION 'Site % not found for tenant %', p_site_id, p_tenant_id;
  END IF;

  WITH deleted AS (DELETE FROM public.documents WHERE site_id = p_site_id RETURNING 1)
    SELECT count(*) INTO v_documents_deleted FROM deleted;

  WITH deleted AS (DELETE FROM public.site_summaries WHERE site_id = p_site_id RETURNING 1)
    SELECT count(*) INTO v_summaries_deleted FROM deleted;

  WITH deleted AS (DELETE FROM public.leads WHERE site_id = p_site_id RETURNING 1)
    SELECT count(*) INTO v_leads_deleted FROM deleted;

  WITH deleted AS (DELETE FROM public.scan_jobs WHERE site_id = p_site_id RETURNING 1)
    SELECT count(*) INTO v_scan_jobs_deleted FROM deleted;

  DELETE FROM public.sites WHERE id = p_site_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'site_id', p_site_id,
    'tenant_id', p_tenant_id,
    'documents_deleted', v_documents_deleted,
    'site_summaries_deleted', v_summaries_deleted,
    'leads_deleted', v_leads_deleted,
    'scan_jobs_deleted', v_scan_jobs_deleted
  );
END;
$$;

-- Tighten the grant to match: drop anon (no legitimate unauthenticated caller;
-- guests are 'authenticated'), keep authenticated (guarded above) and the
-- trusted server role. The in-function guard is the real protection; this is
-- defense in depth.
REVOKE ALL ON FUNCTION public.delete_site_cascade(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_site_cascade(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Usage counters — server-only, must not be caller-reachable.
--
-- Both are SECURITY DEFINER taking an arbitrary target_tenant_id with no
-- ownership check, and had no REVOKE, so anon/authenticated could call them
-- directly to inflate a competitor's usage/lead counters — corrupting billing
-- data and potentially tripping their plan limits as a denial of service.
-- Only api/chat/index.js (service_role) calls them.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.increment_usage(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.increment_lead_usage(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_lead_usage(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. pgmq bridges — internal queue plumbing, never a client concern.
--
-- SECURITY DEFINER with no REVOKE let any caller read, delete, or inject
-- messages on any internal pgmq queue by name (e.g. the scan/crawl pipeline),
-- regardless of tenant. No publishable-key code path calls these; they are
-- used server-side and by internal SQL (which, being SECURITY DEFINER, runs as
-- owner and is unaffected by the EXECUTE grant).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.pgmq_send(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pgmq_send(text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.pgmq_read(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pgmq_read(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.pgmq_delete(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pgmq_delete(text, bigint) TO service_role;
