import React, { useEffect, useState } from 'react';
import { authenticatedHeaders, supabase, supabaseConfigurationError } from './lib/supabase';
import Header from './components/Header';
import Dashboard from './features/dashboard/Dashboard';
import LeadsTable from './components/LeadsTable';
import LoginModal from './components/LoginModal';
import Pricing from './components/Pricing';
import PaymentSuccessPage from './components/PaymentSuccessPage';
import AboutPage from './components/AboutPage';
import { Users } from 'lucide-react';

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
  const [authMessage, setAuthMessage] = useState('');
  const [paymentToast, setPaymentToast] = useState(null); // 'success' | 'cancel' | null

  // Detect Stripe redirect routes
  const path = window.location.pathname;
  const [currentView, setCurrentView] = useState(
    path === '/payment-success' ? 'payment-success' :
    path === '/payment-cancel' ? 'pricing' :
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
        setAuthMessage('Vérifiez votre e-mail pour confirmer et sécuriser votre espace.');
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        setAuthMessage('Lien de connexion envoyé. Vérifiez votre e-mail.');
      }
    } catch (e) {
      console.warn('[handleLogin] error:', e);
      setAuthMessage(e.message || 'Impossible de démarrer la connexion.');
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
      const ownedTenants = data || [];
      setTenants(ownedTenants);
      setSelectedTenant((current) => ownedTenants.find((tenant) => tenant.id === current?.id) || ownedTenants[0] || null);
    }
    loadOwnedTenants();
  }, [currentUser?.id, authReady]);

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
          throw new Error(anonErr?.message || 'Session non initialisée. Veuillez activer "Anonymous Sign-in" dans les paramètres Supabase Auth ou vous connecter.');
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
          throw new Error(`Échec de création du workspace client: ${tErr?.message || 'Erreur base de données'}`);
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
      console.warn('[handleAddSite] Insert site warning, checking existing domain:', siteInsertErr.message);
    }

    // 2. If duplicate domain error, fetch existing site for this domain
    const { data: existingSite } = await supabase
      .from('sites')
      .select('*')
      .eq('domain', domain)
      .maybeSingle();

    if (existingSite) {
      await supabase.from('sites').update({ tenant_id: tId }).eq('id', existingSite.id);
      existingSite.tenant_id = tId;
      setSites((prev) => [existingSite, ...prev.filter((s) => s.id !== existingSite.id)]);
      return existingSite;
    }

    throw new Error(siteInsertErr?.message || "Échec de l'enregistrement du domaine dans la base de données.");
  };

  // Handler: Update site settings
  const handleUpdateSiteSettings = async (siteId, updates) => {
    const { data: updated } = await supabase.from('sites').update(updates).eq('id', siteId).select().single();
    if (updated) {
      setSites((prev) => prev.map((s) => (s.id === siteId ? updated : s)));
    }
  };

  // Handler: Delete unselected document URLs
  const handleDeleteDocumentUrls = async (siteId, urlsToDelete) => {
    if (!urlsToDelete || urlsToDelete.length === 0) return;
    await supabase.from('documents').delete().eq('site_id', siteId).in('url', urlsToDelete);
  };

  // Handler: Delete entire Site and its associated documents/summaries
  const handleDeleteSite = async (siteId) => {
    if (!siteId) return false;
    try {
      // 1. Try server API endpoint first for guaranteed cascade deletion
      try {
        const res = await fetch(`${window.location.origin}/api/crawler/delete-site`, {
          method: 'POST',
          headers: await authenticatedHeaders(),
          body: JSON.stringify({ site_id: siteId, tenant_id: selectedTenant?.id })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setSites((prev) => prev.filter((s) => s.id !== siteId));
            return true;
          }
        }
      } catch (apiErr) {
        console.warn('[handleDeleteSite] API delete fallback to client:', apiErr);
      }

      // 2. Direct client fallback with cascade cleanup
      await supabase.from('documents').delete().eq('site_id', siteId).catch(() => {});
      await supabase.from('site_summaries').delete().eq('site_id', siteId).catch(() => {});
      await supabase.from('leads').delete().eq('site_id', siteId).catch(() => {});
      await supabase.from('scan_jobs').delete().eq('site_id', siteId).catch(() => {});
      await supabase.from('usage_counters').delete().eq('site_id', siteId).catch(() => {});
      const { error } = await supabase.from('sites').delete().eq('id', siteId);
      if (error) throw error;
      setSites((prev) => prev.filter((s) => s.id !== siteId));
      return true;
    } catch (err) {
      console.error('[handleDeleteSite] Error:', err);
      // Even if network/DB error occurs, update UI state if desired
      setSites((prev) => prev.filter((s) => s.id !== siteId));
      return true;
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

      {/* For Guest, we add a simple brand header with navigation tabs */}
      {!sessionEmail && !showLoginModal && (
        <header className="glass-card sticky top-0 z-50 px-4 sm:px-8 py-3 sm:py-4 mb-6 sm:mb-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div 
                onClick={() => setCurrentView('dashboard')}
                className="flex items-center gap-3 cursor-pointer"
              >
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-400 flex items-center justify-center text-white shadow-lg">
                  <span className="font-bold">AI</span>
                </div>
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">AI Assistant Platform</h1>
              </div>

              <nav className="flex items-center gap-1 bg-dark-900/80 p-1 rounded-xl border border-white/5">
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
              </nav>
            </div>

            <button onClick={() => setShowLoginModal(true)} className="text-xs sm:text-sm font-medium bg-white/10 hover:bg-white/20 text-white px-3.5 py-1.5 rounded-lg transition-colors">
              Sign In
            </button>
          </div>
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
        />
      ) : currentView === 'about' ? (
        <AboutPage />
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
    </div>
  );
}
