import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Header from './components/Header';
import ClientOnboarding from './components/ClientOnboarding';
import LeadsTable from './components/LeadsTable';
import LoginModal from './components/LoginModal';
import Pricing from './components/Pricing';
import PaymentSuccessPage from './components/PaymentSuccessPage';
import { Users } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://xuvueegdokgiyedwvmkm.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function App() {
  const [sessionEmail, setSessionEmail] = useState(() => localStorage.getItem('b2b_session_email') || null);
  const [selectedTenant, setSelectedTenant] = useState(() => {
    try {
      const saved = localStorage.getItem('b2b_selected_tenant');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [tenants, setTenants] = useState(() => (selectedTenant ? [selectedTenant] : []));
  const [sites, setSites] = useState([]);
  const [leads, setLeads] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [paymentToast, setPaymentToast] = useState(null); // 'success' | 'cancel' | null

  // Detect Stripe redirect routes
  const path = window.location.pathname;
  const [currentView, setCurrentView] = useState(
    path === '/payment-success' ? 'payment-success' :
    path === '/payment-cancel' ? 'pricing' :
    'dashboard'
  );

  const isGuest = !sessionEmail && selectedTenant?.name?.startsWith('Guest_');

  // Check LocalStorage & sync session silently in background on boot
  useEffect(() => {
    async function initSession() {
      const savedEmail = localStorage.getItem('b2b_session_email');
      if (savedEmail) {
        await handleLogin(savedEmail, true);
      }
    }
    initSession();
  }, []);

  const handleLogin = async (email, isBackgroundSync = false) => {
    if (!isBackgroundSync) setLoading(true);
    let currentGuestTenant = (selectedTenant && selectedTenant.name.startsWith('Guest_')) ? selectedTenant : null;

    try {
      const { data: existingTenants } = await supabase.from('tenants').select('*').eq('name', email);
      let finalTenant = null;

      if (existingTenants && existingTenants.length > 0) {
        finalTenant = existingTenants[0];
        if (currentGuestTenant) {
          await supabase.from('sites').update({ tenant_id: finalTenant.id }).eq('tenant_id', currentGuestTenant.id);
        }
      } else {
        if (currentGuestTenant) {
          const { data: updated } = await supabase.from('tenants').update({ name: email }).eq('id', currentGuestTenant.id).select().single();
          finalTenant = updated;
        } else {
          const { data: newTenant } = await supabase.from('tenants').insert({ name: email }).select().single();
          finalTenant = newTenant;
        }
      }

      if (finalTenant) {
        setTenants([finalTenant]);
        setSelectedTenant(finalTenant);
        setSessionEmail(email);
        localStorage.setItem('b2b_session_email', email);
        localStorage.setItem('b2b_selected_tenant', JSON.stringify(finalTenant));
        setShowLoginModal(false);
      }
    } catch (e) {
      console.warn('[handleLogin] error:', e);
    } finally {
      if (!isBackgroundSync) setLoading(false);
    }
  };

  const handleLogout = () => {
    setSessionEmail(null);
    setSelectedTenant(null);
    setSites([]);
    setLeads([]);
    localStorage.removeItem('b2b_session_email');
    localStorage.removeItem('b2b_selected_tenant');
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
    let tId = selectedTenant?.id;

    // Create guest tenant if absolutely needed
    if (!tId) {
      const { data: guestTenant } = await supabase.from('tenants').insert({ name: 'Guest_' + Date.now() }).select().single();
      if (guestTenant) {
        tId = guestTenant.id;
        setTenants([guestTenant]);
        setSelectedTenant(guestTenant);
      } else {
        return null;
      }
    }

    // 1. Attempt insert
    const { data: newSite } = await supabase
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

    return null;
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

  // Handler: Trigger Scan Job
  const handleTriggerScan = async (siteId, url, optionalTenantId = null) => {
    const tId = optionalTenantId || selectedTenant?.id;
    if (!tId) return { success: false, error: 'No tenant selected' };
    try {
      const res = await fetch(`${window.location.origin}/api/start-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId, tenant_id: tId, url: url })
      });
      const data = await res.json();
      return { success: res.ok, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  if (loading) {
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
          ⚠️ Payment canceled. You can try again at any time.
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
              ← Back to Dashboard
            </button>
          </div>
          <LeadsTable leads={leads} />
        </main>
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-8 space-y-8 sm:space-y-12">
          <section>
            <ClientOnboarding
              selectedTenant={selectedTenant}
              sites={sites}
              onAddSite={handleAddSite}
              onUpdateSiteSettings={handleUpdateSiteSettings}
              onDeleteDocumentUrls={handleDeleteDocumentUrls}
              onTriggerScan={handleTriggerScan}
              isGuest={isGuest}
              onRequireLogin={() => setShowLoginModal(true)}
              onViewLeads={() => setCurrentView('leads')}
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
