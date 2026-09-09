import React from 'react';
import { NICHES } from '../../content/niches';

/**
 * The site footer. Its links are the only route to the legal pages and to
 * About when the header is hidden — which is exactly the case on the root
 * onboarding hero, before a workspace exists (see navigation.spec.js's
 * "About is still reachable from the footer even with the header hidden").
 *
 * The per-segment landing pages hang off it too: they are real pages meant
 * to be found and shared, and the footer is the one piece of chrome present
 * on every screen, header or no header.
 */
export default function Footer({ onNavigate }) {
  return (
    <footer className="max-w-7xl mx-auto px-4 sm:px-8 py-8 mt-8 text-xs text-gray-500 border-t border-dark-900/10 space-y-4">
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
        <span className="font-semibold text-gray-600">Solutions</span>
        {NICHES.map((niche) => (
          <button
            key={niche.view}
            onClick={() => onNavigate(niche.view)}
            className="hover:text-dark-900 transition-colors underline decoration-dotted underline-offset-4"
          >
            {niche.navLabel}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
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
      </div>
    </footer>
  );
}
