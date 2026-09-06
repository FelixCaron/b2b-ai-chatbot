import React, { useEffect, useState } from 'react';
import { supabase, supabaseConfigurationError, authenticatedHeaders } from './lib/supabase';
import LoginScreen from './components/LoginScreen';
import AccessDenied from './components/AccessDenied';
import TenantsList from './components/TenantsList';
import TenantDetail from './components/TenantDetail';
import StaffAdmins from './components/StaffAdmins';

export default function App() {
  if (supabaseConfigurationError) {
    return (
      <main className="min-h-screen bg-surface-100 flex items-center justify-center p-6 text-dark-900">
        <div className="max-w-lg rounded-xl border border-red-300 bg-red-50 p-6">
          <h1 className="text-lg font-semibold">Configuration required</h1>
          <p className="mt-2 text-sm text-red-700">{supabaseConfigurationError}</p>
        </div>
      </main>
    );
  }

  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  // 'checking' | 'denied' | 'granted'
  const [staffStatus, setStaffStatus] = useState('checking');
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  // 'tenants' | 'staff'
  const [activeTab, setActiveTab] = useState('tenants');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user || null);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user || null);
      setStaffStatus('checking');
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = await authenticatedHeaders();
        const res = await fetch('/api/staff/tenants', { headers });
        if (cancelled) return;
        setStaffStatus(res.status === 200 ? 'granted' : 'denied');
      } catch {
        if (!cancelled) setStaffStatus('denied');
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  const handleLogin = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return error?.message || null;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSelectedTenantId(null);
    setStaffStatus('checking');
  };

  if (!authReady) return null;

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (staffStatus === 'checking') {
    return (
      <main className="min-h-screen bg-surface-100 flex items-center justify-center text-gray-500 text-sm">
        Checking access…
      </main>
    );
  }

  if (staffStatus === 'denied') {
    return <AccessDenied email={currentUser.email} onLogout={handleLogout} />;
  }

  return (
    <main className="min-h-screen bg-surface-100 text-dark-900">
      <header className="border-b border-dark-900/5 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Dorafi — Staff Console</h1>
          <p className="text-xs text-gray-500">Signed in as {currentUser.email}.</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-500 hover:text-dark-900 px-3 py-1.5 rounded-lg border border-dark-900/10"
        >
          Sign out
        </button>
      </header>

      <nav className="px-6 pt-4 flex gap-2 border-b border-dark-900/5">
        {[
          { id: 'tenants', label: 'Tenants' },
          { id: 'staff', label: 'Staff' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSelectedTenantId(null); }}
            className={`text-sm px-3 py-2 border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-brand-500 text-dark-900'
                : 'border-transparent text-gray-500 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="p-6">
        {activeTab === 'staff' ? (
          <StaffAdmins />
        ) : selectedTenantId ? (
          <TenantDetail tenantId={selectedTenantId} onBack={() => setSelectedTenantId(null)} />
        ) : (
          <TenantsList onSelectTenant={setSelectedTenantId} />
        )}
      </div>
    </main>
  );
}
