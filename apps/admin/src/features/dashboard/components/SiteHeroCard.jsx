import React, { useEffect, useState } from 'react';
import { Globe, Eye, RefreshCw, Code, Settings2 } from 'lucide-react';

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
  onOpenSettings,
  children
}) {
  // The site's own favicon, not a generic globe — works for any domain
  // without asking anyone to upload a logo. Falls back to the globe icon
  // if the favicon 404s outright (a fallback service returning its own
  // placeholder image is indistinguishable from a real favicon, and is a
  // fine result either way).
  const [faviconFailed, setFaviconFailed] = useState(false);
  useEffect(() => { setFaviconFailed(false); }, [activeSite?.domain]);
  const faviconUrl = activeSite?.domain
    ? `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(activeSite.domain)}`
    : null;

  return (
    <div className="bg-white/90 p-6 sm:p-8 rounded-2xl border border-dark-900/5 shadow-sm space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold shadow-md overflow-hidden" style={{ backgroundColor: themeColor }}>
            {faviconUrl && !faviconFailed ? (
              <img
                src={faviconUrl}
                alt=""
                className="w-8 h-8 object-contain"
                onError={() => setFaviconFailed(true)}
              />
            ) : (
              <Globe className="w-7 h-7" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl font-bold text-dark-900 tracking-tight">{activeSite.domain}</h2>
              {isActive ? (
                <span className="bg-emerald-500/15 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Assistant Active & Ready
                </span>
              ) : (
                <span className="bg-amber-500/15 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-amber-500/20">
                  <span className="w-2 h-2 rounded-full bg-amber-500/80"></span>
                  Assistant Paused
                </span>
              )}
            </div>
            {/* The public key used to be printed here. It is an
                implementation detail an owner can neither act on nor change;
                the one place it is genuinely needed is the install snippet,
                which carries it already. */}
            <p className="text-xs text-gray-500 mt-1">
              {isActive ? 'Connected to your website' : 'Paused — your assistant is not answering visitors'}
            </p>
          </div>
        </div>

        {/* Action Buttons — stacked & grouped on mobile so nothing wraps
            raggedly or ends up too small to tap comfortably; unchanged
            single-row layout from md (≥768px) upward. */}
        <div className="flex flex-col gap-2.5 w-full md:w-auto md:flex-row md:flex-wrap md:items-center md:gap-3">
          <button
            disabled={isCrawling}
            onClick={onOpenPreview}
            className={`w-full md:w-auto text-white font-semibold px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
              isCrawling
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed border border-dark-900/10 opacity-70'
                : 'bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-600 hover:to-brand-400 shadow-brand-900/30 hover:scale-[1.02] active:scale-98'
            }`}
          >
            {isCrawling ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-brand-600" /> Reading your website...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" /> Test your assistant
              </>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2.5 md:contents">
            <button
              onClick={() => {
                if (isGuest) onRequireLogin();
                else onOpenIntegration();
              }}
              className="bg-white hover:bg-surface-200 border border-dark-900/10 text-gray-700 hover:text-dark-900 px-3 sm:px-4 py-3 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <Code className="w-4 h-4 text-brand-600 shrink-0" /> <span className="truncate">Install</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="bg-white hover:bg-surface-200 border border-dark-900/10 text-gray-600 hover:text-dark-900 px-3 sm:px-4 py-3 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-sm"
              title="Customize your assistant"
            >
              <Settings2 className="w-4 h-4 text-brand-600 shrink-0" /> Settings
            </button>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
