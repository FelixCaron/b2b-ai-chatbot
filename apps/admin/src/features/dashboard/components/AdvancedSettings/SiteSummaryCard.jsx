import React from 'react';
import { FileText, RefreshCw, Check, Edit3, Save } from 'lucide-react';

/** 2. Website Summary Card */
export default function SiteSummaryCard({
  siteSummary,
  setSiteSummary,
  isLoadingSummary,
  isRegeneratingSummary,
  isSavingSummary,
  summarySuccessMsg,
  showSummaryEditor,
  setShowSummaryEditor,
  onRegenerate,
  onSave
}) {
  return (
    <div className="bg-surface-100 p-5 sm:p-6 rounded-xl border border-dark-900/5 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h4 className="text-sm font-bold text-dark-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" /> What your assistant knows about you
            </h4>
            {(isLoadingSummary || isRegeneratingSummary) ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-700 border border-amber-500/20 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-amber-600" /> Generating Summary...
              </span>
            ) : siteSummary ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                <Check className="w-3 h-3" /> Summary Ready
              </span>
            ) : null}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Your assistant leans on this whenever a visitor asks something general that isn't answered by any single page.
          </p>
        </div>

        <button
          onClick={() => setShowSummaryEditor(!showSummaryEditor)}
          className="text-xs font-semibold text-brand-700 bg-brand-500/10 px-3.5 py-1.5 rounded-lg border border-brand-500/20 hover:bg-brand-500/20 transition-all flex items-center gap-1.5"
        >
          <Edit3 className="w-3.5 h-3.5" />
          {showSummaryEditor ? 'Collapse' : 'View / Edit Summary'}
        </button>
      </div>

      {summarySuccessMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-medium text-emerald-700 flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 shrink-0" />
          <span>{summarySuccessMsg}</span>
        </div>
      )}

      {showSummaryEditor && (
        <div className="pt-3 border-t border-dark-900/5 space-y-4">
          <textarea
            rows={5}
            disabled={isLoadingSummary || isRegeneratingSummary}
            value={
              (isLoadingSummary || isRegeneratingSummary)
                ? "Working out what your business does... this takes a few moments."
                : siteSummary
            }
            onChange={(e) => setSiteSummary(e.target.value)}
            placeholder="Write a short overview of the business, or click &quot;Regenerate with AI&quot; to have it written for you..."
            style={{ backgroundColor: '#090d16', color: '#f3f4f6' }}
            className="w-full bg-dark-950 border border-white/10 text-gray-100 placeholder-gray-500 rounded-xl p-4 text-xs leading-relaxed outline-none focus:border-brand-500 transition-colors font-mono shadow-inner"
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              disabled={isLoadingSummary || isRegeneratingSummary}
              onClick={onRegenerate}
              className="w-full sm:w-auto bg-white hover:bg-surface-200 border border-dark-900/10 text-gray-600 hover:text-dark-900 px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-brand-600 ${(isLoadingSummary || isRegeneratingSummary) ? 'animate-spin' : ''}`} />
              Regenerate with AI
            </button>

            <button
              disabled={isLoadingSummary || isRegeneratingSummary || isSavingSummary || !siteSummary.trim()}
              onClick={onSave}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
            >
              {isSavingSummary ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Summary
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
