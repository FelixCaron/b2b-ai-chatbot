import React, { useState } from 'react';
import { ArrowRight, Mail, X } from 'lucide-react';
import LogoMark from './LogoMark';
import { useT } from '../i18n/LanguageContext';

export default function LoginModal({
  onLogin,
  onClose,
  onNotNow,
  loading = false,
  isGuestConversion = false,
  // A link was sent — render the confirmation screen instead of the form.
  message = '',
  // The attempt itself failed (network, rate limit, ...) — shown inline,
  // on top of the still-usable form, so the user can just try again.
  error = '',
  onUseDifferentEmail
}) {
  const { t } = useT();
  const [email, setEmail] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || loading) return;
    await onLogin(email.trim());
  };

  const closeButton = onClose && (
    <button
      onClick={onClose}
      className="absolute top-4 right-4 text-gray-500 hover:text-dark-900 p-2 rounded-lg hover:bg-surface-200 transition-colors z-10"
    >
      <X className="w-5 h-5" />
    </button>
  );

  // A sign-in link was just sent: what happens next is entirely in the
  // visitor's inbox, not this screen, so say that plainly instead of a
  // one-line addition under an otherwise-unchanged form (the previous
  // version left the same email field and "Continue" button on screen,
  // which read as if nothing had happened).
  if (message) {
    return (
      <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="relative bg-white p-10 rounded-3xl w-full max-w-md border border-dark-900/10 shadow-2xl overflow-hidden text-center">
          {closeButton}
          <div className="absolute inset-0 bg-gradient-to-br from-brand-900/20 to-brand-700/20 pointer-events-none"></div>

          <div className="relative w-16 h-16 mx-auto mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center">
            <Mail className="w-7 h-7" />
          </div>

          <h1 className="relative text-2xl font-bold text-dark-900">{t('Check your email')}</h1>
          <p className="relative text-gray-500 text-sm mt-2 leading-relaxed">{message}</p>

          <div className="relative mt-8 flex flex-col gap-2.5">
            {onUseDifferentEmail && (
              <button
                type="button"
                onClick={onUseDifferentEmail}
                className="w-full px-5 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:text-dark-900 bg-white border border-dark-900/10 hover:bg-surface-200 transition-all"
              >
                {t('Use a different email')}
              </button>
            )}
            {/* Sending the link doesn't finish anything by itself — the
                visitor is still a guest until they click it — so this stays
                an explicit, separate opt-out rather than the modal quietly
                closing on its own. */}
            {isGuestConversion && onNotNow && (
              <button
                type="button"
                onClick={onNotNow}
                className="w-full text-center text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                {t('Not now — keep working as a guest')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white p-10 rounded-3xl w-full max-w-md border border-dark-900/10 shadow-2xl overflow-hidden">
        {closeButton}

        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/20 to-brand-700/20 pointer-events-none"></div>

        <div className="relative flex flex-col items-center mb-8">
          <div className="relative w-16 h-16 text-brand-900 mb-6 flex items-center justify-center">
            <LogoMark className="w-full h-full" />
          </div>
          <h1 className="text-2xl font-bold text-dark-900 text-center">
            {isGuestConversion ? t('Congratulations, your AI is ready!') : t('Welcome to your AI Space')}
          </h1>
          <p className="text-gray-500 text-sm mt-2 text-center">
            {isGuestConversion
              ? t('Enter your work email to save your assistant and get your integration embed code.')
              : t('Enter your work email to sign in or configure your assistant.')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">{t('Email Address')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full bg-white border border-gray-300 text-dark-900 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
              required
            />
            <p className="text-[11px] text-gray-500 mt-1.5">{t("No password needed — we'll email you a secure sign-in link.")}</p>
            {error && <p className="text-[11px] text-rose-600 font-medium mt-1.5">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
          >
            {loading ? t('Sending link...') : (
              <>{isGuestConversion ? t('Save My Assistant') : t('Continue')} <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        {/* Quiet opt-out for the congratulations screen — the assistant they
            just built keeps working as a guest draft; putting it on their own
            live website is what actually requires an account (see the isGuest
            gates on the dashboard's Install and Activate buttons). */}
        {isGuestConversion && onNotNow && (
          <button
            type="button"
            onClick={onNotNow}
            className="relative w-full mt-3 text-center text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Not now — keep working as a guest
          </button>
        )}
      </div>
    </div>
  );
}
