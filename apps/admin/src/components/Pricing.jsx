import React, { useState } from 'react';
import { Check, Zap, Shield, Sparkles, ArrowRight, Loader2, ExternalLink } from 'lucide-react';

const PLANS = [
  {
    id: 'free',
    name: 'Free Plan',
    price: '0',
    currency: 'CAD',
    description: "Test and automate your first customer conversations with free AI models.",
    features: [
      '1 AI Assistant on your website',
      '100% Free LLM Models (OpenRouter / Gemini / Llama)',
      '100 messages / month included',
      'Website content indexing',
      'Lead capture & email collection',
      'Customized widget styling',
    ],
    icon: <Sparkles className="w-6 h-6 text-sky-400" />,
    color: 'sky',
  },
  {
    id: 'basic',
    name: 'Basic Chatbot',
    price: '45',
    currency: 'CAD',
    description: "Everything you need to automate 24/7 customer support with AI.",
    popular: true,
    features: [
      '1 AI Assistant on your website',
      "Unlimited automatic website indexing",
      'Bilingual semantic search (FR/EN)',
      'Lead capture & export',
      'Customizable widget (color, tone, goals)',
      'Priority email support',
    ],
    icon: <Zap className="w-6 h-6 text-emerald-400" />,
    color: 'emerald',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    description: 'For organizations with high traffic, custom integrations, and dedicated needs.',
    features: [
      'Unlimited AI Assistants',
      'CRM Integration (HubSpot, Salesforce)',
      'Choice of premium LLMs (Claude, OpenAI, Gemini)',
      '99.9% SLA & Dedicated Account Manager',
    ],
    icon: <Shield className="w-6 h-6 text-brand-400" />,
    color: 'brand',
  },
];

export default function Pricing({ onSelectPlan, tenantId, currentPlan = 'free' }) {
  const [loadingPlanId, setLoadingPlanId] = useState(null);
  const [error, setError] = useState(null);

  const handleSelectPlan = async (planId) => {
    if (planId === 'enterprise') {
      window.open('mailto:hello@your-domain.com?subject=Enterprise Plan Inquiry', '_blank');
      return;
    }

    if (planId === 'free' || !tenantId) {
      onSelectPlan?.(planId);
      return;
    }

    setLoadingPlanId(planId);
    setError(null);

    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, tenantId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error creating checkout session');
      }

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('[Pricing] Checkout error:', err);
      setError(err.message);
    } finally {
      setLoadingPlanId(null);
    }
  };

  const isCurrentPlan = (planId) => currentPlan === planId;

  return (
    <div className="py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h1 className="text-3xl font-bold text-white mb-4">Level Up Your Customer Support</h1>
        <p className="text-gray-400 text-lg">
          Choose the plan that fits your business needs and automate your customer service 24/7.
        </p>
      </div>

      {error && (
        <div className="max-w-md mx-auto mb-8 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 text-center">
          ⚠️ {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {PLANS.map((plan) => {
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
                  : 'border-white/5 hover:border-white/20'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg">
                  Most Popular
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg flex items-center gap-1">
                  <Check className="w-3 h-3" /> Your Current Plan
                </div>
              )}

              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-${plan.color}-500/10 border border-${plan.color}-500/20`}
              >
                {plan.icon}
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
              <p className="text-sm text-gray-400 mb-6 min-h-[40px]">{plan.description}</p>

              <div className="mb-8">
                {plan.price === 'Custom' || plan.price === 'Sur mesure' ? (
                  <span className="text-3xl font-bold text-white">Custom</span>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">${plan.price}</span>
                    <span className="text-gray-400 font-medium">{plan.currency || 'CAD'}/month</span>
                  </div>
                )}
              </div>

              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                    <Check className={`w-5 h-5 shrink-0 text-${plan.color}-400`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                id={`plan-btn-${plan.id}`}
                onClick={() => handleSelectPlan(plan.id)}
                disabled={isLoading || isCurrent}
                className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                  isCurrent
                    ? 'bg-brand-700/50 border border-brand-500/30 text-brand-300 cursor-default'
                    : plan.popular
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/50 hover:scale-[1.02] active:scale-95'
                    : 'bg-dark-800 hover:bg-dark-700 text-white border border-white/10 hover:border-white/20 hover:scale-[1.02] active:scale-95'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isCurrent ? (
                  <>
                    <Check className="w-4 h-4" /> Active Plan
                  </>
                ) : plan.price === 'Custom' || plan.price === 'Sur mesure' ? (
                  <>
                    Contact Us <ExternalLink className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Choose Plan <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-600 mt-10">
        Secure payments powered by{' '}
        <a
          href="https://stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-400 underline"
        >
          Stripe
        </a>
        . Cancel anytime.
      </p>
    </div>
  );
}
