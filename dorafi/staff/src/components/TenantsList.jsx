import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { resolveTenantWidgetStatus } from '@b2b-ai-chatbot/contracts';
import { api } from '../lib/api';
import WidgetStatusBadge from './WidgetStatusBadge';

const PLAN_BADGE = {
  free: 'bg-gray-200 text-gray-600',
  basic: 'bg-slate-700 text-slate-200',
  pro: 'bg-brand-700 text-brand-100',
  premium: 'bg-amber-600/80 text-amber-50',
};

const STATUS_BADGE = {
  active: 'text-emerald-600',
  trialing: 'text-sky-600',
  past_due: 'text-amber-600',
  canceled: 'text-rose-600',
  free: 'text-gray-500',
};

export default function TenantsList({ onSelectTenant }) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.staff.listTenants();
        if (cancelled) return;
        if (!res.ok) throw new Error(res.data?.error || 'Failed to load tenants');
        setTenants(res.data.tenants || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolved once per load rather than per render: the rollup reads the
  // clock (a site counts as live for 10 minutes after its last sighting), and
  // recomputing it on every keystroke in the search box would be work nobody
  // asked for. A staff member watching a tenant come online reloads the page.
  const withWidget = useMemo(
    () => tenants.map((tenant) => ({ ...tenant, widget: resolveTenantWidgetStatus(tenant, tenant.sites) })),
    [tenants]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return withWidget;
    return withWidget.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.stripe_customer_id?.toLowerCase().includes(q) ||
        (t.sites || []).some((site) => site.domain?.toLowerCase().includes(q))
    );
  }, [withWidget, query]);

  if (loading) return <p className="text-sm text-gray-500">Loading tenants…</p>;
  if (error) return <p className="text-sm text-rose-600">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-600">{tenants.length} tenants</h2>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, domain or Stripe customer id…"
            className="bg-white border border-gray-300 text-sm rounded-lg pl-9 pr-3 py-2 w-72 outline-none focus:border-brand-500"
          />
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500 border-b border-dark-900/5">
            <tr>
              <th className="px-4 py-3 font-medium">Tenant</th>
              <th className="px-4 py-3 font-medium" title="Which tier's features and limits apply">Plan</th>
              <th className="px-4 py-3 font-medium" title="Stripe's billing state for that plan">Status</th>
              <th className="px-4 py-3 font-medium">Sites</th>
              <th
                className="px-4 py-3 font-medium"
                title="Whether the embed snippet is actually live on the customer's own website — measured from the widget calling in, not self-reported"
              >
                Widget
              </th>
              <th className="px-4 py-3 font-medium">Messages</th>
              <th className="px-4 py-3 font-medium">Leads</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tenant) => (
              <tr
                key={tenant.id}
                onClick={() => onSelectTenant(tenant.id)}
                className="border-b border-dark-900/5 last:border-0 hover:bg-surface-200 cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-dark-900">{tenant.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${PLAN_BADGE[tenant.plan] || 'bg-slate-700 text-slate-200'}`}>
                    {tenant.plan}
                  </span>
                </td>
                <td className={`px-4 py-3 capitalize ${STATUS_BADGE[tenant.plan_status] || 'text-gray-500'}`}>
                  {tenant.plan_status}
                </td>
                <td className="px-4 py-3 text-gray-600">{tenant.site_count}</td>
                <td className="px-4 py-3">
                  <WidgetStatusBadge status={tenant.widget.status} lastSeenAt={tenant.widget.lastSeenAt} />
                  {tenant.widget.siteCount > 1 && (
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      {tenant.widget.installedCount}/{tenant.widget.siteCount} sites installed
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{tenant.messages_count}</td>
                <td className="px-4 py-3 text-gray-600">{tenant.leads_count}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(tenant.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No tenants match "{query}".</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
