import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';

// Same window IntegrationModal's "Checking installation..." indicator uses —
// long enough that a quiet minute on an otherwise-installed site doesn't
// flip the badge back to "not installed".
const LIVE_WINDOW_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 30 * 1000;

/**
 * Whether the widget has actually been seen loading on the site's own
 * domain recently — a real signal, not a self-report: the widget calls
 * api/chat/init on load from the visitor's browser, and that route stamps
 * sites.widget_last_seen_at only when the request's Origin matches the
 * site's own domain (see api/chat/init.js). Read directly rather than
 * trusting the `sites` row already in memory, which is only as fresh as the
 * last full workspace load.
 *
 * Only polls while `enabled` — there is no point asking this while the
 * assistant is paused or still being built.
 */
export default function useWidgetLiveStatus(siteId, enabled = true) {
  const [isLive, setIsLive] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!enabled || !siteId) {
      setIsLive(false);
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
      if (!data?.widget_last_seen_at) {
        setIsLive(false);
        return;
      }
      const seenAt = new Date(data.widget_last_seen_at).getTime();
      setIsLive(Date.now() - seenAt < LIVE_WINDOW_MS);
    };

    checkOnce();
    const interval = setInterval(checkOnce, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [siteId, enabled]);

  return isLive;
}
