import React, { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { authenticatedHeaders } from '../lib/supabase';

export default function TenantDetail({ tenantId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = await authenticatedHeaders();
        const res = await fetch(`/api/staff/tenants/${tenantId}`, { headers });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error || 'Failed to load tenant');
        setData(body);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

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
                  {data.tenant.plan} · {data.tenant.plan_status} · created {new Date(data.tenant.created_at).toLocaleDateString()}
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
                <li key={site.id} className="py-2.5 flex items-center justify-between text-sm">
                  <span className="text-white">{site.domain}</span>
                  <span className="text-xs text-gray-500">
                    {site.enable_lead_capture ? 'lead capture on' : 'lead capture off'} · added {new Date(site.created_at).toLocaleDateString()}
                  </span>
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
