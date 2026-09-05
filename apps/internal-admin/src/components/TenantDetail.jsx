import React, { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react';
import { authenticatedHeaders } from '../lib/supabase';

const PLANS = ['basic', 'pro', 'premium'];
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

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await authenticatedHeaders();
      const res = await fetch(`/api/staff/tenants?id=${tenantId}`, { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load tenant');
      setData(body);
      setPlan(body.tenant.plan);
      setPlanStatus(body.tenant.plan_status);
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
      const headers = await authenticatedHeaders();
      const res = await fetch(`/api/staff/tenants?id=${tenantId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ plan, plan_status: planStatus }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to update tenant');
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
      const headers = await authenticatedHeaders();
      const res = await fetch(`/api/staff/sites?id=${site.id}`, { method: 'DELETE', headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to delete site');
      await load();
    } catch (err) {
      alert(`Failed to delete site: ${err.message}`);
    } finally {
      setDeletingSiteId(null);
    }
  };

  const dirty = data && (plan !== data.tenant.plan || planStatus !== data.tenant.plan_status);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to tenants
      </button>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {data && (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">{data.tenant.name}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  created {new Date(data.tenant.created_at).toLocaleDateString()}
                </p>
              </div>
              {data.tenant.stripe_customer_id && (
                <a
                  href={`https://dashboard.stripe.com/customers/${data.tenant.stripe_customer_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-brand-300 hover:text-brand-200 border border-white/10 rounded-lg px-3 py-2"
                >
                  Open in Stripe <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3 mt-6">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Plan</label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="bg-dark-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 capitalize"
                >
                  {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Status</label>
                <select
                  value={planStatus}
                  onChange={(e) => setPlanStatus(e.target.value)}
                  className="bg-dark-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 capitalize"
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
                Manual override — writes the DB directly, does not touch Stripe. Use for
                support fixes, not as a substitute for a real subscription change.
              </p>
            </div>
            {saveMessage && (
              <p className={`mt-2 text-sm ${saveMessage.type === 'error' ? 'text-rose-400' : 'text-emerald-300'}`}>
                {saveMessage.text}
              </p>
            )}

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-sm">
              <div>
                <dt className="text-gray-500 text-xs">Sites</dt>
                <dd className="text-white font-semibold">{data.sites.length}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Leads (all time)</dt>
                <dd className="text-white font-semibold">{data.leads_count}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Plan renews</dt>
                <dd className="text-white font-semibold">
                  {data.tenant.plan_expires_at ? new Date(data.tenant.plan_expires_at).toLocaleDateString() : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Stripe subscription</dt>
                <dd className="text-white font-mono text-xs">{data.tenant.stripe_subscription_id || '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Sites</h3>
            {data.sites.length === 0 && <p className="text-sm text-gray-500">No sites yet.</p>}
            <ul className="divide-y divide-white/5">
              {data.sites.map((site) => (
                <li key={site.id} className="py-2.5 flex items-center justify-between text-sm gap-3">
                  <span className="text-white">{site.domain}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {site.enable_lead_capture ? 'lead capture on' : 'lead capture off'} · added {new Date(site.created_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleDeleteSite(site)}
                      disabled={deletingSiteId === site.id}
                      title="Delete this site"
                      className="text-gray-500 hover:text-rose-400 disabled:opacity-40 p-1.5 rounded-lg hover:bg-white/5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Usage — last 30 recorded days</h3>
            {data.usage_counters.length === 0 && <p className="text-sm text-gray-500">No usage recorded yet.</p>}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {data.usage_counters.map((row) => (
                <div key={row.usage_date} className="bg-dark-800 rounded-lg p-3 text-xs">
                  <div className="text-gray-500">{row.usage_date}</div>
                  <div className="text-white mt-1">{row.messages_count} msgs</div>
                  <div className="text-gray-400">{row.scans_count} scans</div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Recent scan jobs</h3>
            {data.scan_jobs.length === 0 && <p className="text-sm text-gray-500">No scans yet.</p>}
            <ul className="divide-y divide-white/5">
              {data.scan_jobs.map((job) => (
                <li key={job.id} className="py-2.5 text-sm flex items-center justify-between">
                  <span className="text-white truncate max-w-md">{job.url}</span>
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
