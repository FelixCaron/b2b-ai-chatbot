import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Header from './components/Header';
import OverviewStats from './components/OverviewStats';
import ClientOnboarding from './components/ClientOnboarding';
import LeadsTable from './components/LeadsTable';
import LoginModal from './components/LoginModal';
import Pricing from './components/Pricing';
import { Users } from 'lucide-react';

const SUPABASE_URL = "https://xuvueegdokgiyedwvmkm.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

export default function App() {
  const [sessionEmail, setSessionEmail] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [sites, setSites] = useState([]);
  const [leads, setLeads] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');

  const isGuest = !sessionEmail && selectedTenant?.name?.startsWith('Guest_');

  // Check LocalStorage on boot
  useEffect(() => {
    async function initSession() {
      const savedEmail = localStorage.getItem('b2b_session_email');
      if (savedEmail) {
        await handleLogin(savedEmail);
      } else {
        setLoading(false);
      }
    }
    initSession();
  }, []);

  const handleLogin = async (email) => {
    setLoading(true);
    let currentGuestTenant = (selectedTenant && selectedTenant.name.startsWith('Guest_')) ? selectedTenant : null;

    const { data: existingTenants } = await supabase.from('tenants').select('*').eq('name', email);
    let finalTenant = null;

    if (existingTenants && existingTenants.length > 0) {
      finalTenant = existingTenants[0];
      // If they had a guest tenant, maybe reassign its sites to the finalTenant, but for MVP let's just use existing.
      if (currentGuestTenant) {
        await supabase.from('sites').update({ tenant_id: finalTenant.id }).eq('tenant_id', currentGuestTenant.id);
      }
    } else {
      if (currentGuestTenant) {
        // Convert guest to real user
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
      setShowLoginModal(false);
    }
    setLoading(false);
  };

  const handleLogout = () => {
    setSessionEmail(null);
    setSelectedTenant(null);
    setSites([]);
    setLeads([]);
    localStorage.removeItem('b2b_session_email');
  };

  // Fetch tenant-specific resources whenever selectedTenant changes
  useEffect(() => {
    if (!selectedTenant) return;

    async function loadTenantData() {
      const tId = selectedTenant.id;
      const { data: sitesData } = await supabase.from('sites').select('*').eq('tenant_id', tId);
      setSites(sitesData || []);

      const { data: leadsData } = await supabase.from('leads').select('*').eq('tenant_id', tId).order('created_at', { ascending: false });
      setLeads(leadsData || []);

      const { data: usageData } = await supabase.from('usage').select('*').eq('tenant_id', tId).maybeSingle();
      setUsage(usageData || { messages_count: 0, leads_count: 0 });
    }

    loadTenantData();
  }, [selectedTenant]);

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
  const handleTriggerScan = async (siteId, url) => {
    if (!selectedTenant) return { success: false, error: 'No tenant selected' };
    try {
      const res = await fetch(`${window.location.origin}/api/start-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId, tenant_id: selectedTenant.id, url: url })
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
        Chargement de l'Espace Client...
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
          onShowPricing={() => setCurrentView(currentView === 'dashboard' ? 'pricing' : 'dashboard')}
        />
      )}

      {showLoginModal && (
        <LoginModal 
          onLogin={handleLogin} 
          onClose={!isGuest ? () => setShowLoginModal(false) : undefined}
          isGuestConversion={isGuest} 
        />
      )}

      {/* For Guest, we add a simple brand header instead of the full tenant header */}
      {!sessionEmail && !showLoginModal && (
        <header className="glass-card sticky top-0 z-50 px-8 py-4 mb-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-400 flex items-center justify-center text-white shadow-lg">
                <span className="font-bold">IA</span>
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">Plateforme Assistant IA</h1>
            </div>
            <button onClick={() => setShowLoginModal(true)} className="text-sm font-medium text-gray-300 hover:text-white">
              Se connecter
            </button>
          </div>
        </header>
      )}

      {currentView === 'pricing' ? (
        <Pricing onSelectPlan={() => setCurrentView('dashboard')} />
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-8 space-y-8 sm:space-y-12">
          {!isGuest && (
            <OverviewStats
              tenant={selectedTenant}
              sitesCount={sites.length}
              usage={usage}
              leadsCount={leads.length}
            />
          )}

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
            />
          </section>

          {!isGuest && sites.length > 0 && leads.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                  <Users className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-white">Prospects Capturés</h2>
              </div>
              <LeadsTable leads={leads} />
            </section>
          )}
        </main>
      )}
    </div>
  );
}
