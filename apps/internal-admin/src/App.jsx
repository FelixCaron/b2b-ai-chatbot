import React, { useEffect, useState } from 'react';
import { supabase, supabaseConfigurationError } from './lib/supabase';
import { api } from './lib/api';
import AppShell from './components/layout/AppShell';
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
        // Any staff-only endpoint answers the access question; this one is the
        // page the console opens on anyway.
        const res = await api.staff.listTenants();
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

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSelectedTenantId(null);
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
    <AppShell
      email={currentUser.email}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onLogout={handleLogout}
    >
      {activeTab === 'staff' ? (
        <StaffAdmins />
      ) : selectedTenantId ? (
        <TenantDetail tenantId={selectedTenantId} onBack={() => setSelectedTenantId(null)} />
      ) : (
        <TenantsList onSelectTenant={setSelectedTenantId} />
      )}
    </AppShell>
  );
}
