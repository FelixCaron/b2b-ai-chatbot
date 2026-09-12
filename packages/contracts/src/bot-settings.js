// ---------------------------------------------------------------------------
// What "the bot's settings" are, and what a valid value for each one is.
//
// Three places need to agree on this list: the customer's own dashboard
// (apps/admin's FeatureToggles and the welcome/summary editors), the staff
// console that edits the same fields on a customer's behalf
// (apps/internal-admin), and the staff endpoint that performs the write.
// The endpoint cannot import this module — apps/internal-admin's serverless
// functions deliberately carry no cross-boundary imports (see that app's
// api/lib/server-config.js header) — so it keeps its own copy of the two
// lists below and scripts/tests/test-staff-bot-settings.js fails the build if
// the copies ever drift apart.
//
// Two tables hold a bot's configuration, and the split is not arbitrary:
//   sites            — how the assistant behaves (objective, tone, colour,
//                      the Business-only integrations).
//   site_summaries   — what it says and what it knows: the generated welcome
//                      message, the widget's own labels, and the business
//                      summary every answer is grounded in.
// ---------------------------------------------------------------------------

import { hasProFeatures } from './plans.js';

export const BOT_GOALS = Object.freeze(['support', 'lead']);
export const BOT_TONES = Object.freeze(['professionnel', 'amical']);

/** Columns of `sites` a staff member may edit on a customer's behalf.
 *  Deliberately excludes domain, public_key and tenant_id: those are
 *  identity, not configuration, and changing them silently re-points a live
 *  widget. */
export const EDITABLE_SITE_FIELDS = Object.freeze([
  'bot_goal',
  'bot_tone',
  'theme_primary_color',
  'enable_lead_capture',
  'support_email',
  'calendar_link',
  'is_active'
]);

/** Columns of `site_summaries` a staff member may edit — everything the
 *  assistant says before the visitor types, plus the summary it answers
 *  from. */
export const EDITABLE_SUMMARY_FIELDS = Object.freeze([
  'summary',
  'welcome_message',
  'ui_status_title',
  'ui_status_online',
  'ui_input_placeholder'
]);

/** Fields the database itself refuses to keep on a non-Business plan.
 *  `enforce_pro_features` (a BEFORE INSERT OR UPDATE trigger on `sites`,
 *  see supabase/migrations/20260908050000) clamps each of these back to its
 *  off state, silently, on every write. Knowing that up front is the
 *  difference between telling a staff member "this tenant's plan doesn't
 *  include lead capture" and letting their edit vanish without a word. */
export const PRO_ONLY_SITE_FIELDS = Object.freeze([
  'enable_lead_capture',
  'support_email',
  'calendar_link'
]);

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
// Deliberately loose: the point is to catch a typo'd address before it
// becomes a support ticket about missing notifications, not to re-litigate
// RFC 5322 in a regular expression.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Longest text this console will write into a summary field. Generous
 *  enough for a real business summary, bounded so a paste accident cannot
 *  push a megabyte into every widget load. */
export const MAX_SUMMARY_LENGTH = 8000;
export const MAX_LABEL_LENGTH = 200;

function normalizeText(value, max) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Validate and normalize a staff edit before it is sent.
 *
 * @param {object} patch - the raw field → value map from the editor.
 * @returns {{ site: object, summary: object, errors: Array<{field: string, message: string}> }}
 *   `site` and `summary` carry only the recognised fields, normalized
 *   (blank strings become NULL, colours lower-cased, text trimmed and
 *   bounded); anything unrecognised is dropped rather than forwarded.
 */
export function validateBotSettings(patch = {}) {
  const site = {};
  const summary = {};
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });

  for (const [field, raw] of Object.entries(patch)) {
    if (EDITABLE_SUMMARY_FIELDS.includes(field)) {
      summary[field] = normalizeText(raw, field === 'summary' ? MAX_SUMMARY_LENGTH : MAX_LABEL_LENGTH);
      continue;
    }
    if (!EDITABLE_SITE_FIELDS.includes(field)) continue;

    switch (field) {
      case 'bot_goal':
        if (!BOT_GOALS.includes(raw)) fail(field, `bot_goal must be one of: ${BOT_GOALS.join(', ')}`);
        else site[field] = raw;
        break;
      case 'bot_tone':
        if (!BOT_TONES.includes(raw)) fail(field, `bot_tone must be one of: ${BOT_TONES.join(', ')}`);
        else site[field] = raw;
        break;
      case 'theme_primary_color':
        if (!HEX_COLOR.test(String(raw || ''))) fail(field, 'theme_primary_color must be a #rrggbb hex colour');
        else site[field] = String(raw).toLowerCase();
        break;
      case 'enable_lead_capture':
      case 'is_active':
        if (typeof raw !== 'boolean') fail(field, `${field} must be true or false`);
        else site[field] = raw;
        break;
      case 'support_email': {
        const email = normalizeText(raw, MAX_LABEL_LENGTH);
        if (email !== null && !EMAIL.test(email)) fail(field, 'support_email must be an email address, or empty to clear it');
        else site[field] = email;
        break;
      }
      case 'calendar_link': {
        const link = normalizeText(raw, MAX_LABEL_LENGTH);
        if (link !== null && !/^https?:\/\//i.test(link)) {
          fail(field, 'calendar_link must be an http(s) URL, or empty to clear it');
        } else {
          site[field] = link;
        }
        break;
      }
      default:
        break;
    }
  }

  return { site, summary, errors };
}

/**
 * Which fields of this edit the database will clamp, given the tenant's plan.
 *
 * @param {string|null} plan - the tenant's plan slug.
 * @param {object} sitePatch - the normalized `site` half of a validated edit.
 * @returns {string[]} the fields that will not survive the write, so the UI
 *   can say so before the staff member saves rather than after.
 */
export function proFieldsBlockedByPlan(plan, sitePatch = {}) {
  if (hasProFeatures(plan)) return [];
  const blocked = PRO_ONLY_SITE_FIELDS.filter((field) => {
    const value = sitePatch[field];
    return value !== undefined && value !== null && value !== false;
  });
  // 'lead' as an objective is gated by the same trigger, which rewrites it
  // back to 'support' rather than nulling a column.
  if (sitePatch.bot_goal === 'lead') blocked.push('bot_goal');
  return blocked;
}
