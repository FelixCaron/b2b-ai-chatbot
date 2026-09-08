import React from 'react';

/** Website switcher — every site the workspace has, plus the one place to
 *  add another. Always shown once there's at least one site (not just once
 *  there are several): it's the one "Add Website" affordance now that the
 *  per-site action row no longer duplicates it.
 *  Parked sites stay in the list, visibly inactive: hiding them would
 *  leave the user wondering why a widget stopped answering. */
export default function SiteTabs({
  sites,
  activeSite,
  isSiteActive,
  onSelectSite,
  onOpenAddSiteModal
}) {
  if (!sites || sites.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider shrink-0 mr-1">Websites:</span>
      {sites.map((s) => {
        const isSelected = activeSite?.id === s.id;
        const isParked = !isSiteActive(s);
        return (
          <button
            key={s.id}
            onClick={() => onSelectSite(s.id)}
            title={isParked ? 'Parked — this website\'s assistant is paused until your plan has room' : s.domain}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 border ${
              isSelected
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : isParked
                ? 'bg-surface-200 text-gray-500 border-dark-900/5 hover:border-amber-500/30 hover:text-gray-700'
                : 'bg-surface-200 text-gray-500 border-dark-900/5 hover:border-dark-900/20 hover:text-dark-900'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${
              isParked ? 'bg-amber-500/70' : isSelected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'
            }`} />
            <span className={isParked ? 'opacity-70' : ''}>{s.domain}</span>
            {isParked && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                Paused
              </span>
            )}
          </button>
        );
      })}
      <button
        onClick={onOpenAddSiteModal}
        className="text-xs text-brand-700 hover:text-brand-800 font-semibold px-2.5 py-1.5 rounded-xl border border-brand-500/20 hover:bg-brand-500/10 transition-all shrink-0"
      >
        + Add Website
      </button>
    </div>
  );
}
