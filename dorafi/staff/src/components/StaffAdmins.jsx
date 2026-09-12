import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api } from '../lib/api';

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
      const res = await api.staff.listAdmins();
      if (!res.ok) throw new Error(res.data?.error || 'Failed to load staff');
      setAdmins(res.data.admins || []);
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
      const res = await api.staff.addAdmin({ email: email.trim() });
      if (!res.ok) throw new Error(res.data?.error || 'Failed to grant staff access');
      const who = res.data.admin?.email || email;
      setFormMessage({
        type: 'success',
        text: res.data.created
          ? `Created an account for ${who} and granted staff access. They'll get an email to set their password.`
          : `Granted staff access to ${who}.`,
      });
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
        <h2 className="text-sm font-semibold text-gray-600 mb-1">Grant staff access</h2>
        <p className="text-xs text-gray-500 mb-4">
          If they already have an account (from signing in to this console or the admin app),
          this just grants access. Otherwise it creates one for them and emails them a link to
          set their password — no need to have them sign in first.
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@dorafi.com"
            className="flex-1 bg-white border border-gray-300 text-dark-900 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
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
          <p className={`mt-3 text-sm ${formMessage.type === 'error' ? 'text-rose-600' : 'text-emerald-700'}`}>
            {formMessage.text}
          </p>
        )}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-900/5">
          <h2 className="text-sm font-semibold text-gray-600">{admins.length} staff members</h2>
        </div>
        {loading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
        {error && <p className="p-4 text-sm text-rose-600">{error}</p>}
        {!loading && !error && (
          <table className="w-full text-sm">
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.user_id} className="border-b border-dark-900/5 last:border-0">
                  <td className="px-4 py-3 text-dark-900">{admin.email}</td>
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
