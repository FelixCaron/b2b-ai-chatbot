-- ==============================================================================
-- Migration: Enforce Row Level Security (RLS) on ALL Supabase Tables
-- Date: 2026-08-20
-- Description: Supports both UUID and TEXT tenant_id columns with strict multi-tenant RLS.
-- ==============================================================================

-- 1. Ensure owner_user_id exists on tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS tenants_owner_user_id_idx ON public.tenants(owner_user_id);

-- 2. Overloaded Helper Functions to check tenant ownership (handles both UUID and TEXT)
CREATE OR REPLACE FUNCTION public.current_user_owns_tenant(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = target_tenant_id AND owner_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_owns_tenant(target_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id::text = target_tenant_id AND owner_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_owns_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_owns_tenant(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_owns_tenant(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_owns_tenant(TEXT) TO anon, authenticated;

-- ==============================================================================
-- 3. ENABLE RLS ON ALL PUBLIC TABLES
-- ==============================================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 4. CLEANUP OLD / PERMISSIVE POLICIES
-- ==============================================================================
DROP POLICY IF EXISTS "Allow all on tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenant owner access" ON public.tenants;
DROP POLICY IF EXISTS "Allow all on sites" ON public.sites;
DROP POLICY IF EXISTS "Tenant owner access" ON public.sites;
DROP POLICY IF EXISTS "Allow all on documents" ON public.documents;
DROP POLICY IF EXISTS "Tenant owner access" ON public.documents;
DROP POLICY IF EXISTS "Allow all on messages" ON public.messages;
DROP POLICY IF EXISTS "Tenant owner access" ON public.messages;
DROP POLICY IF EXISTS "Allow all on leads" ON public.leads;
DROP POLICY IF EXISTS "Tenant owner access" ON public.leads;
DROP POLICY IF EXISTS "Allow all on usage" ON public.usage;
DROP POLICY IF EXISTS "Tenant owner access" ON public.usage;
DROP POLICY IF EXISTS "Allow all on site_summaries" ON public.site_summaries;
DROP POLICY IF EXISTS "Tenant owner access" ON public.site_summaries;
DROP POLICY IF EXISTS "Allow all on usage_counters" ON public.usage_counters;
DROP POLICY IF EXISTS "Tenant owner access" ON public.usage_counters;
DROP POLICY IF EXISTS "Allow all on scan_jobs" ON public.scan_jobs;
DROP POLICY IF EXISTS "Tenant owner access" ON public.scan_jobs;

-- ==============================================================================
-- 5. CREATE STRICT TENANT-ISOLATED POLICIES FOR AUTHENTICATED USERS
-- ==============================================================================

-- Table: tenants (owner can manage their own tenant)
CREATE POLICY "Tenant owner access" ON public.tenants
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Table: sites
CREATE POLICY "Tenant owner access" ON public.sites
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

-- Table: documents
CREATE POLICY "Tenant owner access" ON public.documents
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

-- Table: messages
CREATE POLICY "Tenant owner access" ON public.messages
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

-- Table: leads
CREATE POLICY "Tenant owner access" ON public.leads
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

-- Table: usage
CREATE POLICY "Tenant owner access" ON public.usage
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

-- Table: site_summaries
CREATE POLICY "Tenant owner access" ON public.site_summaries
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

-- Table: usage_counters
CREATE POLICY "Tenant owner access" ON public.usage_counters
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

-- Table: scan_jobs
CREATE POLICY "Tenant owner access" ON public.scan_jobs
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));
