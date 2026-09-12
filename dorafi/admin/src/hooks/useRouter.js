import { useEffect, useState } from 'react';
import { DEFAULT_VIEW, isKnownView, pathForView, viewForPath } from '../app/routes';

/**
 * The one place a view change happens: keeps `currentView` (the render switch)
 * and the address bar in step, and lets Back/Forward drive the switch.
 *
 * The first view is resolved from the address bar (Stripe redirects included),
 * so a deep link — /solutions/osteopathes, /pricing, a refreshed /leads —
 * renders that view rather than always booting into the dashboard.
 */
export function useRouter() {
  const [currentView, setCurrentView] = useState(() => viewForPath(window.location.pathname));

  const navigate = (view) => {
    const nextView = isKnownView(view) ? view : DEFAULT_VIEW;
    setCurrentView(nextView);
    const target = pathForView(nextView);
    if (window.location.pathname !== target) {
      window.history.pushState({ view: nextView }, '', target);
    }
  };

  // Back/forward buttons: the URL is already where the browser wants it, so
  // only the render switch has to catch up (no pushState here — that would
  // fight the history entry we are moving to).
  useEffect(() => {
    const handlePopState = () => setCurrentView(viewForPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return { currentView, navigate };
}

export default useRouter;
