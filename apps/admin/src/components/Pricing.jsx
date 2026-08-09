import React from 'react';
import { Check, Star, Zap, Shield, ArrowRight } from 'lucide-react';

export default function Pricing({ onSelectPlan }) {
  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: '29',
      description: 'Parfait pour les petites entreprises qui débutent avec l\'IA.',
      features: [
        '1 Assistant IA',
        'Jusqu\'à 50 pages indexées',
        'Capture de prospects (Leads)',
        'Support par email'
      ],
      icon: <Star className="w-6 h-6 text-indigo-400" />,
      color: 'indigo'
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '99',
      popular: true,
      description: 'Pour les PME qui veulent maximiser leur conversion.',
      features: [
        '3 Assistants IA',
        'Pages illimitées',
        'Capture de prospects enrichie (Résumé IA)',
        'Personnalisation avancée du Widget',
        'Support prioritaire 24/7'
      ],
      icon: <Zap className="w-6 h-6 text-emerald-400" />,
      color: 'emerald'
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Sur mesure',
      description: 'Pour les grands groupes ayant des besoins spécifiques.',
      features: [
        'Assistants IA illimités',
        'Intégration CRM (HubSpot, Salesforce)',
        'Modèles LLM au choix (Claude, OpenAI)',
        'SLA 99.9% & Account Manager dédié'
      ],
      icon: <Shield className="w-6 h-6 text-brand-400" />,
      color: 'brand'
    }
  ];

  return (
    <div className="py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h1 className="text-3xl font-bold text-white mb-4">Passez à la vitesse supérieure</h1>
        <p className="text-gray-400 text-lg">
          Choisissez le plan qui correspond à vos besoins et automatisez votre relation client 24/7.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {plans.map((plan) => (
          <div 
            key={plan.id}
            className={`relative glass-card rounded-3xl p-8 flex flex-col h-full border transition-all hover:-translate-y-2 ${
              plan.popular 
                ? 'border-emerald-500/50 shadow-2xl shadow-emerald-900/20' 
                : 'border-white/5 hover:border-white/20'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg">
                Le plus populaire
              </div>
            )}

            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-${plan.color}-500/10 border border-${plan.color}-500/20`}>
              {plan.icon}
            </div>

            <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
            <p className="text-sm text-gray-400 mb-6 min-h-[40px]">{plan.description}</p>
            
            <div className="mb-8">
              {plan.price === 'Sur mesure' ? (
                <span className="text-3xl font-bold text-white">Sur mesure</span>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">${plan.price}</span>
                  <span className="text-gray-400 font-medium">/mois</span>
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
              onClick={() => onSelectPlan && onSelectPlan(plan.id)}
              className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                plan.popular
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/50'
                  : 'bg-dark-800 hover:bg-dark-700 text-white border border-white/10 hover:border-white/20'
              }`}
            >
              {plan.price === 'Sur mesure' ? 'Nous contacter' : 'Choisir ce plan'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
