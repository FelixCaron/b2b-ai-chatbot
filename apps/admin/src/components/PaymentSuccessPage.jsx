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
    color: ['#293f68', '#10b981', '#f59e0b', '#ec4899'][Math.floor(Math.random() * 4)],
  }));

  useEffect(() => {
    // Auto-redirect to dashboard after 6 seconds
    const timer = setTimeout(() => {
      onGoToDashboard?.();
    }, 6000);
    return () => clearTimeout(timer);
  }, [onGoToDashboard]);

  return (
    <div className="min-h-screen bg-surface-100 flex items-center justify-center relative overflow-hidden px-4">
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
              <CheckCircle className="w-12 h-12 text-emerald-600" />
            </div>
            {/* Orbiting stars */}
            <Star className="absolute -top-2 -right-2 w-5 h-5 text-yellow-600 animate-spin" style={{ animationDuration: '4s' }} />
            <Sparkles className="absolute -bottom-1 -left-3 w-4 h-4 text-brand-700 animate-pulse" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-3xl sm:text-4xl font-bold text-dark-900 mb-4 leading-tight">
          Welcome to the <br />
          <span className="bg-gradient-to-r from-emerald-600 to-brand-700 bg-clip-text text-transparent">
            Pro Plan! 🎉
          </span>
        </h1>

        <p className="text-gray-500 text-base mb-3 leading-relaxed">
          Your payment was processed successfully. Your subscription is now active.
        </p>

        {/* Feature highlights */}
        <div className="glass-card rounded-2xl p-6 mb-8 text-left space-y-3">
          {[
            { icon: Zap, text: 'All premium features unlocked', color: 'text-emerald-600' },
            { icon: Star, text: 'Priority customer support active', color: 'text-brand-700' },
            { icon: CheckCircle, text: 'Automatic Stripe invoicing & billing', color: 'text-brand-700' },
          ].map(({ icon: Icon, text, color }, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-gray-600">
              <Icon className={`w-4 h-4 shrink-0 ${color}`} />
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onGoToDashboard}
          className="w-full py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-lg shadow-brand-900/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
        >
          Go to My Dashboard
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-xs text-gray-600 mt-4">
          Automatic redirect in a few seconds…
        </p>
      </div>
    </div>
  );
}
