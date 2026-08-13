import React, { useState } from 'react';
import { Check, Zap, Shield, ArrowRight, Loader2, ExternalLink } from 'lucide-react';

const PLANS = [
  {
    id: 'basic',
    name: 'Chatbot Basic',
    price: '45',
    currency: 'CAD',
    description: "Tout ce qu'il vous faut pour automatiser votre service client avec l'IA.",
    popular: true,
    features: [
      '1 Assistant IA sur votre site web',
      "Indexation automatique de vos pages",
      'Recherche sémantique multilingue (FR/EN)',
      'Capture de prospects (Leads)',
      'Widget personnalisable (couleur, ton)',
      'Support par email',
    ],
    icon: <Zap className="w-6 h-6 text-emerald-400" />,
    color: 'emerald',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Sur mesure',
    description: 'Pour les grands groupes ayant des besoins spécifiques et un volume élevé.',
    features: [
      'Assistants IA illimités',
      'Intégration CRM (HubSpot, Salesforce)',
      'Modèles LLM au choix (Claude, OpenAI)',
      'SLA 99.9% & Account Manager dédié',
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
      window.open('mailto:hello@votre-domaine.com?subject=Demande Enterprise', '_blank');
      return;
    }

    if (!tenantId) {
      // Fallback for unauthenticated users — just call parent handler
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
        throw new Error(data.error || 'Erreur lors de la création de la session');
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
        <h1 className="text-3xl font-bold text-white mb-4">Passez à la vitesse supérieure</h1>
        <p className="text-gray-400 text-lg">
          Choisissez le plan qui correspond à vos besoins et automatisez votre relation client 24/7.
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
                  Le plus populaire
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg flex items-center gap-1">
                  <Check className="w-3 h-3" /> Votre plan actuel
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
                {plan.price === 'Sur mesure' ? (
                  <span className="text-3xl font-bold text-white">Sur mesure</span>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">{plan.price}$</span>
                    <span className="text-gray-400 font-medium">{plan.currency || 'CAD'}/mois</span>
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
                    <Check className="w-4 h-4" /> Plan actif
                  </>
                ) : plan.price === 'Sur mesure' ? (
                  <>
                    Nous contacter <ExternalLink className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Choisir ce plan <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-600 mt-10">
        Paiements sécurisés par{' '}
        <a
          href="https://stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-400 underline"
        >
          Stripe
        </a>
        . Annulable à tout moment.
      </p>
    </div>
  );
}
