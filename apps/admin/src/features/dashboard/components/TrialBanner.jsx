import React from 'react';
import { Sparkles, Clock, AlertTriangle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────
// Self-serve Business trial banner.
//
// Every new self-serve workspace starts on a 14-day Business trial (migration
// 20260909030000): lead capture, booking redirection and the premium model are
// all on, so the assistant actually delivers what the landing pages promised.
// This banner is the one place the owner sees that clock — counting down while
// the trial runs, and turning into a hard "it's offline, subscribe" state the
// day it lapses (which is exactly when api/chat/index.js stops answering).
//
// Driven entirely by getTrialInfo(tenant); renders nothing when no self-serve
// trial is in play (a paid or Stripe-managed account never sees it).
// ─────────────────────────────────────────────────────────────────────────
export default function TrialBanner({ trialActive, trialExpired, trialDaysLeft, onShowPricing }) {
  if (trialExpired) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 space-y-3 animate-in fade-in">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-red-500/20 text-red-700 shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 text-xs">
            <h4 className="font-bold text-dark-900 text-sm mb-1">
              Your free trial has ended — the assistant is offline
            </h4>
            <p className="text-gray-600 leading-relaxed">
              Nothing was deleted: everything your assistant learned, and every lead it captured, is still here. Choose a plan and it comes straight back online.
            </p>
          </div>
        </div>
        <div className="flex justify-end pt-2 border-t border-red-500/20">
          <button
            type="button"
            onClick={() => onShowPricing?.()}
            className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-red-500 to-brand-600 hover:from-red-400 hover:to-brand-500 shadow-md transition-all flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> Choose a plan →
          </button>
        </div>
      </div>
    );
  }

  if (!trialActive) return null;

  const daysLabel =
    trialDaysLeft === null
      ? 'Your Business trial is running'
      : trialDaysLeft === 1
        ? '1 day left in your Business trial'
        : `${trialDaysLeft} days left in your Business trial`;

  return (
    <div className="bg-brand-500/10 border border-brand-500/30 rounded-2xl p-4 space-y-3 animate-in fade-in">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-brand-500/20 text-brand-700 shrink-0 mt-0.5">
          <Clock className="w-5 h-5" />
        </div>
        <div className="flex-1 text-xs">
          <h4 className="font-bold text-dark-900 text-sm mb-1">{daysLabel}</h4>
          <p className="text-gray-600 leading-relaxed">
            Lead capture, booking redirection and the premium model are all switched on during your trial. Subscribe before it ends to keep them — your assistant stays online without interruption.
          </p>
        </div>
      </div>
      <div className="flex justify-end pt-2 border-t border-brand-500/20">
        <button
          type="button"
          onClick={() => onShowPricing?.()}
          className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 shadow-md transition-all flex items-center justify-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" /> See plans
        </button>
      </div>
    </div>
  );
}
