import React from 'react';
import { AlertTriangle, RefreshCw, ToggleRight, Sparkles } from 'lucide-react';

/** PARKED WEBSITE BANNER — why this widget stopped answering, and
    the two ways out. Nothing here deletes anything. */
export default function ParkedSiteBanner({
  activeSite,
  tenantPlan,
  maxSitesForPlan,
  activeSitesCount,
  isReactivating,
  onReactivate,
  onShowPricing
}) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3 animate-in fade-in">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 shrink-0 mt-0.5">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 text-xs">
          <h4 className="font-bold text-dark-900 text-sm mb-1">
            This website is parked — its assistant is not answering
          </h4>
          <p className="text-amber-800 leading-relaxed">
            Your <strong>{tenantPlan.toUpperCase()}</strong> plan covers <strong>{maxSitesForPlan} active website(s)</strong>, and you currently have <strong>{activeSitesCount}</strong> active.
          </p>
          <p className="text-gray-600 mt-1">
            Nothing was deleted: everything your assistant learned, and every lead it captured, for <strong className="text-dark-900">{activeSite.domain}</strong> is still here, exactly as you left it. Upgrade your plan and it comes straight back online.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-amber-500/20">
        <button
          type="button"
          disabled={isReactivating || activeSitesCount >= maxSitesForPlan}
          onClick={() => onReactivate(activeSite)}
          title={activeSitesCount >= maxSitesForPlan ? 'Your plan has no free slot — park another website or upgrade first' : 'Bring this website back online'}
          className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:text-dark-900 bg-white border border-dark-900/10 hover:bg-surface-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {isReactivating ? (
            <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Reactivating...</>
          ) : (
            <><ToggleRight className="w-3.5 h-3.5" /> Reactivate this website</>
          )}
        </button>

        {onShowPricing && (
          <button
            type="button"
            onClick={() => onShowPricing()}
            className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-brand-600 hover:from-amber-400 hover:to-brand-500 shadow-md transition-all flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> Upgrade Plan →
          </button>
        )}
      </div>
    </div>
  );
}
