import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { authenticatedHeaders } from '../lib/supabase';

export default function StaffAdmins() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState(null); // { type: 'error' | 'success', text }

  const loadAdmins = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await authenticatedHeaders();
      const res = await fetch('/api/staff/admins', { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load staff');
      setAdmins(body.admins || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAdmins(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setFormMessage(null);
    try {
      const headers = await authenticatedHeaders();
      const res = await fetch('/api/staff/admins', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to grant staff access');
      setFormMessage({ type: 'success', text: `Granted staff access to ${body.admin?.email || email}.` });
      setEmail('');
      await loadAdmins();
    } catch (err) {
      setFormMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="glass-card rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-1">Grant staff access</h2>
        <p className="text-xs text-gray-500 mb-4">
          They need to have signed in at least once (via magic link, on this console or the
          admin app) before they can be granted access — this looks them up by their
          existing Supabase Auth account, it doesn't create one.
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@repondo.com"
            className="flex-1 bg-dark-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
            required
          />
          <button
            type="submit"
            disabled={submitting || !email}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4" /> {submitting ? 'Granting…' : 'Grant access'}
          </button>
        </form>
        {formMessage && (
          <p className={`mt-3 text-sm ${formMessage.type === 'error' ? 'text-rose-400' : 'text-emerald-300'}`}>
            {formMessage.text}
          </p>
        )}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h2 className="text-sm font-semibold text-gray-300">{admins.length} staff members</h2>
        </div>
        {loading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
        {error && <p className="p-4 text-sm text-rose-400">{error}</p>}
        {!loading && !error && (
          <table className="w-full text-sm">
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.user_id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white">{admin.email}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    added {new Date(admin.created_at).toLocaleDateString()}
                    {admin.added_by ? ` by ${admin.added_by}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
