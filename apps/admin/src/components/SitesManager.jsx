import React, { useState } from 'react';
import { Globe, Plus, Code, Search, Check, CheckSquare, Square, Layers, Loader2, Send } from 'lucide-react';

export default function SitesManager({ sites, tenant, onAddSite, onTriggerScan }) {
  const [newDomain, setNewDomain] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);

  // Crawler & Page Selector State
  const [selectedSiteForScan, setSelectedSiteForScan] = useState('');
  const [crawlUrl, setCrawlUrl] = useState('');
  const [isCrawling, setIsCrawling] = useState(false);
  const [discoveredPages, setDiscoveredPages] = useState([]);
  const [selectedUrls, setSelectedUrls] = useState(new Set());
  const [pageSearchFilter, setPageSearchFilter] = useState('');
  const [indexingStatus, setIndexingStatus] = useState('');

  const handleCreateSite = (e) => {
    e.preventDefault();
    if (!newDomain) return;
    onAddSite(newDomain);
    setNewDomain('');
  };

  // Step 1: Trigger Crawler Edge Function (/api/crawl-site)
  const handleCrawlSubmit = async (e) => {
    e.preventDefault();
    if (!crawlUrl) return;

    setIsCrawling(true);
    setIndexingStatus('Crawling website pages...');
    setDiscoveredPages([]);
    setSelectedUrls(new Set());

    try {
      const crawlEndpoint = `${window.location.origin}/api/crawl-site`;
      const res = await fetch(crawlEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: crawlUrl })
      });

      const data = await res.json();

      if (res.ok && data.pages) {
        setDiscoveredPages(data.pages);
        // By default, select all discovered URLs
        setSelectedUrls(new Set(data.pages.map((p) => p.url)));
        setIndexingStatus(`✓ ${data.pages.length} pages discovered! Select pages to index.`);
      } else {
        setIndexingStatus(`Crawl error: ${data.error || 'Unable to crawl this website'}`);
      }
    } catch (err) {
      setIndexingStatus(`Network error: ${err.message}`);
    } finally {
      setIsCrawling(false);
    }
  };

  // Toggle single URL checkbox
  const toggleUrlSelection = (url) => {
    const next = new Set(selectedUrls);
    if (next.has(url)) {
      next.delete(url);
    } else {
      next.add(url);
    }
    setSelectedUrls(next);
  };

  // Select / Deselect All toggle
  const toggleSelectAll = () => {
    if (selectedUrls.size === discoveredPages.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(discoveredPages.map((p) => p.url)));
    }
  };

  // Step 3: Queue selected pages to PGMQ via /api/start-scan
  const handleBatchIndex = async () => {
    if (!selectedSiteForScan || selectedUrls.size === 0) return;

    setIndexingStatus(`Sending ${selectedUrls.size} page(s) to indexing queue...`);
    let queued = 0;

    for (const url of Array.from(selectedUrls)) {
      const result = await onTriggerScan(selectedSiteForScan, url, tenant?.id);
      if (result?.success) queued++;
    }

    setIndexingStatus(`✓ Success! ${queued} / ${selectedUrls.size} indexing tasks queued.`);
  };

  const copySnippet = (key) => {
    const apiChat = `${window.location.origin}/api/chat`;
    const snippet = `<script src="${window.location.origin}/widget.iife.js" data-tenant-key="${key}" data-api-url="${apiChat}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredPages = discoveredPages.filter(
    (p) => p.url.toLowerCase().includes(pageSearchFilter.toLowerCase()) || p.title.toLowerCase().includes(pageSearchFilter.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* 1. Add New Site Card */}
      <div className="glass-card p-6 rounded-2xl">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand-500" /> Register a Website Domain
        </h2>
        <form onSubmit={handleCreateSite} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Domain name (e.g. example.com)"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            className="flex-1 bg-dark-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md"
          >
            <Plus className="w-4 h-4" /> Save
          </button>
        </form>
      </div>

      {/* 2. Registered Sites List & Integration Code */}
      <div className="glass-card p-6 rounded-2xl">
        <h2 className="text-lg font-bold text-white mb-4">Registered Sites & Public Keys</h2>
        {sites.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">No sites registered yet.</div>
        ) : (
          <div className="space-y-4">
            {sites.map((site) => (
              <div key={site.id} className="bg-dark-900/80 p-5 rounded-xl border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="text-base font-semibold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    {site.domain}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 font-mono">
                    Public Key: <span className="text-indigo-300">{site.public_key}</span>
                  </div>
                </div>

                <button
                  onClick={() => copySnippet(site.public_key)}
                  className="bg-dark-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all"
                >
                  {copiedKey === site.public_key ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                    </>
                  ) : (
                    <>
                      <Code className="w-3.5 h-3.5 text-brand-400" /> Copy Embed Code
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Interactive Web Crawler & Page Selection UI */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" /> Web Crawler & Knowledge Base Indexing
          </h2>
        </div>
        <p className="text-xs text-gray-400 mb-6">
          Automatically crawl your site to discover all pages, then choose which URLs to index into the vector knowledge base.
        </p>

        {/* Step 1: Input URL and trigger Crawler */}
        <form onSubmit={handleCrawlSubmit} className="space-y-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">1. Select target site</label>
              <select
                value={selectedSiteForScan}
                onChange={(e) => setSelectedSiteForScan(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
              >
                <option value="">-- Choose a site --</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.domain}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">2. Root URL to crawl</label>
              <input
                type="url"
                placeholder="https://example.com"
                value={crawlUrl}
                onChange={(e) => setCrawlUrl(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={!crawlUrl || isCrawling}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-all shadow-md"
            >
              {isCrawling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Crawling site...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" /> Crawl & Discover Pages
                </>
              )}
            </button>
            {indexingStatus && <span className="text-xs text-indigo-300 font-medium">{indexingStatus}</span>}
          </div>
        </form>

        {/* Step 2: Page Selection List */}
        {discoveredPages.length > 0 && (
          <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white bg-dark-900 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {selectedUrls.size === discoveredPages.length ? (
                    <>
                      <CheckSquare className="w-4 h-4 text-indigo-400" /> Deselect All
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4 text-gray-400" /> Select All ({discoveredPages.length})
                    </>
                  )}
                </button>
                <span className="text-xs text-gray-400">
                  {selectedUrls.size} of {discoveredPages.length} pages selected
                </span>
              </div>

              <input
                type="text"
                placeholder="Filter pages..."
                value={pageSearchFilter}
                onChange={(e) => setPageSearchFilter(e.target.value)}
                className="bg-dark-900 border border-gray-700 text-xs text-white rounded-lg px-3 py-1.5 w-full sm:w-56 outline-none focus:border-indigo-500"
              />
            </div>

            {/* Checkbox Pages Table */}
            <div className="max-h-80 overflow-y-auto rounded-xl border border-white/5 bg-dark-900/60 divide-y divide-white/5">
              {filteredPages.map((page) => {
                const isSelected = selectedUrls.has(page.url);
                return (
                  <div
                    key={page.url}
                    onClick={() => toggleUrlSelection(page.url)}
                    className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-500/10' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-indigo-400">
                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-gray-500" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">{page.title}</div>
                        <div className="text-xs text-gray-400 truncate font-mono">{page.url}</div>
                      </div>
                    </div>
                    <span className="text-[11px] bg-dark-800 text-gray-300 border border-gray-700 px-2 py-0.5 rounded font-mono shrink-0">
                      {page.path}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Step 3: Trigger Batch Indexing Button */}
            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={handleBatchIndex}
                disabled={!selectedSiteForScan || selectedUrls.size === 0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-all shadow-lg"
              >
                <Send className="w-4 h-4" /> Index ({selectedUrls.size}) Selected Pages
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
