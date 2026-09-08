import React from 'react';
import { Check, ArrowUpRight, Code } from 'lucide-react';

/** Quick 3-Step Guided Roadmap */
export default function GuidedRoadmap({
  loadedPagesCount,
  isCrawling,
  isGuest,
  onRequireLogin,
  onOpenPreview,
  onOpenIntegration
}) {
  // The step-1 card used to render `loadedPagesCount || 1`, so a site with
  // nothing indexed still claimed "1 page indexed in memory" under a green
  // checkmark. Zero pages is a real state (crawl still running, or every page
  // failed) and the card has to be able to say so.
  const hasContent = loadedPagesCount > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-dark-900/5">
      <div className="bg-surface-100 p-4 rounded-xl border border-dark-900/5 flex items-center gap-3.5">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-500/20 font-bold text-xs">
          1
        </div>
        <div>
          <div className="text-xs font-bold text-dark-900 flex items-center gap-1.5">
            {hasContent ? (
              <>Website content ready <Check className="w-3.5 h-3.5 text-emerald-600" /></>
            ) : isCrawling ? (
              'Reading your website'
            ) : (
              'No content yet'
            )}
          </div>
          <div className="text-[11px] text-gray-500">
            {hasContent
              ? `${loadedPagesCount} ${loadedPagesCount === 1 ? 'page' : 'pages'} available to your assistant`
              : isCrawling
              ? "We're preparing your content"
              : 'Nothing is available to your assistant yet'}
          </div>
        </div>
      </div>

      <div
        onClick={() => !isCrawling && onOpenPreview()}
        className="bg-surface-100 hover:bg-surface-200 p-4 rounded-xl border border-dark-900/5 flex items-center gap-3.5 cursor-pointer group transition-all"
      >
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-700 flex items-center justify-center shrink-0 border border-brand-500/20 font-bold text-xs group-hover:scale-105 transition-transform">
          2
        </div>
        <div className="flex-1">
          <div className="text-xs font-bold text-dark-900 flex items-center gap-1.5 group-hover:text-brand-700">
            Test your assistant <ArrowUpRight className="w-3.5 h-3.5 text-brand-600" />
          </div>
          <div className="text-[11px] text-gray-500">Ask it questions before your visitors do</div>
        </div>
      </div>

      <div
        onClick={() => {
          if (isGuest) onRequireLogin();
          else onOpenIntegration();
        }}
        className="bg-surface-100 hover:bg-surface-200 p-4 rounded-xl border border-dark-900/5 flex items-center gap-3.5 cursor-pointer group transition-all"
      >
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-700 flex items-center justify-center shrink-0 border border-brand-500/20 font-bold text-xs group-hover:scale-105 transition-transform">
          3
        </div>
        <div className="flex-1">
          <div className="text-xs font-bold text-dark-900 flex items-center gap-1.5 group-hover:text-brand-700">
            Install on your website <Code className="w-3.5 h-3.5 text-brand-600" />
          </div>
          <div className="text-[11px] text-gray-500">One line to paste, and you're live</div>
        </div>
      </div>
    </div>
  );
}
