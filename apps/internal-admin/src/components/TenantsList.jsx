import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { authenticatedHeaders } from '../lib/supabase';

const PLAN_BADGE = {
  basic: 'bg-slate-700 text-slate-200',
  pro: 'bg-brand-700 text-brand-100',
  premium: 'bg-amber-600/80 text-amber-50',
};

const STATUS_BADGE = {
  active: 'text-emerald-400',
  trialing: 'text-sky-400',
  past_due: 'text-amber-400',
  canceled: 'text-rose-400',
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
        const headers = await authenticatedHeaders();
        const res = await fetch('/api/staff/tenants', { headers });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error || 'Failed to load tenants');
        setTenants(body.tenants || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => t.name?.toLowerCase().includes(q) || t.stripe_customer_id?.toLowerCase().includes(q));
  }, [tenants, query]);

  if (loading) return <p className="text-sm text-gray-500">Loading tenants…</p>;
  if (error) return <p className="text-sm text-rose-400">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-300">{tenants.length} tenants</h2>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or Stripe customer id…"
            className="bg-dark-800 border border-gray-700 text-sm rounded-lg pl-9 pr-3 py-2 w-72 outline-none focus:border-brand-500"
          />
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500 border-b border-white/5">
            <tr>
              <th className="px-4 py-3 font-medium">Tenant</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Sites</th>
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
                className="border-b border-white/5 last:border-0 hover:bg-white/5 cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-white">{tenant.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${PLAN_BADGE[tenant.plan] || 'bg-slate-700 text-slate-200'}`}>
                    {tenant.plan}
                  </span>
                </td>
                <td className={`px-4 py-3 capitalize ${STATUS_BADGE[tenant.plan_status] || 'text-gray-400'}`}>
                  {tenant.plan_status}
                </td>
                <td className="px-4 py-3 text-gray-300">{tenant.site_count}</td>
                <td className="px-4 py-3 text-gray-300">{tenant.messages_count}</td>
                <td className="px-4 py-3 text-gray-300">{tenant.leads_count}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(tenant.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No tenants match "{query}".</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
