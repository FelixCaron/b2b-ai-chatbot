// ---------------------------------------------------------------------------
// Views ↔ URLs. `currentView` stays the single render switch in App.jsx; this
// module is only the translation layer that gives each view a real address, so
// Back moves between views instead of leaving the application and a refresh
// lands where the user was (ADR 057). Deliberately not a router: the whole
// thing is this map, pathForView(), viewForPath(), and one popstate listener
// (see hooks/useRouter.js).
// ---------------------------------------------------------------------------

export const VIEW_PATHS = {
  dashboard: '/',
  conversations: '/conversations',
  leads: '/leads',
  'support-tickets': '/support-requests',
  pricing: '/pricing',
  about: '/about',
  privacy: '/privacy',
  terms: '/terms',
  'payment-success': '/payment-success',
  osteopathes: '/solutions/osteopathes'
};

export const DEFAULT_VIEW = 'dashboard';

export function viewForPath(pathname) {
  // Stripe's cancel URL has no view of its own — it drops the user back on the
  // pricing table (and the URL is rewritten to '/' by App's toast effect).
  if (pathname === '/payment-cancel') return 'pricing';
  const normalized = pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname;
  return Object.keys(VIEW_PATHS).find((view) => VIEW_PATHS[view] === normalized) || DEFAULT_VIEW;
}

export function pathForView(view) {
  return VIEW_PATHS[view] || VIEW_PATHS[DEFAULT_VIEW];
}

export function isKnownView(view) {
  return Boolean(VIEW_PATHS[view]);
}
