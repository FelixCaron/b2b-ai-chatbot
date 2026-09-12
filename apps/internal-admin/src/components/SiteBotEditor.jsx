// Editing a customer's assistant from the staff console, the way support is
// actually asked to: "can you make it stop offering meetings", "the welcome
// message still has our old name", "it keeps quoting a page we deleted".
//
// Three groups, matching the three things that decide what a visitor gets:
// how the assistant behaves (the `sites` row), what it says (its
// `site_summaries` row), and what it knows (its indexed pages).
//
// Two rules this editor does not let a staff member around:
//   * Nothing saves without a reason. This is someone else's account, and
//     the reason is what makes the audit entry worth keeping.
//   * Only what changed is sent. A staff member who opens this panel to
//     read it, and closes it, must not rewrite five fields with the values
//     they already had — an audit trail full of no-op "edits" is a trail
//     nobody reads.
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import {
  BOT_GOALS,
  BOT_TONES,
  EDITABLE_SITE_FIELDS,
  EDITABLE_SUMMARY_FIELDS,
  hasProFeatures,
  proFieldsBlockedByPlan,
  validateBotSettings
} from '@b2b-ai-chatbot/contracts';
import { api } from '../lib/api';

const GOAL_LABEL = { support: 'Information & support', lead: 'Lead generation & sales' };
const TONE_LABEL = { professionnel: 'Professional & courteous', amical: 'Warm & friendly' };

const FIELD_LABEL = {
  bot_goal: 'objective',
  bot_tone: 'tone',
  theme_primary_color: 'accent colour',
  enable_lead_capture: 'lead capture',
  support_email: 'support email',
  calendar_link: 'calendar link',
  is_active: 'active',
  summary: 'business summary',
  welcome_message: 'welcome message',
  ui_status_title: 'widget title',
  ui_status_online: 'status line',
  ui_input_placeholder: 'input placeholder'
};

/** The form's own view of a site + its summary row, as editable strings. */
function initialForm(site, summary) {
  return {
    bot_goal: site.bot_goal || 'support',
    bot_tone: site.bot_tone || 'professionnel',
    theme_primary_color: site.theme_primary_color || '#6366f1',
    enable_lead_capture: Boolean(site.enable_lead_capture),
    support_email: site.support_email || '',
    calendar_link: site.calendar_link || '',
    is_active: site.is_active !== false,
    summary: summary?.summary || '',
    welcome_message: summary?.welcome_message || '',
    ui_status_title: summary?.ui_status_title || '',
    ui_status_online: summary?.ui_status_online || '',
    ui_input_placeholder: summary?.ui_input_placeholder || ''
  };
}

const ALL_FIELDS = [...EDITABLE_SITE_FIELDS, ...EDITABLE_SUMMARY_FIELDS];

const inputClass =
  'w-full bg-white border border-gray-300 text-dark-900 text-sm rounded-lg px-3 py-2 outline-none focus:border-brand-500';

function Labelled({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">
        {label}
        {hint && <span className="text-gray-400"> — {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export default function SiteBotEditor({ site, summary, tenant, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => initialForm(site, summary));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const [pages, setPages] = useState(null);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [pagesBusy, setPagesBusy] = useState('');

  const baseline = useMemo(() => initialForm(site, summary), [site, summary]);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  // Only the fields whose value actually moved.
  const changed = useMemo(
    () => ALL_FIELDS.filter((field) => form[field] !== baseline[field]),
    [form, baseline]
  );

  const { site: sitePatch, errors } = useMemo(
    () => validateBotSettings(Object.fromEntries(changed.map((field) => [field, form[field]]))),
    [changed, form]
  );

  // The database clamps these back on a non-Business plan whatever we send
  // (enforce_pro_features) — better said here than discovered afterwards.
  const blocked = useMemo(() => proFieldsBlockedByPlan(tenant?.plan, sitePatch), [tenant, sitePatch]);
  const isPro = hasProFeatures(tenant?.plan);

  const handleSave = async () => {
    setMessage(null);
    if (changed.length === 0) return;
    if (errors.length > 0) {
      setMessage({ type: 'error', text: errors.map((e) => e.message).join(' · ') });
      return;
    }
    if (!reason.trim()) {
      setMessage({ type: 'error', text: 'Say why you are changing this — it is recorded against your name.' });
      return;
    }

    setSaving(true);
    try {
      const payload = { id: site.id, reason: reason.trim() };
      for (const field of changed) payload[field] = form[field];

      const res = await api.staff.updateSite(payload);
      if (!res.ok) throw new Error(res.data?.error || 'Failed to save');

      const clamped = res.data?.clamped || [];
      setMessage(
        clamped.length > 0
          ? {
              type: 'warn',
              text: `Saved, except ${clamped
                .map((f) => FIELD_LABEL[f] || f)
                .join(', ')} — the tenant's plan does not include ${clamped.length > 1 ? 'those' : 'that'}, so the database reset ${clamped.length > 1 ? 'them' : 'it'}.`
            }
          : { type: 'success', text: 'Saved. The change is live for the next visitor.' }
      );
      // Re-seed the form from what the database actually kept, not from what
      // was typed: when the plan clamped a field, the two differ, and leaving
      // the typed value on screen would show the panel as still-unsaved and
      // invite a second, equally futile, save.
      setForm(initialForm(res.data.site || site, res.data.summary || summary));
      setReason('');
      await onSaved?.();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const loadPages = async () => {
    setPagesLoading(true);
    try {
      const res = await api.staff.listSitePages({ site_id: site.id });
      if (!res.ok) throw new Error(res.data?.error || 'Failed to load pages');
      setPages(res.data);
      setSelected(new Set());
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setPagesLoading(false);
    }
  };

  const toggleUrl = (url) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  const runPageAction = async (action) => {
    const urls = [...selected];
    if (urls.length === 0) return;
    if (!reason.trim()) {
      setMessage({ type: 'error', text: 'Say why first — page changes are recorded against your name too.' });
      return;
    }
    if (
      action === 'remove' &&
      !window.confirm(`Forget ${urls.length} page${urls.length > 1 ? 's' : ''}? The assistant stops quoting ${urls.length > 1 ? 'them' : 'it'} immediately.`)
    ) {
      return;
    }

    setPagesBusy(action);
    setMessage(null);
    try {
      const call = action === 'remove' ? api.staff.removeSitePages : api.staff.reindexSitePages;
      const res = await call({ site_id: site.id, urls, reason: reason.trim() });
      if (!res.ok) throw new Error(res.data?.error || `Failed to ${action}`);

      if (action === 'remove') {
        setMessage({ type: 'success', text: `Forgot ${res.data.removed_chunks} chunk(s) across ${res.data.removed_urls.length} page(s).` });
      } else {
        const failed = (res.data.results || []).filter((r) => !r.ok);
        setMessage(
          failed.length === 0
            ? { type: 'success', text: `Re-read ${res.data.succeeded} page(s).` }
            : { type: 'warn', text: `Re-read ${res.data.succeeded} of ${res.data.requested}. Failed: ${failed.map((f) => `${f.url} (${f.error})`).join('; ')}` }
        );
      }
      setReason('');
      await loadPages();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setPagesBusy('');
    }
  };

  return (
    <div className="border border-dark-900/5 rounded-xl overflow-hidden">
      <button
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open && pages === null) loadPages();
        }}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm bg-surface-100 hover:bg-surface-200"
      >
        <span className="font-medium text-dark-900">Edit this assistant</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="p-4 space-y-5 bg-white">
          {!isPro && (
            <p className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              This tenant is not on a Business-tier plan. Lead capture, a lead objective, the support
              email and the calendar link are reset by the database on every write to this site — change
              the plan first if the customer is asking for one of those.
            </p>
          )}

          <section className="grid sm:grid-cols-2 gap-3">
            <Labelled label="Objective" hint="what the assistant is for">
              <select value={form.bot_goal} onChange={(e) => set('bot_goal', e.target.value)} className={inputClass}>
                {BOT_GOALS.map((goal) => (
                  <option key={goal} value={goal}>{GOAL_LABEL[goal] || goal}</option>
                ))}
              </select>
            </Labelled>
            <Labelled label="Tone" hint="how it speaks">
              <select value={form.bot_tone} onChange={(e) => set('bot_tone', e.target.value)} className={inputClass}>
                {BOT_TONES.map((tone) => (
                  <option key={tone} value={tone}>{TONE_LABEL[tone] || tone}</option>
                ))}
              </select>
            </Labelled>
            <Labelled label="Support email" hint="where the bot sends help requests">
              <input
                type="email"
                value={form.support_email}
                onChange={(e) => set('support_email', e.target.value)}
                placeholder="help@customer.example"
                className={inputClass}
              />
            </Labelled>
            <Labelled label="Calendar link" hint="what it offers for bookings">
              <input
                type="url"
                value={form.calendar_link}
                onChange={(e) => set('calendar_link', e.target.value)}
                placeholder="https://cal.com/…"
                className={inputClass}
              />
            </Labelled>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-dark-900">
                <input type="checkbox" checked={form.enable_lead_capture} onChange={(e) => set('enable_lead_capture', e.target.checked)} />
                Lead capture
              </label>
              <label className="flex items-center gap-2 text-sm text-dark-900">
                <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
                Site active
              </label>
              <label className="flex items-center gap-2 text-sm text-dark-900">
                <input
                  type="color"
                  value={form.theme_primary_color}
                  onChange={(e) => set('theme_primary_color', e.target.value)}
                  className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                />
                Accent
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">What it says</h4>
            <Labelled label="Welcome message" hint="the first thing a visitor reads">
              <textarea
                rows={2}
                value={form.welcome_message}
                onChange={(e) => set('welcome_message', e.target.value)}
                className={inputClass}
              />
            </Labelled>
            <div className="grid sm:grid-cols-3 gap-3">
              <Labelled label="Widget title">
                <input value={form.ui_status_title} onChange={(e) => set('ui_status_title', e.target.value)} className={inputClass} />
              </Labelled>
              <Labelled label="Status line">
                <input value={form.ui_status_online} onChange={(e) => set('ui_status_online', e.target.value)} className={inputClass} />
              </Labelled>
              <Labelled label="Input placeholder">
                <input value={form.ui_input_placeholder} onChange={(e) => set('ui_input_placeholder', e.target.value)} className={inputClass} />
              </Labelled>
            </div>
            <Labelled label="Business summary" hint="the description every answer is grounded in">
              <textarea rows={5} value={form.summary} onChange={(e) => set('summary', e.target.value)} className={inputClass} />
            </Labelled>
            {summary?.language && (
              <p className="text-[11px] text-gray-500">
                Generated in <span className="font-mono">{summary.language}</span> — keep edits in the same language as the
                customer’s own site, or the widget will greet visitors in one language and answer in another.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">What it knows</h4>
              <button onClick={loadPages} disabled={pagesLoading} className="text-xs text-brand-700 hover:text-brand-800 disabled:opacity-40">
                {pagesLoading ? 'Loading…' : 'Refresh page list'}
              </button>
            </div>

            {pages && pages.pages.length === 0 && (
              <p className="text-sm text-gray-500">No indexed pages — this site has never been scanned successfully.</p>
            )}

            {pages && pages.pages.length > 0 && (
              <>
                {pages.truncated && (
                  <p className="text-[11px] text-amber-700">Showing the first pages only — this site has more indexed chunks than the console lists.</p>
                )}
                <ul className="max-h-56 overflow-y-auto divide-y divide-dark-900/5 border border-dark-900/5 rounded-lg">
                  {pages.pages.map((page) => (
                    <li key={page.url} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <input type="checkbox" checked={selected.has(page.url)} onChange={() => toggleUrl(page.url)} />
                      <span className="truncate flex-1 text-dark-900" title={page.url}>{page.url}</span>
                      <span className="text-gray-500 whitespace-nowrap">
                        {page.chunks} chunk{page.chunks === 1 ? '' : 's'}
                        {page.embedded < page.chunks && (
                          <span className="text-amber-700" title="Chunks without an embedding are keyword-searchable only — they never enter semantic ranking.">
                            {' '}· {page.chunks - page.embedded} unembedded
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runPageAction('reindex')}
                    disabled={selected.size === 0 || pagesBusy !== ''}
                    className="flex items-center gap-1.5 text-xs border border-dark-900/10 rounded-lg px-3 py-1.5 hover:bg-surface-200 disabled:opacity-40"
                  >
                    {pagesBusy === 'reindex' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Re-read {selected.size || ''} selected
                  </button>
                  <button
                    onClick={() => runPageAction('remove')}
                    disabled={selected.size === 0 || pagesBusy !== ''}
                    className="flex items-center gap-1.5 text-xs text-rose-600 border border-rose-600/20 rounded-lg px-3 py-1.5 hover:bg-rose-50 disabled:opacity-40"
                  >
                    {pagesBusy === 'remove' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Forget {selected.size || ''} selected
                  </button>
                  <span className="text-[11px] text-gray-500">Re-reading spends the tenant’s scan quota.</span>
                </div>
              </>
            )}
          </section>

          <section className="border-t border-dark-900/5 pt-3 space-y-2">
            <Labelled label="Reason" hint="required — goes into the audit trail with your name">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. customer asked by email to drop the old company name"
                className={inputClass}
              />
            </Labelled>

            {blocked.length > 0 && (
              <p className="text-[11px] text-amber-700 flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {blocked.map((f) => FIELD_LABEL[f] || f).join(', ')} will not stick on this tenant’s plan.
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={changed.length === 0 || saving}
                className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
              >
                {saving ? 'Saving…' : changed.length === 0 ? 'No changes' : `Save ${changed.length} change${changed.length > 1 ? 's' : ''}`}
              </button>
              {changed.length > 0 && (
                <span className="text-[11px] text-gray-500">
                  Changing: {changed.map((f) => FIELD_LABEL[f] || f).join(', ')}
                </span>
              )}
            </div>

            {message && (
              <p
                className={`text-sm flex items-start gap-1.5 ${
                  message.type === 'error' ? 'text-rose-600' : message.type === 'warn' ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {message.type === 'success' && <Check className="w-4 h-4 shrink-0 mt-0.5" />}
                {message.text}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
