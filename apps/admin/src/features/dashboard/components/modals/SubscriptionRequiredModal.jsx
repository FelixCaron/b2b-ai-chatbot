import React from 'react';
import { Lock, Sparkles, X } from 'lucide-react';
import { useT } from '../../../../i18n/LanguageContext';

/** 11. SUBSCRIPTION REQUIRED — INSTALL GATE
    Installing puts the assistant on a real, live website — that's the one
    action that actually requires a paid, active plan (everything else about
    building and testing the assistant stays open, guest included). Same
    upgrade-first shape as UpgradeRequiredModal: subscribing is the lead
    action, going back is just a way out. */
export default function SubscriptionRequiredModal({
  show,
  activeSiteDomain,
  onShowPricing,
  onClose
}) {
  const { t } = useT();
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white p-8 rounded-3xl w-full max-w-md border border-brand-500/30 shadow-2xl relative text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-dark-900 p-2 rounded-lg hover:bg-dark-900/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-brand-500/10 text-brand-700 border border-brand-500/20 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7" />
        </div>

        <h3 className="text-xl font-bold text-dark-900 mb-2">
          {t('Subscribe to install {domain}', { domain: activeSiteDomain || t('your assistant') })}
        </h3>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          {t('You can build and test your assistant for free, but putting it live on your website needs an active plan. Choose a plan to get your install code.')}
        </p>

        <div className="flex flex-col gap-3">
          {onShowPricing && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onShowPricing();
              }}
              className="w-full bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-600 hover:to-brand-400 text-white font-bold px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-900/30 hover:scale-[1.02] active:scale-95"
            >
              <Sparkles className="w-4 h-4" /> {t('See Plans →')}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full px-5 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            {t('Go back')}
          </button>
        </div>
      </div>
    </div>
  );
}
