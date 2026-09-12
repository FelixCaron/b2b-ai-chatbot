// DELETE /api/staff/sites?id=<uuid> — staff-assisted site deletion (e.g. a
// tenant asks for a broken/test site removed and can't do it themselves).
// Reuses the same atomic, cascade-checked RPC the tenant-facing delete-site
// flow uses (supabase/migrations — delete_site_cascade, see its own comment
// for why it's one transaction rather than delete-each-table-and-swallow-
// errors). Staff-gated (requireStaff) — see api/lib/server-config.js.
//
// PATCH /api/staff/sites?id=<uuid> — edit a customer's assistant on their
// behalf, the thing support is actually asked for: "can you make it stop
// offering meetings", "the welcome message still says our old name". Writes
// the same two tables the customer's own dashboard writes — `sites` (how the
// assistant behaves) and `site_summaries` (what it says and what it answers
// from) — with three rules the dashboard doesn't need:
//
//   1. A reason is mandatory. This is someone else's account; the audit
//      entry is worthless without why.
//   2. Every change is recorded in internal.staff_audit, before-and-after
//      (see supabase/migrations/20260912020000_staff_audit_log.sql).
//   3. The response reports what the database clamped. `enforce_pro_features`
//      (a trigger on `sites`) silently resets lead capture, a 'lead'
//      objective, the support email and the calendar link whenever the
//      tenant isn't on a Business-tier plan. Silently is fine for a
//      self-serve dashboard that greys those controls out; it is not fine
//      when a staff member has just told a customer "done" — so the write is
//      read back and the difference is returned.
//
// id is a query param, not a path segment — see api/staff/tenants.js's
// header comment for why: this Vercel project doesn't build bracket-segment
// (`[id].js`) routes, confirmed live 2026-09-05 on two independent examples.
import { requireStaff, recordStaffAction } from '../lib/server-config.js';

// Mirrors @b2b-ai-chatbot/contracts' bot-settings.js, which this app's
// serverless functions cannot import (no cross-boundary imports here — see
// api/lib/server-config.js's header). scripts/tests/test-staff-bot-settings.js
// imports both and fails if these copies ever drift from the shared list.
export const BOT_GOALS = ['support', 'lead'];
export const BOT_TONES = ['professionnel', 'amical'];
export const EDITABLE_SITE_FIELDS = [
  'bot_goal',
  'bot_tone',
  'theme_primary_color',
  'enable_lead_capture',
  'support_email',
  'calendar_link',
  'is_active',
];
export const EDITABLE_SUMMARY_FIELDS = [
  'summary',
  'welcome_message',
  'ui_status_title',
  'ui_status_online',
  'ui_input_placeholder',
];

const MAX_SUMMARY_LENGTH = 8000;
const MAX_LABEL_LENGTH = 200;
const MAX_REASON_LENGTH = 500;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeText(value, max) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Server-side validation. The console validates the same way before it
 *  sends (shared rules, shared wording), but the console is not the
 *  authority — this is. */
function validate(body) {
  const site = {};
  const summary = {};
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });

  for (const [field, raw] of Object.entries(body || {})) {
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
        if (link !== null && !/^https?:\/\//i.test(link)) fail(field, 'calendar_link must be an http(s) URL, or empty to clear it');
        else site[field] = link;
        break;
      }
      default:
        break;
    }
  }

  return { site, summary, errors };
}

/** {field: {from, to}} for the audit entry — only what actually moved. */
function diff(before, after, fields) {
  const changes = {};
  for (const field of fields) {
    if (!(field in after)) continue;
    const from = before?.[field] ?? null;
    const to = after[field] ?? null;
    if (from !== to) changes[field] = { from, to };
  }
  return changes;
}

async function handlePatch(req, res, { user, supabase, siteId }) {
  const body = req.body || {};
  const reason = normalizeText(body.reason, MAX_REASON_LENGTH);
  if (!reason) {
    return res.status(400).json({
      error: 'A reason is required — this edit is made inside a customer account and is recorded against your name.',
    });
  }

  const { site: sitePatch, summary: summaryPatch, errors } = validate(body);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.map((e) => e.message).join('; '), issues: errors });
  }
  if (Object.keys(sitePatch).length === 0 && Object.keys(summaryPatch).length === 0) {
    return res.status(400).json({ error: 'Nothing to update — pass at least one bot setting.' });
  }

  const { data: before, error: beforeError } = await supabase
    .from('sites')
    .select('id, tenant_id, domain, bot_goal, bot_tone, theme_primary_color, enable_lead_capture, support_email, calendar_link, is_active')
    .eq('id', siteId)
    .maybeSingle();
  if (beforeError) throw beforeError;
  if (!before) return res.status(404).json({ error: 'Site not found' });

  let site = before;
  if (Object.keys(sitePatch).length > 0) {
    const { data, error } = await supabase
      .from('sites')
      .update(sitePatch)
      .eq('id', siteId)
      // Tenant isolation is manual on a service-role client (CLAUDE.md): the
      // row was just read by id, so pinning its tenant here costs nothing and
      // means a mistyped id can never touch a different customer's site.
      .eq('tenant_id', before.tenant_id)
      .select('id, tenant_id, domain, bot_goal, bot_tone, theme_primary_color, enable_lead_capture, support_email, calendar_link, is_active')
      .maybeSingle();
    if (error) {
      // plan_site_limit's trigger (23514) is the expected refusal here:
      // re-activating a parked site the tenant's plan no longer covers.
      if (error.code === '23514') {
        return res.status(409).json({
          error: "The database refused this change — most likely re-activating a site beyond the tenant's plan limit. Upgrade the plan first.",
          detail: error.message,
        });
      }
      throw error;
    }
    site = data || before;
  }

  // What the pro-features trigger clamped on the way in. Reported rather
  // than hidden: the staff member is about to tell a customer it's done.
  const clamped = Object.keys(sitePatch).filter((field) => site[field] !== sitePatch[field]);

  let summary = null;
  if (Object.keys(summaryPatch).length > 0) {
    const { data: existing, error: existingError } = await supabase
      .from('site_summaries')
      .select('id, summary, welcome_message, ui_status_title, ui_status_online, ui_input_placeholder, language')
      .eq('site_id', siteId)
      .eq('tenant_id', before.tenant_id)
      .maybeSingle();
    if (existingError) throw existingError;

    // summary is NOT NULL in the schema, and for good reason: it is the text
    // every answer is grounded in. Clearing it would either fail deep in
    // Postgres (a 500 that reads like a bug) or, if it were nullable, leave
    // an assistant answering from nothing.
    if (existing && 'summary' in summaryPatch && summaryPatch.summary === null) {
      return res.status(400).json({
        error: 'The business summary cannot be emptied — it is what the assistant answers from. Replace the text instead, or re-scan the site to regenerate it.',
      });
    }

    if (!existing && !summaryPatch.summary) {
      // site_summaries.summary is NOT NULL, and inventing a placeholder to
      // satisfy it would put empty text in front of visitors. This site has
      // simply never been scanned.
      return res.status(409).json({
        error: 'This site has no summary row yet (it has never been scanned). Provide a summary as part of this edit, or run a scan first.',
      });
    }

    const row = existing
      ? { ...summaryPatch, updated_at: new Date().toISOString() }
      : { ...summaryPatch, tenant_id: before.tenant_id, site_id: siteId, updated_at: new Date().toISOString() };

    const query = existing
      ? supabase.from('site_summaries').update(row).eq('id', existing.id).eq('tenant_id', before.tenant_id)
      : supabase.from('site_summaries').insert(row);

    const { data, error } = await query
      .select('id, summary, welcome_message, ui_status_title, ui_status_online, ui_input_placeholder, language')
      .maybeSingle();
    if (error) throw error;
    summary = data;

    await recordStaffAction(supabase, {
      actor: user,
      tenantId: before.tenant_id,
      siteId,
      action: 'site.summary_edited',
      details: diff(existing || {}, summaryPatch, EDITABLE_SUMMARY_FIELDS),
      reason,
    });
  }

  if (Object.keys(sitePatch).length > 0) {
    await recordStaffAction(supabase, {
      actor: user,
      tenantId: before.tenant_id,
      siteId,
      action: 'site.settings_edited',
      // The stored row, not the requested one: what the database kept is
      // what happened, and `clamped` says where the two differed.
      details: { ...diff(before, site, EDITABLE_SITE_FIELDS), ...(clamped.length ? { clamped_by_plan: clamped } : {}) },
      reason,
    });
  }

  return res.status(200).json({ site, summary, clamped });
}

export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireStaff(req));
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message || 'Unauthorized' });
  }

  const siteId = req.query?.id;
  if (!siteId) {
    return res.status(400).json({ error: '?id= is required' });
  }

  try {
    if (req.method === 'PATCH') {
      return await handlePatch(req, res, { user, supabase, siteId });
    }

    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, tenant_id, domain')
      .eq('id', siteId)
      .maybeSingle();
    if (siteError) throw siteError;
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const { data, error } = await supabase.rpc('delete_site_cascade', {
      p_site_id: site.id,
      p_tenant_id: site.tenant_id,
    });
    if (error) throw error;

    await recordStaffAction(supabase, {
      actor: user,
      tenantId: site.tenant_id,
      siteId: site.id,
      action: 'site.deleted',
      details: { domain: site.domain, deleted: data },
      // A DELETE has no body through the contract client — the reason
      // rides in the query string.
      reason: normalizeText(req.query?.reason ?? req.body?.reason, MAX_REASON_LENGTH),
    });

    return res.status(200).json({ deleted: data });
  } catch (err) {
    console.error('[staff/sites] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
