import React, { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { getMaxSitesForPlan, getMaxConversationsForPlan, hasActivePlan } from './lib/plan-limits';
import { domainFromUrl, hasProtocol } from './lib/page-url';
import { executeTurnstileCaptcha } from './lib/turnstile';
import { fetchBrandTheme } from './lib/brand-theme';
import useSiteSummary from './hooks/useSiteSummary';
import useCrawlPipeline from './hooks/useCrawlPipeline';
import usePreview from './hooks/usePreview';
import useAssistantHealth from './hooks/useAssistantHealth';
import useSiteLifecycle from './hooks/useSiteLifecycle';
import OnboardingHero from './components/OnboardingHero';
import SiteTabs from './components/SiteTabs';
import SiteHeroCard from './components/SiteHeroCard';
import ParkedSiteBanner from './components/ParkedSiteBanner';
import GuidedRoadmap from './components/GuidedRoadmap';
import AssistantHealth from './components/AssistantHealth';
import AdvancedSettingsPanel from './components/AdvancedSettings/AdvancedSettingsPanel';
import LearningProgressModal from './components/modals/LearningProgressModal';
import LivePreviewModal from './components/modals/LivePreviewModal';
import IntegrationModal from './components/modals/IntegrationModal';
import EditPageModal from './components/modals/EditPageModal';
import AddSiteModal from './components/modals/AddSiteModal';
import DeleteSiteModal from './components/modals/DeleteSiteModal';
import ResetSiteModal from './components/modals/ResetSiteModal';
import PageSelectionModal from './components/modals/PageSelectionModal';
import UpgradeRequiredModal from './components/modals/UpgradeRequiredModal';
import OverLimitModal from './components/modals/OverLimitModal';
import SubscriptionRequiredModal from './components/modals/SubscriptionRequiredModal';

export default function Dashboard({
  selectedTenant,
  sites,
  onAddSite,
  onUpdateSiteSettings,
  onDeleteDocumentUrls,
  onTriggerScan,
  onDeleteSite,
  isGuest,
  onRequireLogin,
  onViewLeads,
  onViewConversations,
  onShowPricing,
  leadsCount = 0,
  // Set by the Conversations page's "Improve knowledge" action on an
  // unanswered question: '' just opens Knowledge, a URL also pre-fills the
  // "Add a page" field with the page the visitor was actually stuck on.
  pendingKnowledgeUrl = null,
  onPendingKnowledgeUrlConsumed
}) {
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [localCreatedSite, setLocalCreatedSite] = useState(null);
  const activeSite = (sites && sites.find(s => s.id === selectedSiteId)) || sites?.[0] || localCreatedSite;

  const tenantPlan = selectedTenant?.plan || 'basic';
  const maxSitesForPlan = getMaxSitesForPlan(tenantPlan);
  const maxConversationsForPlan = getMaxConversationsForPlan(tenantPlan);

  // Onboarding Step State
  const [siteUrl, setSiteUrl] = useState('');
  const [orgName, setOrgName] = useState(selectedTenant?.name || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedTheme, setDetectedTheme] = useState(null);
  const [step, setStep] = useState(activeSite ? 'dashboard' : 'input');
  const [statusMsg, setStatusMsg] = useState('');

  // View state shared by several sections
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showIntegrationModal, setShowIntegrationModal] = useState(false);
  const [showSubscriptionRequiredModal, setShowSubscriptionRequiredModal] = useState(false);
  const [showResetSiteModal, setShowResetSiteModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedScriptKey, setCopiedScriptKey] = useState(null);

  const summary = useSiteSummary(activeSite);

  const pipeline = useCrawlPipeline({
    activeSite,
    tenantPlan,
    onTriggerScan,
    onDeleteDocumentUrls,
    onUpdateSiteSettings,
    onEnterDashboard: () => setStep('dashboard'),
    setSiteSummary: summary.setSiteSummary,
    setIsRegeneratingSummary: summary.setIsRegeneratingSummary,
    refreshSiteSummary: summary.fetchSiteSummary
  });

  const preview = usePreview();

  const health = useAssistantHealth(selectedTenant?.id);

  // Pages the assistant can actually answer from. Both the health panel and
  // the roadmap card report this, so it is counted once.
  const loadedPagesCount = pipeline.discoveredPages.filter((p) => p.status === 'loaded').length;

  const lifecycle = useSiteLifecycle({
    sites,
    activeSite,
    tenantPlan,
    maxSitesForPlan,
    onAddSite,
    onDeleteSite,
    onSelectSite: setSelectedSiteId,
    onSiteDeleted: (siteToDelete) => {
      preview.setShowPreviewModal(false);
      if (localCreatedSite?.id === siteToDelete.id) {
        setLocalCreatedSite(null);
      }
      const remaining = sites ? sites.filter(s => s.id !== siteToDelete.id) : [];
      if (remaining.length > 0) {
        setSelectedSiteId(remaining[0].id);
      } else {
        setLocalCreatedSite(null);
        setSelectedSiteId(null);
        setSiteUrl('');
        pipeline.setDiscoveredPages([]);
        pipeline.setSelectedUrls(new Set());
        setDetectedTheme(null);
        setStep('input');
      }
    },
    onSiteReady: pipeline.runSynchronousCrawlAndIndex
  });

  // Sync step if activeSite or sites changes
  useEffect(() => {
    if (activeSite && step === 'input') {
      setStep('dashboard');
    } else if ((!sites || sites.length === 0) && !localCreatedSite && step !== 'input') {
      setSelectedSiteId(null);
      setStep('input');
    }
  }, [activeSite, sites, localCreatedSite, step]);

  useEffect(() => {
    pipeline.fetchIndexedPages();
    summary.fetchSiteSummary();
  }, [activeSite?.id]);

  // Instant Onboarding: Client enters URL -> Environment created -> Instant Dashboard with synchronous crawl progression!
  const handleAnalyzeSite = async (e) => {
    e.preventDefault();
    if (!siteUrl) return;

    let formattedUrl = siteUrl.trim();
    if (!hasProtocol(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
      setSiteUrl(formattedUrl);
    }

    setIsAnalyzing(true);
    setStatusMsg('Analyzing your website...');

    try {
      // Invisible silent captcha challenge
      const captchaToken = await executeTurnstileCaptcha();

      let currentDomain = domainFromUrl(formattedUrl);
      let brandColor = '#293f68';
      let faviconUrl = null;

      try {
        const themeData = await fetchBrandTheme(formattedUrl, captchaToken);
        if (themeData?.primary_color) brandColor = themeData.primary_color;
        if (themeData?.org_name) setOrgName(themeData.org_name);
        if (themeData?.favicon_url) faviconUrl = themeData.favicon_url;
      } catch (themeErr) {
        console.warn('Theme extraction fallback:', themeErr);
      }

      setStatusMsg('Building your assistant...');
      const siteObj = await onAddSite(currentDomain, brandColor, faviconUrl);

      if (siteObj) {
        setLocalCreatedSite(siteObj);
        setIsAnalyzing(false);

        await pipeline.runSynchronousCrawlAndIndex(siteObj, formattedUrl);
      } else {
        setStatusMsg('Error: could not add this site. Check that your Supabase session is active.');
        setIsAnalyzing(false);
      }
    } catch (err) {
      console.error('Onboarding error:', err);
      setStatusMsg(`Error: ${err.message}`);
      setIsAnalyzing(false);
    }
  };

  // Single source of truth for the embed snippet, used both for the visible
  // <pre> block and the "Copy Code" button — keeps them from drifting apart.
  // Carries only the site's tenant key: the API URL, theme color and
  // "Powered by" badge visibility are no longer baked into the snippet at
  // copy-paste time — the widget resolves them itself (its own production
  // default for the API, and a live /chat/init read for color + branding,
  // see apps/widget/src/main.js and api/chat/init.js) so a color change or
  // plan upgrade takes effect on the customer's site without anyone
  // re-pasting anything.
  const buildWidgetSnippet = (key) => {
    return `<script src="${window.location.origin}/widget.iife.js" data-tenant-key="${key}"></script>`;
  };

  const copyWidgetScript = (key) => {
    navigator.clipboard.writeText(buildWidgetSnippet(key));
    setCopiedScriptKey(key);
    setTimeout(() => setCopiedScriptKey(null), 2000);
  };

  const themeColor = activeSite?.theme_primary_color || '#293f68';

  // Installing puts the assistant on a real, live website — the one action
  // that actually requires a paid, active plan. Building and testing it
  // stays open to everyone (guest included), so this gate sits only here,
  // not behind the rest of the dashboard.
  const openIntegrationModal = () => {
    if (!hasActivePlan(selectedTenant)) {
      setShowSubscriptionRequiredModal(true);
      return;
    }
    setShowIntegrationModal(true);
  };
  const openPreviewModal = () => preview.setShowPreviewModal(true);
  const openAdvancedSettings = () => {
    setShowAdvancedSettings(true);
    setTimeout(() => {
      document.getElementById('advanced-settings-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  useEffect(() => {
    if (pendingKnowledgeUrl === null || !activeSite || step !== 'dashboard') return;
    setShowAdvancedSettings(true);
    const timer = setTimeout(() => {
      document.getElementById('knowledge-base-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 200);
    onPendingKnowledgeUrlConsumed?.();
    return () => clearTimeout(timer);
  }, [pendingKnowledgeUrl, activeSite, step]);

  return (
    <div className="space-y-8">
      {/* 1. HERO ONBOARDING (When no site exists) */}
      {(!activeSite || step !== 'dashboard') ? (
        <OnboardingHero
          siteUrl={siteUrl}
          setSiteUrl={setSiteUrl}
          isAnalyzing={isAnalyzing}
          statusMsg={statusMsg}
          onSubmit={handleAnalyzeSite}
          // An authenticated user with zero sites still gets the full header
          // (see Header.jsx) — only a guest needs this narrower way back into
          // an existing account.
          showSignIn={isGuest}
          onSignIn={onRequireLogin}
        />
      ) : (
        /* 2. MAIN DASHBOARD CLIENT VIEW */
        <div className="space-y-8">
          {/* Transient feedback (duplicate domain, parking, reactivation) */}
          {lifecycle.siteNotice && (
            <div className="flex items-start gap-3 bg-brand-500/10 border border-brand-500/30 text-brand-800 text-xs rounded-2xl px-4 py-3 animate-in fade-in">
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-brand-600" />
              <span className="flex-1 leading-relaxed">{lifecycle.siteNotice}</span>
              <button
                type="button"
                onClick={() => lifecycle.setSiteNotice('')}
                className="text-brand-600/70 hover:text-brand-900 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <SiteTabs
            sites={sites}
            activeSite={activeSite}
            isSiteActive={lifecycle.isSiteActive}
            onSelectSite={setSelectedSiteId}
            onOpenAddSiteModal={lifecycle.handleOpenAddSiteModal}
          />

          {/* Active Site Hero Card */}
          <SiteHeroCard
            activeSite={activeSite}
            themeColor={themeColor}
            isActive={lifecycle.isSiteActive(activeSite)}
            isCrawling={pipeline.isCrawling}
            isGuest={isGuest}
            onRequireLogin={onRequireLogin}
            onOpenPreview={openPreviewModal}
            onOpenIntegration={openIntegrationModal}
            onOpenSettings={openAdvancedSettings}
          >
            {!lifecycle.isSiteActive(activeSite) && (
              <ParkedSiteBanner
                activeSite={activeSite}
                tenantPlan={tenantPlan}
                maxSitesForPlan={maxSitesForPlan}
                activeSitesCount={lifecycle.activeSites.length}
                isReactivating={lifecycle.reactivatingSiteId === activeSite.id}
                onReactivate={lifecycle.handleReactivateSite}
                onShowPricing={onShowPricing}
              />
            )}

            {/* One panel or the other, never both.
                
                The roadmap's three cards had come to duplicate everything
                around them: "pages available to your assistant" is the health
                panel's first number, and its other two steps are the hero's
                own Test and Install buttons, sitting directly above it. But
                the roadmap is genuinely the right thing to show someone who
                has just finished onboarding, when every statistic is zero and
                what they need is the next instruction.
                
                So the dashboard answers a different question depending on
                where the owner is: before anyone has ever talked to the
                assistant it says what to do next, and afterwards it says how
                it's going. All-time rather than recent, so a quiet week
                doesn't demote an established site back to the setup guide.
                
                Neither is gated behind sign-in: these are the guest's own
                numbers about their own draft assistant, and the header nav
                already opens both pages for them. Signing in is what
                installing requires, not looking. */}
            {health.hasEverBeenUsed ? (
              <AssistantHealth
                pagesCount={loadedPagesCount}
                isCrawling={pipeline.isCrawling}
                conversationsThisWeek={health.conversationsThisWeek}
                conversationsThisMonth={health.conversationsThisMonth}
                conversationLimit={maxConversationsForPlan}
                leadsCount={leadsCount}
                unansweredCount={health.unansweredCount}
                onViewConversations={onViewConversations}
                onViewLeads={onViewLeads}
                onShowPricing={onShowPricing}
              />
            ) : (
              <GuidedRoadmap
                loadedPagesCount={loadedPagesCount}
                isCrawling={pipeline.isCrawling}
                isGuest={isGuest}
                onRequireLogin={onRequireLogin}
                onOpenPreview={openPreviewModal}
                onOpenIntegration={openIntegrationModal}
              />
            )}
          </SiteHeroCard>

          <AdvancedSettingsPanel
            showAdvancedSettings={showAdvancedSettings}
            onToggle={() => setShowAdvancedSettings((prev) => !prev)}
            activeSite={activeSite}
            selectedTenant={selectedTenant}
            themeColor={themeColor}
            onUpdateSiteSettings={onUpdateSiteSettings}
            onRecrawl={pipeline.handleRecrawlSite}
            isCrawling={pipeline.isCrawling}
            siteSummary={summary.siteSummary}
            setSiteSummary={summary.setSiteSummary}
            isLoadingSummary={summary.isLoadingSummary}
            isRegeneratingSummary={summary.isRegeneratingSummary}
            isSavingSummary={summary.isSavingSummary}
            summarySuccessMsg={summary.summarySuccessMsg}
            showSummaryEditor={summary.showSummaryEditor}
            setShowSummaryEditor={summary.setShowSummaryEditor}
            onRegenerateSummary={summary.handleRegenerateSummary}
            onSaveSummary={summary.handleSaveSummary}
            welcomeMessage={summary.welcomeMessage}
            setWelcomeMessage={summary.setWelcomeMessage}
            uiStatusTitle={summary.uiStatusTitle}
            setUiStatusTitle={summary.setUiStatusTitle}
            uiStatusOnline={summary.uiStatusOnline}
            setUiStatusOnline={summary.setUiStatusOnline}
            uiInputPlaceholder={summary.uiInputPlaceholder}
            setUiInputPlaceholder={summary.setUiInputPlaceholder}
            welcomeLanguage={summary.welcomeLanguage}
            hasWelcomeExperience={summary.hasWelcomeExperience}
            isSavingWelcome={summary.isSavingWelcome}
            welcomeSuccessMsg={summary.welcomeSuccessMsg}
            showWelcomeEditor={summary.showWelcomeEditor}
            setShowWelcomeEditor={summary.setShowWelcomeEditor}
            onSaveWelcomeExperience={summary.handleSaveWelcomeExperience}
            discoveredPages={pipeline.discoveredPages}
            selectedUrls={pipeline.selectedUrls}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onTogglePageActivation={pipeline.handleTogglePageActivation}
            onAddManualPage={pipeline.handleAddManualPage}
            onEditPage={pipeline.handleEditPage}
            prefillAddUrl={pendingKnowledgeUrl || ''}
            onRequestDeleteSite={() => lifecycle.setShowDeleteConfirmModal(true)}
            onRequestResetSite={() => setShowResetSiteModal(true)}
          />
        </div>
      )}

      <LearningProgressModal
        show={pipeline.showLearningModal}
        learningStep={pipeline.learningStep}
        learningDomain={pipeline.learningDomain}
        learningProgress={pipeline.learningProgress}
        crawlProgressMsg={pipeline.crawlProgressMsg}
        onTestBot={() => {
          pipeline.setShowLearningModal(false);
          preview.setShowPreviewModal(true);
        }}
        onGoToDashboard={() => pipeline.setShowLearningModal(false)}
      />

      <LivePreviewModal
        show={preview.showPreviewModal}
        activeSite={activeSite}
        themeColor={themeColor}
        onClose={() => {
          preview.setShowPreviewModal(false);
          if (isGuest) onRequireLogin();
        }}
      />

      <IntegrationModal
        show={showIntegrationModal}
        activeSite={activeSite}
        tenantPlan={tenantPlan}
        discoveredPages={pipeline.discoveredPages}
        selectedUrls={pipeline.selectedUrls}
        snippet={activeSite ? buildWidgetSnippet(activeSite.public_key) : ''}
        copied={copiedScriptKey === activeSite?.public_key}
        onCopy={() => copyWidgetScript(activeSite.public_key)}
        onClose={() => setShowIntegrationModal(false)}
        onManagePages={() => {
          setShowIntegrationModal(false);
          setShowAdvancedSettings(true);
          setTimeout(() => {
            const kbTable = document.getElementById('knowledge-base-section');
            if (kbTable) kbTable.scrollIntoView({ behavior: 'smooth' });
          }, 200);
        }}
        onShowPricing={onShowPricing}
      />

      <SubscriptionRequiredModal
        show={showSubscriptionRequiredModal}
        activeSiteDomain={activeSite?.domain}
        onShowPricing={onShowPricing}
        onClose={() => setShowSubscriptionRequiredModal(false)}
      />

      <EditPageModal
        editingPage={pipeline.editingPage}
        onChangeContent={(content) => pipeline.setEditingPage({ ...pipeline.editingPage, content })}
        onSave={async () => {
          const result = await pipeline.handleSavePageContent();
          if (result?.ok) {
            lifecycle.setSiteNotice('Page updated — your assistant now uses the new content.');
          }
        }}
        onClose={() => pipeline.setEditingPage(null)}
      />

      <AddSiteModal
        show={lifecycle.showAddSiteModal}
        newSiteUrlInput={lifecycle.newSiteUrlInput}
        setNewSiteUrlInput={lifecycle.setNewSiteUrlInput}
        isAddingNewSite={lifecycle.isAddingNewSite}
        newSiteError={lifecycle.newSiteError}
        onSubmit={lifecycle.handleAddSiteModalSubmit}
        onClose={() => lifecycle.setShowAddSiteModal(false)}
      />

      <DeleteSiteModal
        show={lifecycle.showDeleteConfirmModal}
        activeSite={activeSite}
        isDeletingSite={lifecycle.isDeletingSite}
        deleteSiteError={lifecycle.deleteSiteError}
        onCancel={() => {
          lifecycle.setShowDeleteConfirmModal(false);
          lifecycle.setDeleteSiteError('');
        }}
        onConfirm={lifecycle.handleConfirmDeleteSite}
      />

      <ResetSiteModal
        show={showResetSiteModal}
        activeSite={activeSite}
        onCancel={() => setShowResetSiteModal(false)}
        onConfirm={() => {
          // The reset (delete, then re-crawl) runs in the background from
          // here on — same as onboarding — so this modal doesn't block on
          // it; it just kicks the work off and gets out of the way.
          setShowResetSiteModal(false);
          pipeline.handleResetSite().catch((err) => {
            console.error('[handleResetSite] Reset failed:', err);
            lifecycle.setSiteNotice(`Could not reset ${activeSite?.domain || 'this website'} — please try again.`);
          });
        }}
      />

      <PageSelectionModal
        show={pipeline.showPageSelectionModal}
        pendingCrawlPages={pipeline.pendingCrawlPages}
        selectedUrls={pipeline.selectedUrls}
        setSelectedUrls={pipeline.setSelectedUrls}
        pageSelectionSearch={pipeline.pageSelectionSearch}
        setPageSelectionSearch={pipeline.setPageSelectionSearch}
        tenantPlan={tenantPlan}
        onConfirm={pipeline.handleConfirmSelectedPagesAndScan}
        onClose={() => pipeline.setShowPageSelectionModal(false)}
        onShowPricing={onShowPricing}
      />

      <UpgradeRequiredModal
        show={lifecycle.showUpgradeRequiredModal}
        tenantPlan={tenantPlan}
        maxSitesForPlan={maxSitesForPlan}
        sitesCount={sites?.length ?? 0}
        upgradeRequiredDomain={lifecycle.upgradeRequiredDomain}
        activeSiteDomain={activeSite?.domain}
        onShowPricing={onShowPricing}
        onDeleteInstead={() => {
          lifecycle.setShowUpgradeRequiredModal(false);
          lifecycle.setShowDeleteConfirmModal(true);
        }}
        onClose={() => lifecycle.setShowUpgradeRequiredModal(false)}
      />

      <OverLimitModal
        show={lifecycle.showOverLimitModal}
        activeSites={lifecycle.activeSites}
        tenantPlan={tenantPlan}
        maxSitesForPlan={maxSitesForPlan}
        overLimitKeepIds={lifecycle.overLimitKeepIds}
        overLimitError={lifecycle.overLimitError}
        isParkingSites={lifecycle.isParkingSites}
        onToggleKeep={lifecycle.toggleOverLimitKeep}
        onConfirm={lifecycle.handleConfirmOverLimitSelection}
        onClose={() => lifecycle.setShowOverLimitModal(false)}
        onShowPricing={onShowPricing}
      />
    </div>
  );
}
