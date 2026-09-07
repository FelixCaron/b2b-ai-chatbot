import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import api from '../../../lib/api';
import { getMaxPagesForPlan } from '../lib/plan-limits';
import { normalizePageUrl, rootUrlForDomain, stripProtocol, titleForPageUrl } from '../lib/page-url';

/**
 * Discovery → indexing → summary, and the two modals that report on it:
 * the learning progress popup and the large-website page selector.
 *
 * The summary setters come from useSiteSummary: step 3 of the pipeline
 * generates the business summary, and the settings panel shows the same state.
 */
export default function useCrawlPipeline({
  activeSite,
  tenantPlan,
  onTriggerScan,
  onDeleteDocumentUrls,
  onEnterDashboard,
  setSiteSummary,
  setIsRegeneratingSummary,
  refreshSiteSummary
}) {
  // Page Management & Selection State
  const [discoveredPages, setDiscoveredPages] = useState([]);
  const [selectedUrls, setSelectedUrls] = useState(new Set());
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlProgressMsg, setCrawlProgressMsg] = useState('');
  const [editingPage, setEditingPage] = useState(null);

  // Learning Progress Modal State
  const [showLearningModal, setShowLearningModal] = useState(false);
  const [learningProgress, setLearningProgress] = useState(0);
  const [learningStep, setLearningStep] = useState(1); // 1: Discover, 2: Index, 3: Summary, 4: Complete
  const [learningDomain, setLearningDomain] = useState('');
  const [learningStats, setLearningStats] = useState({ pages: 0, indexed: 0, protected: 0, empty: 0 });

  // Large Website Selection Modal State (Never a silent miss)
  const [showPageSelectionModal, setShowPageSelectionModal] = useState(false);
  const [pendingCrawlPages, setPendingCrawlPages] = useState([]);
  const [pendingSiteObj, setPendingSiteObj] = useState(null);
  const [pendingTargetUrl, setPendingTargetUrl] = useState('');
  const [pageSelectionSearch, setPageSelectionSearch] = useState('');

  // Batch indexer helper
  const executeBatchScan = async (siteObj, targetUrl, pagesToScan) => {
    setIsCrawling(true);
    onEnterDashboard();
    setShowLearningModal(true);
    setLearningProgress(20);
    setLearningStep(2);
    setLearningDomain(siteObj.domain || stripProtocol(targetUrl));

    setDiscoveredPages(pagesToScan);
    setSelectedUrls(new Set(pagesToScan.map(p => p.url)));

    let loadedCount = 0;
    let protectedCount = 0;
    let emptyCount = 0;
    let completedPagesCount = 0;

    // Scan pages in parallel batches (10x concurrency)
    const CONCURRENCY = 10;
    for (let i = 0; i < pagesToScan.length; i += CONCURRENCY) {
      const batch = pagesToScan.slice(i, i + CONCURRENCY);

      await Promise.all(batch.map(async (page) => {
        const scanRes = await onTriggerScan(siteObj.id, page.url, siteObj.tenant_id).catch(() => null);

        // Verify ground truth chunk count in DB for this exact page
        const { count } = await supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('site_id', siteObj.id)
          .eq('url', page.url);

        const isProtected = scanRes?.data?.is_protected || scanRes?.is_protected;
        const chunksCount = count ?? scanRes?.data?.chunks_count ?? scanRes?.chunks_count ?? 0;
        const isEmpty = !isProtected && (scanRes?.data?.is_empty || chunksCount === 0);

        if (isProtected) {
          protectedCount++;
          setSelectedUrls(prev => {
            const next = new Set(prev);
            next.delete(page.url);
            return next;
          });
          setDiscoveredPages(prev => prev.map(p => p.url === page.url ? { ...p, status: 'protected', isProtected: true, isEmpty: false, chunksCount: 0 } : p));
        } else if (isEmpty) {
          emptyCount++;
          setSelectedUrls(prev => {
            const next = new Set(prev);
            next.delete(page.url);
            return next;
          });
          setDiscoveredPages(prev => prev.map(p => p.url === page.url ? { ...p, status: 'empty', isEmpty: true, isProtected: false, chunksCount: 0 } : p));
        } else {
          loadedCount++;
          setDiscoveredPages(prev => prev.map(p => p.url === page.url ? { ...p, status: 'loaded', isEmpty: false, isProtected: false, chunksCount } : p));
        }

        completedPagesCount++;
        const pct = Math.round(20 + ((completedPagesCount / pagesToScan.length) * 60));
        setLearningProgress(Math.min(pct, 85));
        setCrawlProgressMsg(`Indexing page ${completedPagesCount}/${pagesToScan.length} (${Math.round((completedPagesCount / pagesToScan.length) * 100)}%)`);
      }));
    }

    // Automatically generate website summary during scan
    setLearningStep(3);
    setLearningProgress(90);
    setIsRegeneratingSummary(true);
    setCrawlProgressMsg('Generating AI Business Summary...');

    try {
      const summaryRes = await api.crawler.summarize({
        tenant_id: siteObj.tenant_id,
        site_id: siteObj.id,
        url: targetUrl
      });
      if (summaryRes.ok && summaryRes.data?.summary) {
        setSiteSummary(summaryRes.data.summary);
      }
    } catch (sumErr) {
      console.warn('[executeBatchScan] Summary generation warning:', sumErr);
    } finally {
      setIsRegeneratingSummary(false);
    }
    await refreshSiteSummary();

    // Complete
    setLearningStats({
      pages: pagesToScan.length,
      indexed: loadedCount,
      protected: protectedCount,
      empty: emptyCount
    });
    setLearningStep(4);
    setLearningProgress(100);
    setCrawlProgressMsg(`✓ Scan finished! ${loadedCount} page(s) indexed.`);
    setIsCrawling(false);
  };

  // Synchronous crawl and index pipeline
  const runSynchronousCrawlAndIndex = async (siteObj, targetUrl) => {
    setIsCrawling(true);
    onEnterDashboard();
    setShowLearningModal(true);
    setLearningProgress(5);
    setLearningStep(1);
    setLearningDomain(siteObj.domain || stripProtocol(targetUrl));

    setCrawlProgressMsg('Discovering website pages...');

    // 1. Discover ALL pages via /api/crawler/crawl without silent drops
    let pagesToScan = [{ url: targetUrl, title: 'Home Page', status: 'loading' }];
    setDiscoveredPages(pagesToScan);
    setSelectedUrls(new Set([targetUrl]));

    const crawlRes = await api.crawler.discover({ url: targetUrl });
    if (crawlRes.ok) {
      const crawlData = crawlRes.data;
      if (crawlData.pages && crawlData.pages.length > 0) {
        pagesToScan = crawlData.pages.map(p => ({
          url: p.url,
          title: p.title || p.url,
          status: 'loading'
        }));
      }
    } else {
      // The client answers with an envelope instead of throwing, so a failed
      // discovery is reported here and the scan carries on with the home page
      // alone — exactly what the old catch block left behind.
      console.error('[runSynchronousCrawlAndIndex] Crawl error:', crawlRes.error);
    }

    const maxAllowedPages = getMaxPagesForPlan(tenantPlan);

    // If website exceeds plan limit (e.g. over 500 pages), prompt with warning and interactive page selector
    if (pagesToScan.length > maxAllowedPages) {
      setPendingCrawlPages(pagesToScan);
      setPendingSiteObj(siteObj);
      setPendingTargetUrl(targetUrl);
      setSelectedUrls(new Set(pagesToScan.slice(0, maxAllowedPages).map(p => p.url)));
      setShowLearningModal(false);
      setIsCrawling(false);
      setShowPageSelectionModal(true);
      return;
    }

    await executeBatchScan(siteObj, targetUrl, pagesToScan);
  };

  const handleConfirmSelectedPagesAndScan = async () => {
    if (!pendingSiteObj || !pendingTargetUrl) return;
    setShowPageSelectionModal(false);
    const chosenPages = pendingCrawlPages.filter(p => selectedUrls.has(p.url));
    const finalPages = chosenPages.length > 0 ? chosenPages : pendingCrawlPages.slice(0, 1);
    await executeBatchScan(pendingSiteObj, pendingTargetUrl, finalPages);
  };

  const handleRecrawlSite = async () => {
    if (!activeSite || isCrawling) return;
    setIsCrawling(true);
    setCrawlProgressMsg('Resetting previous database chunks...');

    try {
      await supabase.from('documents').delete().eq('site_id', activeSite.id);
    } catch (err) {
      console.error('[handleRecrawlSite] DB cleanup error:', err);
    }

    setDiscoveredPages([]);
    setSelectedUrls(new Set());

    const rootUrl = rootUrlForDomain(activeSite.domain);
    await runSynchronousCrawlAndIndex(activeSite, rootUrl);
  };

  const handleTogglePageActivation = async (pageUrl) => {
    if (!activeSite) return;
    const targetPage = discoveredPages.find(p => p.url === pageUrl);
    const currentStatus = targetPage?.status || (selectedUrls.has(pageUrl) ? 'loaded' : 'disabled');

    if (currentStatus === 'loaded' || currentStatus === 'loading') {
      setDiscoveredPages(prev => prev.map(p => p.url === pageUrl ? { ...p, status: 'disabled' } : p));
      setSelectedUrls(prev => {
        const next = new Set(prev);
        next.delete(pageUrl);
        return next;
      });
      await onDeleteDocumentUrls(activeSite.id, [pageUrl]);
    } else {
      setDiscoveredPages(prev => prev.map(p => p.url === pageUrl ? { ...p, status: 'loading' } : p));
      setSelectedUrls(prev => new Set(prev).add(pageUrl));
      await onTriggerScan(activeSite.id, pageUrl, activeSite.tenant_id);
      setDiscoveredPages(prev => prev.map(p => p.url === pageUrl ? { ...p, status: 'loaded' } : p));
    }
  };

  // Auto-fetch indexed pages when site changes
  const fetchIndexedPages = async () => {
    if (!activeSite?.id || isCrawling) return;
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('url, metadata')
        .eq('site_id', activeSite.id)
        .limit(10000);
      if (error) {
        console.error('[ClientOnboarding] Error fetching indexed pages:', error);
        return;
      }
      if (data && data.length > 0) {
        const uniqueUrls = new Set();
        const pages = [];
        data.forEach(d => {
          if (d.url && !d.url.includes('#site-summary')) {
            const normUrl = normalizePageUrl(d.url);
            if (normUrl && !uniqueUrls.has(normUrl)) {
              uniqueUrls.add(normUrl);
              let title = d.metadata?.title;
              if (!title) {
                title = titleForPageUrl(normUrl);
              }
              pages.push({ url: normUrl, title, status: 'loaded' });
            }
          }
        });
        setDiscoveredPages(pages);
        setSelectedUrls(new Set(pages.map(p => p.url)));
      } else {
        setDiscoveredPages([]);
        setSelectedUrls(new Set());
      }
    } catch (err) {
      console.error('[ClientOnboarding] Exception fetching indexed pages:', err);
    }
  };

  const handleEditPage = async (pageUrl, e) => {
    e.stopPropagation();
    setEditingPage({ url: pageUrl, content: 'Loading content...', saving: false });
    try {
      const { data, error } = await supabase.from('documents').select('content').eq('site_id', activeSite.id).eq('url', pageUrl);
      if (error) throw error;
      const fullContent = data ? data.map(d => d.content).join('\n\n') : '';
      setEditingPage({ url: pageUrl, content: fullContent, saving: false });
    } catch (err) {
      setEditingPage({ url: pageUrl, content: 'Error loading page content.', saving: false });
    }
  };

  const handleSavePageContent = async () => {
    if (!editingPage) return;
    setEditingPage(prev => ({ ...prev, saving: true }));
    const res = await api.crawler.update({
      site_id: activeSite.id,
      tenant_id: activeSite.tenant_id,
      url: editingPage.url,
      content: editingPage.content
    });
    if (!res.ok) {
      alert("Error saving page content.");
      setEditingPage(prev => ({ ...prev, saving: false }));
      return;
    }
    setSelectedUrls(prev => new Set(prev).add(editingPage.url));
    setEditingPage(null);
  };

  return {
    discoveredPages,
    setDiscoveredPages,
    selectedUrls,
    setSelectedUrls,
    isCrawling,
    crawlProgressMsg,
    showLearningModal,
    setShowLearningModal,
    learningProgress,
    learningStep,
    learningDomain,
    learningStats,
    showPageSelectionModal,
    setShowPageSelectionModal,
    pendingCrawlPages,
    pageSelectionSearch,
    setPageSelectionSearch,
    editingPage,
    setEditingPage,
    runSynchronousCrawlAndIndex,
    handleConfirmSelectedPagesAndScan,
    handleRecrawlSite,
    handleTogglePageActivation,
    fetchIndexedPages,
    handleEditPage,
    handleSavePageContent
  };
}
