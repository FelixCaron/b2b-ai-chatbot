import React, { useState } from 'react';
import { ShieldCheck, LogOut, Settings, Loader2, Menu, X } from 'lucide-react';
import PlanBadge from '../PlanBadge';
import LogoMark from '../LogoMark';
import { navItemsWithBadges } from './navigation';
import api from '../../lib/api';

/**
 * The full header a signed-in user gets: workspace selector, plan badge, and
 * the billing action their plan calls for. The nav tabs themselves come from
 * ./navigation.js, shared with <GuestHeader />.
 */
export default function AppHeader({ 
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = navItemsWithBadges({ leadsCount });

  const selectView = (view) => {
    onSelectView?.(view);
    setMobileNavOpen(false);
  };

  const plan = selectedTenant?.plan || 'free';
  const planStatus = selectedTenant?.plan_status || 'free';
  const hasActivePlan = plan !== 'free' && planStatus === 'active';

  const handleManageSubscription = async () => {
    if (!selectedTenant?.id) return;
    setPortalLoading(true);
    const result = await api.billing.portal({ tenantId: selectedTenant.id });
    if (result.ok && result.data?.url) {
      window.location.href = result.data.url;
      return;
    }
    console.error('[AppHeader] Portal error:', result.error);
    setPortalLoading(false);
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
            <div className="w-9 h-9 sm:w-10 sm:h-10 text-brand-900 shrink-0 group-hover:scale-105 transition-transform flex items-center justify-center">
              <LogoMark className="w-full h-full" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-dark-900 tracking-tight lowercase">dorafi</h1>
              <p className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" /> Secure Workspace
              </p>
            </div>
          </div>

          {/* Navigation Tabs — inline pills from sm: up, a sandwich menu below that */}
          <nav className="hidden sm:flex items-center gap-1 bg-surface-200 p-1 rounded-xl border border-dark-900/5">
            {navItems.map(({ view, label, icon: Icon, iconClassName, badgeValue }) => (
              <button
                key={view}
                onClick={() => selectView(view)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  currentView === view
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-dark-900 hover:bg-white'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${iconClassName}`} />
                <span>{label}</span>
                {badgeValue > 0 && (
                  <span className="bg-emerald-500/15 text-emerald-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                    {badgeValue}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Sandwich menu toggle — mobile only */}
          <button
            onClick={() => setMobileNavOpen((open) => !open)}
            className="sm:hidden w-9 h-9 rounded-lg bg-surface-200 hover:bg-surface-300 border border-dark-900/10 flex items-center justify-center text-gray-600 transition-colors"
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {mobileNavOpen && (
          <nav className="sm:hidden w-full flex flex-col gap-1 pt-2 border-t border-dark-900/5">
            {navItems.map(({ view, label, icon: Icon, iconClassName, badgeValue }) => (
              <button
                key={view}
                onClick={() => selectView(view)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  currentView === view
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-dark-900 hover:bg-surface-200'
                }`}
              >
                <Icon className={`w-4 h-4 ${iconClassName}`} />
                <span>{label}</span>
                {badgeValue > 0 && (
                  <span className="bg-emerald-500/15 text-emerald-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                    {badgeValue}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}

        {/* Tenant Selector, Plan Badge & Actions */}
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-dark-900/5 pt-2 sm:pt-0">
          {/* Plan Badge — always visible */}
          <PlanBadge plan={plan} planStatus={planStatus} />

          {/* Manage Subscription (if on a paid plan) */}
          {hasActivePlan ? (
            <button
              id="manage-subscription-btn"
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="text-xs font-semibold text-gray-600 hover:text-dark-900 px-3 py-1.5 rounded-full border border-dark-900/10 hover:border-dark-900/25 flex items-center gap-1.5 transition-all disabled:opacity-50"
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
              className="text-xs font-semibold bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-600 hover:to-brand-400 text-white px-3.5 py-1.5 rounded-full transition-all shadow-md shadow-brand-500/20 shrink-0"
            >
              Upgrade / Plans
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium hidden md:inline">Logged in:</span>
            <select
              value={selectedTenant?.id || ''}
              onChange={(e) => {
                const t = tenants.find((item) => item.id === e.target.value);
                if (t) setSelectedTenant(t);
              }}
              className="bg-white text-dark-900 border border-gray-300 rounded-lg px-2.5 py-1 text-xs sm:text-sm font-medium outline-none focus:border-brand-500 transition-colors cursor-pointer max-w-[140px] sm:max-w-[200px] truncate"
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
            className="shrink-0 text-gray-500 hover:text-dark-900 p-2 rounded-lg hover:bg-surface-200 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
