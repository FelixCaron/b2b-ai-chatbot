import React from 'react';
import { AlertTriangle, ShieldCheck, RefreshCw, Sparkles } from 'lucide-react';

/** 11. OVER_LIMIT_CHOOSE — MORE WEBSITES THAN THE PLAN COVERS
    Reached after a downgrade (Stripe change, past_due). The user picks
    which websites stay active; the others are parked, never deleted. */
export default function OverLimitModal({
  show,
  activeSites,
  tenantPlan,
  maxSitesForPlan,
  overLimitKeepIds,
  overLimitError,
  isParkingSites,
  onToggleKeep,
  onConfirm,
  onClose,
  onShowPricing
}) {
  if (!show || activeSites.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white p-6 sm:p-8 rounded-3xl w-full max-w-2xl border border-amber-500/30 shadow-2xl relative flex flex-col max-h-[88vh]">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 border border-amber-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-dark-900">
                Choose which website{maxSitesForPlan > 1 ? 's' : ''} stay{maxSitesForPlan > 1 ? '' : 's'} active
              </h3>
              <p className="text-xs text-gray-500">
                Your <strong>{tenantPlan.toUpperCase()}</strong> plan covers <strong>{maxSitesForPlan} active website{maxSitesForPlan > 1 ? 's' : ''}</strong>, and you have <strong>{activeSites.length}</strong>.
              </p>
            </div>
          </div>

          <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
            overLimitKeepIds.size === 0
              ? 'bg-red-500/20 text-red-700 border border-red-500/30'
              : 'bg-brand-500/20 text-brand-800 border border-brand-500/30'
          }`}>
            {overLimitKeepIds.size} / {maxSitesForPlan} selected
          </span>
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-3.5 text-xs text-emerald-800 leading-relaxed flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <span>
            The websites you do not select are <strong className="text-dark-900">parked, not deleted</strong>. Everything they learned, and every lead they captured, stays exactly where it is — they simply stop answering visitors. Upgrade your plan and they come back online exactly as they were.
          </span>
        </div>

        {overLimitError && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs font-medium text-red-700 text-left flex items-start gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{overLimitError}</span>
          </div>
        )}

        {/* Scrollable Website Checklist */}
        <div className="flex-1 overflow-y-auto min-h-0 my-3 divide-y divide-dark-900/5 rounded-xl border border-dark-900/5 bg-white">
          {activeSites.map((s) => {
            const isChecked = overLimitKeepIds.has(s.id);
            const isFull = !isChecked && overLimitKeepIds.size >= maxSitesForPlan;
            return (
              <div
                key={s.id}
                onClick={() => onToggleKeep(s.id)}
                title={isFull ? 'Unselect another website first' : ''}
                className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                  isFull ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-dark-900/[0.03]'
                } ${isChecked ? 'bg-brand-500/5' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-brand-600 bg-white border-gray-300 focus:ring-0 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-dark-900 truncate">{s.domain}</div>
                    <div className="text-[11px] text-gray-500 truncate">{isChecked ? 'Stays online' : 'Parked'}</div>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  isChecked
                    ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                }`}>
                  {isChecked ? 'Stays active' : 'Will be parked'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-dark-900/5">
          {onShowPricing ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onShowPricing();
              }}
              className="w-full sm:w-auto text-xs text-amber-700 hover:text-amber-800 font-semibold flex items-center gap-1.5 px-3 py-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Upgrade instead and keep all {activeSites.length} online →
            </button>
          ) : <span />}

          <button
            type="button"
            disabled={isParkingSites || overLimitKeepIds.size === 0 || overLimitKeepIds.size > maxSitesForPlan}
            onClick={onConfirm}
            className="w-full sm:w-auto bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isParkingSites ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...</>
            ) : (
              <>Keep selected active & park {Math.max(activeSites.length - overLimitKeepIds.size, 0)} →</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
