import React from 'react';
import { Settings2, ChevronUp, ChevronDown } from 'lucide-react';
import FeatureToggles from './FeatureToggles';
import SiteSummaryCard from './SiteSummaryCard';
import KnowledgeBasePanel from './KnowledgeBasePanel';
import DangerZone from './DangerZone';

/** Collapsible Section for Non-Essential / Advanced Settings */
export default function AdvancedSettingsPanel({
  showAdvancedSettings,
  onToggle,
  activeSite,
  selectedTenant,
  themeColor,
  onUpdateSiteSettings,
  siteSummary,
  setSiteSummary,
  isLoadingSummary,
  isRegeneratingSummary,
  isSavingSummary,
  summarySuccessMsg,
  showSummaryEditor,
  setShowSummaryEditor,
  onRegenerateSummary,
  onSaveSummary,
  discoveredPages,
  selectedUrls,
  searchQuery,
  setSearchQuery,
  onTogglePageActivation,
  onAddManualPage,
  onEditPage,
  onRequestDeleteSite
}) {
  return (
    <div id="advanced-settings-section" className="bg-white/70 rounded-2xl border border-dark-900/5 overflow-hidden transition-all scroll-mt-20">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
        className="w-full p-5 sm:p-6 flex items-center justify-between text-left hover:bg-dark-900/[0.02] transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-200 border border-dark-900/10 flex items-center justify-center text-brand-700">
            <Settings2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-dark-900 flex items-center gap-2">
              Customize your assistant
            </h3>
            <p className="text-xs text-gray-500">How it speaks, how it looks, what it collects, and which pages it answers from.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-brand-700 bg-brand-500/10 px-3.5 py-1.5 rounded-lg border border-brand-500/20">
          {showAdvancedSettings ? (
            <>Hide Settings <ChevronUp className="w-4 h-4" /></>
          ) : (
            <>Show Settings <ChevronDown className="w-4 h-4" /></>
          )}
        </div>
      </button>

      {showAdvancedSettings && (
        <div className="p-6 pt-2 border-t border-dark-900/5 space-y-6 animate-in fade-in duration-300">
          <FeatureToggles
            activeSite={activeSite}
            selectedTenant={selectedTenant}
            themeColor={themeColor}
            onUpdateSiteSettings={onUpdateSiteSettings}
          />

          <SiteSummaryCard
            siteSummary={siteSummary}
            setSiteSummary={setSiteSummary}
            isLoadingSummary={isLoadingSummary}
            isRegeneratingSummary={isRegeneratingSummary}
            isSavingSummary={isSavingSummary}
            summarySuccessMsg={summarySuccessMsg}
            showSummaryEditor={showSummaryEditor}
            setShowSummaryEditor={setShowSummaryEditor}
            onRegenerate={onRegenerateSummary}
            onSave={onSaveSummary}
          />

          <KnowledgeBasePanel
            activeSite={activeSite}
            discoveredPages={discoveredPages}
            selectedUrls={selectedUrls}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onTogglePageActivation={onTogglePageActivation}
            onAddManualPage={onAddManualPage}
            onEditPage={onEditPage}
          />

          <DangerZone
            activeSite={activeSite}
            onRequestDelete={onRequestDeleteSite}
          />
        </div>
      )}
    </div>
  );
}
