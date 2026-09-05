import React, { useEffect, useState } from 'react';
import { authenticatedHeaders, supabase, supabaseConfigurationError } from './lib/supabase';
import Header from './components/Header';
import Dashboard from './features/dashboard/Dashboard';
import LeadsTable from './components/LeadsTable';
import LoginModal from './components/LoginModal';
import Pricing from './components/Pricing';
import PaymentSuccessPage from './components/PaymentSuccessPage';
import AboutPage from './components/AboutPage';
import { PrivacyPolicy, TermsOfService } from './components/LegalPages';
import OsteopathyLanding from './components/OsteopathyLanding';
import { getMaxSitesForPlan } from './lib/plans';
import { Users, Menu, X } from 'lucide-react';

export default function App() {
  if (supabaseConfigurationError) {
    return (
      <main className="min-h-screen bg-dark-900 flex items-center justify-center p-6 text-slate-100">
        <div className="max-w-lg rounded-xl border border-red-400/40 bg-red-950/30 p-6">
          <h1 className="text-lg font-semibold">Configuration requise</h1>
          <p className="mt-2 text-sm text-slate-300">{supabaseConfigurationError}</p>
        </div>
      </main>
    );
  }
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [sites, setSites] = useState([]);
  const [leads, setLeads] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [paymentToast, setPaymentToast] = useState(null); // 'success' | 'cancel' | null

  // Detect Stripe redirect routes
  const path = window.location.pathname;
  const [currentView, setCurrentView] = useState(
    path === '/payment-success' ? 'payment-success' :
    path === '/payment-cancel' ? 'pricing' :
    path === '/solutions/osteopathes' ? 'osteopathes' :
    'dashboard'
  );

  const sessionEmail = currentUser?.email || null;
  const isGuest = Boolean(currentUser?.is_anonymous);

  useEffect(() => {
    async function initSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
      } else {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) console.warn('[auth] anonymous sign-in failed:', error.message);
        setCurrentUser(data.user || null);
      }
      setAuthReady(true);
    }
    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user || null);
    });

    // Listen for B2B Copilot Tool Calls
    const handleCopilotTool = (e) => {
      const { name, args } = e.detail;
      if (name === 'navigate_to' && args?.page) {
        setCurrentView(args.page.toLowerCase());
      }
    };
    window.addEventListener('b2b_tool_call', handleCopilotTool);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('b2b_tool_call', handleCopilotTool);
    };
  }, []);

  const handleLogin = async (email) => {
    setLoading(true);
    setAuthMessage('');
    try {
      if (currentUser?.is_anonymous) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
        setAuthMessage('Check your email to confirm and secure your workspace.');
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        setAuthMessage('Sign-in link sent. Check your email.');
      }
    } catch (e) {
      console.warn('[handleLogin] error:', e);
      setAuthMessage(e.message || 'Could not start sign-in.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSelectedTenant(null);
    setTenants([]);
    setSites([]);
    setLeads([]);
    const { data } = await supabase.auth.signInAnonymously();
    setCurrentUser(data.user || null);
  };

  // Show toast on payment redirect
  useEffect(() => {
    if (path === '/payment-success') {
      setPaymentToast('success');
      // Clean up URL without hard reload
      window.history.replaceState({}, '', '/');
    } else if (path === '/payment-cancel') {
      setPaymentToast('cancel');
      window.history.replaceState({}, '', '/');
      const t = setTimeout(() => setPaymentToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (!currentUser || !authReady) return;
    async function loadOwnedTenants() {
      const { data } = await supabase.from('tenants').select('*').eq('owner_user_id', currentUser.id);
      let ownedTenants = data || [];

      // A tenant created before its owner provided an email is named
      // `Guest_<timestamp>` (see handleAddSite below) and nothing ever
      // renamed it once they converted — a real, registered account could
      // sit under a stale "Guest_..." name forever, which is confusing in
      // any tenant list AND actively dangerous: the cleanup cron used to
      // decide what to delete by matching this same stale name pattern, so
      // a converted user's real data could get swept up by it. Fix at the
      // source: once we know the account is real (not anonymous, has a
      // confirmed email), bring the name in line with reality.
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
      setSites(sitesData || []);

      const { data: leadsData } = await supabase.from('leads').select('*').eq('tenant_id', tId).order('created_at', { ascending: false });
      setLeads(leadsData || []);

      const { data: usageData } = await supabase.from('usage').select('*').eq('tenant_id', tId).maybeSingle();
      setUsage(usageData || { messages_count: 0, leads_count: 0 });
    }

    loadTenantData();
  }, [selectedTenant?.id]);

  // Handler: Add new Site
  const handleAddSite = async (domain, primaryColor = '#6366f1') => {
    let user = currentUser;
    if (!user) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        user = sessionData.session.user;
        setCurrentUser(user);
      } else {
        const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
        if (anonErr || !anonData?.user) {
          console.error('[handleAddSite] Anonymous sign-in failed:', anonErr);
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
          console.error('[handleAddSite] Tenant creation failed:', tErr);
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

    if (siteInsertErr) {
      // The sites_enforce_limit trigger (see the site-limits migration) is
      // the real gate — this is a friendly message for the case a client
      // reaches the database despite the UI's own precheck (a stale plan
      // value, a second tab, a client that skips the check entirely).
      if (siteInsertErr.message?.includes('site_limit_reached')) {
        const plan = selectedTenant?.plan || tenants.find((t) => t.id === tId)?.plan || 'basic';
        const maxSites = getMaxSitesForPlan(plan);
        throw new Error(`Your plan allows up to ${maxSites} website(s). Please upgrade to add more domains!`);
      }
      console.warn('[handleAddSite] Insert site warning, checking existing domain:', siteInsertErr.message);
    }

    // 2. If duplicate domain error, fetch the existing site for this domain —
    // scoped to this tenant, matching the per-tenant unique index the
    // duplicate error actually comes from (sites_tenant_domain_uq). Adding a
    // domain you already have in this workspace just hands back that site
    // rather than erroring.
    const { data: existingSite } = await supabase
      .from('sites')
      .select('*')
      .eq('tenant_id', tId)
      .ilike('domain', domain)
      .maybeSingle();

    if (existingSite) {
      setSites((prev) => [existingSite, ...prev.filter((s) => s.id !== existingSite.id)]);
      return existingSite;
    }

    throw new Error(siteInsertErr?.message || 'Failed to save the domain to the database.');
  };

  // Handler: Update site settings
  const handleUpdateSiteSettings = async (siteId, updates) => {
    const { data: updated, error } = await supabase.from('sites').update(updates).eq('id', siteId).select().single();
    if (updated) {
      setSites((prev) => prev.map((s) => (s.id === siteId ? updated : s)));
      return { success: true };
    }
    // Surfaces sites_enforce_limit rejections (e.g. reactivating a parked
    // site while the plan is already full) instead of failing silently.
    return { success: false, error: error?.message?.includes('site_limit_reached')
      ? error.message.replace('site_limit_reached: ', '')
      : (error?.message || 'Could not save this change.') };
  };

  // Handler: Delete unselected document URLs
  const handleDeleteDocumentUrls = async (siteId, urlsToDelete) => {
    if (!urlsToDelete || urlsToDelete.length === 0) return;
    await supabase.from('documents').delete().eq('site_id', siteId).in('url', urlsToDelete);
  };

  // Handler: Delete entire Site and its associated documents/summaries.
  // This calls the atomic server-side RPC (delete_site_cascade) via the API
  // route so the deletion either fully succeeds or fully fails — never a
  // partial deletion. Only on a *confirmed* success do we touch local/UI
  // state; on failure we surface the real error instead of silently pretending
  // the site is gone (which used to leave "ghost" sites: removed from the UI
  // but still present, along with their data, in the database).
  const handleDeleteSite = async (siteId) => {
    if (!siteId || !selectedTenant?.id) {
      return { success: false, error: 'Missing site or workspace context.' };
    }
    try {
      const res = await fetch(`${window.location.origin}/api/crawler/delete-site`, {
        method: 'POST',
        headers: await authenticatedHeaders(),
        body: JSON.stringify({ site_id: siteId, tenant_id: selectedTenant.id })
      });

      let data = null;
      try {
        data = await res.json();
      } catch (parseErr) {
        // response had no/invalid JSON body — fall through to error handling below
      }

      if (res.ok && data?.success) {
        setSites((prev) => prev.filter((s) => s.id !== siteId));
        return { success: true };
      }

      const errorMessage = data?.error || `Deletion failed (HTTP ${res.status}). Please try again.`;
      console.error('[handleDeleteSite] Server refused/failed deletion:', errorMessage);
      return { success: false, error: errorMessage };
    } catch (err) {
      console.error('[handleDeleteSite] Network/exception error:', err);
      return { success: false, error: err.message || 'Network error while deleting the site. Please check your connection and try again.' };
    }
  };

  // Handler: Trigger Scan Job
  const handleTriggerScan = async (siteId, url, optionalTenantId = null) => {
    const tId = optionalTenantId || selectedTenant?.id;
    if (!tId) return { success: false, error: 'No tenant selected' };
    try {
      const res = await fetch(`${window.location.origin}/api/crawler/scan`, {
        method: 'POST',
        headers: await authenticatedHeaders(),
        body: JSON.stringify({ site_id: siteId, tenant_id: tId, url: url })
      });
      const data = await res.json();
      return { success: res.ok, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  if (loading || !authReady) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center text-brand-400 text-sm font-medium animate-pulse">
        Loading Client Workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-16">
      {sessionEmail && (
        <Header
          tenants={tenants}
          selectedTenant={selectedTenant}
          setSelectedTenant={setSelectedTenant}
          onLogout={handleLogout}
          currentView={currentView}
          onSelectView={(v) => setCurrentView(v)}
          onShowPricing={() => setCurrentView('pricing')}
          leadsCount={leads.length}
        />
      )}

      {showLoginModal && (
        <LoginModal 
          onLogin={handleLogin} 
          onClose={!isGuest ? () => setShowLoginModal(false) : undefined}
          isGuestConversion={isGuest} 
          message={authMessage}
        />
      )}

      {/* For Guest, we add a simple brand header with navigation tabs.
          It's skipped on marketing/landing screens (the niche pages, and
          the root onboarding hero before a site exists) - the app-shell
          nav (Dashboard/Leads/Plans/Sign In) doesn't belong there, only
          once there's an actual workspace to navigate. */}
      {!sessionEmail && !showLoginModal && currentView !== 'osteopathes' &&
        !(currentView === 'dashboard' && sites.length === 0) && (
        <header className="glass-card sticky top-0 z-50 px-4 sm:px-8 py-3 sm:py-4 mb-6 sm:mb-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div
                onClick={() => { setCurrentView('dashboard'); setMobileMenuOpen(false); }}
                className="flex items-center gap-3 cursor-pointer"
              >
                <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-400 shadow-lg flex items-center justify-center">
                  <span className="text-white font-extrabold text-base sm:text-lg leading-none select-none">R</span>
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-dark-900" />
                </div>
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight lowercase">repondo</h1>
              </div>

              {/* Desktop nav */}
              <nav className="hidden sm:flex items-center gap-1 bg-dark-900/80 p-1 rounded-xl border border-white/5">
                <button
                  onClick={() => setCurrentView('dashboard')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentView === 'dashboard' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setCurrentView('leads')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentView === 'leads' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Leads ({leads.length})
                </button>
                <button
                  onClick={() => setCurrentView('pricing')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentView === 'pricing' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Plans
                </button>
                <button
                  onClick={() => setCurrentView('about')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentView === 'about' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  About
                </button>
              </nav>
            </div>

            {/* Desktop Sign In */}
            <button
              onClick={() => setShowLoginModal(true)}
              className="hidden sm:inline-flex text-xs sm:text-sm font-medium bg-white/10 hover:bg-white/20 text-white px-3.5 py-1.5 rounded-lg transition-colors"
            >
              Sign In
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="sm:hidden w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-300 transition-colors"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>

          {/* Mobile dropdown */}
          {mobileMenuOpen && (
            <div className="sm:hidden max-w-7xl mx-auto mt-3 pt-3 border-t border-white/10 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-150">
              <button
                onClick={() => { setCurrentView('dashboard'); setMobileMenuOpen(false); }}
                className={`text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  currentView === 'dashboard' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => { setCurrentView('leads'); setMobileMenuOpen(false); }}
                className={`text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  currentView === 'leads' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                Leads ({leads.length})
              </button>
              <button
                onClick={() => { setCurrentView('pricing'); setMobileMenuOpen(false); }}
                className={`text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  currentView === 'pricing' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                Plans
              </button>
              <button
                onClick={() => { setCurrentView('about'); setMobileMenuOpen(false); }}
                className={`text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  currentView === 'about' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                About
              </button>
              <button
                onClick={() => { setShowLoginModal(true); setMobileMenuOpen(false); }}
                className="text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold text-white bg-white/10 hover:bg-white/20 mt-1 transition-colors"
              >
                Sign In
              </button>
            </div>
          )}
        </header>
      )}

      {/* Payment cancel toast */}
      {paymentToast === 'cancel' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-dark-800 border border-yellow-500/30 text-yellow-400 text-sm rounded-xl px-6 py-3 shadow-xl animate-in fade-in slide-in-from-bottom-4">
          ⚠️ Payment canceled. You can try again at any time.
        </div>
      )}

      {currentView === 'payment-success' ? (
        <PaymentSuccessPage onGoToDashboard={() => { setCurrentView('dashboard'); setPaymentToast(null); }} />
      ) : currentView === 'pricing' ? (
        <Pricing
          onSelectPlan={() => setCurrentView('dashboard')}
          tenantId={selectedTenant?.id}
          currentPlan={selectedTenant?.plan || 'free'}
          onNavigate={setCurrentView}
        />
      ) : currentView === 'about' ? (
        <AboutPage />
      ) : currentView === 'osteopathes' ? (
        <OsteopathyLanding onNavigate={setCurrentView} />
      ) : currentView === 'privacy' ? (
        <PrivacyPolicy />
      ) : currentView === 'terms' ? (
        <TermsOfService />
      ) : currentView === 'leads' ? (
        <main className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Captured Leads & Contacts</h2>
                <p className="text-xs text-gray-400">Prospects and inquiries collected automatically by your AI assistants</p>
              </div>
            </div>
            <button
              onClick={() => setCurrentView('dashboard')}
              className="text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"
            >
              ← Back to Dashboard
            </button>
          </div>
          <LeadsTable leads={leads} />
        </main>
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-8 space-y-8 sm:space-y-12">
          <section>
            <Dashboard
              selectedTenant={selectedTenant}
              sites={sites}
              onAddSite={handleAddSite}
              onUpdateSiteSettings={handleUpdateSiteSettings}
              onDeleteDocumentUrls={handleDeleteDocumentUrls}
              onTriggerScan={handleTriggerScan}
              onDeleteSite={handleDeleteSite}
              isGuest={isGuest}
              onRequireLogin={() => setShowLoginModal(true)}
              onViewLeads={() => setCurrentView('leads')}
              onShowPricing={() => setCurrentView('pricing')}
              leadsCount={leads.length}
            />
          </section>

          {leads.length > 0 && (
            <section className="border-t border-white/5 pt-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Recent Captured Leads</h2>
                    <p className="text-xs text-gray-400">{leads.length} prospect{leads.length > 1 ? 's' : ''} captured</p>
                  </div>
                </div>
                <button
                  onClick={() => setCurrentView('leads')}
                  className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
                >
                  View All Leads →
                </button>
              </div>
              <LeadsTable leads={leads} />
            </section>
          )}
        </main>
      )}

      <footer className="max-w-7xl mx-auto px-4 sm:px-8 py-8 mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-500 border-t border-white/5">
        <button onClick={() => setCurrentView('about')} className="hover:text-gray-300 transition-colors">
          About
        </button>
        <button onClick={() => setCurrentView('privacy')} className="hover:text-gray-300 transition-colors">
          Privacy Policy
        </button>
        <button onClick={() => setCurrentView('terms')} className="hover:text-gray-300 transition-colors">
          Terms of Service
        </button>
        <span>&copy; {new Date().getFullYear()} Repondo</span>
      </footer>
    </div>
  );
}
