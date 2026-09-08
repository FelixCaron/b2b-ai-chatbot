import React from 'react';
import { Layers, Search, Lock, RefreshCw, Check } from 'lucide-react';

/** 3. The pages the assistant answers from.
 *
 *  Wording here is deliberately about the customer's website, not about our
 *  retrieval stack: an owner decides whether a page should be included, and
 *  has no reason to know that inclusion means chunks in a vector store. Every
 *  status says what happened to their page rather than what state a row is in.
 */
export default function KnowledgeBasePanel({
  activeSite,
  discoveredPages,
  selectedUrls,
  searchQuery,
  setSearchQuery,
  onTogglePageActivation,
  onEditPage
}) {
  return (
    <div id="knowledge-base-section" className="bg-surface-100 p-5 sm:p-6 rounded-xl border border-dark-900/5 space-y-4 scroll-mt-24">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-dark-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-600" /> Website content
          </h4>
          <p className="text-xs text-gray-500">Choose which pages of your website your assistant is allowed to answer from.</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter pages by URL or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl pl-8 pr-3 py-1.5 text-xs text-dark-900 outline-none focus:border-brand-500"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-dark-900/5 bg-white shadow-inner">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-200 text-gray-500 uppercase tracking-wider border-b border-dark-900/5">
            <tr>
              <th className="py-2.5 px-4 font-semibold w-12 text-center">Include</th>
              <th className="py-2.5 px-4 font-semibold">Page Title</th>
              <th className="py-2.5 px-4 font-semibold">Address</th>
              <th className="py-2.5 px-4 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-900/5 text-gray-700">
            {discoveredPages
              .filter(p => p.url.toLowerCase().includes(searchQuery.toLowerCase()) || (p.title && p.title.toLowerCase().includes(searchQuery.toLowerCase())))
              .map((page) => {
                const currentStatus = page.status || (selectedUrls.has(page.url) ? 'loaded' : 'disabled');
                const isIncluded = currentStatus === 'loaded' || currentStatus === 'loading';

                return (
                  <tr
                    key={page.url}
                    className={`hover:bg-dark-900/[0.03] transition-colors ${isIncluded ? 'bg-brand-500/5' : 'opacity-75'}`}
                  >
                    <td className="py-2.5 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isIncluded}
                        onChange={() => onTogglePageActivation(page.url)}
                        className="w-4 h-4 rounded accent-brand-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-dark-900 line-clamp-1">{page.title || 'Untitled Page'}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-gray-500 font-mono truncate max-w-[200px]" title={page.url}>
                        {page.url.replace(`https://${activeSite?.domain}`, '') || '/'}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-2">
                      <button
                        onClick={(e) => onEditPage(page.url, e)}
                        className="text-[10px] bg-white hover:bg-surface-200 text-gray-600 px-2 py-1 rounded border border-dark-900/10 transition-colors"
                      >
                        Edit
                      </button>

                      {/* The row's checkbox already toggles inclusion. A second
                          control doing the identical thing, worded differently,
                          only raised the question of how the two differed. */}

                      {currentStatus === 'protected' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 border border-rose-500/20">
                          <Lock className="w-2.5 h-2.5" /> Couldn't open
                        </span>
                      ) : currentStatus === 'empty' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-200 text-gray-500 border border-gray-300">
                          No readable text
                        </span>
                      ) : currentStatus === 'loading' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Reading...
                        </span>
                      ) : currentStatus === 'loaded' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                          <Check className="w-2.5 h-2.5" /> Included
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/10 text-gray-600 border border-gray-500/20">
                          Not used
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
