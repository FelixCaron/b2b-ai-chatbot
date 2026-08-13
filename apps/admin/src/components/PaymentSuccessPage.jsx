import React, { useEffect } from 'react';
import { CheckCircle, ArrowRight, Sparkles, Zap, Star } from 'lucide-react';

/**
 * PaymentSuccessPage — shown after a successful Stripe Checkout.
 * Reads ?session_id= from the URL but the actual plan update
 * is handled by the Stripe webhook asynchronously.
 */
export default function PaymentSuccessPage({ onGoToDashboard }) {
  // Simple confetti-like floating particles effect
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2}s`,
    duration: `${2 + Math.random() * 3}s`,
    size: `${4 + Math.random() * 8}px`,
    color: ['#6366f1', '#10b981', '#f59e0b', '#ec4899'][Math.floor(Math.random() * 4)],
  }));

  useEffect(() => {
    // Auto-redirect to dashboard after 6 seconds
    const timer = setTimeout(() => {
      onGoToDashboard?.();
    }, 6000);
    return () => clearTimeout(timer);
  }, [onGoToDashboard]);

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center relative overflow-hidden px-4">
      {/* Background particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full opacity-60 animate-bounce"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}

      {/* Glow backdrop */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-96 h-96 rounded-full bg-emerald-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-lg w-full text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
        {/* Success icon */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center shadow-2xl shadow-emerald-900/50">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
            </div>
            {/* Orbiting stars */}
            <Star className="absolute -top-2 -right-2 w-5 h-5 text-yellow-400 animate-spin" style={{ animationDuration: '4s' }} />
            <Sparkles className="absolute -bottom-1 -left-3 w-4 h-4 text-brand-400 animate-pulse" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">
          Bienvenue dans la <br />
          <span className="bg-gradient-to-r from-emerald-400 to-brand-400 bg-clip-text text-transparent">
            version payante ! 🎉
          </span>
        </h1>

        <p className="text-gray-400 text-base mb-3 leading-relaxed">
          Votre paiement a été traité avec succès. Votre abonnement est maintenant actif.
        </p>

        {/* Feature highlights */}
        <div className="glass-card rounded-2xl p-6 mb-8 text-left space-y-3">
          {[
            { icon: Zap, text: 'Toutes les fonctionnalités débloquées', color: 'text-emerald-400' },
            { icon: Star, text: 'Support prioritaire activé', color: 'text-indigo-400' },
            { icon: CheckCircle, text: 'Factures envoyées automatiquement par Stripe', color: 'text-brand-400' },
          ].map(({ icon: Icon, text, color }, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-gray-300">
              <Icon className={`w-4 h-4 shrink-0 ${color}`} />
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onGoToDashboard}
          className="w-full py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-brand-600 to-indigo-500 hover:from-brand-500 hover:to-indigo-400 text-white shadow-lg shadow-brand-900/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
        >
          Accéder à mon Dashboard
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-xs text-gray-600 mt-4">
          Redirection automatique dans quelques secondes…
        </p>
      </div>
    </div>
  );
}
