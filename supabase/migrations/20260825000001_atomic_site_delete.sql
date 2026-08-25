-- ==============================================================================
-- Migration: Atomic, Ownership-Checked Cascade Delete for Sites
-- Date: 2026-08-25
-- Description:
--   Replaces the previous "delete each child table one by one, swallow any
--   error" approach (used in both api/crawler/delete-site.js and the client
--   fallback in App.jsx) with a single SECURITY DEFINER function that runs
--   inside one transaction. If any step fails the whole deletion rolls back
--   instead of leaving orphaned rows or a half-deleted site behind.
--
--   Note: usage_counters is a tenant-level daily aggregate (no site_id column),
--   so it is intentionally NOT touched here — the previous code attempted
--   `DELETE FROM usage_counters WHERE site_id = ...` which always failed
--   (column does not exist) and was silently discarded via .catch(() => {}),
--   masking a real error on every single deletion.
-- ==============================================================================

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

  -- Ownership check happens here too (defense in depth) in addition to the
  -- caller verifying tenant ownership before invoking this function.
  SELECT EXISTS (
    SELECT 1 FROM public.sites WHERE id = p_site_id AND tenant_id = p_tenant_id
  ) INTO v_site_exists;

  IF NOT v_site_exists THEN
    RAISE EXCEPTION 'Site % not found for tenant %', p_site_id, p_tenant_id;
  END IF;

  -- Every statement below runs inside this function's implicit transaction:
  -- any failure raises and rolls back everything already deleted in this call.
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

REVOKE ALL ON FUNCTION public.delete_site_cascade(UUID, UUID) FROM PUBLIC;
-- Granted to anon/authenticated because guest (anonymous auth) tenants must be
-- able to delete their own sites too; the API route always verifies tenant
-- ownership (requireSiteOwnership) before calling this function, and the
-- function re-checks ownership itself.
GRANT EXECUTE ON FUNCTION public.delete_site_cascade(UUID, UUID) TO anon, authenticated;
