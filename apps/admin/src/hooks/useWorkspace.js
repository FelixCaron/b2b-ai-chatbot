import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';

// Dashboard selects sites[0] when it has no selection of its own, so "land the
// user on this site" is expressed by ordering the list around it.
function orderSitesForFocus(rows, focusSiteId) {
  if (!focusSiteId) return rows;
  const focused = rows.find((site) => site.id === focusSiteId);
  return focused ? [focused, ...rows.filter((site) => site.id !== focusSiteId)] : rows;
}

/**
 * Everything that belongs to the signed-in account: its tenants, the selected
 * one, and that tenant's sites, leads and usage — plus the write operations
 * that keep them in step.
 *
 * The loaders are effects on `currentUser` and `selectedTenant`; the writes are
 * plain async functions the UI calls. Every write returns a result the caller
 * can act on rather than throwing into a void, except handleAddSite, whose
 * three distinct failures the onboarding form reports as messages (so it still
 * throws, and its callers still catch).
 */
export function useWorkspace({ currentUser, authReady, setCurrentUser, onLandOnSite }) {
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [sites, setSites] = useState([]);
  const [leads, setLeads] = useState([]);
  const [usage, setUsage] = useState(null);

  const focusSiteIdRef = useRef(null);

  useEffect(() => {
    if (!currentUser || !authReady) return;
    async function loadOwnedTenants() {
      const { data } = await supabase.from('tenants').select('*').eq('owner_user_id', currentUser.id);
      let ownedTenants = data || [];

      // A tenant created before its owner provided an email is named
      // `Guest_<timestamp>` (see addSite below) and nothing ever renamed it
      // once they converted — a real, registered account could sit under a
      // stale "Guest_..." name forever, which is confusing in any tenant list
      // AND actively dangerous: the cleanup cron used to decide what to delete
      // by matching this same stale name pattern, so a converted user's real
      // data could get swept up by it. Fix at the source: once we know the
      // account is real (not anonymous, has a confirmed email), bring the name
      // in line with reality.
      if (!currentUser.is_anonymous && currentUser.email) {
        const staleGuestTenants = ownedTenants.filter(
          (tenant) => tenant.name?.startsWith('Guest_') && tenant.name !== currentUser.email
        );
        if (staleGuestTenants.length > 0) {
          await Promise.all(
            staleGuestTenants.map((tenant) =>
              supabase.from('tenants').update({ name: currentUser.email }).eq('id', tenant.id)
            )
          );
          ownedTenants = ownedTenants.map((tenant) =>
            staleGuestTenants.some((stale) => stale.id === tenant.id)
              ? { ...tenant, name: currentUser.email }
              : tenant
          );
        }
      }

      setTenants(ownedTenants);
      setSelectedTenant((current) => ownedTenants.find((tenant) => tenant.id === current?.id) || ownedTenants[0] || null);
    }
    loadOwnedTenants();
  }, [currentUser?.id, currentUser?.is_anonymous, currentUser?.email, authReady]);

  // Fetch tenant-specific resources whenever selectedTenant changes
  useEffect(() => {
    if (!selectedTenant) return;

    async function loadTenantData() {
      const tId = selectedTenant.id;
      // Refresh tenant to pick up plan changes from Stripe webhook
      const { data: freshTenant } = await supabase.from('tenants').select('*').eq('id', tId).single();
      if (freshTenant) setSelectedTenant(freshTenant);

      const { data: sitesData } = await supabase.from('sites').select('*').eq('tenant_id', tId);
      // Same ordering as landOnSite(), so a workspace transfer that also
      // switches tenant lands on the moved site whichever of the two refreshes
      // finishes last.
      setSites(orderSitesForFocus(sitesData || [], focusSiteIdRef.current));

      const { data: leadsData } = await supabase.from('leads').select('*').eq('tenant_id', tId).order('created_at', { ascending: false });
      setLeads(leadsData || []);

      const { data: usageData } = await supabase.from('usage').select('*').eq('tenant_id', tId).maybeSingle();
      setUsage(usageData || { messages_count: 0, leads_count: 0 });
    }

    loadTenantData();
  }, [selectedTenant?.id]);

  /** Drop everything that belonged to the account being signed out of. */
  const resetWorkspace = () => {
    setSelectedTenant(null);
    setTenants([]);
    setSites([]);
    setLeads([]);
  };

  /** Pull the account's data back in around a site that just arrived (or that
   *  already lived here), and put the user in front of it. */
  const landOnSite = async (tenantId, siteId) => {
    focusSiteIdRef.current = siteId || null;

    const { data: tenantRow } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    if (tenantRow) {
      setTenants((prev) => (prev.some((t) => t.id === tenantRow.id) ? prev : [...prev, tenantRow]));
      setSelectedTenant(tenantRow);
    }

    const { data: sitesData } = await supabase.from('sites').select('*').eq('tenant_id', tenantId);
    setSites(orderSitesForFocus(sitesData || [], siteId));

    const { data: leadsData } = await supabase
      .from('leads')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    setLeads(leadsData || []);

    onLandOnSite?.();
  };

  const addSite = async (domain, primaryColor = '#293f68') => {
    let user = currentUser;
    if (!user) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        user = sessionData.session.user;
        setCurrentUser(user);
      } else {
        const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
        if (anonErr || !anonData?.user) {
          console.error('[addSite] Anonymous sign-in failed:', anonErr);
          throw new Error(anonErr?.message || 'Session not initialized. Enable "Anonymous Sign-in" in your Supabase Auth settings, or sign in.');
        }
        user = anonData.user;
        setCurrentUser(user);
      }
    }

    let tId = selectedTenant?.id;
    if (!tId) {
      const { data: existingTenants } = await supabase
        .from('tenants')
        .select('*')
        .eq('owner_user_id', user.id);

      if (existingTenants && existingTenants.length > 0) {
        tId = existingTenants[0].id;
        setSelectedTenant(existingTenants[0]);
        setTenants(existingTenants);
      } else {
        const { data: guestTenant, error: tErr } = await supabase
          .from('tenants')
          .insert({ name: user.email || `Guest_${Date.now()}`, owner_user_id: user.id })
          .select()
          .single();

        if (tErr || !guestTenant) {
          console.error('[addSite] Tenant creation failed:', tErr);
          throw new Error(`Failed to create workspace: ${tErr?.message || 'Database error'}`);
        }
        tId = guestTenant.id;
        setTenants([guestTenant]);
        setSelectedTenant(guestTenant);
      }
    }

    // 1. Attempt insert
    const { data: newSite, error: siteInsertErr } = await supabase
      .from('sites')
      .insert({
        tenant_id: tId,
        domain: domain,
        theme_primary_color: primaryColor,
        enable_lead_capture: false
      })
      .select()
      .single();

    if (newSite) {
      setSites((prev) => [newSite, ...prev.filter((s) => s.id !== newSite.id)]);
      return newSite;
    }

    // 2. Translate the two constraints the database now enforces (see
    //    20260905030000_site_limits_and_guest_claims.sql) into something a
    //    user can act on.
    //
    //    There used to be a "fallback" here that looked the domain up across
    //    *all* tenants and, if it found one, re-pointed that row's tenant_id at
    //    the current tenant. That is a cross-tenant takeover primitive — it only
    //    failed to be exploitable because RLS happened to block the update — and
    //    it was dead code anyway: nothing made domains collide globally. A
    //    failed insert now fails, full stop.
    const insertMessage = siteInsertErr?.message || '';
    console.warn('[addSite] Insert site failed:', insertMessage);

    if (insertMessage.includes('site_limit_reached')) {
      throw new Error(
        'Your plan has no room for another website. Upgrade your plan, or remove a website you no longer use.'
      );
    }

    if (siteInsertErr?.code === '23505' || insertMessage.includes('sites_tenant_domain_uq')) {
      throw new Error(`${domain} is already in this workspace. Open it from your website list instead of adding it again.`);
    }

    throw new Error(insertMessage || 'Failed to save the domain to the database.');
  };

  const updateSiteSettings = async (siteId, updates) => {
    const { data: updated, error } = await supabase.from('sites').update(updates).eq('id', siteId).select().single();
    if (updated) {
      setSites((prev) => prev.map((s) => (s.id === siteId ? updated : s)));
      return { ok: true, data: updated };
    }
    console.error('[updateSiteSettings] Error:', error);
    return { ok: false, error: error?.message || 'Could not save that change.' };
  };

  const deleteDocumentUrls = async (siteId, urlsToDelete) => {
    if (!urlsToDelete || urlsToDelete.length === 0) return;
    await supabase.from('documents').delete().eq('site_id', siteId).in('url', urlsToDelete);
  };

  /** Part of the Danger Zone "Reset Website" flow — leads live in this
   *  hook's own state (fetched at the tenant level), so the site-scoped
   *  documents/summary deletes in useCrawlPipeline's handleResetSite call
   *  back through here to also clear this site's leads and keep the local
   *  `leads` list in step. Throws on failure so the caller's error handling
   *  (which also owns the documents/summary deletes) sees it. */
  const deleteLeadsForSite = async (siteId) => {
    const { error } = await supabase.from('leads').delete().eq('site_id', siteId);
    if (error) throw error;
    setLeads((prev) => prev.filter((lead) => lead.site_id !== siteId));
  };

  /**
   * Delete an entire site and its documents/summaries. This goes through the
   * atomic server-side RPC (delete_site_cascade) so the deletion either fully
   * succeeds or fully fails — never a partial deletion. Only on a *confirmed*
   * success do we touch local/UI state; on failure we surface the real error
   * instead of silently pretending the site is gone (which used to leave
   * "ghost" sites: removed from the UI but still present, with their data, in
   * the database).
   */
  const deleteSite = async (siteId) => {
    if (!siteId || !selectedTenant?.id) {
      return { success: false, error: 'Missing site or workspace context.' };
    }

    const result = await api.crawler.deleteSite({ site_id: siteId, tenant_id: selectedTenant.id });

    if (result.ok && result.data?.success) {
      setSites((prev) => prev.filter((s) => s.id !== siteId));
      return { success: true };
    }

    console.error('[deleteSite] Server refused/failed deletion:', result.error);
    return { success: false, error: result.error };
  };

  const triggerScan = async (siteId, url, optionalTenantId = null) => {
    const tId = optionalTenantId || selectedTenant?.id;
    if (!tId) return { success: false, error: 'No tenant selected' };
    const result = await api.crawler.scan({ site_id: siteId, tenant_id: tId, url });
    // The dashboard reads `data` on both paths (a refused scan still explains
    // itself in the body), so hand back the whole envelope's body either way.
    return { success: result.ok, data: result.data, error: result.ok ? undefined : result.error };
  };

  return {
    tenants,
    selectedTenant,
    setSelectedTenant,
    sites,
    leads,
    usage,
    landOnSite,
    resetWorkspace,
    addSite,
    updateSiteSettings,
    deleteDocumentUrls,
    deleteLeadsForSite,
    deleteSite,
    triggerScan
  };
}

export default useWorkspace;
