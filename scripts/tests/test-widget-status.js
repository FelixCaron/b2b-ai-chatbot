// Widget status verification — "is the assistant actually on the customer's
// website?", the one answer the customer dashboard, the install modal and the
// staff console all render, now from one shared rule
// (packages/contracts/src/widget-status.js).
//
// The cases below are the ones that used to be decided by eye in whichever
// component needed them: a preview that must not count as an install, a quiet
// afternoon that must not un-install a site, and a snippet that is genuinely
// pasted on a page the plan no longer pays for.
import {
  WIDGET_STATUS,
  WIDGET_LIVE_WINDOW_MS,
  resolveSiteWidgetStatus,
  resolveTenantWidgetStatus
} from '../../packages/contracts/src/widget-status.js';

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`PASS: ${label}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${label} — ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const NOW = Date.parse('2026-09-12T12:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

/** A paying tenant: the plan gate is open, so status is decided by traffic. */
const PAID = { plan: 'pro', plan_status: 'active', stripe_subscription_id: 'sub_1' };
/** Nobody is paying — the widget loads and refuses to answer. */
const UNPAID = { plan: 'free', plan_status: 'free' };

check('a site never seen from its own domain is not installed', () => {
  const status = resolveSiteWidgetStatus({ widget_last_seen_at: null }, PAID, NOW);
  assert(status.status === WIDGET_STATUS.NOT_INSTALLED, `got ${status.status}`);
  assert(!status.isInstalled && !status.isLive, 'a never-seen site reported an install');
  assert(status.lastSeenAt === null, 'a never-seen site reported a sighting');
});

check('a sighting inside the live window is live, outside it is still installed', () => {
  const live = resolveSiteWidgetStatus({ widget_last_seen_at: ago(60 * 1000) }, PAID, NOW);
  assert(live.status === WIDGET_STATUS.LIVE, `got ${live.status}`);
  assert(live.isInstalled && live.isLive, 'a minute-old sighting was not live');

  // The bug this guards: a quiet afternoon telling an owner who installed
  // the snippet weeks ago to go install it again.
  const quiet = resolveSiteWidgetStatus({ widget_last_seen_at: ago(6 * 3600 * 1000) }, PAID, NOW);
  assert(quiet.status === WIDGET_STATUS.INSTALLED, `got ${quiet.status}`);
  assert(quiet.isInstalled && !quiet.isLive, 'a six-hour-old sighting was reported as traffic');
});

check('the live window is a window, not a rounding error', () => {
  const justInside = resolveSiteWidgetStatus({ widget_last_seen_at: ago(WIDGET_LIVE_WINDOW_MS - 1000) }, PAID, NOW);
  const justOutside = resolveSiteWidgetStatus({ widget_last_seen_at: ago(WIDGET_LIVE_WINDOW_MS + 1000) }, PAID, NOW);
  assert(justInside.isLive, 'a sighting inside the window was not live');
  assert(!justOutside.isLive, 'a sighting outside the window was still live');
  assert(justOutside.isInstalled, 'a sighting outside the window stopped counting as installed');
});

check('a parked site reports parked, however recently it was seen', () => {
  // api/chat/init.js stamps widget_last_seen_at BEFORE refusing a parked
  // site, so "seen two minutes ago" and "serving nobody" are both true here.
  const status = resolveSiteWidgetStatus(
    { widget_last_seen_at: ago(2 * 60 * 1000), is_active: false },
    PAID,
    NOW
  );
  assert(status.status === WIDGET_STATUS.PARKED, `got ${status.status}`);
  assert(status.isInstalled && status.isLive, 'parking a site erased the install signal');
});

check('an unpaid tenant is blocked even with the snippet in place', () => {
  const status = resolveSiteWidgetStatus({ widget_last_seen_at: ago(2 * 60 * 1000) }, UNPAID, NOW);
  assert(status.status === WIDGET_STATUS.BLOCKED, `got ${status.status}`);
  assert(status.isInstalled, 'the plan gate erased the install signal');
});

check('omitting the tenant asks only about the install signal', () => {
  // What the customer dashboard's hook does: it has the sighting and nothing
  // else, and must not invent a plan verdict from a missing tenant row.
  const status = resolveSiteWidgetStatus({ widget_last_seen_at: ago(60 * 1000) }, null, NOW);
  assert(status.status === WIDGET_STATUS.LIVE, `got ${status.status}`);
  const unknown = resolveSiteWidgetStatus(null, null, NOW);
  assert(unknown.status === WIDGET_STATUS.NOT_INSTALLED, `got ${unknown.status}`);
  assert(!unknown.isInstalled, 'a missing row reported an install');
});

check('a tenant with no sites has nothing to install', () => {
  const rollup = resolveTenantWidgetStatus(PAID, [], NOW);
  assert(rollup.status === WIDGET_STATUS.NO_SITE, `got ${rollup.status}`);
  assert(rollup.siteCount === 0 && rollup.installedCount === 0, 'counted sites that do not exist');
  assert(resolveTenantWidgetStatus(PAID, null, NOW).status === WIDGET_STATUS.NO_SITE, 'a null site list was not handled');
});

check('one live site makes the tenant live, and the counts stay honest', () => {
  const rollup = resolveTenantWidgetStatus(
    PAID,
    [
      { widget_last_seen_at: ago(60 * 1000) },
      { widget_last_seen_at: null },
      { widget_last_seen_at: ago(3 * 86400 * 1000) }
    ],
    NOW
  );
  assert(rollup.status === WIDGET_STATUS.LIVE, `got ${rollup.status}`);
  assert(rollup.siteCount === 3, `site count ${rollup.siteCount}`);
  assert(rollup.installedCount === 2, `installed count ${rollup.installedCount}`);
  assert(rollup.liveCount === 1, `live count ${rollup.liveCount}`);
  assert(rollup.lastSeenAt === ago(60 * 1000), 'the rollup did not report the most recent sighting');
});

check('the most recent sighting wins whatever order the rows arrive in', () => {
  // PostgREST renders timestamps with a '+00:00' offset; a plain string sort
  // against a 'Z' suffix would pick the wrong one.
  const rollup = resolveTenantWidgetStatus(
    PAID,
    [
      { widget_last_seen_at: '2026-09-10T08:00:00+00:00' },
      { widget_last_seen_at: '2026-09-11T23:30:00Z' },
      { widget_last_seen_at: '2026-09-09T23:00:00+00:00' }
    ],
    NOW
  );
  assert(rollup.lastSeenAt === '2026-09-11T23:30:00Z', `got ${rollup.lastSeenAt}`);
});

check('an unpaid tenant rolls up as blocked, not as live', () => {
  const rollup = resolveTenantWidgetStatus(UNPAID, [{ widget_last_seen_at: ago(60 * 1000) }], NOW);
  assert(rollup.status === WIDGET_STATUS.BLOCKED, `got ${rollup.status}`);
  assert(rollup.installedCount === 1, 'the plan gate erased the install count');
});

check('a parked site does not hide a working one', () => {
  const rollup = resolveTenantWidgetStatus(
    PAID,
    [{ is_active: false, widget_last_seen_at: null }, { widget_last_seen_at: ago(2 * 3600 * 1000) }],
    NOW
  );
  assert(rollup.status === WIDGET_STATUS.INSTALLED, `got ${rollup.status}`);

  const allParked = resolveTenantWidgetStatus(PAID, [{ is_active: false, widget_last_seen_at: null }], NOW);
  assert(allParked.status === WIDGET_STATUS.PARKED, `got ${allParked.status}`);
});

check('a garbage timestamp reads as never seen rather than throwing', () => {
  const status = resolveSiteWidgetStatus({ widget_last_seen_at: 'not-a-date' }, PAID, NOW);
  assert(status.status === WIDGET_STATUS.NOT_INSTALLED, `got ${status.status}`);
  assert(!status.isInstalled && status.lastSeenAt === null, 'an unparseable timestamp counted as an install');
});

console.log(`\nWidget Status Test Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
