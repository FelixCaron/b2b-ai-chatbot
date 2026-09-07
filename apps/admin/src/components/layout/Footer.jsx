import React from 'react';

/**
 * The site footer. Its three links are the only route to the legal pages and
 * to About when the header is hidden — which is exactly the case on the root
 * onboarding hero, before a workspace exists (see navigation.spec.js's "About
 * is still reachable from the footer even with the header hidden").
 */
export default function Footer({ onNavigate }) {
  return (
    <footer className="max-w-7xl mx-auto px-4 sm:px-8 py-8 mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-500 border-t border-dark-900/10">
      <button onClick={() => onNavigate('about')} className="hover:text-dark-900 transition-colors">
        About
      </button>
      <button onClick={() => onNavigate('privacy')} className="hover:text-dark-900 transition-colors">
        Privacy Policy
      </button>
      <button onClick={() => onNavigate('terms')} className="hover:text-dark-900 transition-colors">
        Terms of Service
      </button>
      <span>&copy; {new Date().getFullYear()} Dorafi</span>
    </footer>
  );
}
