import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setMessage('');
    const error = await onLogin(email.trim());
    setMessage(error || 'Sign-in link sent. Check your email.');
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-surface-100 flex items-center justify-center p-4">
      <div className="glass-card p-10 rounded-3xl w-full max-w-md border border-dark-900/10 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white shadow-xl shadow-brand-500/30 mb-6">
            <span className="font-extrabold text-xl">R</span>
          </div>
          <h1 className="text-xl font-bold text-dark-900 text-center">Staff Console</h1>
          <p className="text-gray-500 text-sm mt-2 text-center">
            Internal, staff-only. Sign in with your Dorafi team email.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@dorafi.com"
            className="w-full bg-white border border-gray-300 text-dark-900 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500"
            required
          />
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>

        {message && <p className="mt-4 text-center text-sm text-emerald-700">{message}</p>}

        <div className="mt-8 pt-6 border-t border-dark-900/5 flex items-center justify-center gap-2 text-xs text-gray-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600/70" /> Access is separately granted per staff account
        </div>
      </div>
    </main>
  );
}
