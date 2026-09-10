import React, { useState } from 'react';
import { Check, Zap, Shield, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { PLANS } from '@b2b-ai-chatbot/contracts';
import api from '../lib/api';
import { useT } from '../i18n/LanguageContext';
import { GENERAL_EMAIL } from './LegalPages';

// Plan copy, prices, and limits live in one place — packages/contracts/src/
// plans.js — and this file only adds the presentational bits (icon, color)
// on top. See that file's header comment for why: two rounds of "advertised
// vs enforced" numbers drifting apart have already happened in this repo
// (ADR 057, and the CAD/USD mismatch this pricing rewrite itself fixed).
const PLAN_PRESENTATION = {
  basic: { icon: <Sparkles className="w-6 h-6 text-sky-600" />, color: 'sky' },
  pro: { icon: <Zap className="w-6 h-6 text-emerald-600" />, color: 'emerald' },
  premium: { icon: <Shield className="w-6 h-6 text-brand-700" />, color: 'brand' },
};

export default function Pricing({ onSelectPlan, tenantId, currentPlan = 'basic', onNavigate }) {
  const { t } = useT();
  const [loadingPlanId, setLoadingPlanId] = useState(null);
  const [error, setError] = useState(null);

  const handleSelectPlan = async (planId) => {
    // Every plan is self-serve Stripe checkout. Without a tenant there is
    // nothing to bill yet, so hand the choice back to the caller to sort out
    // sign-in first.
    if (!tenantId) {
      onSelectPlan?.(planId);
      return;
    }

    setLoadingPlanId(planId);
    setError(null);

    const result = await api.billing.checkout({ planId, tenantId });

    if (result.ok && result.data?.url) {
      // Redirect to Stripe Checkout
      window.location.href = result.data.url;
      return;
    }

    console.error('[Pricing] Checkout error:', result.error);
    setError(result.error || t('Error creating checkout session'));
    setLoadingPlanId(null);
  };

  const isCurrentPlan = (planId) => currentPlan === planId;

  // A real way to reach a human about an Enterprise-sized need — this used to
  // send people to the About page, a marketing page with no contact info and
  // no way to actually get in touch, a dead end for exactly the visitor
  // trying hardest to become a customer.
  const enterpriseMailto = `mailto:${GENERAL_EMAIL}?subject=${encodeURIComponent('Enterprise plan inquiry')}`;

  return (
    <div className="py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h1 className="text-3xl font-bold text-dark-900 mb-4">{t('Turn Website Visitors Into Customers')}</h1>
        <p className="text-gray-500 text-lg">
          {t('A virtual employee on your site that answers, qualifies, and converts visitors — 24/7.')}
        </p>
      </div>

      {error && (
        <div className="max-w-md mx-auto mb-8 bg-red-500/10 border border-red-500/30 text-red-600 text-sm rounded-xl px-4 py-3 text-center">
          ⚠️ {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {PLANS.map((plan) => {
          const { icon, color } = PLAN_PRESENTATION[plan.id];
          const isLoading = loadingPlanId === plan.id;
          const isCurrent = isCurrentPlan(plan.id);

          return (
            <div
              key={plan.id}
              className={`relative glass-card rounded-3xl p-8 flex flex-col h-full border transition-all hover:-translate-y-2 ${
                plan.popular
                  ? 'border-emerald-500/50 shadow-2xl shadow-emerald-900/20'
                  : isCurrent
                  ? 'border-brand-500/40 shadow-lg shadow-brand-900/20'
                  : 'border-dark-900/10 hover:border-dark-900/20'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg">
                  {t('Most Popular')}
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg flex items-center gap-1">
                  <Check className="w-3 h-3" /> {t('Your Current Plan')}
                </div>
              )}

              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-${color}-500/10 border border-${color}-500/20`}
              >
                {icon}
              </div>

              <h3 className="text-xl font-bold text-dark-900 mb-1">{t(plan.displayName)}</h3>
              <p className={`text-xs font-bold uppercase tracking-wider mb-3 text-${color}-600`}>{t(plan.tagline)}</p>
              <p className="text-sm text-gray-500 mb-6 min-h-[40px]">{t(plan.description)}</p>

              <div className="mb-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-dark-900">${plan.priceCad}</span>
                  <span className="text-gray-500 font-medium">{t('CAD/month')}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-6">{t('14-day free trial · No credit card required')}</p>

              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                    <Check className={`w-5 h-5 shrink-0 text-${color}-600`} />
                    <span>{t(feature)}</span>
                  </li>
                ))}
              </ul>

              <button
                id={`plan-btn-${plan.id}`}
                onClick={() => handleSelectPlan(plan.id)}
                disabled={isLoading || isCurrent}
                className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                  isCurrent
                    ? 'bg-brand-500/10 border border-brand-500/30 text-brand-700 cursor-default'
                    : plan.popular
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/50 hover:scale-[1.02] active:scale-95'
                    : 'bg-white hover:bg-surface-200 text-dark-900 border border-dark-900/10 hover:border-dark-900/20 hover:scale-[1.02] active:scale-95'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isCurrent ? (
                  <>
                    <Check className="w-4 h-4" /> {t('Active Plan')}
                  </>
                ) : (
                  <>
                    {t('Start Free Trial')} <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm text-gray-500 mt-10">
        {t('Need multiple locations, higher volumes, or a CRM integration?')}{' '}
        <a href={enterpriseMailto} className="underline hover:text-gray-700 font-medium">
          {t('Contact us')}
        </a>{' '}
        {t('about Enterprise.')}
      </p>

      <p className="text-center text-xs text-gray-600 mt-6">
        {t('Secure payments powered by')}{' '}
        <a
          href="https://stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-700 underline"
        >
          Stripe
        </a>
        {t('. Cancel anytime.')}
      </p>
      <p className="text-center text-[11px] text-gray-600 mt-2">
        {t('By subscribing, you agree to our')}{' '}
        <button onClick={() => onNavigate?.('terms')} className="underline hover:text-gray-700">
          {t('Terms of Service')}
        </button>{' '}
        {t('and')}{' '}
        <button onClick={() => onNavigate?.('privacy')} className="underline hover:text-gray-700">
          {t('Privacy Policy')}
        </button>
        .
      </p>
    </div>
  );
}
