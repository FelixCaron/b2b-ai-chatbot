import React, { useEffect, useState } from 'react';
import { supabase, supabaseConfigurationError, authenticatedHeaders } from './lib/supabase';
import LoginScreen from './components/LoginScreen';
import AccessDenied from './components/AccessDenied';
import TenantsList from './components/TenantsList';
import TenantDetail from './components/TenantDetail';

export default function App() {
  if (supabaseConfigurationError) {
    return (
      <main className="min-h-screen bg-dark-900 flex items-center justify-center p-6 text-slate-100">
        <div className="max-w-lg rounded-xl border border-red-400/40 bg-red-950/30 p-6">
          <h1 className="text-lg font-semibold">Configuration required</h1>
          <p className="mt-2 text-sm text-slate-300">{supabaseConfigurationError}</p>
        </div>
      </main>
    );
  }

  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  // 'checking' | 'denied' | 'granted'
  const [staffStatus, setStaffStatus] = useState('checking');
  const [selectedTenantId, setSelectedTenantId] = useState(null);

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
      <main className="min-h-screen bg-dark-900 flex items-center justify-center text-slate-400 text-sm">
        Checking access…
      </main>
    );
  }

  if (staffStatus === 'denied') {
    return <AccessDenied email={currentUser.email} onLogout={handleLogout} />;
  }

  return (
    <main className="min-h-screen bg-dark-900 text-gray-100">
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Repondo — Staff Console</h1>
          <p className="text-xs text-gray-500">Read-only, cross-tenant. Signed in as {currentUser.email}.</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10"
        >
          Sign out
        </button>
      </header>

      <div className="p-6">
        {selectedTenantId ? (
          <TenantDetail tenantId={selectedTenantId} onBack={() => setSelectedTenantId(null)} />
        ) : (
          <TenantsList onSelectTenant={setSelectedTenantId} />
        )}
      </div>
    </main>
  );
}
