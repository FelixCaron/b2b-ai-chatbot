import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { executeTurnstileCaptcha } from '../lib/turnstile';
import { fetchBrandTheme } from '../lib/brand-theme';
import { domainFromUrl, ensureHttps } from '../lib/page-url';
import { getPlanDisplayName } from '../lib/plan-limits';
import { useT } from '../../../i18n/LanguageContext';

/**
 * Everything that changes the *set* of websites in the workspace: adding one,
 * deleting one, and the parking / reactivation dance a plan downgrade forces.
 *
 * `onSelectSite`, `onSiteDeleted` and `onSiteReady` are the three moments this
 * hook has to hand back to the dashboard — which website is on screen, what to
 * reset once one is gone, and the crawl that follows a freshly added one.
 */
export default function useSiteLifecycle({
  sites,
  activeSite,
  tenantPlan,
  maxSitesForPlan,
  onAddSite,
  onDeleteSite,
  onSelectSite,
  onSiteDeleted,
  onSiteReady
}) {
  const { t } = useT();

  // Local is_active overrides for websites parked or re-activated in this
  // session: `sites` is owned by App.jsx and is not refetched after a plain
  // supabase update, so without this the list would keep showing the previous
  // state until the next tenant load.
  const [siteActiveOverrides, setSiteActiveOverrides] = useState({});

  // A parked site (is_active = false) keeps every page, lead and key it had —
  // only its widget stops answering (api/chat/index.js refuses an inactive
  // site). Rows created before the migration have no column at all, so anything
  // that is not explicitly false counts as active.
  const isSiteActive = (site) => {
    if (!site) return false;
    if (Object.prototype.hasOwnProperty.call(siteActiveOverrides, site.id)) {
      return siteActiveOverrides[site.id];
    }
    return site.is_active !== false;
  };
  const activeSites = (sites || []).filter(isSiteActive);
  const isOverSiteLimit = activeSites.length > maxSitesForPlan;

  // Add Site Modal state (non-blocking)
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);
  const [newSiteUrlInput, setNewSiteUrlInput] = useState('');
  const [isAddingNewSite, setIsAddingNewSite] = useState(false);
  const [newSiteError, setNewSiteError] = useState('');
  // Upgrade-first prompt: shown instead of an inline error when the workspace
  // is already at its plan's website limit — either our own pre-check or the
  // sites_enforce_limit trigger refusing the insert.
  const [showUpgradeRequiredModal, setShowUpgradeRequiredModal] = useState(false);
  const [upgradeRequiredDomain, setUpgradeRequiredDomain] = useState('');

  // OVER_LIMIT_CHOOSE state — a Stripe downgrade (or a past_due plan change)
  // can leave a workspace holding more websites than its new plan covers. The
  // user picks which ones stay active; every other one is parked
  // (is_active = false), never deleted, and comes back on upgrade.
  const [showOverLimitModal, setShowOverLimitModal] = useState(false);
  const [overLimitKeepIds, setOverLimitKeepIds] = useState(new Set());
  const [isParkingSites, setIsParkingSites] = useState(false);
  const [overLimitError, setOverLimitError] = useState('');
  const [reactivatingSiteId, setReactivatingSiteId] = useState(null);
  const [siteNotice, setSiteNotice] = useState('');

  // Delete Site state
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isDeletingSite, setIsDeletingSite] = useState(false);
  const [deleteSiteError, setDeleteSiteError] = useState('');

  // Best-effort cleanup of any browser-side (this admin session's own origin)
  // references to a deleted site: the Live Preview widget (injected by
  // preview.html on this same origin) keeps its own chat session in
  // localStorage, scoped per public_key. If we don't clear it, re-adding a
  // site with a reused domain — or simply the browser tab sticking around —
  // could keep pointing at conversation state tied to the now-deleted site.
  const purgeLocalSiteReferences = (site) => {
    if (!site) return;
    try {
      window.localStorage?.removeItem(`b2b_chat_session_id_${site.public_key}`);
    } catch (e) {
      // localStorage unavailable (private mode, SSR, etc.) — nothing to clean up
    }
  };

  // Clear any stale error message whenever the confirm modal is (re)opened,
  // regardless of which of the several "Delete" buttons triggered it.
  useEffect(() => {
    if (showDeleteConfirmModal) setDeleteSiteError('');
  }, [showDeleteConfirmModal]);

  const handleConfirmDeleteSite = async () => {
    if (!activeSite?.id || isDeletingSite || !onDeleteSite) return;
    setIsDeletingSite(true);
    setDeleteSiteError('');
    const siteToDelete = activeSite;
    try {
      const result = await onDeleteSite(siteToDelete.id);
      if (result?.success) {
        purgeLocalSiteReferences(siteToDelete);
        setShowDeleteConfirmModal(false);
        onSiteDeleted(siteToDelete);
      } else {
        // Deletion genuinely failed server-side — keep the modal open and the
        // site in the list, and tell the user exactly what happened instead of
        // silently pretending it worked (the previous behavior left "ghost"
        // sites: gone from the UI, still present with all their data in the DB).
        setDeleteSiteError(result?.error || 'Deletion failed. Please try again.');
      }
    } catch (err) {
      console.error('[handleConfirmDeleteSite] Error:', err);
      setDeleteSiteError(err.message || 'Unexpected error while deleting the site.');
    } finally {
      setIsDeletingSite(false);
    }
  };

  // The `sites` table answers with raw Postgres errors (the limit trigger and
  // the sites_tenant_domain_uq unique index both surface as SQL strings). Turn
  // them into something a customer can actually act on.
  const describeSiteWriteError = (err, fallback) => {
    const raw = err?.message || '';
    if (raw.includes('site_limit_reached')) {
      return t('Your {plan} plan covers {max} website(s). Upgrade your plan to connect another one.', {
        plan: t(getPlanDisplayName(tenantPlan)),
        max: maxSitesForPlan,
      });
    }
    if (raw.includes('sites_tenant_domain_uq') || raw.includes('duplicate key')) {
      return 'This website is already connected to your workspace.';
    }
    return raw || fallback;
  };

  // Transient, non-error feedback for the dashboard view (e.g. "you already
  // have this website — switched you to it").
  useEffect(() => {
    if (!siteNotice) return;
    const timer = setTimeout(() => setSiteNotice(''), 8000);
    return () => clearTimeout(timer);
  }, [siteNotice]);

  // OVER_LIMIT_CHOOSE: as soon as the workspace has more active websites than
  // the plan covers, the choice is unavoidable — the widgets of whichever sites
  // end up parked stop answering, so the user, not us, decides which ones.
  // Pre-selects the website currently being viewed as a sane starting point.
  useEffect(() => {
    if (!isOverSiteLimit) {
      setShowOverLimitModal(false);
      return;
    }
    setOverLimitError('');
    setShowOverLimitModal(true);
    setOverLimitKeepIds(prev => {
      // Drop anything already parked (or gone) and never keep more ids than the
      // current plan has slots — a second downgrade can shrink the limit again.
      const stillSelectable = [...prev]
        .filter(id => activeSites.some(s => s.id === id))
        .slice(0, maxSitesForPlan);
      if (stillSelectable.length > 0) return new Set(stillSelectable);
      return new Set(isSiteActive(activeSite) ? [activeSite.id] : []);
    });
  }, [isOverSiteLimit, activeSite?.id]);

  const toggleOverLimitKeep = (siteId) => {
    setOverLimitKeepIds(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) {
        next.delete(siteId);
      } else {
        if (next.size >= maxSitesForPlan) return next; // plan has no more slots
        next.add(siteId);
      }
      return next;
    });
  };

  const handleConfirmOverLimitSelection = async () => {
    if (isParkingSites) return;
    const keepIds = Array.from(overLimitKeepIds);
    if (keepIds.length === 0 || keepIds.length > maxSitesForPlan) return;

    const idsToPark = activeSites.filter(s => !overLimitKeepIds.has(s.id)).map(s => s.id);
    if (idsToPark.length === 0) {
      setShowOverLimitModal(false);
      return;
    }

    setIsParkingSites(true);
    setOverLimitError('');
    try {
      // Plain update, no RPC: parking is always allowed under owner RLS — the
      // sites_enforce_limit trigger only guards the other direction
      // (re-activating). Deliberately an update and never a delete: upgrading
      // must bring these websites back with their pages, leads and keys intact.
      const { error } = await supabase
        .from('sites')
        .update({ is_active: false })
        .in('id', idsToPark);
      if (error) throw error;

      setSiteActiveOverrides(prev => {
        const next = { ...prev };
        idsToPark.forEach(id => { next[id] = false; });
        keepIds.forEach(id => { next[id] = true; });
        return next;
      });
      if (!overLimitKeepIds.has(activeSite?.id)) {
        onSelectSite(keepIds[0]);
      }
      setSiteNotice(`${idsToPark.length} website(s) parked. Nothing was deleted — upgrade your plan to bring them back online.`);
      setShowOverLimitModal(false);
    } catch (err) {
      console.error('[handleConfirmOverLimitSelection] Error:', err);
      setOverLimitError(describeSiteWriteError(err, 'Could not update your websites. Please try again.'));
    } finally {
      setIsParkingSites(false);
    }
  };

  // Bring a parked website back online. The trigger re-checks the limit on
  // re-activation, so a plan without a free slot is refused server-side too.
  const handleReactivateSite = async (site) => {
    if (!site?.id || reactivatingSiteId) return;
    setReactivatingSiteId(site.id);
    setSiteNotice('');
    try {
      const { error } = await supabase
        .from('sites')
        .update({ is_active: true })
        .eq('id', site.id);
      if (error) throw error;
      setSiteActiveOverrides(prev => ({ ...prev, [site.id]: true }));
      setSiteNotice(`${site.domain} is back online — its assistant is answering again.`);
    } catch (err) {
      console.error('[handleReactivateSite] Error:', err);
      setSiteNotice(describeSiteWriteError(err, 'Could not reactivate this website. Please try again.'));
    } finally {
      setReactivatingSiteId(null);
    }
  };

  // Add Website Modal Submit handler
  const handleOpenAddSiteModal = () => {
    setNewSiteUrlInput('');
    setNewSiteError('');
    setShowAddSiteModal(true);
  };

  const handleAddSiteModalSubmit = async (e) => {
    e.preventDefault();
    if (!newSiteUrlInput.trim()) return;

    const formattedUrl = ensureHttps(newSiteUrlInput);
    const currentDomain = domainFromUrl(formattedUrl);

    // Already connected? Switch to the site they have instead of attempting a
    // second row for the same domain — sites_tenant_domain_uq would reject it,
    // and a duplicate is never what the user actually wanted. Parked sites are
    // matched too: the answer there is to reactivate, not to add it twice.
    const existingSite = (sites || []).find(
      s => (s.domain || '').toLowerCase() === currentDomain.toLowerCase()
    );
    if (existingSite) {
      onSelectSite(existingSite.id);
      setShowAddSiteModal(false);
      setNewSiteUrlInput('');
      setNewSiteError('');
      setSiteNotice(
        isSiteActive(existingSite)
          ? `${existingSite.domain} is already connected to your workspace — switched you to it.`
          : `${existingSite.domain} is already connected to your workspace, but currently parked. Reactivate it below.`
      );
      return;
    }

    // Client-side pre-check, kept so a doomed crawl never starts. Counts every
    // website in the workspace, parked ones included: the database counts rows,
    // and parking is a consequence of exceeding the limit, not a way past it.
    if (sites && sites.length >= maxSitesForPlan) {
      setShowAddSiteModal(false);
      setUpgradeRequiredDomain(currentDomain);
      setShowUpgradeRequiredModal(true);
      return;
    }

    setIsAddingNewSite(true);
    setNewSiteError('');

    try {
      const captchaToken = await executeTurnstileCaptcha();
      let brandColor = '#293f68';
      let faviconUrl = null;

      try {
        const themeData = await fetchBrandTheme(formattedUrl, captchaToken);
        if (themeData?.primary_color) brandColor = themeData.primary_color;
        if (themeData?.favicon_url) faviconUrl = themeData.favicon_url;
      } catch (e) {}

      const newSiteObj = await onAddSite(currentDomain, brandColor, faviconUrl);

      if (newSiteObj) {
        onSelectSite(newSiteObj.id);
        setShowAddSiteModal(false);
        setIsAddingNewSite(false);
        await onSiteReady(newSiteObj, formattedUrl);
      } else {
        setNewSiteError('Could not add this website. Please verify domain name.');
        setIsAddingNewSite(false);
      }
    } catch (err) {
      console.error('[handleAddSiteModalSubmit] Error:', err);
      // The database has the last word on the limit (sites_enforce_limit); if
      // it is what refused the insert, answer with the same upgrade-first
      // prompt as the pre-check rather than a raw SQL string in a red box.
      if ((err?.message || '').includes('site_limit_reached')) {
        setShowAddSiteModal(false);
        setUpgradeRequiredDomain(currentDomain);
        setShowUpgradeRequiredModal(true);
      } else {
        setNewSiteError(describeSiteWriteError(err, 'Could not add this website. Please try again.'));
      }
      setIsAddingNewSite(false);
    }
  };

  return {
    isSiteActive,
    activeSites,
    isOverSiteLimit,
    siteNotice,
    setSiteNotice,
    showAddSiteModal,
    setShowAddSiteModal,
    newSiteUrlInput,
    setNewSiteUrlInput,
    isAddingNewSite,
    newSiteError,
    handleOpenAddSiteModal,
    handleAddSiteModalSubmit,
    showUpgradeRequiredModal,
    setShowUpgradeRequiredModal,
    upgradeRequiredDomain,
    showOverLimitModal,
    setShowOverLimitModal,
    overLimitKeepIds,
    toggleOverLimitKeep,
    handleConfirmOverLimitSelection,
    isParkingSites,
    overLimitError,
    reactivatingSiteId,
    handleReactivateSite,
    showDeleteConfirmModal,
    setShowDeleteConfirmModal,
    isDeletingSite,
    deleteSiteError,
    setDeleteSiteError,
    handleConfirmDeleteSite
  };
}
