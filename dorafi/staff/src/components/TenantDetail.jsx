import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react';
import { resolveSiteWidgetStatus, resolveTenantWidgetStatus } from '@b2b-ai-chatbot/contracts';
import { api } from '../lib/api';
import WidgetStatusBadge, { formatLastSeen } from './WidgetStatusBadge';

// 'free' has to be a selectable Plan (not just a Status) — it's the DEFAULT
// every tenant starts on before they ever subscribe, so it's a real value of
// this column, not merely the absence of one.
const PLANS = ['free', 'basic', 'pro', 'premium'];
const STATUSES = ['free', 'active', 'trialing', 'past_due', 'canceled'];

export default function TenantDetail({ tenantId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState('');
  const [planStatus, setPlanStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [deletingSiteId, setDeletingSiteId] = useState(null);
  const [deletingTenant, setDeletingTenant] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.staff.getTenant({ id: tenantId });
      if (!res.ok) throw new Error(res.data?.error || 'Failed to load tenant');
      setData(res.data);
      setPlan(res.data.tenant.plan);
      setPlanStatus(res.data.tenant.plan_status);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tenantId]);

  const handleSavePlan = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await api.staff.updateTenantPlan({ id: tenantId, plan, plan_status: planStatus });
      if (!res.ok) throw new Error(res.data?.error || 'Failed to update tenant');
      setSaveMessage({ type: 'success', text: 'Saved. Note: this does not change anything in Stripe.' });
      await load();
    } catch (err) {
      setSaveMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSite = async (site) => {
    if (!window.confirm(`Delete "${site.domain}"? This permanently deletes its documents, leads, summaries, and scan history. This cannot be undone.`)) {
      return;
    }
    setDeletingSiteId(site.id);
    try {
      const res = await api.staff.deleteSite({ id: site.id });
      if (!res.ok) throw new Error(res.data?.error || 'Failed to delete site');
      await load();
    } catch (err) {
      alert(`Failed to delete site: ${err.message}`);
    } finally {
      setDeletingSiteId(null);
    }
  };

  const handleDeleteTenant = async () => {
    const name = data.tenant.name;
    const typed = window.prompt(
      `This permanently deletes "${name}" — all its sites, documents, messages, leads, and usage history. ` +
      `This cannot be undone.\n\nType the tenant name to confirm:`
    );
    if (typed !== name) {
      if (typed !== null) alert('Name did not match — tenant was not deleted.');
      return;
    }
    setDeletingTenant(true);
    try {
      const res = await api.staff.deleteTenant({ id: tenantId });
      if (!res.ok) throw new Error(res.data?.error || 'Failed to delete tenant');
      onBack();
    } catch (err) {
      alert(`Failed to delete tenant: ${err.message}`);
    } finally {
      setDeletingTenant(false);
    }
  };

  const dirty = data && (plan !== data.tenant.plan || planStatus !== data.tenant.plan_status);

  // One rollup for the summary, and each site's own status for the list
  // below it — both from the shared rules in @b2b-ai-chatbot/contracts, so
  // this console and the customer's own dashboard answer "is it live?" the
  // same way. Recomputed only when the tenant is reloaded (the live window is
  // ten minutes wide; nothing here moves faster than a refresh).
  const widget = useMemo(
    () => (data ? resolveTenantWidgetStatus(data.tenant, data.sites) : null),
    [data]
  );

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-dark-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to tenants
      </button>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {data && (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-dark-900">{data.tenant.name}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  created {new Date(data.tenant.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {data.tenant.stripe_customer_id && (
                  <a
                    href={`https://dashboard.stripe.com/customers/${data.tenant.stripe_customer_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-brand-700 hover:text-brand-800 border border-dark-900/10 rounded-lg px-3 py-2"
                  >
                    Open in Stripe <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  onClick={handleDeleteTenant}
                  disabled={deletingTenant}
                  title="Delete this tenant and everything under it"
                  className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 border border-rose-600/20 hover:bg-rose-50 disabled:opacity-40 rounded-lg px-3 py-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {deletingTenant ? 'Deleting…' : 'Delete tenant'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 mt-6">
              <div>
                <label className="block text-xs text-gray-500 mb-1" title="Which tier's features and limits apply">
                  Plan <span className="font-normal normal-case text-gray-400">(tier)</span>
                </label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  title="Which tier's features and limits apply"
                  className="bg-white border border-gray-300 text-dark-900 text-sm rounded-lg px-3 py-2 capitalize"
                >
                  {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1" title="Stripe's billing state for that plan">
                  Status <span className="font-normal normal-case text-gray-400">(billing state)</span>
                </label>
                <select
                  value={planStatus}
                  onChange={(e) => setPlanStatus(e.target.value)}
                  title="Stripe's billing state for that plan"
                  className="bg-white border border-gray-300 text-dark-900 text-sm rounded-lg px-3 py-2 capitalize"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button
                onClick={handleSavePlan}
                disabled={!dirty || saving}
                className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <p className="text-[11px] text-gray-500 max-w-xs">
                Plan is which tier applies (free/basic/pro/premium); Status is that tier's Stripe
                billing state (e.g. a pro tenant can be active, past_due, or canceled). Manual
                override — writes the DB directly, does not touch Stripe. Use for support fixes,
                not as a substitute for a real subscription change.
              </p>
            </div>
            {saveMessage && (
              <p className={`mt-2 text-sm ${saveMessage.type === 'error' ? 'text-rose-600' : 'text-emerald-700'}`}>
                {saveMessage.text}
              </p>
            )}

            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-6 text-sm">
              <div>
                <dt className="text-gray-500 text-xs">Sites</dt>
                <dd className="text-dark-900 font-semibold">{data.sites.length}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Widget</dt>
                <dd className="mt-0.5">
                  <WidgetStatusBadge status={widget.status} lastSeenAt={widget.lastSeenAt} />
                  <span className="block text-[11px] text-gray-500 mt-1">
                    {widget.siteCount === 0
                      ? 'no site to install on'
                      : `${widget.installedCount}/${widget.siteCount} installed`}
                    {widget.lastSeenAt ? ` · last seen ${formatLastSeen(widget.lastSeenAt)}` : ''}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Leads (all time)</dt>
                <dd className="text-dark-900 font-semibold">{data.leads_count}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Plan renews</dt>
                <dd className="text-dark-900 font-semibold">
                  {data.tenant.plan_expires_at ? new Date(data.tenant.plan_expires_at).toLocaleDateString() : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Stripe subscription</dt>
                <dd className="text-dark-900 font-mono text-xs">{data.tenant.stripe_subscription_id || '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-4">Sites</h3>
            {data.sites.length === 0 && <p className="text-sm text-gray-500">No sites yet.</p>}
            <ul className="divide-y divide-dark-900/5">
              {data.sites.map((site) => {
                const siteWidget = resolveSiteWidgetStatus(site, data.tenant);
                return (
                <li key={site.id} className="py-2.5 flex items-center justify-between text-sm gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-dark-900 truncate">{site.domain}</span>
                    <WidgetStatusBadge status={siteWidget.status} lastSeenAt={siteWidget.lastSeenAt} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {siteWidget.lastSeenAt
                        ? `widget seen ${formatLastSeen(siteWidget.lastSeenAt)}`
                        : 'widget never seen'} · {site.enable_lead_capture ? 'lead capture on' : 'lead capture off'} · added {new Date(site.created_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleDeleteSite(site)}
                      disabled={deletingSiteId === site.id}
                      title="Delete this site"
                      className="text-gray-500 hover:text-rose-600 disabled:opacity-40 p-1.5 rounded-lg hover:bg-surface-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
                );
              })}
            </ul>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-4">Usage — last 30 recorded days</h3>
            {data.usage_counters.length === 0 && <p className="text-sm text-gray-500">No usage recorded yet.</p>}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {data.usage_counters.map((row) => (
                <div key={row.usage_date} className="bg-surface-200 rounded-lg p-3 text-xs">
                  <div className="text-gray-500">{row.usage_date}</div>
                  <div className="text-dark-900 mt-1">{row.messages_count} msgs</div>
                  <div className="text-gray-500">{row.scans_count} scans</div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-4">Recent scan jobs</h3>
            {data.scan_jobs.length === 0 && <p className="text-sm text-gray-500">No scans yet.</p>}
            <ul className="divide-y divide-dark-900/5">
              {data.scan_jobs.map((job) => (
                <li key={job.id} className="py-2.5 text-sm flex items-center justify-between">
                  <span className="text-dark-900 truncate max-w-md">{job.url}</span>
                  <span className="text-xs text-gray-500 capitalize">{job.status} · {job.pages_indexed}/{job.pages_discovered} pages</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
