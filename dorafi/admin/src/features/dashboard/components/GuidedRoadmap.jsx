import React from 'react';
import { Check, ArrowUpRight, Code, Power } from 'lucide-react';
import { useT } from '../../../i18n/LanguageContext';

/** Quick 3-Step Guided Roadmap */
export default function GuidedRoadmap({
  loadedPagesCount,
  isCrawling,
  isGuest,
  onRequireLogin,
  onOpenPreview,
  onOpenIntegration,
  onActivate,
  // Step 3 is whatever is actually left to do, and it has to be the same
  // answer the hero card's primary button gives — two panels on one screen
  // telling an owner two different "next steps" is worse than either.
  isPlanActive = true,
  isInstalled = false
}) {
  const { t } = useT();
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
              <>{t('Website content ready')} <Check className="w-3.5 h-3.5 text-emerald-600" /></>
            ) : isCrawling ? (
              t('Reading your website')
            ) : (
              t('No content yet')
            )}
          </div>
          <div className="text-[11px] text-gray-500">
            {hasContent
              ? (loadedPagesCount === 1
                  ? t('{n} page available to your assistant', { n: loadedPagesCount })
                  : t('{n} pages available to your assistant', { n: loadedPagesCount }))
              : isCrawling
              ? t("We're preparing your content")
              : t('Nothing is available to your assistant yet')}
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
            {t('Test your assistant')} <ArrowUpRight className="w-3.5 h-3.5 text-brand-600" />
          </div>
          <div className="text-[11px] text-gray-500">{t('Ask it questions before your visitors do')}</div>
        </div>
      </div>

      {/* Step 3 — the same next step the hero card's primary button offers:
          add it to the website, then switch it on, then it's done. */}
      <div
        onClick={() => {
          if (isGuest) onRequireLogin();
          else if (!isInstalled) onOpenIntegration();
          else if (!isPlanActive) onActivate?.();
          else onOpenIntegration();
        }}
        className="bg-surface-100 hover:bg-surface-200 p-4 rounded-xl border border-dark-900/5 flex items-center gap-3.5 cursor-pointer group transition-all"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border font-bold text-xs group-hover:scale-105 transition-transform ${
          isInstalled && isPlanActive
            ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
            : 'bg-brand-500/10 text-brand-700 border-brand-500/20'
        }`}>
          {isInstalled && isPlanActive ? <Check className="w-3.5 h-3.5" /> : '3'}
        </div>
        <div className="flex-1">
          <div className="text-xs font-bold text-dark-900 flex items-center gap-1.5 group-hover:text-brand-700">
            {!isInstalled ? (
              <>{t('Add it to your website')} <Code className="w-3.5 h-3.5 text-brand-600" /></>
            ) : !isPlanActive ? (
              <>{t('Activate it on your website')} <Power className="w-3.5 h-3.5 text-amber-600" /></>
            ) : (
              <>{t('Live on your website')} <Check className="w-3.5 h-3.5 text-emerald-600" /></>
            )}
          </div>
          <div className="text-[11px] text-gray-500">
            {!isInstalled
              ? t("One line to paste — we'll show you exactly where")
              : !isPlanActive
              ? t("It's on your website, but still invisible until you activate it")
              : t('Your visitors can talk to it right now')}
          </div>
        </div>
      </div>
    </div>
  );
}
