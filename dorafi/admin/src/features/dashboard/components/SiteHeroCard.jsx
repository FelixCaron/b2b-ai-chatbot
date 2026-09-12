import React, { useEffect, useState } from 'react';
import { Globe, Eye, RefreshCw, Code, Settings2, Power } from 'lucide-react';
import { useT } from '../../../i18n/LanguageContext';

/** The active website's identity card and its action row. The parked banner
 *  and the guided roadmap are rendered as children, inside the same card. */
export default function SiteHeroCard({
  activeSite,
  themeColor,
  isActive,
  isCrawling,
  isGuest,
  onRequireLogin,
  onOpenPreview,
  onOpenIntegration,
  // Whether the assistant is allowed to appear on the website at all — the
  // product's one paywall (see plan-limits.js's isAssistantActive, which is
  // the same predicate the widget itself is served under). Installed code on
  // an inactive workspace renders nothing, so the card has to say so rather
  // than let an owner believe a pasted snippet is enough.
  isPlanActive = true,
  // Whether the snippet has ever loaded from this domain, and whether it was
  // seen in the last few minutes. Read once in the Dashboard and handed to
  // both this card and the guided roadmap, so the two can't offer the owner
  // two different "next steps" at the same time.
  isInstalled = false,
  isLive = false,
  onActivate,
  onOpenSettings,
  // Live narration of the crawl. It used to exist only inside the completion
  // modal — which appears when the work is already over — so the minutes an
  // owner actually spends waiting were a spinner and the word "Learning...".
  crawlProgress = 0,
  crawlProgressMsg = '',
  children
}) {
  const { t } = useT();
  // Whether the widget has actually loaded on the live site recently — only
  // worth checking once the assistant is built and not mid-crawl.

  // Exactly one primary action, and it is whatever this owner's assistant is
  // actually waiting on. The order is the order the funnel runs in: get the
  // code onto the website, turn it on, then use it. A second gradient button
  // next to the first is how a call-to-action stops being one.
  const primaryAction = isCrawling
    ? 'learning'
    : !isActive
    ? 'test'
    : !isInstalled
    ? 'install'
    : !isPlanActive
    ? 'activate'
    : 'test';
  // The site's own favicon, not a generic globe — works for any domain
  // without asking anyone to upload a logo. Tried in order of how likely
  // each is to actually be right:
  //   1. favicon_url — parsed straight out of the site's own HTML at
  //      add-site time (api/chat/theme.js), the same source of truth a
  //      browser tab uses. Most accurate when present.
  //   2. The domain's own conventional /favicon.ico path.
  //   3. A third-party favicon lookup service — a last resort: it has been
  //      seen returning a generic/wrong icon instead of the site's actual
  //      one, which is exactly why (1) exists.
  // Falls through to the next candidate on a load error, and to the plain
  // globe icon once every candidate has failed.
  const faviconCandidates = activeSite?.domain
    ? [
        activeSite.favicon_url || null,
        `https://${activeSite.domain}/favicon.ico`,
        `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(activeSite.domain)}`
      ].filter(Boolean)
    : [];
  const [faviconIndex, setFaviconIndex] = useState(0);
  useEffect(() => { setFaviconIndex(0); }, [activeSite?.id, activeSite?.favicon_url]);
  const faviconUrl = faviconCandidates[faviconIndex] || null;

  return (
    <div className="bg-white/90 p-6 sm:p-8 rounded-2xl border border-dark-900/5 shadow-sm space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold shadow-md overflow-hidden" style={{ backgroundColor: themeColor }}>
            {faviconUrl ? (
              <img
                key={faviconUrl}
                src={faviconUrl}
                alt=""
                className="w-8 h-8 object-contain"
                onError={() => setFaviconIndex((i) => i + 1)}
              />
            ) : (
              <Globe className="w-7 h-7" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl font-bold text-dark-900 tracking-tight">{activeSite.domain}</h2>
              {isCrawling ? (
                <span className="bg-brand-500/15 text-brand-700 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-brand-500/20">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {t('Learning...')}
                </span>
              ) : !isActive ? (
                <span className="bg-amber-500/15 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-amber-500/20">
                  <span className="w-2 h-2 rounded-full bg-amber-500/80"></span>
                  {t('Assistant Paused')}
                </span>
              ) : !isPlanActive ? (
                <span className="bg-amber-500/15 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-amber-500/20">
                  <span className="w-2 h-2 rounded-full bg-amber-500/80"></span>
                  {t('Not active on your website')}
                </span>
              ) : isLive ? (
                <span className="bg-emerald-500/15 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  {t('Live on your website')}
                </span>
              ) : isInstalled ? (
                <span className="bg-emerald-500/10 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500/70"></span>
                  {t('Installed on your website')}
                </span>
              ) : (
                <span className="bg-gray-500/10 text-gray-600 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-gray-500/20">
                  <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                  {t('Not installed yet')}
                </span>
              )}
            </div>
            {/* The public key used to be printed here. It is an
                implementation detail an owner can neither act on nor change;
                the one place it is genuinely needed is the install snippet,
                which carries it already. */}
            <p className="text-xs text-gray-500 mt-1">
              {isCrawling
                ? t('Reading your website and learning what your business does...')
                : !isActive
                ? t('Paused — your assistant is not answering visitors')
                : !isPlanActive
                ? t('Your assistant does not appear on your website yet — activate it to put it in front of visitors')
                : isLive
                ? t('Installed and answering visitors on your website')
                : isInstalled
                ? t('Installed on your website and ready for your next visitor')
                : t('Built and ready — add it to your website to put it in front of visitors')}
            </p>
          </div>
        </div>

        {/* Action Buttons — stacked & grouped on mobile so nothing wraps
            raggedly or ends up too small to tap comfortably; unchanged
            single-row layout from md (≥768px) upward.

            The primary slot changes with the state of the assistant, and the
            actions that aren't primary drop to the quiet row below it. The
            Install button in particular does not exist once the widget has
            been seen loading on the site: an owner who has already pasted the
            snippet has no use for a button telling them to paste it, and the
            code stays reachable from Settings for the rare day they need it
            again. */}
        <div className="flex flex-col gap-2.5 w-full md:w-auto md:flex-row md:flex-wrap md:items-center md:gap-3">
          {primaryAction === 'learning' && (
            <button
              disabled
              className="w-full md:w-auto font-semibold px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg bg-gray-300 text-gray-500 cursor-not-allowed border border-dark-900/10 opacity-70"
            >
              <RefreshCw className="w-4 h-4 animate-spin text-brand-600" /> {t('Learning your website...')}
            </button>
          )}

          {primaryAction === 'install' && (
            <button
              type="button"
              onClick={() => {
                if (isGuest) onRequireLogin();
                else onOpenIntegration();
              }}
              className="w-full md:w-auto bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-600 hover:to-brand-400 text-white font-semibold px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-brand-900/30 transition-all hover:scale-[1.02] active:scale-98"
            >
              <Code className="w-4 h-4" /> {t('Add it to my website')}
            </button>
          )}

          {primaryAction === 'activate' && (
            <button
              type="button"
              onClick={() => {
                if (isGuest) onRequireLogin();
                else onActivate?.();
              }}
              className="w-full md:w-auto bg-gradient-to-r from-amber-500 to-brand-600 hover:from-amber-400 hover:to-brand-500 text-white font-semibold px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-brand-900/20 transition-all hover:scale-[1.02] active:scale-98"
            >
              <Power className="w-4 h-4" /> {t('Activate on my website')}
            </button>
          )}

          {primaryAction === 'test' && (
            <button
              onClick={onOpenPreview}
              className="w-full md:w-auto bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-600 hover:to-brand-400 text-white font-semibold px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-brand-900/30 transition-all hover:scale-[1.02] active:scale-98"
            >
              <Eye className="w-4 h-4" /> {t('Test your assistant')}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2.5 md:contents">
            {primaryAction !== 'test' && primaryAction !== 'learning' && (
              <button
                type="button"
                onClick={onOpenPreview}
                className="bg-white hover:bg-surface-200 border border-dark-900/10 text-gray-700 hover:text-dark-900 px-3 sm:px-4 py-3 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <Eye className="w-4 h-4 text-brand-600 shrink-0" /> <span className="truncate">{t('Test')}</span>
              </button>
            )}

            {/* Not installed yet AND not activated: installing is the primary
                action above, so activating waits here rather than competing
                with it. */}
            {primaryAction === 'install' && !isPlanActive && (
              <button
                type="button"
                onClick={() => {
                  if (isGuest) onRequireLogin();
                  else onActivate?.();
                }}
                className="bg-white hover:bg-surface-200 border border-amber-500/40 text-amber-700 hover:text-amber-800 px-3 sm:px-4 py-3 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <Power className="w-4 h-4 shrink-0" /> <span className="truncate">{t('Activate')}</span>
              </button>
            )}

            {/* Still building: the code is no use yet, but an owner who wants
                to look at it (or paste it in advance) can. */}
            {primaryAction === 'learning' && (
              <button
                type="button"
                onClick={() => {
                  if (isGuest) onRequireLogin();
                  else onOpenIntegration();
                }}
                className="bg-white hover:bg-surface-200 border border-dark-900/10 text-gray-700 hover:text-dark-900 px-3 sm:px-4 py-3 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <Code className="w-4 h-4 text-brand-600 shrink-0" /> <span className="truncate">{t('Install')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenSettings}
              className="bg-white hover:bg-surface-200 border border-dark-900/10 text-gray-600 hover:text-dark-900 px-3 sm:px-4 py-3 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-sm"
              title={t('Customize your assistant')}
            >
              <Settings2 className="w-4 h-4 text-brand-600 shrink-0" /> {t('Settings')}
            </button>
          </div>
        </div>
      </div>

      {/* What is happening right now, while it happens. Only during the
          crawl: the rest of the time there is nothing to narrate, and a
          progress bar sitting at 100% forever is just furniture. */}
      {isCrawling && (
        <div className="mt-6 pt-5 border-t border-dark-900/5">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold mb-2">
            <span className="text-gray-600 flex items-center gap-2 min-w-0">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-600 shrink-0" />
              <span className="truncate">{crawlProgressMsg || t('Reading your website...')}</span>
            </span>
            <span className="text-brand-700 font-mono shrink-0">{Math.round(crawlProgress)}%</span>
          </div>
          <div className="w-full h-2.5 bg-surface-200 rounded-full overflow-hidden border border-dark-900/10 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-brand-600 via-brand-400 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(2, Math.min(100, crawlProgress))}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            {t('Everything it reads is something your assistant will be able to answer. You can keep using the dashboard while it works.')}
          </p>
        </div>
      )}

      {children}
    </div>
  );
}
