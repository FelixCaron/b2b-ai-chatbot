// How the staff console renders a widget status. The states themselves — and
// the rules that produce them — belong to @b2b-ai-chatbot/contracts
// (widget-status.js), shared with the customer dashboard; only the wording
// and the colors live here, because this console is staff-only English while
// the customer dashboard translates everything it shows.
import React from 'react';
import { WIDGET_STATUS } from '@b2b-ai-chatbot/contracts';

const PRESENTATION = {
  [WIDGET_STATUS.LIVE]: {
    label: 'Live',
    badge: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20',
    dot: 'bg-emerald-500 animate-pulse',
    hint: 'The widget loaded from the customer’s own domain within the last 10 minutes.',
  },
  [WIDGET_STATUS.INSTALLED]: {
    label: 'Installed',
    badge: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    dot: 'bg-emerald-500/70',
    hint: 'The snippet is in place — seen loading from the customer’s domain before, but not in the last 10 minutes.',
  },
  [WIDGET_STATUS.NOT_INSTALLED]: {
    label: 'Not installed',
    badge: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
    dot: 'bg-gray-400',
    hint: 'The widget has never been seen loading from the customer’s own domain. Dashboard previews do not count.',
  },
  [WIDGET_STATUS.BLOCKED]: {
    label: 'No plan',
    badge: 'bg-amber-500/15 text-amber-700 border-amber-500/20',
    dot: 'bg-amber-500/80',
    hint: 'No plan covers this tenant, so the widget refuses to answer visitors even where the snippet is installed.',
  },
  [WIDGET_STATUS.PARKED]: {
    label: 'Parked',
    badge: 'bg-amber-500/15 text-amber-700 border-amber-500/20',
    dot: 'bg-amber-500/80',
    hint: 'Parked by a plan downgrade (sites.is_active = false) — the assistant answers "paused" on this site.',
  },
  [WIDGET_STATUS.NO_SITE]: {
    label: 'No site',
    badge: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    dot: 'bg-gray-300',
    hint: 'This tenant has no site yet, so there is nothing to install.',
  },
};

/** "4 min ago" / "3 h ago" / a date once it stops being a useful interval.
 *  Returns null for a site the widget has never been seen on. */
export function formatLastSeen(lastSeenAt, now = Date.now()) {
  if (!lastSeenAt) return null;
  const seenMs = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seenMs)) return null;

  const minutes = Math.floor((now - seenMs) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(seenMs).toLocaleDateString();
}

export default function WidgetStatusBadge({ status, lastSeenAt = null, className = '' }) {
  const presentation = PRESENTATION[status] || PRESENTATION[WIDGET_STATUS.NOT_INSTALLED];
  const seen = formatLastSeen(lastSeenAt);
  // The hint carries the "why", including the last sighting, so a staff
  // member reading a dense table can get the whole story from one hover
  // instead of clicking into the tenant.
  const title = seen ? `${presentation.hint} Last seen ${seen}.` : presentation.hint;

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${presentation.badge} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${presentation.dot}`}></span>
      {presentation.label}
    </span>
  );
}
