import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Search, Sparkles } from 'lucide-react';
import { MAX_DISCOVERABLE_PAGES } from '@b2b-ai-chatbot/contracts';
import { getMaxPagesForPlan } from '../../lib/plan-limits';
import { GENERAL_EMAIL } from '../../../../components/LegalPages';

// Every row is rendered at exactly this height (see the `style={{ height }}`
// on each row below) so the windowing math here can be arithmetic instead of
// measurement. Matches the natural height of the p-3 row + its two truncated
// text lines.
const ROW_HEIGHT = 58;
// Extra rows rendered above/below the visible band so a fast scroll or a
// keyboard PageDown doesn't show a blank flash before the next paint fills in.
const OVERSCAN = 10;

/**
 * A large site can discover tens of thousands of pages (see MAX_DISCOVERABLE_PAGES
 * in @b2b-ai-chatbot/contracts) — mapping that array straight into DOM nodes,
 * as this list used to, put one row element per page in the tab's DOM at
 * once and froze or crashed the browser before a customer could even make a
 * selection. Windowing keeps the DOM bounded to what's actually on screen
 * regardless of how many pages were discovered: `selectedUrls` and
 * `pendingCrawlPages` still hold every page, only what gets rendered is
 * limited.
 */
function VirtualizedPageList({ pages, selectedUrls, onTogglePage }) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The filtered list can shrink between renders (a search narrows it) while
  // scrollTop is still whatever it was on the longer list — clamp so the
  // window never starts past the end of what's actually there.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxScrollTop = Math.max(0, pages.length * ROW_HEIGHT - viewportHeight);
    if (el.scrollTop > maxScrollTop) {
      el.scrollTop = 0;
      setScrollTop(0);
    }
  }, [pages, viewportHeight]);

  const total = pages.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(total, startIndex + visibleRowCount);
  const visiblePages = pages.slice(startIndex, endIndex);

  const topSpacerHeight = startIndex * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (total - endIndex) * ROW_HEIGHT);

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="flex-1 overflow-y-auto min-h-0 my-3 rounded-xl border border-dark-900/5 bg-white"
    >
      {total === 0 ? (
        <div className="p-6 text-center text-xs text-gray-500">No pages match your search.</div>
      ) : (
        <>
          <div style={{ height: topSpacerHeight }} />
          <div className="divide-y divide-dark-900/5">
            {visiblePages.map((page) => {
              const isChecked = selectedUrls.has(page.url);
              return (
                <div
                  key={page.url}
                  onClick={() => onTogglePage(page.url)}
                  style={{ height: ROW_HEIGHT }}
                  className={`px-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-dark-900/[0.03] transition-colors ${
                    isChecked ? 'bg-brand-500/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-4 h-4 rounded text-brand-600 bg-white border-gray-300 focus:ring-0 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-dark-900 truncate">{page.title || page.url}</div>
                      <div className="text-[11px] text-gray-500 font-mono truncate">{page.url}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    isChecked ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {isChecked ? 'Selected' : 'Skipped'}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ height: bottomSpacerHeight }} />
        </>
      )}
    </div>
  );
}

/** 9. LARGE WEBSITE PAGE SELECTION REVIEW MODAL (Never a silent miss) */
export default function PageSelectionModal({
  show,
  pendingCrawlPages,
  discoveryTruncated,
  selectedUrls,
  setSelectedUrls,
  pageSelectionSearch,
  setPageSelectionSearch,
  tenantPlan,
  onConfirm,
  onClose,
  onShowPricing
}) {
  const filteredPages = useMemo(() => {
    const q = pageSelectionSearch.trim().toLowerCase();
    if (!q) return pendingCrawlPages;
    return pendingCrawlPages.filter(
      (p) => p.url.toLowerCase().includes(q) || (p.title && p.title.toLowerCase().includes(q))
    );
  }, [pendingCrawlPages, pageSelectionSearch]);

  const togglePage = (pageUrl) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(pageUrl)) {
        next.delete(pageUrl);
      } else {
        if (next.size >= getMaxPagesForPlan(tenantPlan)) {
          alert(`Your plan allows up to ${getMaxPagesForPlan(tenantPlan)} pages. Please upgrade or uncheck another page.`);
          return next;
        }
        next.add(pageUrl);
      }
      return next;
    });
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white p-6 sm:p-8 rounded-3xl w-full max-w-3xl border border-amber-500/30 shadow-2xl relative flex flex-col max-h-[88vh]">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 border border-amber-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-dark-900">
                Large Website ({pendingCrawlPages.length} Pages Discovered)
              </h3>
              <p className="text-xs text-gray-500">
                Your current <strong>{tenantPlan.toUpperCase()}</strong> plan includes up to <strong>{getMaxPagesForPlan(tenantPlan)} pages</strong>. Select which pages to index or upgrade your plan.
              </p>
            </div>
          </div>

          <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
            selectedUrls.size > getMaxPagesForPlan(tenantPlan)
              ? 'bg-red-500/20 text-red-700 border border-red-500/30'
              : 'bg-brand-500/20 text-brand-800 border border-brand-500/30'
          }`}>
            {selectedUrls.size} / {getMaxPagesForPlan(tenantPlan)} pages selected
          </span>
        </div>

        {/* Quick Actions & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-dark-900/5">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter pages by URL or title..."
              value={pageSelectionSearch}
              onChange={(e) => setPageSelectionSearch(e.target.value)}
              className="w-full bg-white border border-gray-300 text-dark-900 placeholder-gray-400 rounded-xl pl-8 pr-3 py-1.5 text-xs outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => {
                const topN = pendingCrawlPages.slice(0, getMaxPagesForPlan(tenantPlan));
                setSelectedUrls(new Set(topN.map(p => p.url)));
              }}
              className="text-xs text-gray-600 hover:text-dark-900 bg-white hover:bg-surface-200 px-3 py-1.5 rounded-lg border border-dark-900/10 transition-colors"
            >
              Select Top {getMaxPagesForPlan(tenantPlan)}
            </button>
            <button
              type="button"
              onClick={() => setSelectedUrls(new Set())}
              className="text-xs text-gray-500 hover:text-dark-900 bg-white hover:bg-surface-200 px-3 py-1.5 rounded-lg border border-dark-900/10 transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>

        {discoveryTruncated && (
          <p className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mt-3">
            This site has more than {MAX_DISCOVERABLE_PAGES.toLocaleString()} pages — showing the first {MAX_DISCOVERABLE_PAGES.toLocaleString()} discovered. Need a page beyond that indexed?{' '}
            <a href={`mailto:${GENERAL_EMAIL}`} className="font-semibold underline hover:text-amber-800">
              Contact us
            </a>{' '}
            and we'll add it by hand.
          </p>
        )}

        {/* Scrollable, windowed page checklist — only the rows in view are ever
            mounted, so this stays smooth whether pendingCrawlPages holds 20
            pages or 20,000 (see VirtualizedPageList above). */}
        <VirtualizedPageList pages={filteredPages} selectedUrls={selectedUrls} onTogglePage={togglePage} />

        {/* Modal Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-dark-900/5">
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onShowPricing) onShowPricing();
            }}
            className="w-full sm:w-auto text-xs text-amber-700 hover:text-amber-800 font-semibold flex items-center gap-1.5 px-3 py-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Upgrade plan for unlimited pages →
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:text-dark-900"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedUrls.size === 0 || selectedUrls.size > getMaxPagesForPlan(tenantPlan)}
              onClick={onConfirm}
              className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg disabled:opacity-50"
            >
              Confirm & Index Selected Pages ({selectedUrls.size}) →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
