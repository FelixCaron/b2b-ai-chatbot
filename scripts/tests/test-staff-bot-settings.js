// Staff bot-editing verification.
//
// Two things are checked here, and the first matters more than it looks:
//
// 1. The staff endpoint keeps its OWN copy of "which fields are editable and
//    what counts as a valid value", because apps/internal-admin's serverless
//    functions deliberately carry no cross-boundary imports (see that app's
//    api/lib/server-config.js header). A duplicated list is only safe if
//    something fails when the copies drift — that is this file. Without it,
//    adding a field to the shared contract would produce a console that
//    offers a control the server silently ignores.
//
// 2. The validation itself, on the cases that decide whether a support edit
//    lands in a customer's account correctly: a cleared field must become
//    NULL rather than an empty string, a plan that doesn't include lead
//    capture must be flagged BEFORE the write (the database clamps it
//    silently), and an unknown field must never be forwarded.
import {
  BOT_GOALS,
  BOT_TONES,
  EDITABLE_SITE_FIELDS,
  EDITABLE_SUMMARY_FIELDS,
  validateBotSettings,
  proFieldsBlockedByPlan
} from '../../packages/contracts/src/bot-settings.js';
import * as staffSites from '../../apps/internal-admin/api/staff/sites.js';

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

function sameList(a, b, what) {
  assert(
    a.length === b.length && a.every((value, index) => value === b[index]),
    `${what} drifted: contract has [${a.join(', ')}], the staff endpoint has [${b.join(', ')}]`
  );
}

check('the staff endpoint edits exactly the fields the contract defines', () => {
  sameList([...EDITABLE_SITE_FIELDS], [...staffSites.EDITABLE_SITE_FIELDS], 'EDITABLE_SITE_FIELDS');
  sameList([...EDITABLE_SUMMARY_FIELDS], [...staffSites.EDITABLE_SUMMARY_FIELDS], 'EDITABLE_SUMMARY_FIELDS');
  sameList([...BOT_GOALS], [...staffSites.BOT_GOALS], 'BOT_GOALS');
  sameList([...BOT_TONES], [...staffSites.BOT_TONES], 'BOT_TONES');
});

check('a valid edit is split between the two tables that hold it', () => {
  const { site, summary, errors } = validateBotSettings({
    bot_tone: 'amical',
    welcome_message: '  Bonjour !  ',
    unknown_field: 'ignored'
  });
  assert(errors.length === 0, `unexpected errors: ${JSON.stringify(errors)}`);
  assert(site.bot_tone === 'amical', 'the site field did not survive');
  assert(summary.welcome_message === 'Bonjour !', `the summary field was not trimmed: ${summary.welcome_message}`);
  assert(!('unknown_field' in site) && !('unknown_field' in summary), 'an unrecognised field was forwarded');
});

check('clearing a field means NULL, not an empty string', () => {
  // '' in support_email would be a valid-looking address of zero length that
  // the chat endpoint would then try to send mail to.
  const { site, errors } = validateBotSettings({ support_email: '   ', calendar_link: '' });
  assert(errors.length === 0, `clearing was rejected: ${JSON.stringify(errors)}`);
  assert(site.support_email === null, `support_email became ${JSON.stringify(site.support_email)}`);
  assert(site.calendar_link === null, `calendar_link became ${JSON.stringify(site.calendar_link)}`);
});

check('nonsense values are refused with the field named', () => {
  const { errors } = validateBotSettings({
    bot_goal: 'whatever',
    bot_tone: 'shouty',
    theme_primary_color: 'blue',
    support_email: 'not-an-address',
    calendar_link: 'javascript:alert(1)',
    enable_lead_capture: 'yes'
  });
  const fields = errors.map((e) => e.field).sort();
  assert(
    fields.join(',') === 'bot_goal,bot_tone,calendar_link,enable_lead_capture,support_email,theme_primary_color',
    `unexpected error set: ${fields.join(',')}`
  );
});

check('a colour is normalised, not just accepted', () => {
  const { site, errors } = validateBotSettings({ theme_primary_color: '#AABBCC' });
  assert(errors.length === 0, 'a valid colour was rejected');
  assert(site.theme_primary_color === '#aabbcc', `got ${site.theme_primary_color}`);
});

check('a long paste is bounded rather than written whole', () => {
  const { summary } = validateBotSettings({ summary: 'x'.repeat(50_000), ui_status_title: 'y'.repeat(5000) });
  assert(summary.summary.length === 8000, `summary length ${summary.summary.length}`);
  assert(summary.ui_status_title.length === 200, `label length ${summary.ui_status_title.length}`);
});

check("the plan's silent clamping is predicted before the write, not after", () => {
  // enforce_pro_features resets all of these on a non-Business plan without
  // saying anything — the console has to say it instead.
  const { site } = validateBotSettings({
    enable_lead_capture: true,
    support_email: 'help@acme.example',
    calendar_link: 'https://cal.com/acme',
    bot_goal: 'lead'
  });
  const blocked = proFieldsBlockedByPlan('basic', site).sort();
  assert(
    blocked.join(',') === 'bot_goal,calendar_link,enable_lead_capture,support_email',
    `expected all four to be blocked on basic, got ${blocked.join(',')}`
  );
  assert(proFieldsBlockedByPlan('pro', site).length === 0, 'a Business plan was told its own features would not stick');
  assert(proFieldsBlockedByPlan('premium', site).length === 0, 'premium was told its features would not stick');
});

check('turning a pro feature OFF is never blocked by the plan', () => {
  // Clearing a stale value from a downgraded tenant is exactly what support
  // needs to be able to do.
  const { site } = validateBotSettings({ enable_lead_capture: false, support_email: '' });
  assert(proFieldsBlockedByPlan('free', site).length === 0, 'clearing a pro field was reported as blocked');
});

console.log(`\nStaff Bot Settings Test Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
