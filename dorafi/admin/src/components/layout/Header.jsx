import React from 'react';
import AppHeader from './AppHeader';
import GuestHeader from './GuestHeader';

/**
 * The application header — one component, two shapes.
 *
 * A signed-in session gets the full header (workspace selector, plan badge,
 * billing action); a guest gets the lightweight one (same nav, a Sign In call
 * to action instead). Which one is a detail of this file, not something every
 * caller has to branch on: App.jsx renders <Header /> and passes what it has.
 *
 * `null` is a legitimate answer. The header is deliberately absent on the
 * marketing/landing screens and on the root onboarding hero before a workspace
 * exists — an app-shell nav (Dashboard/Leads/Plans/Sign In) does not belong on
 * a page whose only job is to take a URL.
 */
export default function Header({
  isAuthenticated,
  hidden = false,
  currentView = 'dashboard',
  onNavigate,
  leadsCount = 0,
  // Signed-in only
  tenants = [],
  selectedTenant = null,
  onSelectTenant,
  onLogout,
  onShowPricing,
  // Guest only
  onSignIn
}) {
  if (hidden) return null;

  if (isAuthenticated) {
    return (
      <AppHeader
        tenants={tenants}
        selectedTenant={selectedTenant}
        setSelectedTenant={onSelectTenant}
        onLogout={onLogout}
        currentView={currentView}
        onSelectView={onNavigate}
        onShowPricing={onShowPricing}
        leadsCount={leadsCount}
      />
    );
  }

  return (
    <GuestHeader
      currentView={currentView}
      onNavigate={onNavigate}
      onSignIn={onSignIn}
      leadsCount={leadsCount}
    />
  );
}
