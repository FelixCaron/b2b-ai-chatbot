// ---------------------------------------------------------------------------
// The app's primary navigation, defined once.
//
// Both headers — the full one a signed-in user gets and the lightweight one a
// guest gets — used to carry their own hand-written copy of these four tabs, in
// two different files, which is how they drifted (the guest header shipped
// without the About tab for a while, and the two disagreed on the Leads count
// format). Adding, renaming or reordering a tab is now one edit here.
// ---------------------------------------------------------------------------

import { LayoutDashboard, Users, Sparkles } from 'lucide-react';

export const NAV_ITEMS = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, iconClassName: '' },
  { view: 'leads', label: 'Leads', icon: Users, iconClassName: 'text-emerald-500', badge: 'leadsCount' },
  { view: 'pricing', label: 'Plans', icon: Sparkles, iconClassName: 'text-amber-500' },
  { view: 'about', label: 'About', icon: Users, iconClassName: '' }
];

/** Resolve each item's live badge value from the counts the header is given. */
export function navItemsWithBadges(counts = {}) {
  return NAV_ITEMS.map((item) => ({
    ...item,
    badgeValue: item.badge ? counts[item.badge] || 0 : 0
  }));
}
