import { useEffect, useRef, useState } from 'react';
import { resolveSiteWidgetStatus } from '@b2b-ai-chatbot/contracts';
import { supabase } from '../../../lib/supabase';

const POLL_INTERVAL_MS = 30 * 1000;

/**
 * Whether the widget has actually been seen loading on the site's own domain —
 * a real signal, not a self-report: the widget calls api/chat/init on load from
 * the visitor's browser, and that route stamps sites.widget_last_seen_at only
 * when the request's Origin matches the site's own domain (see
 * api/chat/init.js). Read directly rather than trusting the `sites` row already
 * in memory, which is only as fresh as the last full workspace load.
 *
 * Two different questions, and conflating them was a bug:
 *
 *   isInstalled — has the snippet EVER loaded from this domain? That is what
 *     "the code is in place" means, and it doesn't stop being true because
 *     nobody visited the site this morning. The dashboard hides the Install
 *     call-to-action on this, so a quiet Tuesday can't tell an owner who
 *     installed weeks ago to go install it again.
 *   isLive — was it seen in the last few minutes? That is traffic, and it is
 *     only ever used to say something positive ("live on your website").
 *
 * The rule itself — including how wide "the last few minutes" is — lives in
 * @b2b-ai-chatbot/contracts' widget-status.js, shared with the install modal
 * and the staff console, so the three cannot drift apart.
 *
 * Only polls while `enabled` — there is no point asking this while the
 * assistant is paused or still being built.
 *
 * @returns {{ isInstalled: boolean, isLive: boolean }}
 */
export default function useWidgetLiveStatus(siteId, enabled = true) {
  const [status, setStatus] = useState({ isInstalled: false, isLive: false });
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!siteId) {
      setStatus({ isInstalled: false, isLive: false });
      return;
    }
    cancelledRef.current = false;

    const checkOnce = async () => {
      const { data } = await supabase
        .from('sites')
        .select('widget_last_seen_at')
        .eq('id', siteId)
        .maybeSingle();
      if (cancelledRef.current) return;
      // Only the install signal is read here — no site row, no tenant — so
      // the helper reports just the two booleans this hook promises, without
      // the parked/plan states the staff console also renders.
      const { isInstalled, isLive } = resolveSiteWidgetStatus(data);
      setStatus({ isInstalled, isLive });
    };

    checkOnce();
    // "Installed" doesn't change minute to minute, so a paused or
    // mid-crawl site is read once and left alone; only the live/traffic
    // half is worth polling for.
    if (!enabled) return () => { cancelledRef.current = true; };

    const interval = setInterval(checkOnce, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [siteId, enabled]);

  return status;
}
