-- Tenant ownership for authenticated and anonymous Supabase users.
-- Existing named tenants are linked to a matching Auth email where available.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT;

UPDATE public.tenants AS tenant
SET owner_user_id = auth_user.id
FROM auth.users AS auth_user
WHERE tenant.owner_user_id IS NULL
  AND lower(trim(tenant.name)) = lower(auth_user.email);

CREATE INDEX IF NOT EXISTS tenants_owner_user_id_idx ON public.tenants(owner_user_id);

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

REVOKE ALL ON FUNCTION public.current_user_owns_tenant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_owns_tenant(UUID) TO anon, authenticated;

DROP POLICY IF EXISTS "Allow all on tenants" ON public.tenants;
CREATE POLICY "Tenant owner access" ON public.tenants
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Allow all on sites" ON public.sites;
CREATE POLICY "Tenant owner access" ON public.sites
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on documents" ON public.documents;
CREATE POLICY "Tenant owner access" ON public.documents
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on messages" ON public.messages;
CREATE POLICY "Tenant owner access" ON public.messages
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on leads" ON public.leads;
CREATE POLICY "Tenant owner access" ON public.leads
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on usage" ON public.usage;
CREATE POLICY "Tenant owner access" ON public.usage
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on site_summaries" ON public.site_summaries;
CREATE POLICY "Tenant owner access" ON public.site_summaries
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on usage_counters" ON public.usage_counters;
CREATE POLICY "Tenant owner access" ON public.usage_counters
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));

DROP POLICY IF EXISTS "Allow all on scan_jobs" ON public.scan_jobs;
CREATE POLICY "Tenant owner access" ON public.scan_jobs
  FOR ALL TO authenticated
  USING (public.current_user_owns_tenant(tenant_id))
  WITH CHECK (public.current_user_owns_tenant(tenant_id));
