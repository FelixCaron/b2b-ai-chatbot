import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, Globe, Eye, CheckCircle2, ArrowRight, Settings2, ShieldCheck, 
  ToggleLeft, ToggleRight, Check, RefreshCw, Copy, Layers, Laptop, 
  Smartphone, X, Send, Code, Lock, FileText, Save, Edit3, ExternalLink,
  ChevronDown, ChevronUp, Bot, ArrowUpRight, Search, Trash2, AlertTriangle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase, authenticatedHeaders } from '../../lib/supabase';
import { fetchEventSource } from '@microsoft/fetch-event-source';

export default function Dashboard({
  selectedTenant,
  sites,
  onAddSite,
  onUpdateSiteSettings,
  onDeleteDocumentUrls,
  onTriggerScan,
  onDeleteSite,
  isGuest,
  onRequireLogin,
  onViewLeads,
  onShowPricing,
  leadsCount = 0
}) {
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [localCreatedSite, setLocalCreatedSite] = useState(null);
  const activeSite = (sites && sites.find(s => s.id === selectedSiteId)) || sites?.[0] || localCreatedSite;

  const tenantPlan = selectedTenant?.plan || 'free';
  const getMaxSitesForPlan = (plan) => {
    if (plan === 'enterprise') return 999;
    if (plan === 'pro' || plan === 'starter') return 5;
    return 1; // free and basic: 1 website
  };
  const getMaxPagesForPlan = (plan) => {
    if (plan === 'enterprise') return 9999;
    if (plan === 'pro' || plan === 'starter') return 2000;
    return 500; // Do not block unless over 500 pages
  };

  // Onboarding Step State
  const [siteUrl, setSiteUrl] = useState('');
  const [orgName, setOrgName] = useState(selectedTenant?.name || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedTheme, setDetectedTheme] = useState(null);
  const [step, setStep] = useState(activeSite ? 'dashboard' : 'input');

  // Add Site Modal state (non-blocking)
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);
  const [newSiteUrlInput, setNewSiteUrlInput] = useState('');
  const [isAddingNewSite, setIsAddingNewSite] = useState(false);
  const [newSiteError, setNewSiteError] = useState('');

  // Delete Site state
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isDeletingSite, setIsDeletingSite] = useState(false);

  const handleConfirmDeleteSite = async () => {
    if (!activeSite?.id || isDeletingSite || !onDeleteSite) return;
    setIsDeletingSite(true);
    try {
      const ok = await onDeleteSite(activeSite.id);
      if (ok) {
        setShowDeleteConfirmModal(false);
        const remaining = sites ? sites.filter(s => s.id !== activeSite.id) : [];
        if (remaining.length > 0) {
          setSelectedSiteId(remaining[0].id);
        } else {
          setLocalCreatedSite(null);
          setSelectedSiteId(null);
          setSiteUrl('');
          setStep('input');
        }
      }
    } catch (err) {
      console.error('[handleConfirmDeleteSite] Error:', err);
    } finally {
      setIsDeletingSite(false);
    }
  };

  // Sync step if activeSite changes
  useEffect(() => {
    if (activeSite && step === 'input') {
      setStep('dashboard');
    }
  }, [activeSite]);

  // Page Management & Selection State
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [discoveredPages, setDiscoveredPages] = useState([]);
  const [selectedUrls, setSelectedUrls] = useState(new Set());
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlProgressMsg, setCrawlProgressMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [showIntegrationModal, setShowIntegrationModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
    setStep('dashboard');
    setShowLearningModal(true);
    setLearningProgress(20);
    setLearningStep(2);
    setLearningDomain(siteObj.domain || targetUrl.replace('https://', '').replace('http://', ''));

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
      const summaryRes = await fetch(`${window.location.origin}/api/crawler/summarize`, {
        method: 'POST',
        headers: await authenticatedHeaders(),
        body: JSON.stringify({
          tenant_id: siteObj.tenant_id,
          site_id: siteObj.id,
          url: targetUrl
        })
      });
      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        if (sumData?.summary) {
          setSiteSummary(sumData.summary);
        }
      }
    } catch (sumErr) {
      console.warn('[executeBatchScan] Summary generation warning:', sumErr);
    } finally {
      setIsRegeneratingSummary(false);
    }
    await fetchSiteSummary();

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
    setStep('dashboard');
    setShowLearningModal(true);
    setLearningProgress(5);
    setLearningStep(1);
    setLearningDomain(siteObj.domain || targetUrl.replace('https://', '').replace('http://', ''));

    setCrawlProgressMsg('Discovering website pages...');

    // 1. Discover ALL pages via /api/crawler/crawl without silent drops
    let pagesToScan = [{ url: targetUrl, title: 'Home Page', status: 'loading' }];
    setDiscoveredPages(pagesToScan);
    setSelectedUrls(new Set([targetUrl]));

    try {
      const crawlRes = await fetch(`${window.location.origin}/api/crawler/crawl`, {
        method: 'POST',
        headers: await authenticatedHeaders(),
        body: JSON.stringify({ url: targetUrl })
      });

      if (crawlRes.ok) {
        const crawlData = await crawlRes.json();
        if (crawlData.pages && crawlData.pages.length > 0) {
          pagesToScan = crawlData.pages.map(p => ({
            url: p.url,
            title: p.title || p.url,
            status: 'loading'
          }));
        }
      }
    } catch (err) {
      console.error('[runSynchronousCrawlAndIndex] Crawl error:', err);
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

    const rootUrl = activeSite.domain.startsWith('http') ? activeSite.domain : `https://${activeSite.domain}`;
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

  function normalizePageUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      let uStr = rawUrl.split('#')[0].split('?')[0].trim();
      if (!uStr.startsWith('http://') && !uStr.startsWith('https://')) {
        uStr = `https://${uStr}`;
      }
      const parsed = new URL(uStr);
      parsed.pathname = parsed.pathname.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
      if (parsed.pathname === '' || parsed.pathname === '/') {
        parsed.pathname = '/';
      } else if (parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }
      return parsed.href;
    } catch (e) {
      return rawUrl;
    }
  }

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
                const u = new URL(normUrl);
                title = (u.pathname === '/' || u.pathname === '') ? "Home Page" : u.pathname.replace(/^\//, '');
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

  // Website Summary State & Handlers
  const [siteSummary, setSiteSummary] = useState('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [isRegeneratingSummary, setIsRegeneratingSummary] = useState(false);
  const [summarySuccessMsg, setSummarySuccessMsg] = useState('');
  const [showSummaryEditor, setShowSummaryEditor] = useState(false);

  const fetchSiteSummary = async () => {
    if (!activeSite?.id) return;
    setIsLoadingSummary(true);
    try {
      const { data: sumData } = await supabase
        .from('site_summaries')
        .select('summary')
        .eq('site_id', activeSite.id)
        .maybeSingle();

      if (sumData?.summary) {
        setSiteSummary(sumData.summary);
        setIsLoadingSummary(false);
        return;
      }

      const { data: docData } = await supabase
        .from('documents')
        .select('content')
        .eq('site_id', activeSite.id)
        .ilike('url', '%#site-summary')
        .maybeSingle();

      if (docData?.content) {
        setSiteSummary(docData.content.replace(/^\[SITE_SUMMARY\]\n/, ''));
        setIsLoadingSummary(false);
        return;
      }

      if (activeSite?.domain) {
        setIsRegeneratingSummary(true);
        const summaryRes = await fetch(`${window.location.origin}/api/crawler/summarize`, {
          method: 'POST',
          headers: await authenticatedHeaders(),
          body: JSON.stringify({
            tenant_id: activeSite.tenant_id,
            site_id: activeSite.id,
            url: activeSite.domain
          })
        }).catch(() => null);

        if (summaryRes && summaryRes.ok) {
          const resData = await summaryRes.json();
          if (resData?.summary) {
            setSiteSummary(resData.summary);
          }
        }
      }
    } catch (err) {
      console.error('[fetchSiteSummary] Error:', err);
    } finally {
      setIsLoadingSummary(false);
      setIsRegeneratingSummary(false);
    }
  };

  const handleSaveSummary = async () => {
    if (!activeSite?.id || !siteSummary.trim()) return;
    setIsSavingSummary(true);
    try {
      await supabase.from('site_summaries').upsert({
        tenant_id: activeSite.tenant_id,
        site_id: activeSite.id,
        summary: siteSummary.trim(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,site_id' });

      // Fallback document sync
      const summaryUrl = `https://${activeSite.domain}#site-summary`;
      await supabase.from('documents').delete().eq('site_id', activeSite.id).eq('url', summaryUrl);
      await supabase.from('documents').insert({
        tenant_id: activeSite.tenant_id,
        site_id: activeSite.id,
        url: summaryUrl,
        content: `[SITE_SUMMARY]\n${siteSummary.trim()}`
      });

      setSummarySuccessMsg('✓ Business summary saved successfully!');
      setTimeout(() => setSummarySuccessMsg(''), 3500);
    } catch (err) {
      console.error('[handleSaveSummary] Error:', err);
    } finally {
      setIsSavingSummary(false);
    }
  };

  const handleRegenerateSummary = async () => {
    if (!activeSite?.id || isRegeneratingSummary) return;
    setIsRegeneratingSummary(true);
    try {
      const res = await fetch(`${window.location.origin}/api/crawler/summarize`, {
        method: 'POST',
        headers: await authenticatedHeaders(),
        body: JSON.stringify({
          tenant_id: activeSite.tenant_id,
          site_id: activeSite.id,
          url: activeSite.domain
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setSiteSummary(data.summary);
          setSummarySuccessMsg('✓ AI Business Summary regenerated successfully!');
          setTimeout(() => setSummarySuccessMsg(''), 3500);
        }
      }
    } catch (err) {
      console.error('[handleRegenerateSummary] Error:', err);
    } finally {
      setIsRegeneratingSummary(false);
    }
  };

  useEffect(() => {
    fetchIndexedPages();
    fetchSiteSummary();
  }, [activeSite?.id]);

  // Full-Screen Preview & Live Bot Testing State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewViewport, setPreviewViewport] = useState('desktop'); // 'desktop' | 'mobile'
  const [copiedScriptKey, setCopiedScriptKey] = useState(null);

  // Live Preview Chatbot State
  const [previewSessionId, setPreviewSessionId] = useState(() => 'preview_sess_' + Date.now());
  const [previewChatOpen, setPreviewChatOpen] = useState(true);
  const [previewMessages, setPreviewMessages] = useState([
    { role: 'assistant', text: "Hello! I am your website's virtual assistant. Ask me any question to test my live responses!" }
  ]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewStreaming, setPreviewStreaming] = useState(false);

  // Hide the admin dashboard bot when in preview mode to prevent overlap
  useEffect(() => {
    const adminBot = document.getElementById('b2b-chatbot-host');
    if (adminBot) {
      adminBot.style.display = showPreviewModal ? 'none' : '';
    }
    return () => {
      if (adminBot) adminBot.style.display = '';
    };
  }, [showPreviewModal]);
  const chatMessagesEndRef = useRef(null);

  // Reset session and welcome message whenever activeSite changes
  useEffect(() => {
    if (activeSite) {
      setPreviewSessionId('preview_sess_' + Date.now());
      setPreviewMessages([
        { role: 'assistant', text: `Hello! I am the virtual assistant for ${activeSite.domain}. Ask me any question to test my live answers!` }
      ]);
    }
  }, [activeSite?.id]);

  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [previewMessages, previewChatOpen]);

  // Instant Onboarding: Client enters URL -> Environment created -> Instant Dashboard with synchronous crawl progression!
  const handleAnalyzeSite = async (e) => {
    e.preventDefault();
    if (!siteUrl) return;

    let formattedUrl = siteUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
      setSiteUrl(formattedUrl);
    }

    setIsAnalyzing(true);
    setStatusMsg('Creating your AI Assistant...');

    try {
      let currentDomain = formattedUrl.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];
      let brandColor = '#4f46e5';

      const siteObj = await onAddSite(currentDomain, brandColor);

      if (siteObj) {
        setLocalCreatedSite(siteObj);
        setIsAnalyzing(false);

        authenticatedHeaders().then(authHeaders => {
          fetch(`${window.location.origin}/api/chat/theme`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ url: formattedUrl })
          }).then(res => res.ok ? res.json() : null).then(themeData => {
            if (themeData?.primary_color) {
              onUpdateSiteSettings(siteObj.id, { theme_primary_color: themeData.primary_color });
            }
            if (themeData?.org_name) setOrgName(themeData.org_name);
          }).catch(() => {});
        });

        await runSynchronousCrawlAndIndex(siteObj, formattedUrl);
      } else {
        setStatusMsg('Erreur : Impossible d\'ajouter ce site. Vérifiez que votre session Supabase est active.');
        setIsAnalyzing(false);
      }
    } catch (err) {
      console.error('Onboarding error:', err);
      setStatusMsg(`Error: ${err.message}`);
      setIsAnalyzing(false);
    }
  };

  // Add Website Modal Submit handler
  const handleOpenAddSiteModal = () => {
    setNewSiteUrlInput('');
    setNewSiteError('');
    setShowAddSiteModal(true);
  };

  const handleAddSiteModalSubmit = async (e) => {
    e.preventDefault();
    if (!newSiteUrlInput.trim()) return;

    const maxSites = getMaxSitesForPlan(tenantPlan);
    if (sites && sites.length >= maxSites) {
      setNewSiteError(`Your plan allows up to ${maxSites} website(s). Please upgrade to add more domains!`);
      return;
    }

    let formattedUrl = newSiteUrlInput.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    setIsAddingNewSite(true);
    setNewSiteError('');

    try {
      let currentDomain = formattedUrl.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];
      const newSiteObj = await onAddSite(currentDomain, '#6366f1');

      if (newSiteObj) {
        setSelectedSiteId(newSiteObj.id);
        setShowAddSiteModal(false);
        setIsAddingNewSite(false);
        await runSynchronousCrawlAndIndex(newSiteObj, formattedUrl);
      } else {
        setNewSiteError('Could not add this website. Please verify domain name.');
        setIsAddingNewSite(false);
      }
    } catch (err) {
      setNewSiteError(`Error: ${err.message}`);
      setIsAddingNewSite(false);
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
    try {
      await fetch(`${window.location.origin}/api/crawler/update`, {
        method: 'POST',
        headers: await authenticatedHeaders(),
        body: JSON.stringify({
          site_id: activeSite.id,
          tenant_id: activeSite.tenant_id,
          url: editingPage.url,
          content: editingPage.content
        })
      });
      setSelectedUrls(prev => new Set(prev).add(editingPage.url));
      setEditingPage(null);
    } catch (e) {
      alert("Error saving page content.");
      setEditingPage(prev => ({ ...prev, saving: false }));
    }
  };

  // Send test message directly to live /api/chat inside preview modal
  const handleSendPreviewChat = async () => {
    if (!previewInput.trim() || previewStreaming || !activeSite) return;

    const userText = previewInput.trim();
    setPreviewInput('');
    setPreviewMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setPreviewStreaming("Thinking...");

    let assistantText = '';
    let hasAssistantBubble = false;

    try {
      await fetchEventSource(`${window.location.origin}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          message: userText,
          tenant_public_key: activeSite.public_key,
          session_id: previewSessionId
        }),
        async onopen(res) {
          if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
             const errJson = await res.json().catch(() => ({}));
             throw new Error(errJson.error || `Error ${res.status}`);
          } else if (!res.ok) {
             throw new Error(`Error ${res.status}`);
          }
        },
        onmessage(ev) {
          if (ev.data === '[DONE]') return;
          try {
            const parsed = JSON.parse(ev.data);
            if (ev.event === 'tool_start' || ev.event === 'tool_end' || parsed.tool_call) {
              setPreviewStreaming("Searching knowledge base & formulating answer...");
            }
            if (parsed.text) {
              if (previewStreaming) setPreviewStreaming(false);
              assistantText = parsed.text;
              if (!hasAssistantBubble) {
                hasAssistantBubble = true;
                setPreviewMessages((prev) => [...prev, { role: 'assistant', text: assistantText }]);
              } else {
                setPreviewMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', text: assistantText };
                  return updated;
                });
              }
            }
          } catch (e) {}
        },
        onerror(err) {
          throw err;
        }
      });
    } catch (err) {
      setPreviewMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${err.message}` }]);
    } finally {
      setPreviewStreaming(false);
    }
  };

  const copyWidgetScript = (key) => {
    const snippet = `<script src="${window.location.origin}/widget.iife.js" data-tenant-key="${key}" data-api-url="${window.location.origin}/api/chat" data-theme-color="${activeSite?.theme_primary_color || '#6366f1'}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCopiedScriptKey(key);
    setTimeout(() => setCopiedScriptKey(null), 2000);
  };

  const themeColor = activeSite?.theme_primary_color || '#6366f1';

  return (
    <div className="space-y-8">
      {/* 1. HERO ONBOARDING (When no site exists) */}
      {(!activeSite || step !== 'dashboard') ? (
        <div className="relative max-w-2xl mx-auto mt-12">
          <div className="relative bg-dark-800/50 backdrop-blur-sm p-10 rounded-2xl border border-white/10 text-center shadow-lg overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-dark-700 border border-white/10 flex items-center justify-center mx-auto mb-6 text-brand-400 shadow-sm">
              <Globe className="w-8 h-8" />
            </div>
            
            <h2 className="text-3xl font-bold text-white tracking-tight mb-3">
              Deploy Your AI Assistant in 30 Seconds
            </h2>
            <p className="text-base text-gray-400 mb-10 max-w-lg mx-auto">
              Enter your website address. Our system will automatically crawl your site, learn your business, and configure your custom AI assistant.
            </p>

            <form onSubmit={handleAnalyzeSite} className="space-y-4">
              <div className="relative max-w-lg mx-auto">
                <Globe className="w-5 h-5 text-gray-400 absolute left-4 top-3.5" />
                <input
                  type="text"
                  placeholder="https://your-company.com or your-company.com"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  className="w-full bg-dark-900 border border-gray-700 text-white rounded-2xl pl-12 pr-4 py-3.5 text-sm outline-none focus:border-brand-500 transition-colors shadow-inner"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={!siteUrl || isAnalyzing}
                className="w-full max-w-lg mx-auto bg-brand-600 hover:bg-brand-500 text-white font-medium py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-900/40"
              >
                {isAnalyzing ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Analyzing your website...
                  </span>
                ) : (
                  <>Create My AI Assistant <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            {statusMsg && (
              <div className="mt-6 flex items-center justify-center gap-3 text-sm text-brand-400 font-medium bg-brand-500/10 p-3 rounded-xl border border-brand-500/20">
                {isAnalyzing && <RefreshCw className="w-4 h-4 animate-spin" />}
                {statusMsg}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 2. MAIN DASHBOARD CLIENT VIEW */
        <div className="space-y-8">
          {/* Multi-Site Selector Tabs (if more than 1 site exists) */}
          {sites && sites.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider shrink-0 mr-1">Websites:</span>
              {sites.map((s) => {
                const isSelected = activeSite?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSiteId(s.id)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 border ${
                      isSelected
                        ? 'bg-brand-600/20 text-white border-brand-500/40 shadow-sm'
                        : 'bg-dark-900/80 text-gray-400 border-white/5 hover:border-white/20 hover:text-gray-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                    <span>{s.domain}</span>
                  </button>
                );
              })}
              <button
                onClick={handleOpenAddSiteModal}
                className="text-xs text-brand-400 hover:text-brand-300 font-semibold px-2.5 py-1.5 rounded-xl border border-brand-500/20 hover:bg-brand-500/10 transition-all shrink-0"
              >
                + Add Website
              </button>
            </div>
          )}

          {/* Active Site Hero Card */}
          <div className="bg-dark-800/80 p-6 sm:p-8 rounded-2xl border border-white/5 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold shadow-md" style={{ backgroundColor: themeColor }}>
                  <Globe className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-2xl font-bold text-white tracking-tight">{activeSite.domain}</h2>
                    <span className="bg-emerald-500/15 text-emerald-400 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-emerald-500/20">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Assistant Active & Ready
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                    Public Key: <span className="font-mono text-indigo-300 bg-dark-900 px-2 py-0.5 rounded border border-white/5">{activeSite.public_key}</span>
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                <button
                  disabled={isCrawling}
                  onClick={() => setShowPreviewModal(true)}
                  className={`flex-1 sm:flex-initial text-white font-semibold px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                    isCrawling 
                      ? 'bg-gray-800 text-gray-400 cursor-not-allowed border border-white/10 opacity-70' 
                      : 'bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-brand-900/50 hover:scale-[1.02] active:scale-98'
                  }`}
                >
                  {isCrawling ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-brand-400" /> Indexing website...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" /> Test Live Assistant
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => {
                    if (isGuest) onRequireLogin();
                    else setShowIntegrationModal(true);
                  }}
                  className="bg-dark-900 hover:bg-gray-800 border border-white/10 text-gray-200 hover:text-white px-5 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <Code className="w-4 h-4 text-brand-400" /> Embed Widget
                </button>

                <button
                  onClick={handleRecrawlSite}
                  disabled={isCrawling}
                  className="bg-dark-900 hover:bg-gray-800 border border-white/10 text-gray-400 hover:text-white p-3 rounded-xl text-sm transition-all"
                  title="Re-scan and re-learn website"
                >
                  <RefreshCw className={`w-4 h-4 ${isCrawling ? 'animate-spin text-brand-400' : ''}`} />
                </button>

                <button
                  onClick={handleOpenAddSiteModal}
                  className="bg-dark-900 hover:bg-gray-800 border border-white/10 text-gray-400 hover:text-white px-3.5 py-3 rounded-xl text-xs font-medium transition-all"
                  title="Add another website"
                >
                  + Add Website
                </button>

                <button
                  onClick={() => setShowDeleteConfirmModal(true)}
                  className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 p-3 rounded-xl text-sm transition-all"
                  title="Delete this website"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick 3-Step Guided Roadmap */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/5">
              <div className="bg-dark-900/60 p-4 rounded-xl border border-white/5 flex items-center gap-3.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20 font-bold text-xs">
                  1
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    AI Knowledge Learned <Check className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-[11px] text-gray-400">{discoveredPages.filter(p => p.status === 'loaded').length || 1} pages indexed in memory</div>
                </div>
              </div>

              <div 
                onClick={() => !isCrawling && setShowPreviewModal(true)}
                className="bg-dark-900/60 hover:bg-dark-900 p-4 rounded-xl border border-white/5 flex items-center gap-3.5 cursor-pointer group transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center shrink-0 border border-brand-500/20 font-bold text-xs group-hover:scale-105 transition-transform">
                  2
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5 group-hover:text-brand-300">
                    Test Your Bot Live <ArrowUpRight className="w-3.5 h-3.5 text-brand-400" />
                  </div>
                  <div className="text-[11px] text-gray-400">Try live questions in sandbox preview</div>
                </div>
              </div>

              <div 
                onClick={() => {
                  if (isGuest) onRequireLogin();
                  else setShowIntegrationModal(true);
                }}
                className="bg-dark-900/60 hover:bg-dark-900 p-4 rounded-xl border border-white/5 flex items-center gap-3.5 cursor-pointer group transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20 font-bold text-xs group-hover:scale-105 transition-transform">
                  3
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5 group-hover:text-indigo-300">
                    Embed on Website <Code className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="text-[11px] text-gray-400">Copy 1-line script for your site</div>
                </div>
              </div>
            </div>
          </div>

          {/* Collapsible Section for Non-Essential / Advanced Settings */}
          <div className="bg-dark-800/40 rounded-2xl border border-white/5 overflow-hidden transition-all">
            <button
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="w-full p-5 sm:p-6 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-dark-700/80 border border-white/10 flex items-center justify-center text-indigo-400">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Advanced Settings & Knowledge Base
                  </h3>
                  <p className="text-xs text-gray-400">Customize bot personality, widget colors, lead capture, business summary, and individual page URLs.</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-brand-400 bg-brand-500/10 px-3.5 py-1.5 rounded-lg border border-brand-500/20">
                {showAdvancedSettings ? (
                  <>Hide Settings <ChevronUp className="w-4 h-4" /></>
                ) : (
                  <>Show Settings <ChevronDown className="w-4 h-4" /></>
                )}
              </div>
            </button>

            {showAdvancedSettings && (
              <div className="p-6 pt-2 border-t border-white/5 space-y-6 animate-in fade-in duration-300">
                {/* 1. Feature Toggles Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Lead Capture Toggle */}
                  <div className="bg-dark-900/60 p-5 rounded-xl border border-white/5 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                        <ShieldCheck className="w-4 h-4 text-brand-400" /> Lead Capture & Email Collection
                      </h4>
                      <p className="text-xs text-gray-400">
                        Automatically prompts visitors for email and contact info.
                      </p>
                    </div>

                    <button
                      onClick={() => onUpdateSiteSettings(activeSite.id, { enable_lead_capture: !activeSite.enable_lead_capture })}
                      className="p-1 cursor-pointer transition-transform hover:scale-105"
                    >
                      {activeSite.enable_lead_capture ? (
                        <ToggleRight className="w-9 h-9 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-9 h-9 text-gray-600" />
                      )}
                    </button>
                  </div>

                  {/* Widget Color */}
                  <div className="bg-dark-900/60 p-5 rounded-xl border border-white/5 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                        <Settings2 className="w-4 h-4 text-indigo-400" /> Widget Accent Color
                      </h4>
                      <p className="text-xs text-gray-400">Match your brand styling.</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={themeColor}
                        onChange={(e) => onUpdateSiteSettings(activeSite.id, { theme_primary_color: e.target.value })}
                        className="w-9 h-9 rounded-xl border-0 bg-transparent cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Bot Goal */}
                  <div className="bg-dark-900/60 p-5 rounded-xl border border-white/5 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-emerald-400" /> Primary Objective
                      </h4>
                      <p className="text-xs text-gray-400">AI conversation focus.</p>
                    </div>

                    <select
                      value={activeSite.bot_goal || 'support'}
                      onChange={(e) => onUpdateSiteSettings(activeSite.id, { bot_goal: e.target.value })}
                      className="bg-dark-800 border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none"
                    >
                      <option value="support">Information & Support</option>
                      <option value="lead">Lead Generation & Sales</option>
                    </select>
                  </div>

                  {/* Bot Tone */}
                  <div className="bg-dark-900/60 p-5 rounded-xl border border-white/5 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-emerald-400" /> Voice Tone
                      </h4>
                      <p className="text-xs text-gray-400">Personality & communication style.</p>
                    </div>

                    <select
                      value={activeSite.bot_tone || 'professionnel'}
                      onChange={(e) => onUpdateSiteSettings(activeSite.id, { bot_tone: e.target.value })}
                      className="bg-dark-800 border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none"
                    >
                      <option value="professionnel">Professional & Courteous</option>
                      <option value="amical">Warm & Friendly</option>
                    </select>
                  </div>

                  {/* PRO Integrations: Support Email & Calendar Link */}
                  <div className="bg-dark-900/60 p-5 rounded-xl border border-brand-500/20 flex flex-col gap-4 relative overflow-hidden">
                    {selectedTenant?.plan !== 'pro' && selectedTenant?.plan !== 'enterprise' && (
                      <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-4 text-center">
                        <Lock className="w-6 h-6 text-brand-400 mb-2" />
                        <h4 className="text-sm font-bold text-white">Pro Feature</h4>
                        <p className="text-xs text-gray-400 mb-3 max-w-[250px]">Upgrade to the Pro Appointment plan to unlock calendar integrations and support email forwarding.</p>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-5 h-5 text-brand-400" />
                      <h4 className="text-base font-bold text-white">Pro Integrations</h4>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <label className="text-xs font-semibold text-gray-400 mb-1 block">Support Email</label>
                        <input
                          type="email"
                          placeholder="support@yourcompany.com"
                          value={activeSite.support_email || ''}
                          onChange={(e) => onUpdateSiteSettings(activeSite.id, { support_email: e.target.value })}
                          className="w-full bg-dark-800 border border-white/10 text-white text-sm rounded-lg px-4 py-2.5 outline-none focus:border-brand-500/50"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Chatbot will send support requests here.</p>
                      </div>

                      <div className="flex-1">
                        <label className="text-xs font-semibold text-gray-400 mb-1 block">Calendar Link</label>
                        <input
                          type="url"
                          placeholder="https://calendly.com/your-name"
                          value={activeSite.calendar_link || ''}
                          onChange={(e) => onUpdateSiteSettings(activeSite.id, { calendar_link: e.target.value })}
                          className="w-full bg-dark-800 border border-white/10 text-white text-sm rounded-lg px-4 py-2.5 outline-none focus:border-brand-500/50"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Calendly, Cal.com, or Google Calendar link.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Website Summary Card */}
                <div className="bg-dark-900/60 p-5 sm:p-6 rounded-xl border border-white/5 space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <FileText className="w-4 h-4 text-emerald-400" /> AI Business Summary
                        </h4>
                        {(isLoadingSummary || isRegeneratingSummary) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" /> Generating Summary...
                          </span>
                        ) : siteSummary ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Check className="w-3 h-3" /> Summary Ready
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        High-level context injected into the system prompt to answer general business inquiries accurately.
                      </p>
                    </div>

                    <button
                      onClick={() => setShowSummaryEditor(!showSummaryEditor)}
                      className="text-xs font-semibold text-brand-400 bg-brand-500/10 px-3.5 py-1.5 rounded-lg border border-brand-500/20 hover:bg-brand-500/20 transition-all flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      {showSummaryEditor ? 'Collapse' : 'View / Edit Summary'}
                    </button>
                  </div>

                  {summarySuccessMsg && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-medium text-emerald-400 flex items-center gap-2 animate-in fade-in">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{summarySuccessMsg}</span>
                    </div>
                  )}

                  {showSummaryEditor && (
                    <div className="pt-3 border-t border-white/5 space-y-4">
                      <textarea
                        rows={5}
                        disabled={isLoadingSummary || isRegeneratingSummary}
                        value={
                          (isLoadingSummary || isRegeneratingSummary)
                            ? "Analyzing your business overview with our AI model... Please wait a few moments."
                            : siteSummary
                        }
                        onChange={(e) => setSiteSummary(e.target.value)}
                        placeholder="Enter business summary overview here or click regenerate..."
                        style={{ backgroundColor: '#090d16', color: '#f3f4f6' }}
                        className="w-full bg-dark-950 border border-white/10 text-gray-100 placeholder-gray-500 rounded-xl p-4 text-xs leading-relaxed outline-none focus:border-brand-500 transition-colors font-mono shadow-inner"
                      />

                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                        <button
                          disabled={isLoadingSummary || isRegeneratingSummary}
                          onClick={handleRegenerateSummary}
                          className="w-full sm:w-auto bg-dark-800 hover:bg-gray-700 border border-white/10 text-gray-300 hover:text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-brand-400 ${(isLoadingSummary || isRegeneratingSummary) ? 'animate-spin' : ''}`} />
                          Regenerate with AI
                        </button>

                        <button
                          disabled={isLoadingSummary || isRegeneratingSummary || isSavingSummary || !siteSummary.trim()}
                          onClick={handleSaveSummary}
                          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
                        >
                          {isSavingSummary ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save Summary
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Knowledge Base / Indexed Pages Management */}
                <div id="knowledge-base-section" className="bg-dark-900/60 p-5 sm:p-6 rounded-xl border border-white/5 space-y-4 scroll-mt-24">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-400" /> Knowledge Base & Page Management
                      </h4>
                      <p className="text-xs text-gray-400">Select which discovered website URLs are indexed into the vector database.</p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="relative flex-1 sm:w-60">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          placeholder="Filter URLs or titles..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-dark-950 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-brand-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-white/5 bg-dark-950/60 shadow-inner">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-dark-800/80 text-gray-400 uppercase tracking-wider border-b border-white/5">
                        <tr>
                          <th className="py-2.5 px-4 font-semibold w-12 text-center">Active</th>
                          <th className="py-2.5 px-4 font-semibold">Page Title</th>
                          <th className="py-2.5 px-4 font-semibold">URL Path</th>
                          <th className="py-2.5 px-4 font-semibold text-right">Status & Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-gray-300">
                        {discoveredPages
                          .filter(p => p.url.toLowerCase().includes(searchQuery.toLowerCase()) || (p.title && p.title.toLowerCase().includes(searchQuery.toLowerCase())))
                          .map((page) => {
                            const currentStatus = page.status || (selectedUrls.has(page.url) ? 'loaded' : 'disabled');
                            const isIncluded = currentStatus === 'loaded' || currentStatus === 'loading';

                            return (
                              <tr
                                key={page.url}
                                className={`hover:bg-white/[0.03] transition-colors ${isIncluded ? 'bg-brand-500/5' : 'opacity-75'}`}
                              >
                                <td className="py-2.5 px-4 text-center">
                                  <input 
                                    type="checkbox" 
                                    checked={isIncluded} 
                                    onChange={() => handleTogglePageActivation(page.url)}
                                    className="w-4 h-4 rounded accent-brand-500 cursor-pointer" 
                                  />
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="font-medium text-white line-clamp-1">{page.title || 'Untitled Page'}</div>
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="text-gray-400 font-mono truncate max-w-[200px]" title={page.url}>
                                    {page.url.replace(`https://${activeSite?.domain}`, '') || '/'}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-right space-x-2">
                                  <button 
                                    onClick={(e) => handleEditPage(page.url, e)}
                                    className="text-[10px] bg-dark-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded border border-white/10 transition-colors"
                                  >
                                    Edit
                                  </button>

                                  <button
                                    onClick={() => handleTogglePageActivation(page.url)}
                                    className={`text-[10px] px-2 py-1 rounded font-semibold border transition-colors ${
                                      isIncluded
                                        ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20'
                                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                                    }`}
                                  >
                                    {isIncluded ? 'Disable' : 'Enable'}
                                  </button>

                                  {currentStatus === 'protected' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                      <Lock className="w-2.5 h-2.5" /> Auth Protected
                                    </span>
                                  ) : currentStatus === 'empty' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-dark-900 text-gray-400 border border-gray-700/60">
                                      Empty (0 chunks)
                                    </span>
                                  ) : currentStatus === 'loading' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                      <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Indexing...
                                    </span>
                                  ) : currentStatus === 'loaded' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      <Check className="w-2.5 h-2.5" /> Indexed
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20">
                                      Disabled
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
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. DEDICATED LEARNING PROGRESS MODAL (POPUP WITH PROGRESS BAR) */}
      {showLearningModal && (
        <div className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card p-8 sm:p-10 rounded-3xl w-full max-w-lg border border-white/10 shadow-2xl relative text-center overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            {/* Background Glow */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-brand-500/20 blur-[90px] pointer-events-none" />

            {/* AI Avatar / Radar */}
            <div className="relative mx-auto mb-6 flex justify-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-2xl shadow-brand-500/30 border border-white/20">
                {learningStep === 4 ? (
                  <CheckCircle2 className="w-10 h-10 text-emerald-300" />
                ) : (
                  <Bot className="w-10 h-10 text-white animate-pulse" />
                )}
              </div>
            </div>

            {/* Title & Description */}
            <h3 className="text-2xl font-bold text-white mb-2">
              {learningStep === 4 ? "🎉 Your AI Assistant is Ready!" : `Teaching Your AI from ${learningDomain || 'Website'}`}
            </h3>
            <p className="text-sm text-gray-400 mb-8 max-w-md mx-auto">
              {learningStep === 4
                ? `Our system successfully crawled, indexed, and synthesized your website content. You can now test it live!`
                : `Our system is analyzing your website pages, extracting content & services, and training your custom 24/7 AI chatbot.`}
            </p>

            {/* Progress Bar */}
            <div className="space-y-2 mb-8 text-left">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-gray-300 flex items-center gap-2">
                  {learningStep < 4 && <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-400" />}
                  {crawlProgressMsg || "Processing website..."}
                </span>
                <span className="text-brand-400 font-mono">{learningProgress}%</span>
              </div>
              <div className="w-full h-3 bg-dark-900 rounded-full overflow-hidden border border-white/10 p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-500 shadow-sm"
                  style={{ width: `${learningProgress}%` }}
                />
              </div>
            </div>

            {/* Step Checklist */}
            <div className="bg-dark-900/70 p-4 rounded-2xl border border-white/5 text-left space-y-3 mb-8">
              <div className="flex items-center gap-3 text-xs">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${learningStep >= 2 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-brand-500/20 text-brand-400 animate-pulse'}`}>
                  {learningStep >= 2 ? <Check className="w-3 h-3" /> : '1'}
                </div>
                <span className={learningStep >= 2 ? 'text-gray-300 font-medium' : 'text-white font-semibold'}>
                  Discovering all website pages & sitemap
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${learningStep >= 3 ? 'bg-emerald-500/20 text-emerald-400' : learningStep === 2 ? 'bg-brand-500/20 text-brand-400 animate-pulse' : 'bg-gray-800 text-gray-500'}`}>
                  {learningStep >= 3 ? <Check className="w-3 h-3" /> : '2'}
                </div>
                <span className={learningStep >= 3 ? 'text-gray-300 font-medium' : learningStep === 2 ? 'text-white font-semibold' : 'text-gray-500'}>
                  Extracting text & building semantic vector index
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${learningStep >= 4 ? 'bg-emerald-500/20 text-emerald-400' : learningStep === 3 ? 'bg-brand-500/20 text-brand-400 animate-pulse' : 'bg-gray-800 text-gray-500'}`}>
                  {learningStep >= 4 ? <Check className="w-3 h-3" /> : '3'}
                </div>
                <span className={learningStep >= 4 ? 'text-gray-300 font-medium' : learningStep === 3 ? 'text-white font-semibold' : 'text-gray-500'}>
                  Synthesizing AI Business Summary
                </span>
              </div>
            </div>

            {/* Completion Buttons */}
            {learningStep === 4 ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    setShowLearningModal(false);
                    setShowPreviewModal(true);
                  }}
                  className="flex-1 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold py-3.5 px-6 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-brand-900/40 transition-all hover:scale-[1.02] active:scale-98"
                >
                  <Eye className="w-4 h-4" /> Test My Bot Now →
                </button>
                <button
                  onClick={() => setShowLearningModal(false)}
                  className="bg-dark-800 hover:bg-gray-700 text-gray-300 hover:text-white font-semibold py-3.5 px-5 rounded-xl text-sm transition-all"
                >
                  Go to Dashboard
                </button>
              </div>
            ) : (
              <div className="text-xs text-gray-500">
                Please keep this window open while we finish learning your site...
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. FULL-SCREEN LIVE SITE PREVIEW WITH FUNCTIONAL CHATBOT */}
      {showPreviewModal && activeSite && (
        <div className="fixed inset-0 z-[999999] w-screen h-screen bg-black flex flex-col">
          {/* Top Control Bar */}
          <div className="h-14 px-6 bg-dark-900 border-b border-white/10 flex items-center justify-between text-white shrink-0">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  if (isGuest) onRequireLogin();
                }}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all"
              >
                ← Back to Dashboard
              </button>
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 font-mono">
                <Globe className="w-4 h-4 text-emerald-400" /> https://{activeSite.domain}
              </div>
            </div>

            {/* Viewport Switcher & New Tab Button */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-dark-800 p-1 rounded-xl border border-white/5">
                <button
                  onClick={() => setPreviewViewport('desktop')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    previewViewport === 'desktop' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5" /> Desktop
                </button>
                <button
                  onClick={() => setPreviewViewport('mobile')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    previewViewport === 'mobile' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Mobile
                </button>
              </div>

              <a
                href={`${window.location.origin}/preview.html?domain=${encodeURIComponent(activeSite.domain)}&tenant_key=${encodeURIComponent(activeSite.public_key)}&theme_color=${encodeURIComponent(themeColor)}&api_url=${encodeURIComponent(`${window.location.origin}/api/chat`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl flex items-center gap-2 transition-all border border-white/5 shadow-sm"
                title="Open site preview with chatbot"
              >
                <ExternalLink className="w-3.5 h-3.5 text-brand-400" />
                <span className="hidden sm:inline">Open in new tab</span>
              </a>
            </div>

            <button
              onClick={() => {
                setShowPreviewModal(false);
                if (isGuest) onRequireLogin();
              }}
              className="text-gray-400 hover:text-white p-2 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Viewport */}
          <div className="flex-1 bg-gray-950 flex items-center justify-center relative overflow-hidden">
            <div
              className={`h-full transition-all duration-300 relative ${
                previewViewport === 'mobile' ? 'w-[390px] h-[780px] my-auto rounded-3xl border-8 border-gray-800 overflow-hidden shadow-2xl' : 'w-full h-full'
              }`}
            >
              <iframe
                src={activeSite.domain.startsWith('http') ? activeSite.domain : `https://${activeSite.domain}`}
                className="w-full h-full border-0 bg-white"
                title="Website Preview"
              />

              {/* LIVE FUNCTIONAL CHATBOT WIDGET OVERLAY */}
              <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 z-[100000] flex flex-col items-end max-w-[calc(100vw-24px)]">
                {/* Chat Panel Modal */}
                {previewChatOpen && (
                  <div className="w-[calc(100vw-24px)] sm:w-[380px] h-[70vh] sm:h-[520px] max-h-[600px] bg-dark-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-3 sm:mb-4 animate-in fade-in slide-in-from-bottom-4">
                    {/* Header */}
                    <div className="p-4 bg-dark-800 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-md"
                          style={{ backgroundColor: themeColor }}
                        >
                          AI
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">Virtual Assistant</div>
                          <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Live on {activeSite.domain}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setPreviewChatOpen(false)} className="text-gray-400 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Messages Feed */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
                      {previewMessages.map((m, idx) => {
                        if (m.role === 'tool') {
                          return (
                            <div key={idx} className="mr-auto my-1.5 p-3 rounded-xl bg-indigo-950/80 border border-brand-500/30 font-mono text-[11px] text-brand-300 space-y-1 shadow-inner animate-in fade-in">
                              <div className="flex items-center gap-1.5 font-bold text-brand-400">
                                <span>🛠️ Tool Call:</span>
                                <span className="bg-brand-500/20 px-1.5 py-0.5 rounded text-white">{m.tool_call.name}</span>
                              </div>
                              {m.tool_call.name === 'search_knowledge_base' && (
                                <div className="space-y-1">
                                  <div>🔍 Search keywords: "{m.tool_call.keywords || m.tool_call.query}"</div>
                                  <div className="text-[10px] text-gray-400 mb-1">📄 {m.tool_call.matched_chunks} chunks matched ({m.tool_call.sources?.length || 0} sources)</div>
                                  {m.tool_call.sources && m.tool_call.sources.length > 0 && (
                                    <div className="mt-1 flex flex-col gap-1">
                                      {m.tool_call.sources.map((src, i) => (
                                        <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="text-[9px] text-indigo-400 hover:text-indigo-300 truncate max-w-[200px] flex items-center gap-1 bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-500/20">
                                          🔗 {src.replace(`https://${activeSite.domain}`, '') || '/'}
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              {m.tool_call.name === 'capture_lead' && (
                                <div className="space-y-0.5">
                                  <div>👤 Lead captured: {m.tool_call.lead?.name || m.tool_call.lead?.email || m.tool_call.lead?.phone || 'Visitor'}</div>
                                  <div className="text-[10px] text-emerald-400">✓ Saved in Supabase database</div>
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={idx}
                            className={`max-w-[85%] p-3 rounded-xl leading-relaxed ${
                              m.role === 'user'
                                ? 'ml-auto bg-gradient-to-r from-brand-600 to-indigo-600 text-white rounded-br-none shadow-md'
                                : 'mr-auto bg-dark-800 text-gray-200 border border-white/5 rounded-bl-none shadow-md prose prose-invert prose-sm max-w-none'
                            }`}
                          >
                            {m.role === 'user' ? m.text : (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  a: ({ node, ...props }) => (
                                    <a {...props} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 underline font-semibold transition-colors" />
                                  ),
                                  strong: ({ node, ...props }) => (
                                    <strong {...props} className="font-bold text-white" />
                                  ),
                                  ul: ({ node, ...props }) => (
                                    <ul {...props} className="list-disc pl-4 my-1.5 space-y-1" />
                                  ),
                                  ol: ({ node, ...props }) => (
                                    <ol {...props} className="list-decimal pl-4 my-1.5 space-y-1" />
                                  ),
                                  li: ({ node, ...props }) => (
                                    <li {...props} className="text-gray-200 leading-relaxed" />
                                  ),
                                  code: ({ node, inline, ...props }) => (
                                    inline
                                      ? <code {...props} className="bg-white/10 text-brand-200 text-[11px] px-1.5 py-0.5 rounded font-mono" />
                                      : <code {...props} className="block bg-black/40 text-gray-200 p-2 rounded text-[11px] font-mono overflow-x-auto my-1.5 border border-white/5" />
                                  ),
                                  p: ({ node, ...props }) => (
                                    <p {...props} className="mb-2 last:mb-0 leading-relaxed" />
                                  )
                                }}
                              >
                                {m.text}
                              </ReactMarkdown>
                            )}
                          </div>
                        );
                      })}

                      {/* Typing indicator dots when AI is thinking */}
                      {previewStreaming && (
                        <div className="mr-auto bg-dark-800 text-gray-400 border border-white/5 rounded-xl rounded-bl-none p-3 max-w-[200px] flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                          </div>
                          <span className="text-[10px] text-gray-500 italic">{typeof previewStreaming === 'string' ? previewStreaming : '...'}</span>
                        </div>
                      )}
                      <div ref={chatMessagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 bg-dark-800 border-t border-white/10 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Ask your assistant anything..."
                        value={previewInput}
                        onChange={(e) => setPreviewInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendPreviewChat()}
                        className="flex-1 bg-dark-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-500"
                      />
                      <button
                        onClick={handleSendPreviewChat}
                        disabled={!previewInput.trim() || previewStreaming}
                        className="p-2 rounded-xl text-white disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                        style={{ backgroundColor: themeColor }}
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Floating Launcher Pill Button */}
                <button
                  onClick={() => setPreviewChatOpen(!previewChatOpen)}
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl shadow-2xl hover:scale-105 transition-transform"
                  style={{ backgroundColor: themeColor, boxShadow: `0 10px 25px -5px ${themeColor}88` }}
                >
                  💬
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. INTEGRATION MODAL */}
      {showIntegrationModal && activeSite && (() => {
        const activeIndexedPagesCount = discoveredPages.filter(p => p.status === 'loaded' || (selectedUrls && selectedUrls.has(p.url))).length;
        const allowedPagesForPlan = getMaxPagesForPlan(tenantPlan);
        const isOverPlanLimit = activeIndexedPagesCount > allowedPagesForPlan;

        return (
          <div className="fixed inset-0 z-[9999999] bg-black/80 flex items-center justify-center p-4 animate-in fade-in">
            <div className="glass-card p-6 sm:p-8 rounded-3xl w-full max-w-2xl border border-white/10 shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setShowIntegrationModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Code className="w-6 h-6 text-brand-400" /> Embed Widget on Your Website
              </h3>
              <p className="text-sm text-gray-400 mb-6">
                Copy this code snippet and paste it right before the closing <code className="text-indigo-300 font-mono text-xs bg-dark-800 px-1 py-0.5 rounded">&lt;/body&gt;</code> tag on any pages where you want the assistant to appear.
              </p>

              {/* PLAN LIMIT WARNING BANNER */}
              {isOverPlanLimit && (
                <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-left space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-xs">
                      <h4 className="font-bold text-white text-sm mb-1 flex items-center gap-2">
                        Plan Limit Exceeded ({activeIndexedPagesCount} / {allowedPagesForPlan} pages)
                      </h4>
                      <p className="text-amber-200/90 leading-relaxed">
                        Your website has <strong>{activeIndexedPagesCount} active pages</strong>, which exceeds your current <strong>{tenantPlan.toUpperCase()}</strong> plan limit of <strong>{allowedPagesForPlan} pages</strong>.
                      </p>
                      <p className="text-gray-300 mt-1">
                        To deploy to your live website, either <strong>upgrade your plan</strong> or <strong>deactivate {activeIndexedPagesCount - allowedPagesForPlan} extra page(s)</strong> in your Knowledge Base table.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-amber-500/20">
                    <button
                      onClick={() => {
                        setShowIntegrationModal(false);
                        setShowAdvancedSettings(true);
                        setTimeout(() => {
                          const kbTable = document.getElementById('knowledge-base-section');
                          if (kbTable) kbTable.scrollIntoView({ behavior: 'smooth' });
                        }, 200);
                      }}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-white bg-dark-900 border border-white/10 hover:bg-dark-800 transition-all"
                    >
                      Manage & Deactivate Pages
                    </button>

                    <button
                      onClick={() => {
                        setShowIntegrationModal(false);
                        if (onShowPricing) onShowPricing();
                      }}
                      className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-brand-600 hover:from-amber-400 hover:to-brand-500 shadow-md transition-all flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Upgrade Plan →
                    </button>
                  </div>
                </div>
              )}

              <div className="relative group">
                <pre className="bg-dark-900 border border-white/10 p-4 rounded-xl text-xs text-emerald-400 font-mono overflow-x-auto">
                  {`<script src="${window.location.origin}/widget.iife.js" data-tenant-key="${activeSite.public_key}" data-api-url="${window.location.origin}/api/chat" data-theme-color="${themeColor}"></script>`}
                </pre>
                <button
                  onClick={() => copyWidgetScript(activeSite.public_key)}
                  className="absolute top-3 right-3 bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-semibold backdrop-blur-md"
                >
                  {copiedScriptKey === activeSite.public_key ? <><Check className="w-4 h-4 text-emerald-400" /> Copied</> : <><Copy className="w-4 h-4" /> Copy Code</>}
                </button>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowIntegrationModal(false)}
                  className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all shadow-lg"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 6. EDIT PAGE CONTENT MODAL */}
      {editingPage && (
        <div className="fixed inset-0 z-[9999999] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-dark-900 p-6 rounded-2xl w-full max-w-3xl border border-white/10 shadow-2xl relative flex flex-col h-[80vh]">
            <button
              onClick={() => setEditingPage(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-white mb-1">Edit Indexed Knowledge Content</h3>
            <p className="text-xs text-gray-400 font-mono mb-4 truncate pr-10">{editingPage.url}</p>

            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <textarea
                value={editingPage.content}
                onChange={(e) => setEditingPage({ ...editingPage, content: e.target.value })}
                disabled={editingPage.saving || editingPage.content === 'Loading content...'}
                style={{ backgroundColor: '#090d16', color: '#f3f4f6' }}
                className="flex-1 w-full bg-dark-950 border border-white/10 rounded-xl p-4 text-sm text-gray-100 font-mono resize-none outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setEditingPage(null)}
                className="px-5 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePageContent}
                disabled={editingPage.saving || editingPage.content === 'Loading content...'}
                className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all shadow-sm flex items-center gap-2"
              >
                {editingPage.saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. NON-BLOCKING ADD WEBSITE MODAL */}
      {showAddSiteModal && (
        <div className="fixed inset-0 z-[9999999] bg-black/80 flex items-center justify-center p-4 animate-in fade-in">
          <div className="glass-card p-8 rounded-3xl w-full max-w-lg border border-white/10 shadow-2xl relative">
            <button
              onClick={() => setShowAddSiteModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Globe className="w-6 h-6 text-brand-400" /> Add a New Website
            </h3>
            <p className="text-sm text-gray-400 mb-6">
              Connect another website to your account without interrupting your active assistant.
            </p>

            {newSiteError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl p-3">
                ⚠️ {newSiteError}
              </div>
            )}

            <form onSubmit={handleAddSiteModalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-2">Website URL / Domain</label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-gray-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="https://second-company.com"
                    value={newSiteUrlInput}
                    onChange={(e) => setNewSiteUrlInput(e.target.value)}
                    style={{ backgroundColor: '#090d16', color: '#f3f4f6' }}
                    className="w-full bg-dark-950 border border-white/10 text-gray-100 placeholder-gray-500 rounded-xl pl-10 pr-4 py-2.5 text-xs outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSiteModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingNewSite || !newSiteUrlInput.trim()}
                  className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md disabled:opacity-50"
                >
                  {isAddingNewSite ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Adding & Learning...</>
                  ) : (
                    <>Add & Learn Website →</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. DELETE WEBSITE CONFIRMATION MODAL */}
      {showDeleteConfirmModal && activeSite && (
        <div className="fixed inset-0 z-[9999999] bg-black/80 flex items-center justify-center p-4 animate-in fade-in">
          <div className="glass-card p-8 rounded-3xl w-full max-w-md border border-red-500/30 shadow-2xl relative text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">
              Delete Website?
            </h3>
            <p className="text-sm text-gray-400 mb-6 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">{activeSite.domain}</strong>? All indexed knowledge pages, business summaries, and the chatbot API key will be permanently removed.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={isDeletingSite}
                onClick={() => setShowDeleteConfirmModal(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-gray-300 hover:text-white bg-dark-900 border border-white/10 hover:bg-dark-800 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingSite}
                onClick={handleConfirmDeleteSite}
                className="bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-red-900/40 disabled:opacity-50"
              >
                {isDeletingSite ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
                ) : (
                  <><Trash2 className="w-3.5 h-3.5" /> Delete Permanently</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. LARGE WEBSITE PAGE SELECTION REVIEW MODAL (Never a silent miss) */}
      {showPageSelectionModal && (
        <div className="fixed inset-0 z-[9999999] bg-black/85 flex items-center justify-center p-4 animate-in fade-in">
          <div className="glass-card p-6 sm:p-8 rounded-3xl w-full max-w-3xl border border-amber-500/30 shadow-2xl relative flex flex-col max-h-[88vh]">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Large Website ({pendingCrawlPages.length} Pages Discovered)
                  </h3>
                  <p className="text-xs text-gray-400">
                    Your current <strong>{tenantPlan.toUpperCase()}</strong> plan includes up to <strong>{getMaxPagesForPlan(tenantPlan)} pages</strong>. Select which pages to index or upgrade your plan.
                  </p>
                </div>
              </div>

              <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                selectedUrls.size > getMaxPagesForPlan(tenantPlan)
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
              }`}>
                {selectedUrls.size} / {getMaxPagesForPlan(tenantPlan)} pages selected
              </span>
            </div>

            {/* Quick Actions & Search */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-white/5">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter pages by URL or title..."
                  value={pageSelectionSearch}
                  onChange={(e) => setPageSelectionSearch(e.target.value)}
                  style={{ backgroundColor: '#090d16', color: '#f3f4f6' }}
                  className="w-full bg-dark-950 border border-white/10 text-gray-100 placeholder-gray-500 rounded-xl pl-8 pr-3 py-1.5 text-xs outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const topN = pendingCrawlPages.slice(0, getMaxPagesForPlan(tenantPlan));
                    setSelectedUrls(new Set(topN.map(p => p.url)));
                  }}
                  className="text-xs text-gray-300 hover:text-white bg-dark-800 hover:bg-dark-700 px-3 py-1.5 rounded-lg border border-white/10 transition-colors"
                >
                  Select Top {getMaxPagesForPlan(tenantPlan)}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUrls(new Set())}
                  className="text-xs text-gray-400 hover:text-white bg-dark-800 hover:bg-dark-700 px-3 py-1.5 rounded-lg border border-white/10 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Scrollable Page Checklist */}
            <div className="flex-1 overflow-y-auto min-h-0 my-3 divide-y divide-white/5 rounded-xl border border-white/5 bg-dark-950/60">
              {pendingCrawlPages
                .filter(p => p.url.toLowerCase().includes(pageSelectionSearch.toLowerCase()) || (p.title && p.title.toLowerCase().includes(pageSelectionSearch.toLowerCase())))
                .map((page, idx) => {
                  const isChecked = selectedUrls.has(page.url);
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedUrls(prev => {
                          const next = new Set(prev);
                          if (next.has(page.url)) {
                            next.delete(page.url);
                          } else {
                            if (next.size >= getMaxPagesForPlan(tenantPlan)) {
                              alert(`Your plan allows up to ${getMaxPagesForPlan(tenantPlan)} pages. Please upgrade or uncheck another page.`);
                              return next;
                            }
                            next.add(page.url);
                          }
                          return next;
                        });
                      }}
                      className={`p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.03] transition-colors ${
                        isChecked ? 'bg-brand-500/5' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-brand-600 bg-dark-800 border-white/20 focus:ring-0 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{page.title || page.url}</div>
                          <div className="text-[11px] text-gray-400 font-mono truncate">{page.url}</div>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                        isChecked ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-gray-800 text-gray-400'
                      }`}>
                        {isChecked ? 'Selected' : 'Skipped'}
                      </span>
                    </div>
                  );
                })}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={() => {
                  setShowPageSelectionModal(false);
                  if (onShowPricing) onShowPricing();
                }}
                className="w-full sm:w-auto text-xs text-amber-300 hover:text-amber-200 font-semibold flex items-center gap-1.5 px-3 py-2"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Upgrade plan for unlimited pages →
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowPageSelectionModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedUrls.size === 0 || selectedUrls.size > getMaxPagesForPlan(tenantPlan)}
                  onClick={handleConfirmSelectedPagesAndScan}
                  className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg disabled:opacity-50"
                >
                  Confirm & Index Selected Pages ({selectedUrls.size}) →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
