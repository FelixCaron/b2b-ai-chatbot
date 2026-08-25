import React, { useState } from 'react';
import { ShieldCheck, LogOut, Settings, Loader2, Users, LayoutDashboard, Sparkles } from 'lucide-react';
import PlanBadge from './PlanBadge';
import { authenticatedHeaders } from '../lib/supabase';

export default function Header({ 
  tenants, 
  selectedTenant, 
  setSelectedTenant, 
  onLogout, 
  onShowPricing,
  currentView = 'dashboard',
  onSelectView,
  leadsCount = 0
}) {
  const [portalLoading, setPortalLoading] = useState(false);

  const plan = selectedTenant?.plan || 'free';
  const planStatus = selectedTenant?.plan_status || 'free';
  const hasActivePlan = plan !== 'free' && planStatus === 'active';

  const handleManageSubscription = async () => {
    if (!selectedTenant?.id) return;
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: await authenticatedHeaders(),
        body: JSON.stringify({ tenantId: selectedTenant.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('[Header] Portal error:', err);
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <header className="glass-card sticky top-0 z-50 px-4 sm:px-8 py-3 sm:py-4 mb-6 sm:mb-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & Title */}
        <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-start">
          <div 
            onClick={() => onSelectView?.('dashboard')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-400 shadow-lg shadow-brand-500/30 shrink-0 group-hover:scale-105 transition-transform">
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-dark-900" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight lowercase">repondo</h1>
              <p className="text-[10px] sm:text-xs text-gray-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> Secure Workspace
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-dark-900/80 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => onSelectView?.('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'dashboard' 
                  ? 'bg-brand-600 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => onSelectView?.('leads')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'leads' 
                  ? 'bg-brand-600 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Leads</span>
              {leadsCount > 0 && (
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {leadsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onSelectView?.('pricing')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'pricing' 
                  ? 'bg-brand-600 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Plans</span>
            </button>

            <button
              onClick={() => onSelectView?.('about')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'about' 
                  ? 'bg-brand-600 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>About</span>
            </button>
          </nav>
        </div>

        {/* Tenant Selector, Plan Badge & Actions */}
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">
          {/* Plan Badge — always visible */}
          <PlanBadge plan={plan} planStatus={planStatus} />

          {/* Manage Subscription (if on a paid plan) */}
          {hasActivePlan ? (
            <button
              id="manage-subscription-btn"
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="text-xs font-semibold text-gray-300 hover:text-white px-3 py-1.5 rounded-full border border-white/10 hover:border-white/25 flex items-center gap-1.5 transition-all disabled:opacity-50"
              title="Manage Subscription"
            >
              {portalLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Settings className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">Manage</span>
            </button>
          ) : (
            <button
              id="upgrade-btn"
              onClick={onShowPricing}
              className="text-xs font-semibold bg-gradient-to-r from-brand-500 to-indigo-500 hover:from-brand-400 hover:to-indigo-400 text-white px-3.5 py-1.5 rounded-full transition-all shadow-md shadow-brand-500/20 shrink-0"
            >
              Upgrade / Plans
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-medium hidden md:inline">Logged in:</span>
            <select
              value={selectedTenant?.id || ''}
              onChange={(e) => {
                const t = tenants.find((item) => item.id === e.target.value);
                if (t) setSelectedTenant(t);
              }}
              className="bg-dark-800 text-white border border-gray-700 rounded-lg px-2.5 py-1 text-xs sm:text-sm font-medium outline-none focus:border-brand-500 transition-colors cursor-pointer max-w-[140px] sm:max-w-[200px] truncate"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onLogout}
            className="shrink-0 text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
