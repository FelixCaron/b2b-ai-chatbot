import React, { useState } from 'react';
import { Bot, ShieldCheck, LogOut, Settings, Loader2 } from 'lucide-react';
import PlanBadge from './PlanBadge';

export default function Header({ tenants, selectedTenant, setSelectedTenant, onLogout, onShowPricing }) {
  const [portalLoading, setPortalLoading] = useState(false);

  const plan = selectedTenant?.plan || 'free';
  const planStatus = selectedTenant?.plan_status || 'free';
  const hasActivePlan = plan !== 'free' && planStatus === 'active';

  const handleManageSubscription = async () => {
    if (!selectedTenant?.id) return;
    setPortalLoading(true);
    try {
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-400 flex items-center justify-center text-white shadow-lg shadow-brand-500/30 shrink-0">
              <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-white tracking-tight">AI Assistant Platform</h1>
              <p className="text-[10px] sm:text-xs text-gray-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> Secure Workspace
              </p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="sm:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
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
            className="hidden sm:block text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
