import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, X } from 'lucide-react';
import LogoMark from './LogoMark';

export default function LoginModal({ onLogin, onClose, isGuestConversion = false, message = '' }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setLoading(true);
    await onLogin(email.trim());
  };

  return (
    <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white p-10 rounded-3xl w-full max-w-md border border-dark-900/10 shadow-2xl overflow-hidden">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-dark-900 p-2 rounded-lg hover:bg-surface-200 transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/20 to-brand-700/20 pointer-events-none"></div>

        <div className="relative flex flex-col items-center mb-8">
          <div className="relative w-16 h-16 text-brand-900 mb-6 flex items-center justify-center">
            <LogoMark className="w-full h-full" />
          </div>
          <h1 className="text-2xl font-bold text-dark-900 text-center">
            {isGuestConversion ? "Congratulations, your AI is ready!" : "Welcome to your AI Space"}
          </h1>
          <p className="text-gray-500 text-sm mt-2 text-center">
            {isGuestConversion
              ? "Enter your work email to save your assistant and get your integration embed code."
              : "Enter your work email to sign in or configure your assistant."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full bg-white border border-gray-300 text-dark-900 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
              required
            />
            <p className="text-[11px] text-gray-500 mt-1.5">No password needed — we'll email you a secure sign-in link.</p>
          </div>

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
          >
            {loading ? 'Saving...' : (
              <>{isGuestConversion ? 'Save My Assistant' : 'Continue'} <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        {message && <p className="relative mt-4 text-center text-sm text-emerald-700">{message}</p>}

        <div className="relative mt-8 pt-6 border-t border-dark-900/10 flex items-center justify-center gap-2 text-xs text-gray-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500/70" /> {isGuestConversion ? "Secure account creation" : "Secure sign in"}
        </div>
      </div>
    </div>
  );
}
