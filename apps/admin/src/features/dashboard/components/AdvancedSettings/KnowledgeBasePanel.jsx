import React, { useEffect, useState } from 'react';
import { Layers, Search, Lock, RefreshCw, Check, Plus, AlertTriangle } from 'lucide-react';

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
  onAddManualPage,
  onEditPage,
  // Set from a "this wasn't answered" conversation: the page the visitor was
  // stuck on, handed here so fixing it is one click instead of "go find the
  // right URL yourself".
  prefillAddUrl
}) {
  const [addUrl, setAddUrl] = useState('');
  const [addError, setAddError] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (prefillAddUrl) setAddUrl(prefillAddUrl);
  }, [prefillAddUrl]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addUrl.trim() || isAdding) return;
    setIsAdding(true);
    setAddError('');
    const result = await onAddManualPage(addUrl);
    setIsAdding(false);
    if (result?.ok) {
      setAddUrl('');
    } else {
      setAddError(result?.error || 'Could not add that page.');
    }
  };

  return (
    <div id="knowledge-base-section" className="bg-surface-100 p-5 sm:p-6 rounded-xl border border-dark-900/5 space-y-4 scroll-mt-24">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-dark-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-600" /> Website knowledge
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

      {/* Pages that were never linked anywhere the crawler could find them —
          a pricing page reached only through a button, not an <a> — but
          real, and worth the assistant knowing about. */}
      <form onSubmit={handleAddSubmit} className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <div className="relative flex-1 w-full">
          <Plus className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Add a page the crawler missed, e.g. yoursite.com/pricing"
            value={addUrl}
            onChange={(e) => { setAddUrl(e.target.value); setAddError(''); }}
            className="w-full bg-white border border-gray-300 rounded-xl pl-8 pr-3 py-1.5 text-xs text-dark-900 outline-none focus:border-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={!addUrl.trim() || isAdding}
          className="text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white px-3.5 py-1.5 rounded-xl transition-colors disabled:opacity-40 shrink-0 w-full sm:w-auto"
        >
          {isAdding ? 'Adding…' : 'Add page'}
        </button>
      </form>
      {addError && <p className="text-xs text-rose-600">{addError}</p>}

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
                      ) : currentStatus === 'failed' ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-700 border border-orange-500/20"
                          title={page.errorMessage || "We couldn't reach this page to scan it — this is different from an empty page."}
                        >
                          <AlertTriangle className="w-2.5 h-2.5" /> Couldn't scan — retry
                        </span>
                      ) : currentStatus === 'loading' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Reading...
                        </span>
                      ) : currentStatus === 'loaded' ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            page.embeddingDegraded
                              ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                          }`}
                          title={page.embeddingDegraded ? 'Included, but only reachable by keyword search — semantic search could not be generated for part of this page.' : undefined}
                        >
                          <Check className="w-2.5 h-2.5" /> {page.embeddingDegraded ? 'Included (limited search)' : 'Included'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/10 text-gray-600 border border-gray-500/20">
                          Excluded
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
