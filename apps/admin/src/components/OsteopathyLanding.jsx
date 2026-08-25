import React, { useEffect, useRef, useState } from 'react';
import {
  Stethoscope,
  PhoneMissed,
  MessageCircleQuestion,
  CalendarCheck,
  Globe,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Baby,
  Activity,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────
// Niche landing page — Ostéopathes / cliniques manuelles.
// Static, zero-backend-dependency page: the "demo conversation" below is a
// scripted preview (not a live widget call) so this page ships stable and
// testable without depending on a real demo tenant existing yet. Once a
// real demo tenant is onboarded (see TODO.md), the preview can be swapped
// for a live embed pointed at its public_key.
//
// Content (pricing format, conditions treated, first-visit description) is
// grounded in how real Québec osteopathy practices present themselves
// publicly, genericized — no specific practitioner's name, photo, or
// business identity is used on this public page.
// ─────────────────────────────────────────────────────────────────────────

const DEMO_EXCHANGE = [
  {
    q: 'Est-ce que la première consultation est différente des suivantes?',
    a: "Oui — la première visite inclut une évaluation complète de votre posture, votre mobilité et votre historique de santé, en plus du traitement. Prévoyez environ 60 minutes. Aucun vêtement spécial n'est requis, une tenue confortable suffit.",
  },
  {
    q: "Traitez-vous les femmes enceintes et les bébés?",
    a: "Oui, l'ostéopathie douce est adaptée aux douleurs liées à la grossesse, au suivi post-partum ainsi qu'aux tensions chez le nourrisson. N'hésitez pas à mentionner votre situation en réservant.",
  },
  {
    q: 'Avez-vous de la disponibilité cette semaine?',
    a: "Je vérifie ça pour vous — voici le lien de réservation en ligne de la clinique, vous y verrez les créneaux disponibles en temps réel : [Réserver un rendez-vous].",
  },
];

function DemoChatPreview() {
  const [step, setStep] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    if (step >= DEMO_EXCHANGE.length * 2) return;
    const delay = step === 0 ? 600 : 1400;
    const t = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [step]);

  const bubbles = [];
  for (let i = 0; i < DEMO_EXCHANGE.length; i++) {
    if (step > i * 2) bubbles.push({ role: 'user', text: DEMO_EXCHANGE[i].q, key: `q${i}` });
    if (step > i * 2 + 1) bubbles.push({ role: 'bot', text: DEMO_EXCHANGE[i].a, key: `a${i}` });
  }

  return (
    <div
      ref={containerRef}
      className="glass-card rounded-3xl border border-white/10 p-4 sm:p-6 max-w-md mx-auto shadow-2xl"
      aria-label="Aperçu d'une conversation avec l'assistant IA (exemple)"
    >
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/10">
        <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shrink-0">
          <Stethoscope className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-tight">Assistant de votre clinique</p>
          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> En ligne
          </p>
        </div>
      </div>

      <div className="space-y-3 min-h-[220px]">
        {bubbles.map((b) => (
          <div
            key={b.key}
            className={`animate-in fade-in slide-in-from-bottom-2 duration-300 flex ${
              b.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`text-xs sm:text-[13px] leading-relaxed rounded-2xl px-3.5 py-2.5 max-w-[85%] ${
                b.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-dark-900 text-gray-200 border border-white/10 rounded-bl-sm'
              }`}
            >
              {b.text}
            </div>
          </div>
        ))}
        {step < DEMO_EXCHANGE.length * 2 && step % 2 === 1 && (
          <div className="flex justify-start">
            <div className="bg-dark-900 border border-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" />
              </span>
            </div>
          </div>
        )}
      </div>
      <p className="text-[10px] text-gray-500 mt-4 text-center">
        Exemple illustratif — trainé automatiquement sur le vrai contenu de votre site.
      </p>
    </div>
  );
}

const PAIN_POINTS = [
  {
    icon: <PhoneMissed className="w-5 h-5 text-red-400" />,
    title: 'Impossible de répondre pendant un traitement',
    text: "Vous avez les mains sur un patient — l'appel ou le message d'un nouveau client tombe, et il réserve ailleurs pendant que vous êtes occupé·e.",
  },
  {
    icon: <MessageCircleQuestion className="w-5 h-5 text-amber-400" />,
    title: 'Toujours les mêmes questions',
    text: "Est-ce couvert par les assurances? Que porter? Traitez-vous les enfants ou les femmes enceintes? Vous répondez au même message dix fois par semaine.",
  },
  {
    icon: <CalendarCheck className="w-5 h-5 text-emerald-400" />,
    title: 'Des rendez-vous perdus le soir et la fin de semaine',
    text: "La majorité des visiteurs de votre site arrivent en dehors de vos heures d'ouverture, quand personne ne peut leur répondre.",
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Collez l\'adresse de votre site',
    text: "Aucune installation technique. On lit automatiquement les pages de votre site (services, tarifs, FAQ, à propos).",
  },
  {
    n: '2',
    title: 'Votre assistant est prêt en quelques secondes',
    text: "Il répond aux questions de vos patients avec le contenu réel de votre clinique — pas des réponses génériques.",
  },
  {
    n: '3',
    title: 'Un seul lien à coller sur votre site',
    text: 'Une ligne de code, fournie automatiquement. Ajoutez votre lien de réservation existant (Calendly, Cal.com, GoRendezvous…) et l\'assistant peut y diriger vos patients directement.',
  },
];

export default function OsteopathyLanding({ onNavigate }) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Assistant IA pour ostéopathes et cliniques manuelles';
    let meta = document.querySelector('meta[name="description"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    const prevDescription = meta.getAttribute('content');
    meta.setAttribute(
      'content',
      "Un assistant IA entraîné sur le contenu réel de votre site répond aux questions de vos patients 24/7, capture leurs coordonnées et les dirige vers votre réservation en ligne. Pensé pour les ostéopathes et cliniques de thérapie manuelle."
    );
    return () => {
      document.title = prevTitle;
      if (created) {
        meta.remove();
      } else if (prevDescription !== null) {
        meta.setAttribute('content', prevDescription);
      }
    };
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Hero */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 sm:pb-20 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <Activity className="w-3.5 h-3.5" /> Pensé pour les ostéopathes & cliniques manuelles
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-white tracking-tight leading-tight mb-5">
            Un assistant qui répond à vos patients,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-indigo-500">
              même quand vous avez les mains prises
            </span>
          </h1>
          <p className="text-base sm:text-lg text-gray-400 mb-8 max-w-lg">
            Collez l'adresse de votre site : votre assistant apprend vos services, vos tarifs et votre FAQ, répond à
            vos visiteurs 24/7 et capture leurs coordonnées pendant que vous traitez vos patients.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => onNavigate?.('dashboard')}
              className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold px-6 py-3.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-brand-900/40"
            >
              Essayer avec le site de ma clinique <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate?.('pricing')}
              className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-semibold px-6 py-3.5 rounded-xl border border-white/10 transition-all"
            >
              Voir les tarifs
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-4">Essai gratuit sans carte de crédit. Prêt en moins d'une minute.</p>
        </div>

        <DemoChatPreview />
      </div>

      {/* Pain points */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-10">
          Ce que ça coûte de ne pas répondre à temps
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PAIN_POINTS.map((p) => (
            <div key={p.title} className="glass-card rounded-2xl border border-white/5 p-6">
              <div className="w-10 h-10 rounded-xl bg-dark-900 border border-white/10 flex items-center justify-center mb-4">
                {p.icon}
              </div>
              <h3 className="text-sm font-bold text-white mb-2">{p.title}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{p.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-10">Comment ça marche</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="text-center">
              <div className="w-11 h-11 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center mx-auto mb-4">
                {s.n}
              </div>
              <h3 className="text-sm font-bold text-white mb-2">{s.title}</h3>
              <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature tie-in */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <div className="glass-card rounded-3xl border border-white/10 p-8 sm:p-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <ShieldCheck className="w-6 h-6 text-brand-400 mb-3" />
            <h3 className="text-sm font-bold text-white mb-1.5">Vos données, isolées</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Le contenu de votre site et les échanges avec vos patients restent strictement séparés de tout autre
              client.
            </p>
          </div>
          <div>
            <CalendarCheck className="w-6 h-6 text-emerald-400 mb-3" />
            <h3 className="text-sm font-bold text-white mb-1.5">Réservation en un clic</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Ajoutez votre lien Calendly, Cal.com ou GoRendezvous — l'assistant y dirige directement les patients
              prêts à prendre rendez-vous.
            </p>
          </div>
          <div>
            <Baby className="w-6 h-6 text-sky-400 mb-3" />
            <h3 className="text-sm font-bold text-white mb-1.5">Bilingue, sans configuration</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Répond aussi bien en français qu'en anglais à partir du même contenu, pour les clientèles mixtes.
            </p>
          </div>
        </div>
      </div>

      {/* Closing CTA */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-20 text-center">
        <div className="p-10 bg-gradient-to-br from-brand-900/40 to-indigo-900/40 border border-brand-500/30 rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Globe className="w-28 h-28 text-brand-300" />
          </div>
          <Sparkles className="w-6 h-6 text-brand-300 mx-auto mb-4 relative z-10" />
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 relative z-10">
            Voyez ce que ça donne avec le site de votre clinique
          </h2>
          <p className="text-brand-200 text-sm mb-7 max-w-md mx-auto relative z-10">
            Aucune carte de crédit requise pour essayer. Ça prend moins d'une minute.
          </p>
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
