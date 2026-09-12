// ---------------------------------------------------------------------------
// "Is the assistant actually on the customer's website?" — derived once.
//
// Three separate facts decide that, and each already has its own source of
// truth elsewhere:
//
//   1. sites.widget_last_seen_at — the only honest install signal we have.
//      api/chat/init.js stamps it when the widget calls in from a request
//      whose Origin is the site's own domain, so it cannot be faked by the
//      owner previewing from the dashboard (see the column's own comment in
//      supabase/migrations/20260908030000_widget_install_detection.sql).
//   2. sites.is_active — false means the site is parked by a plan downgrade
//      and api/chat/init.js answers `site_inactive` instead of serving.
//   3. The tenant's plan gate — resolveTenantPlan().widgetActive in plans.js,
//      the same gate the widget's init and the chat endpoint apply.
//
// Combining them was previously done by eye, in whichever component needed
// the answer: the dashboard hook and the install modal each kept their own
// copy of the ten-minute window, and neither knew about (2) or (3). This is
// the one place that math lives now, so the customer dashboard and the staff
// console can never disagree about whether a given site is live.
//
// Precedence deliberately matches api/chat/init.js's own order of refusals —
// parked first, then the plan gate, then traffic — because that is what a
// visitor to the site would actually get. Note that init stamps
// widget_last_seen_at BEFORE either refusal, so a parked or unpaid site can
// legitimately be "installed and recently seen" while serving nobody: that is
// exactly the case 'parked'/'blocked' exist to name.
// ---------------------------------------------------------------------------

import { isWidgetActive } from './plans.js';

/** How recently the widget must have been seen to count as carrying traffic
 *  right now. Ten minutes, not ten seconds: a quiet stretch on an otherwise
 *  installed site must not flip the badge back to "nobody is there". */
export const WIDGET_LIVE_WINDOW_MS = 10 * 60 * 1000;

/** Every state a site's (or a tenant's) widget can be in. Wording is left to
 *  each UI — the customer dashboard translates it, the staff console does
 *  not — so this module deals only in the states themselves. */
export const WIDGET_STATUS = Object.freeze({
  /** Nothing to install yet — the tenant has no site at all. */
  NO_SITE: 'no_site',
  /** The snippet has never been seen loading from the site's own domain. */
  NOT_INSTALLED: 'not_installed',
  /** Parked by a plan downgrade: sites.is_active is false. */
  PARKED: 'parked',
  /** No plan covers this tenant, so the widget loads and refuses to serve. */
  BLOCKED: 'blocked',
  /** Seen before, but not within the live window. */
  INSTALLED: 'installed',
  /** Seen within the live window — real visitors are loading it now. */
  LIVE: 'live'
});

// Best-first, for rolling several sites up into one tenant-level answer. A
// tenant with one live site and one parked site is "live"; the parked site is
// still visible per-site in the detail view. 'parked' sorts last because it
// is the only state the tenant cannot fix by pasting a snippet.
const ROLLUP_ORDER = [
  WIDGET_STATUS.LIVE,
  WIDGET_STATUS.INSTALLED,
  WIDGET_STATUS.NOT_INSTALLED,
  WIDGET_STATUS.PARKED
];

function lastSeenMs(value) {
  if (!value) return NaN;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? NaN : ms;
}

/**
 * Resolve one site's widget status.
 *
 * @param {object|null} site - a `sites` row; `widget_last_seen_at` and
 *   `is_active` are read, both optional. A partial read (the dashboard hook
 *   selects only `widget_last_seen_at`) simply skips the checks it has no
 *   data for.
 * @param {object|null} [tenant] - the owning `tenants` row (`plan`,
 *   `plan_status`, `trial_ends_at`, `stripe_subscription_id`). Omit it to ask
 *   only about the install signal, without the plan gate.
 * @param {number} [now] - injectable clock, for tests.
 * @returns {{ status: string, isInstalled: boolean, isLive: boolean,
 *   lastSeenAt: string|null }} `isInstalled`/`isLive` stay separate from
 *   `status` on purpose: they answer "has the snippet ever loaded" and "is it
 *   loading now", which remain true whatever the plan or parked state says.
 */
export function resolveSiteWidgetStatus(site, tenant = null, now = Date.now()) {
  const lastSeenAt = site?.widget_last_seen_at || null;
  const seenMs = lastSeenMs(lastSeenAt);
  const isInstalled = !Number.isNaN(seenMs);
  const isLive = isInstalled && now - seenMs < WIDGET_LIVE_WINDOW_MS;

  let status;
  if (site?.is_active === false) {
    status = WIDGET_STATUS.PARKED;
  } else if (tenant && !isWidgetActive(tenant)) {
    status = WIDGET_STATUS.BLOCKED;
  } else if (isLive) {
    status = WIDGET_STATUS.LIVE;
  } else if (isInstalled) {
    status = WIDGET_STATUS.INSTALLED;
  } else {
    status = WIDGET_STATUS.NOT_INSTALLED;
  }

  return { status, isInstalled, isLive, lastSeenAt: isInstalled ? lastSeenAt : null };
}

/**
 * Roll a tenant's sites up into the single answer a cross-tenant list needs.
 *
 * @param {object|null} tenant - the `tenants` row, for the plan gate.
 * @param {Array<object>|null} sites - that tenant's `sites` rows.
 * @param {number} [now] - injectable clock, for tests.
 * @returns {{ status: string, siteCount: number, installedCount: number,
 *   liveCount: number, lastSeenAt: string|null, sites: Array<object> }}
 *   The counts are what makes a one-line answer honest for a tenant with
 *   several sites ("live" plus "1 of 3 installed" says more than either
 *   alone).
 */
export function resolveTenantWidgetStatus(tenant, sites, now = Date.now()) {
  const rows = Array.isArray(sites) ? sites : [];
  const resolved = rows.map((site) => resolveSiteWidgetStatus(site, tenant, now));

  const installedCount = resolved.filter((s) => s.isInstalled).length;
  const liveCount = resolved.filter((s) => s.isLive).length;
  // Compared as timestamps, not as strings: PostgREST's offset notation
  // ('+00:00') does not sort lexicographically against a 'Z' suffix, and a
  // mixed pair would silently pick the wrong "most recent".
  const lastSeenAt = resolved
    .map((s) => s.lastSeenAt)
    .filter(Boolean)
    .sort((a, b) => lastSeenMs(a) - lastSeenMs(b))
    .pop() || null;

  let status;
  if (rows.length === 0) {
    status = WIDGET_STATUS.NO_SITE;
  } else if (tenant && !isWidgetActive(tenant)) {
    // Tenant-wide, so every site is blocked — no point picking between them.
    status = WIDGET_STATUS.BLOCKED;
  } else {
    const present = new Set(resolved.map((s) => s.status));
    status = ROLLUP_ORDER.find((candidate) => present.has(candidate)) || WIDGET_STATUS.NOT_INSTALLED;
  }

  return { status, siteCount: rows.length, installedCount, liveCount, lastSeenAt, sites: resolved };
}
