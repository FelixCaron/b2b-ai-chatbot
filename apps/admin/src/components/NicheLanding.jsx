import React, { useEffect, useRef, useState } from 'react';
import { Globe, ArrowRight, Sparkles } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────
// One landing page, any segment.
//
// Every /solutions/<slug> page renders through here; what differs between
// them is content, and content lives in content/niches.js. Adding a segment
// is adding an object there — not another copy of this file.
//
// Static and zero-backend-dependency by design: the demo conversation is
// scripted rather than a live widget call, so these pages load (and are
// testable) without a demo tenant existing.
// ─────────────────────────────────────────────────────────────────────────

/** Replays the niche's scripted exchange, one bubble at a time. */
function DemoChatPreview({ demo }) {
  const [step, setStep] = useState(0);
  const containerRef = useRef(null);
  const exchange = demo.exchange;

  // Restart the script when the visitor moves between niche pages.
  useEffect(() => { setStep(0); }, [demo]);

  useEffect(() => {
    if (step >= exchange.length * 2) return;
    const delay = step === 0 ? 600 : 1400;
    const t = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [step, exchange.length]);

  const bubbles = [];
  for (let i = 0; i < exchange.length; i++) {
    if (step > i * 2) bubbles.push({ role: 'user', text: exchange[i].q, key: `q${i}` });
    if (step > i * 2 + 1) bubbles.push({ role: 'bot', text: exchange[i].a, key: `a${i}` });
  }

  return (
    <div className="glass-card rounded-3xl border border-dark-900/10 p-5 sm:p-6 shadow-xl">
      <div className="flex items-center gap-3 pb-4 border-b border-dark-900/5">
        <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-dark-900 leading-tight">{demo.assistantLabel}</p>
          <p className="text-[11px] text-emerald-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> En ligne
          </p>
        </div>
      </div>

      <div ref={containerRef} className="pt-4 space-y-3 min-h-[19rem]">
        {bubbles.map((b) => (
          <div key={b.key} className={`flex ${b.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                b.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-surface-200 text-dark-900 border border-dark-900/5 rounded-bl-sm'
              }`}
            >
              {b.text}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-gray-500 mt-4 text-center">
        Exemple illustratif — entraîné automatiquement sur le vrai contenu de votre site.
      </p>
    </div>
  );
}

export default function NicheLanding({ niche, onNavigate, showSignIn = false, onSignIn }) {
  const { seoTitle, seoDescription } = niche;

  useEffect(() => {
    const prevTitle = document.title;
    document.title = seoTitle;
    let meta = document.querySelector('meta[name="description"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    const prevDescription = meta.getAttribute('content');
    meta.setAttribute('content', seoDescription);

    // Unlisted, not secret. The title and description above still matter —
    // they are what a prospect sees when the link is pasted into an email or
    // a message — but the page is reachable by link only, so it should not
    // turn up in search results for every other customer.
    const robots = document.createElement('meta');
    robots.setAttribute('name', 'robots');
    robots.setAttribute('content', 'noindex, nofollow');
    document.head.appendChild(robots);

    return () => {
      document.title = prevTitle;
      robots.remove();
      if (created) {
        meta.remove();
      } else if (prevDescription !== null) {
        meta.setAttribute('content', prevDescription);
      }
    };
  }, [seoTitle, seoDescription]);

  const BadgeIcon = niche.badge.icon;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* The app-shell header is deliberately hidden on this page (see
          components/layout/Header.jsx) — it's a landing page, not the app.
          But that left a visitor who already has an account with no way
          back into it short of guessing a URL. One link, not a header. */}
      {showSignIn && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 flex justify-end">
          <button
            type="button"
            onClick={onSignIn}
            className="text-xs font-semibold text-gray-500 hover:text-dark-900 transition-colors"
          >
            Already have an account? Sign in
          </button>
        </div>
      )}

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 sm:pb-20 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 text-brand-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <BadgeIcon className="w-3.5 h-3.5" /> {niche.badge.text}
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-dark-900 tracking-tight leading-tight mb-5">
            {niche.hero.titleLead}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-700 to-brand-500">
              {niche.hero.titleAccent}
            </span>
          </h1>
          <p className="text-base sm:text-lg text-gray-500 mb-8 max-w-lg">{niche.hero.subtitle}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => onNavigate?.('dashboard')}
              className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold px-6 py-3.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-brand-900/40"
            >
              {niche.hero.primaryCta} <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate?.('pricing')}
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-surface-200 text-dark-900 font-semibold px-6 py-3.5 rounded-xl border border-dark-900/10 transition-all"
            >
              Voir les tarifs
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-4">{niche.hero.reassurance}</p>
        </div>

        <DemoChatPreview demo={niche.demo} />
      </div>

      {/* Pain points */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <h2 className="text-xl sm:text-2xl font-bold text-dark-900 text-center mb-10">{niche.painPointsTitle}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {niche.painPoints.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="glass-card rounded-2xl border border-dark-900/5 p-6">
                <div className="w-10 h-10 rounded-xl bg-surface-200 border border-dark-900/10 flex items-center justify-center mb-4">
                  <Icon className={`w-5 h-5 ${p.iconClass}`} />
                </div>
                <h3 className="text-sm font-bold text-dark-900 mb-2">{p.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{p.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <h2 className="text-xl sm:text-2xl font-bold text-dark-900 text-center mb-10">Comment ça marche</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {niche.steps.map((s, i) => (
            <div key={s.title} className="text-center">
              <div className="w-11 h-11 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center mx-auto mb-4">
                {i + 1}
              </div>
              <h3 className="text-sm font-bold text-dark-900 mb-2">{s.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed max-w-xs mx-auto">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature tie-in */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <div className="glass-card rounded-3xl border border-dark-900/10 p-8 sm:p-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          {niche.trust.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.title}>
                <Icon className={`w-6 h-6 mb-3 ${t.iconClass}`} />
                <h3 className="text-sm font-bold text-dark-900 mb-1.5">{t.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{t.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Closing CTA */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-20 text-center">
        <div className="p-10 bg-gradient-to-br from-brand-800 to-brand-600 border border-brand-500/30 rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Globe className="w-28 h-28 text-brand-300" />
          </div>
          <Sparkles className="w-6 h-6 text-brand-300 mx-auto mb-4 relative z-10" />
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 relative z-10">{niche.closing.title}</h2>
          <p className="text-brand-200 text-sm mb-7 max-w-md mx-auto relative z-10">{niche.closing.text}</p>
          <button
            onClick={() => onNavigate?.('dashboard')}
            className="inline-flex items-center gap-2 bg-white text-brand-900 hover:bg-gray-100 px-7 py-3.5 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg relative z-10"
          >
            Essayer gratuitement <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
