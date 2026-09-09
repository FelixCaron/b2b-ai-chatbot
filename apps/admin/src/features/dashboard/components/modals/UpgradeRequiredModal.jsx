import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { getNextPlanUpgrade, getPlanDisplayName } from '../../lib/plan-limits';

/** 10. PLAN LIMIT REACHED — UPGRADE FIRST MODAL
    Adding a website at the limit is not an error the user made, it is a
    plan decision: upgrading is the lead action, everything else is a way
    out of the dialog. */
export default function UpgradeRequiredModal({
  show,
  tenantPlan,
  maxSitesForPlan,
  sitesCount,
  upgradeRequiredDomain,
  activeSiteDomain,
  onShowPricing,
  onDeleteInstead,
  onClose
}) {
  if (!show) return null;

  const nextPlan = getNextPlanUpgrade(tenantPlan);

  return (
    <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white p-8 rounded-3xl w-full max-w-md border border-brand-500/30 shadow-2xl relative text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-dark-900 p-2 rounded-lg hover:bg-dark-900/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-brand-500/10 text-brand-700 border border-brand-500/20 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7" />
        </div>

        <h3 className="text-xl font-bold text-dark-900 mb-2">
          Add {upgradeRequiredDomain || 'another website'} with an upgrade
        </h3>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Your <strong className="text-dark-900">{getPlanDisplayName(tenantPlan)}</strong> plan covers <strong className="text-dark-900">{maxSitesForPlan} website{maxSitesForPlan > 1 ? 's' : ''}</strong>, and your workspace already has {sitesCount}.
          {nextPlan
            ? <> Upgrading to <strong className="text-dark-900">{nextPlan.name}</strong> raises that to <strong className="text-dark-900">{nextPlan.sites} websites</strong> — your current assistants keep running exactly as they are.</>
            : <> That is our largest plan; get in touch and we will work out what you need.</>}
        </p>

        <div className="flex flex-col gap-3">
          {onShowPricing && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onShowPricing();
              }}
              className="w-full bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-600 hover:to-brand-400 text-white font-bold px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-900/30 hover:scale-[1.02] active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              {nextPlan ? `Upgrade to ${nextPlan.name}` : 'See plans'} →
            </button>
          )}

          {/* Secondary, deliberately quiet: deleting a website to make
              room is destructive and permanent, unlike upgrading. */}
          <button
            type="button"
            onClick={onDeleteInstead}
            className="w-full px-5 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-dark-900 transition-colors"
          >
            Or delete {activeSiteDomain || 'an existing website'} to free a slot
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full px-5 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
