import React, { useRef, useState } from 'react';
import { supabaseConfigurationError } from './lib/supabase';
import { AppShell } from './components/layout';
import ConfigurationError from './components/ConfigurationError';
import PaymentToast from './components/PaymentToast';
import LoginModal from './components/LoginModal';
import WorkspaceTransfer from './components/WorkspaceTransfer';
import Pricing from './components/Pricing';
import PaymentSuccessPage from './components/PaymentSuccessPage';
import AboutPage from './components/AboutPage';
import { PrivacyPolicy, TermsOfService } from './components/LegalPages';
import OsteopathyLanding from './components/OsteopathyLanding';
import Dashboard from './features/dashboard/Dashboard';
import ConversationsPage from './features/conversations/ConversationsPage';
import LeadsPage from './features/leads/LeadsPage';
import RecentLeadsSection from './features/leads/RecentLeadsSection';
import {
  useAuthSession,
  useCopilotNavigation,
  useGuestSiteClaim,
  usePaymentToast,
  useRouter,
  useWorkspace
} from './hooks';

// ---------------------------------------------------------------------------
// The composition root.
//
// App owns no data of its own beyond "is the login modal open": the session
// lives in useAuthSession, the account's tenants/sites/leads in useWorkspace,
// the guest-workspace transfer in useGuestSiteClaim, and the view↔URL mapping
// in useRouter. What is left here is the wiring between them and the switch
// that decides which view the shell renders.
// ---------------------------------------------------------------------------

export default function App() {
  if (supabaseConfigurationError) {
    return <ConfigurationError message={supabaseConfigurationError} />;
  }

  const [showLoginModal, setShowLoginModal] = useState(false);

  const { currentView, navigate } = useRouter();
  useCopilotNavigation(navigate);

  // Read once, before any effect rewrites it: Stripe's redirect path is gone
  // by the time the toast renders.
  const entryPathRef = useRef(window.location.pathname);
  const { paymentToast, setPaymentToast } = usePaymentToast(entryPathRef.current);

  // Filing a claim happens inside the sign-in flow, but needs the workspace
  // that only exists further down. The ref is the seam: useAuthSession calls
  // through it at login time, by which point it is populated.
  const claimRef = useRef(null);

  const auth = useAuthSession({
    onBeforeConvertGuest: (email) => claimRef.current?.createClaim(email)
  });

  const workspace = useWorkspace({
    currentUser: auth.currentUser,
    authReady: auth.authReady,
    setCurrentUser: auth.setCurrentUser,
    onLandOnSite: () => navigate('dashboard')
  });

  const claim = useGuestSiteClaim({
    authReady: auth.authReady,
    currentUser: auth.currentUser,
    selectedTenant: workspace.selectedTenant,
    sites: workspace.sites,
    landOnSite: workspace.landOnSite,
    deleteSite: workspace.deleteSite
  });
  claimRef.current = claim;

  const { sessionEmail, isGuest } = auth;
  const { sites, leads, selectedTenant } = workspace;

  const handleLogout = async () => {
    workspace.resetWorkspace();
    await auth.logout();
  };

  if (auth.loading || !auth.authReady) {
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center text-brand-600 text-sm font-medium animate-pulse">
        Loading Client Workspace...
      </div>
    );
  }

  // The header is deliberately absent on the marketing/landing screens (the
  // niche pages, and the root onboarding hero before a site exists) — the
  // app-shell nav (Dashboard/Leads/Plans/Sign In) doesn't belong there, only
  // once there's an actual workspace to navigate. A signed-in session always
  // gets its header.
  const isAuthenticated = Boolean(sessionEmail);
  const headerHidden =
    !isAuthenticated &&
    (showLoginModal ||
      currentView === 'osteopathes' ||
      (currentView === 'dashboard' && sites.length === 0));

  const header = {
    isAuthenticated,
    hidden: headerHidden,
    currentView,
    onNavigate: navigate,
    leadsCount: leads.length,
    tenants: workspace.tenants,
    selectedTenant,
    onSelectTenant: workspace.setSelectedTenant,
    onLogout: handleLogout,
    onShowPricing: () => navigate('pricing'),
    onSignIn: () => setShowLoginModal(true)
  };

  const renderView = () => {
    switch (currentView) {
      case 'payment-success':
        return <PaymentSuccessPage onGoToDashboard={() => { navigate('dashboard'); setPaymentToast(null); }} />;
      case 'pricing':
        return (
          <Pricing
            onSelectPlan={() => navigate('dashboard')}
            tenantId={selectedTenant?.id}
            currentPlan={selectedTenant?.plan || 'free'}
            onNavigate={navigate}
          />
        );
      case 'about':
        return <AboutPage />;
      case 'osteopathes':
        return <OsteopathyLanding onNavigate={navigate} />;
      case 'privacy':
        return <PrivacyPolicy />;
      case 'terms':
        return <TermsOfService />;
      case 'conversations':
        return <ConversationsPage tenantId={selectedTenant?.id} onBack={() => navigate('dashboard')} />;
      case 'leads':
        return <LeadsPage leads={leads} onBack={() => navigate('dashboard')} />;
      default:
        return (
          <main className="max-w-7xl mx-auto px-4 sm:px-8 space-y-8 sm:space-y-12">
            <section>
              <Dashboard
                selectedTenant={selectedTenant}
                sites={sites}
                onAddSite={workspace.addSite}
                onUpdateSiteSettings={workspace.updateSiteSettings}
                onDeleteDocumentUrls={workspace.deleteDocumentUrls}
                onTriggerScan={workspace.triggerScan}
                onDeleteSite={workspace.deleteSite}
                isGuest={isGuest}
                onRequireLogin={() => setShowLoginModal(true)}
                onViewLeads={() => navigate('leads')}
                onShowPricing={() => navigate('pricing')}
                leadsCount={leads.length}
              />
            </section>

            <RecentLeadsSection leads={leads} onViewAll={() => navigate('leads')} />
          </main>
        );
    }
  };

  return (
    <AppShell header={header}>
      {showLoginModal && (
        <LoginModal
          onLogin={auth.login}
          onClose={!isGuest ? () => setShowLoginModal(false) : undefined}
          isGuestConversion={isGuest}
          message={auth.authMessage}
        />
      )}

      {/* Guest workspace waiting to move into the account just signed into */}
      <WorkspaceTransfer
        state={claim.transferState}
        sites={sites}
        busy={claim.transferBusy}
        error={claim.transferError}
        onConfirm={claim.redeemClaim}
        onDismiss={claim.dismissTransfer}
        onUpgrade={() => {
          claim.setTransferState(null);
          navigate('pricing');
        }}
        onReplaceSite={claim.replaceSiteForTransfer}
      />

      <PaymentToast kind={paymentToast} />

      {renderView()}
    </AppShell>
  );
}
