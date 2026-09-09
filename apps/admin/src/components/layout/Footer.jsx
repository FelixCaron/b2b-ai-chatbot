import React from 'react';
import { useT } from '../../i18n/LanguageContext';

/**
 * The site footer. Its three links are the only route to the legal pages and
 * to About when the header is hidden — which is exactly the case on the root
 * onboarding hero, before a workspace exists (see navigation.spec.js's "About
 * is still reachable from the footer even with the header hidden").
 *
 * The /solutions/<slug> segment pages are deliberately NOT here: they are
 * unlisted outreach pages, sent to one segment at a time, not something every
 * customer should find by scrolling. Their links live in the staff console
 * (apps/internal-admin's Niches tab).
 */
export default function Footer({ onNavigate }) {
  const { t } = useT();
  return (
    <footer className="max-w-7xl mx-auto px-4 sm:px-8 py-8 mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-500 border-t border-dark-900/10">
      <button onClick={() => onNavigate('about')} className="hover:text-dark-900 transition-colors">
        {t('About')}
      </button>
      <button onClick={() => onNavigate('privacy')} className="hover:text-dark-900 transition-colors">
        {t('Privacy Policy')}
      </button>
      <button onClick={() => onNavigate('terms')} className="hover:text-dark-900 transition-colors">
        {t('Terms of Service')}
      </button>
      <span>&copy; {new Date().getFullYear()} Dorafi</span>
    </footer>
  );
}
