import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import LogoMark from '../LogoMark';
import { navItemsWithBadges } from './navigation';
import { useT } from '../../i18n/LanguageContext';

/**
 * The lightweight header a guest (anonymous session) gets: the same four tabs
 * as the full header, a Sign In call to action instead of the tenant selector,
 * and no plan/billing controls — a guest has no plan to manage yet.
 *
 * Below the sm: breakpoint the nav collapses into a sandwich menu that closes
 * itself after each selection.
 */
export default function GuestHeader({ currentView = 'dashboard', onNavigate, onSignIn, leadsCount = 0 }) {
  const { t } = useT();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navItems = navItemsWithBadges({ leadsCount });

  const selectView = (view) => {
    onNavigate?.(view);
    setMobileMenuOpen(false);
  };

  const labelFor = (item) => (item.badge ? `${t(item.label)} (${item.badgeValue})` : t(item.label));

  return (
    <header className="glass-card sticky top-0 z-50 px-4 sm:px-8 py-3 sm:py-4 mb-6 sm:mb-8">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div
            onClick={() => selectView('dashboard')}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 text-brand-900 shrink-0 flex items-center justify-center">
              <LogoMark className="w-full h-full" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-dark-900 tracking-tight lowercase">dorafi</h1>
          </div>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1 bg-surface-200 p-1 rounded-xl border border-dark-900/5">
            {navItems.map((item) => (
              <button
                key={item.view}
                onClick={() => onNavigate?.(item.view)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  currentView === item.view ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-dark-900'
                }`}
              >
                {labelFor(item)}
              </button>
            ))}
          </nav>
        </div>

        {/* Desktop Sign In */}
        <button
          onClick={onSignIn}
          className="hidden sm:inline-flex text-xs sm:text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white px-3.5 py-1.5 rounded-lg transition-colors"
        >
          {t('Sign In')}
        </button>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="sm:hidden w-9 h-9 rounded-lg bg-surface-200 hover:bg-surface-300 border border-dark-900/10 flex items-center justify-center text-gray-600 transition-colors"
          aria-label={mobileMenuOpen ? t('Close menu') : t('Open menu')}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="sm:hidden max-w-7xl mx-auto mt-3 pt-3 border-t border-dark-900/10 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-150">
          {navItems.map((item) => (
            <button
              key={item.view}
              onClick={() => selectView(item.view)}
              className={`text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                currentView === item.view ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-surface-200'
              }`}
            >
              {labelFor(item)}
            </button>
          ))}
          <button
            onClick={() => { onSignIn?.(); setMobileMenuOpen(false); }}
            className="text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 mt-1 transition-colors"
          >
            {t('Sign In')}
          </button>
        </div>
      )}
    </header>
  );
}
