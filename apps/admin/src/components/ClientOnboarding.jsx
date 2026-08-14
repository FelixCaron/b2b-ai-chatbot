import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Globe, Eye, CheckCircle2, ArrowRight, Settings2, ShieldCheck, ToggleLeft, ToggleRight, Check, RefreshCw, Copy, Layers, Laptop, Smartphone, X, Send, Code, Lock, FileText, Save, Edit3 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import remarkGfm from 'remark-gfm';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://xuvueegdokgiyedwvmkm.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function ClientOnboarding({
  selectedTenant,
  sites,
  onAddSite,
  onUpdateSiteSettings,
  onDeleteDocumentUrls,
  onTriggerScan,
  isGuest,
  onRequireLogin
}) {
  const [localCreatedSite, setLocalCreatedSite] = useState(null);
  const activeSite = sites[0] || localCreatedSite;

  // Onboarding Step State
  const [siteUrl, setSiteUrl] = useState('');
  const [orgName, setOrgName] = useState(selectedTenant?.name || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedTheme, setDetectedTheme] = useState(null);
  const [step, setStep] = useState(activeSite ? 'dashboard' : 'input');

  // Sync step if activeSite changes
  useEffect(() => {
    if (activeSite && step === 'input') {
      setStep('dashboard');
    }
  }, [activeSite]);

  // Page Management & Selection State
  const [showPageManager, setShowPageManager] = useState(false);
  const [discoveredPages, setDiscoveredPages] = useState([]);
  const [selectedUrls, setSelectedUrls] = useState(new Set());
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlProgressMsg, setCrawlProgressMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [showIntegrationModal, setShowIntegrationModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPage, setEditingPage] = useState(null);

  // Synchronous crawl and index pipeline
  const runSynchronousCrawlAndIndex = async (siteObj, targetUrl) => {
    setIsCrawling(true);
    setShowPageManager(true);
    setStep('dashboard');

    setCrawlProgressMsg('Découverte de toutes les pages du site...');

    // 1. Instantly discover ALL pages via /api/crawl-site without waiting
    let pagesToScan = [{ url: targetUrl, title: 'Page d\'accueil', status: 'loading' }];
    setDiscoveredPages(pagesToScan);
    setSelectedUrls(new Set([targetUrl]));

    try {
      const crawlRes = await fetch(`${window.location.origin}/api/crawl-site`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    // Populate all discovered pages in loading state in the table right away!
    setDiscoveredPages(pagesToScan);
    setSelectedUrls(new Set(pagesToScan.map(p => p.url)));

    let loadedCount = 0;
    let protectedCount = 0;
    let emptyCount = 0;

    // 2. Scan each page: while loading, page shows 'loading'. Immediately when IT finishes loading, update its status row!
    for (let i = 0; i < pagesToScan.length; i++) {
      const page = pagesToScan[i];
      const cleanPath = page.url.replace(/^https?:\/\/[^\/]+/, '') || '/';
      const pct = Math.round(((i + 1) / pagesToScan.length) * 100);
      setCrawlProgressMsg(`Indexation page ${i + 1}/${pagesToScan.length} (${pct}%) : ${cleanPath}`);

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

      // Update status immediately as soon as THIS page finishes loading!
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
    }

    // Automatically generate website summary during onboarding / scan
    setCrawlProgressMsg('Génération du résumé IA de votre entreprise...');
    try {
      const summaryRes = await fetch(`${window.location.origin}/api/generate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      console.warn('[runSynchronousCrawlAndIndex] Summary generation warning:', sumErr);
    }
    await fetchSiteSummary();

    setCrawlProgressMsg(`✓ Scan terminé ! ${loadedCount} page(s) indexée(s)${protectedCount > 0 ? `, ${protectedCount} protégée(s)` : ''}${emptyCount > 0 ? `, ${emptyCount} vide(s)` : ''}.`);
    setIsCrawling(false);
  };




  const handleRecrawlSite = async () => {
    if (!activeSite || isCrawling) return;
    setIsCrawling(true);
    setShowPageManager(true);
    setCrawlProgressMsg('Nettoyage de l\'ancienne base de données...');

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
      // Deactivate & delete document chunks
      setDiscoveredPages(prev => prev.map(p => p.url === pageUrl ? { ...p, status: 'disabled' } : p));
      setSelectedUrls(prev => {
        const next = new Set(prev);
        next.delete(pageUrl);
        return next;
      });
      await onDeleteDocumentUrls(activeSite.id, [pageUrl]);
    } else {
      // Activate & Scan page
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
      const { data, error } = await supabase.from('documents').select('url, metadata').eq('site_id', activeSite.id);
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
                title = (u.pathname === '/' || u.pathname === '') ? "Page d'accueil" : u.pathname.replace(/^\//, '');
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
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [isRegeneratingSummary, setIsRegeneratingSummary] = useState(false);
  const [summarySuccessMsg, setSummarySuccessMsg] = useState('');
  const [showSummaryEditor, setShowSummaryEditor] = useState(false);

  const fetchSiteSummary = async () => {
    if (!activeSite?.id) return;
    try {
      const { data: sumData } = await supabase
        .from('site_summaries')
        .select('summary')
        .eq('site_id', activeSite.id)
        .maybeSingle();

      if (sumData?.summary) {
        setSiteSummary(sumData.summary);
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
      } else if (activeSite?.domain) {
        setSiteSummary('');
        // Trigger auto summary generation if no summary exists yet
        fetch(`${window.location.origin}/api/generate-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: activeSite.tenant_id,
            site_id: activeSite.id,
            url: activeSite.domain
          })
        }).then(res => res.json()).then(resData => {
          if (resData?.summary) setSiteSummary(resData.summary);
        }).catch(() => null);
      }

    } catch (err) {
      console.error('[fetchSiteSummary] Error:', err);
    }
  };

  const handleSaveSummary = async () => {
    if (!activeSite?.id || !siteSummary.trim()) return;
    setIsSavingSummary(true);
    try {
      const { error: sumErr } = await supabase.from('site_summaries').upsert({
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

      setSummarySuccessMsg('✓ Résumé enregistré avec succès !');
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
      const res = await fetch(`${window.location.origin}/api/generate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          setSummarySuccessMsg('✓ Résumé régénéré par IA avec succès !');
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
  const [previewChatOpen, setPreviewChatOpen] = useState(true); // Open chatbot by default in preview!
  const [previewMessages, setPreviewMessages] = useState([
    { role: 'assistant', text: 'Bonjour! Je suis l\'assistant virtuel de votre site. Posez-moi une question pour tester mes réponses en direct!' }
  ]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewStreaming, setPreviewStreaming] = useState(false);
  const chatMessagesEndRef = useRef(null);

  // Reset session and welcome message whenever activeSite changes
  useEffect(() => {
    if (activeSite) {
      setPreviewSessionId('preview_sess_' + Date.now());
      setPreviewMessages([
        { role: 'assistant', text: `Bonjour! Je suis l'assistant virtuel de ${activeSite.domain}. Posez-moi une question pour tester mes réponses en direct!` }
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
    setStatusMsg('Analyse de la charte graphique...');

    try {
      let currentDomain = formattedUrl.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];

      // 1. Detect theme color in background
      let brandColor = '#6366f1';
      try {
        const themeRes = await fetch(`${window.location.origin}/api/analyze-theme`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: formattedUrl })
        });
        if (themeRes.ok) {
          const themeData = await themeRes.json();
          if (themeData.primary_color) brandColor = themeData.primary_color;
          if (themeData.org_name) setOrgName(themeData.org_name);
        }
      } catch (_tErr) {}

      // 2. Add or fetch site in database
      const siteObj = await onAddSite(currentDomain, brandColor);

      if (siteObj) {
        setLocalCreatedSite(siteObj);
        setIsAnalyzing(false);
        // Switch immediately to dashboard & run synchronous crawling with progression messages!
        await runSynchronousCrawlAndIndex(siteObj, formattedUrl);
      } else {
        setStatusMsg('Erreur : Impossible d\'ajouter ce site.');
        setIsAnalyzing(false);
      }
    } catch (err) {
      console.error('Onboarding error:', err);
      setStatusMsg(`Erreur : ${err.message}`);
      setIsAnalyzing(false);
    }
  };

  const handleConfirmAndIndex = async () => {
    setStep('dashboard');
    setShowPreviewModal(true);
  };

  // Toggle single page selection & sync DB deletions
  const handleTogglePage = async (pageUrl) => {
    const next = new Set(selectedUrls);
    const wasSelected = next.has(pageUrl);

    if (wasSelected) {
      next.delete(pageUrl);
      if (primarySite) {
        await onDeleteDocumentUrls(primarySite.id, [pageUrl]);
      }
    } else {
      next.add(pageUrl);
      if (primarySite) {
        await onTriggerScan(primarySite.id, pageUrl, primarySite.tenant_id);
      }
    }
    setSelectedUrls(next);
  };

  const handleEditPage = async (pageUrl, e) => {
    e.stopPropagation();
    setEditingPage({ url: pageUrl, content: 'Chargement...', saving: false });
    try {
      const { data, error } = await supabase.from('documents').select('content').eq('site_id', activeSite.id).eq('url', pageUrl);
      if (error) throw error;
      const fullContent = data ? data.map(d => d.content).join('\n\n') : '';
      setEditingPage({ url: pageUrl, content: fullContent, saving: false });
    } catch (err) {
      setEditingPage({ url: pageUrl, content: 'Erreur de chargement.', saving: false });
    }
  };

  const handleSavePageContent = async () => {
    if (!editingPage) return;
    setEditingPage(prev => ({ ...prev, saving: true }));
    try {
      await fetch(`${window.location.origin}/api/update-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      alert("Erreur lors de la sauvegarde.");
      setEditingPage(prev => ({ ...prev, saving: false }));
    }
  };

  // Send test message directly to live /api/chat inside preview modal
  const handleSendPreviewChat = async () => {
    if (!previewInput.trim() || previewStreaming || !activeSite) return;

    const userText = previewInput.trim();
    setPreviewInput('');
    setPreviewMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setPreviewStreaming("Recherche dans la base de connaissances...");

    try {
      const res = await fetch(`${window.location.origin}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          tenant_public_key: activeSite.public_key,
          session_id: previewSessionId
        })
      });

      if (!res.ok) throw new Error(`Erreur ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      setPreviewStreaming("L'assistant rédige une réponse...");
      setPreviewMessages((prev) => [...prev, { role: 'assistant', text: '' }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.includes('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.tool_call) {
                setPreviewMessages((prev) => {
                  // Insert tool message before the empty assistant message placeholder
                  const updated = [...prev];
                  const lastMsg = updated[updated.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.text) {
                    updated.splice(updated.length - 1, 0, { role: 'tool', tool_call: parsed.tool_call });
                  } else {
                    updated.push({ role: 'tool', tool_call: parsed.tool_call });
                  }
                  return updated;
                });
              }
              if (parsed.text) {
                // Clear the loading string once we get the first chunk
                if (previewStreaming) setPreviewStreaming(false);
                assistantText = parsed.text;
                setPreviewMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', text: assistantText };
                  return updated;
                });
              }
            } catch (_e) {}
          }
        }
      }
    } catch (err) {
      setPreviewMessages((prev) => [...prev, { role: 'assistant', text: `Erreur: ${err.message}` }]);
    } finally {
      setPreviewStreaming(false);
    }
  };

  const copyWidgetScript = (key) => {
    const snippet = `<script src="${window.location.origin}/widget.iife.js" data-tenant-key="${key}" data-api-url="${window.location.origin}/api/chat" data-theme-color="${primarySite?.theme_primary_color || '#6366f1'}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCopiedScriptKey(key);
    setTimeout(() => setCopiedScriptKey(null), 2000);
  };

  const themeColor = activeSite?.theme_primary_color || '#6366f1';

  return (
    <div className="space-y-8">
      {/* HERO ONBOARDING (When no site exists) */}
      {(!activeSite || step !== 'dashboard') ? (
        <div className="relative max-w-2xl mx-auto mt-12">
          <div className="relative bg-dark-800/50 backdrop-blur-sm p-10 rounded-2xl border border-white/10 text-center shadow-lg overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-dark-700 border border-white/10 flex items-center justify-center mx-auto mb-6 text-brand-400 shadow-sm">
              <Globe className="w-8 h-8" />
            </div>
            
            <h2 className="text-3xl font-bold text-white tracking-tight mb-3">
              Déployez votre IA en 30 secondes
            </h2>
            <p className="text-base text-gray-400 mb-10 max-w-lg mx-auto">
              Entrez l'adresse de votre site. Notre système analysera automatiquement son contenu pour configurer votre assistant sur mesure.
            </p>

            {step === 'input' && (
              <form onSubmit={handleAnalyzeSite} className="space-y-4">
                <div className="relative max-w-lg mx-auto">
                  <Globe className="w-5 h-5 text-gray-400 absolute left-4 top-3.5" />
                  <input
                    type="text"
                    placeholder="https://votre-entreprise.com ou votre-entreprise.com"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    className="w-full bg-dark-900 border border-gray-700 text-white rounded-2xl pl-12 pr-4 py-3.5 text-sm outline-none focus:border-brand-500 transition-colors shadow-inner"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={!siteUrl || isAnalyzing}
                  className="w-full max-w-lg mx-auto bg-brand-600 hover:bg-brand-500 text-white font-medium py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Analyse intelligente de votre marque...
                    </span>
                  ) : (
                    <>Continuer <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            )}

            {step === 'confirm' && (
              <div className="space-y-6 text-left max-w-lg mx-auto bg-dark-900/80 p-6 rounded-2xl border border-white/5 shadow-inner">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Nom de votre entreprise / Organisation</label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full bg-dark-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
                  />
                </div>

                {detectedTheme && (
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-dark-800 border border-white/5">
                    <span className="text-xs text-gray-300 font-medium">Style de votre marque détecté :</span>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full border border-white/20 shadow-md" style={{ backgroundColor: detectedTheme.primary_color }}></span>
                      <span className="text-xs font-mono text-indigo-300">{detectedTheme.primary_color}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleConfirmAndIndex}
                  disabled={isIndexing}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                  {isIndexing ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Lecture & Apprentissage du site...
                    </span>
                  ) : (
                    <>Activer mon Assistant IA <CheckCircle2 className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            )}

            {statusMsg && (
              <div className="mt-6 flex items-center justify-center gap-3 text-sm text-brand-400 font-medium bg-brand-500/10 p-3 rounded-xl border border-brand-500/20">
                {isAnalyzing && <RefreshCw className="w-4 h-4 animate-spin" />}
                {statusMsg}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* MAIN DASHBOARD CLIENT VIEW */
        <div className="space-y-8">
          {/* Active Site Header & Fullscreen Preview Button */}
          <div className="bg-dark-800/80 p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-white/5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-sm" style={{ backgroundColor: themeColor }}>
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">{activeSite.domain}</h2>
                  <span className="bg-emerald-500/15 text-emerald-400 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-emerald-500/20">
                    <Check className="w-3.5 h-3.5" /> Assistant En Ligne
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Identifiant : <span className="font-mono text-indigo-300">{activeSite.public_key}</span>
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                disabled={isCrawling}
                onClick={() => setShowPreviewModal(true)}
                className={`flex-1 sm:flex-initial text-white font-medium px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm transition-all ${
                  isCrawling 
                    ? 'bg-gray-800 text-gray-400 cursor-not-allowed border border-white/10 opacity-70' 
                    : 'bg-brand-600 hover:bg-brand-500 shadow-brand-900/50'
                }`}
                title={isCrawling ? "Veuillez patienter pendant la fin du crawl" : "Aperçu Plein Écran & Test Live"}
              >
                {isCrawling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-brand-400" /> Crawl en cours...
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" /> Aperçu Plein Écran & Test Live
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  if (isGuest) onRequireLogin();
                  else setShowIntegrationModal(true);
                }}
                className="bg-dark-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all"
              >
                <Code className="w-4 h-4 text-gray-400" /> Intégrer à mon site
              </button>
              <button
                onClick={() => {
                  setSiteUrl('');
                  setStep('input');
                }}
                className="bg-dark-800 hover:bg-gray-700 border border-gray-700 text-gray-400 hover:text-white px-3 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1 transition-all"
                title="Configurer un nouveau site"
              >
                + Nouveau site
              </button>
            </div>
          </div>

          {/* Feature Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Feature 1: Prospect Capture Toggle (Opt-in) */}
            <div className="bg-dark-800/50 p-6 rounded-xl border border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-4 h-4 text-brand-400" /> Capture de Prospects
                </h3>
                <p className="text-xs text-gray-400">
                  Propose au client de transmettre son email.
                </p>
              </div>

              <button
                onClick={() => onUpdateSiteSettings(activeSite.id, { enable_lead_capture: !activeSite.enable_lead_capture })}
                className="p-1 cursor-pointer transition-transform hover:scale-105"
              >
                {activeSite.enable_lead_capture ? (
                  <ToggleRight className="w-10 h-10 text-emerald-400" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-gray-600" />
                )}
              </button>
            </div>

            {/* Feature 2: Brand Color Preference */}
            <div className="bg-dark-800/50 p-6 rounded-xl border border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                  <Settings2 className="w-4 h-4 text-indigo-400" /> Couleur du Widget
                </h3>
                <p className="text-xs text-gray-400">Personnalisez la couleur du bouton.</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => onUpdateSiteSettings(activeSite.id, { theme_primary_color: e.target.value })}
                  className="w-10 h-10 rounded-xl border-0 bg-transparent cursor-pointer"
                />
              </div>
            </div>

            {/* Feature 3: Bot Goal */}
            <div className="bg-dark-800/50 p-6 rounded-xl border border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-emerald-400" /> Objectif Principal
                </h3>
                <p className="text-xs text-gray-400">Comportement du bot.</p>
              </div>

              <select
                value={activeSite.bot_goal || 'support'}
                onChange={(e) => onUpdateSiteSettings(activeSite.id, { bot_goal: e.target.value })}
                className="bg-dark-900 border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none"
              >
                <option value="support">Information & Support</option>
                <option value="lead">Génération de Leads</option>
              </select>
            </div>

            {/* Feature 4: Bot Tone */}
            <div className="bg-dark-800/50 p-6 rounded-xl border border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-emerald-400" /> Ton de la Voix
                </h3>
                <p className="text-xs text-gray-400">Personnalité du bot.</p>
              </div>

              <select
                value={activeSite.bot_tone || 'professionnel'}
                onChange={(e) => onUpdateSiteSettings(activeSite.id, { bot_tone: e.target.value })}
                className="bg-dark-900 border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none"
              >
                <option value="professionnel">Professionnel & Courtois</option>
                <option value="amical">Chaleureux & Amical</option>
              </select>
            </div>
          </div>

          {/* Feature 5: Editable Website Summary Card */}
          <div className="bg-dark-800/50 p-6 rounded-xl border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" /> Résumé du site web & Aperçu entreprise
                </h3>
                <p className="text-xs text-gray-400">
                  Présentation synthétique transmise directement à l'IA lors de chaque conversation. Vous pouvez la consulter et la modifier ci-dessous.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSummaryEditor(!showSummaryEditor)}
                  className="text-xs font-semibold text-brand-400 bg-brand-500/10 px-3.5 py-1.5 rounded-lg border border-brand-500/20 hover:bg-brand-500/20 transition-all flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {showSummaryEditor ? 'Masquer' : 'Afficher / Modifier'}
                </button>
              </div>
            </div>

            {summarySuccessMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-medium text-emerald-400 flex items-center gap-2 animate-in fade-in">
                <Check className="w-4 h-4 shrink-0" />
                <span>{summarySuccessMsg}</span>
              </div>
            )}

            {showSummaryEditor && (
              <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
                <div className="relative">
                  <textarea
                    rows={6}
                    value={siteSummary}
                    onChange={(e) => setSiteSummary(e.target.value)}
                    placeholder="Aucun résumé disponible pour le moment. Entrez la présentation synthétique de votre entreprise ici ou régénérez par IA..."
                    className="w-full bg-dark-900 border border-white/10 text-white rounded-xl p-4 text-xs leading-relaxed outline-none focus:border-brand-500 transition-colors font-mono shadow-inner"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <button
                    disabled={isRegeneratingSummary}
                    onClick={handleRegenerateSummary}
                    className="w-full sm:w-auto bg-dark-900 hover:bg-gray-800 border border-white/10 text-gray-300 hover:text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-brand-400 ${isRegeneratingSummary ? 'animate-spin' : ''}`} />
                    {isRegeneratingSummary ? 'Génération IA en cours...' : 'Régénérer par IA depuis le site'}
                  </button>

                  <button
                    disabled={isSavingSummary || !siteSummary.trim()}
                    onClick={handleSaveSummary}
                    className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingSummary ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Enregistrer le résumé
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Collapsible Page Selection Drawer */}

          <div className="bg-dark-800/50 p-6 rounded-xl border border-white/5 space-y-4">
            <button
              onClick={() => setShowPageManager(!showPageManager)}
              className="w-full flex items-center justify-between text-left"
            >
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" /> Gérer la base de connaissances
                </h3>
                <p className="text-xs text-gray-400">Sélectionnez les pages web que votre assistant doit connaître.</p>
              </div>
              <span className="text-xs font-semibold text-brand-400 bg-brand-500/10 px-3 py-1.5 rounded-lg border border-brand-500/20">
                {showPageManager ? 'Masquer' : 'Afficher / Modifier'}
              </span>
            </button>

            {/* Real-time progression bar inside page management section */}
            {crawlProgressMsg && (
              <div className="p-3.5 bg-brand-500/10 border border-brand-500/20 rounded-xl text-xs font-medium text-brand-300 flex items-center justify-between shadow-inner animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  {isCrawling && <RefreshCw className="w-4 h-4 animate-spin text-brand-400 shrink-0" />}
                  <span>{crawlProgressMsg}</span>
                </div>
              </div>
            )}

            {showPageManager && (
              <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
                {discoveredPages.length === 0 && !isCrawling ? (
                  <div className="text-center py-8 bg-dark-900/40 rounded-xl border border-dashed border-white/10">
                    <p className="text-sm text-gray-400 mb-4">Aucune page indexée dans la base de données pour le moment.</p>
                    <button
                      disabled={isCrawling}
                      onClick={handleRecrawlSite}
                      className={`bg-brand-600 hover:bg-brand-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mx-auto transition-all shadow-lg shadow-brand-900/50 ${isCrawling ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <RefreshCw className={`w-4 h-4 ${isCrawling ? 'animate-spin' : ''}`} /> 
                      Lancer un scan et crawl complet du site
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                      <input
                        type="text"
                        placeholder="Rechercher une page par URL ou titre..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 bg-dark-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-brand-500 transition-colors"
                      />
                      <button
                        disabled={isCrawling}
                        onClick={handleRecrawlSite}
                        className={`bg-brand-600 hover:bg-brand-500 text-white px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all border border-brand-500/30 shadow-md ${isCrawling ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Efface les anciennes données et relance un crawl synchrone de toutes les pages"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isCrawling ? 'animate-spin' : ''}`} /> 
                        {isCrawling ? 'Re-scan en cours...' : 'Re-scanner & Rafraîchir le site'}
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 shadow-inner">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-dark-800/80 text-gray-400 text-xs uppercase tracking-wider border-b border-white/5">
                          <tr>
                            <th className="py-3 px-4 font-semibold w-12 text-center">Inclus</th>
                            <th className="py-3 px-4 font-semibold">Titre de la page</th>
                            <th className="py-3 px-4 font-semibold">URL</th>
                            <th className="py-3 px-4 font-semibold text-right">Statut & Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-gray-300">
                          {discoveredPages
                            .filter(p => p.url.toLowerCase().includes(searchQuery.toLowerCase()) || (p.title && p.title.toLowerCase().includes(searchQuery.toLowerCase())))
                            .sort((a, b) => {
                              const statusOrder = { loaded: 1, loading: 2, disabled: 3, empty: 4, protected: 5 };
                              const stA = a.status || (selectedUrls.has(a.url) ? 'loaded' : 'disabled');
                              const stB = b.status || (selectedUrls.has(b.url) ? 'loaded' : 'disabled');
                              const ordA = statusOrder[stA] || 3;
                              const ordB = statusOrder[stB] || 3;
                              if (ordA !== ordB) return ordA - ordB;
                              return a.url.localeCompare(b.url);
                            })
                            .map((page) => {
                            const currentStatus = page.status || (selectedUrls.has(page.url) ? 'loaded' : 'disabled');
                            const isIncluded = currentStatus === 'loaded' || currentStatus === 'loading';

                            return (
                              <tr
                                key={page.url}
                                className={`hover:bg-white/[0.03] transition-colors ${isIncluded ? 'bg-brand-500/5' : 'opacity-75'}`}
                              >
                                <td className="py-3 px-4 text-center">
                                  <input 
                                    type="checkbox" 
                                    checked={isIncluded} 
                                    onChange={() => handleTogglePageActivation(page.url)}
                                    className="w-4 h-4 rounded accent-brand-500 cursor-pointer" 
                                  />
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-medium text-white line-clamp-1">{page.title || 'Page sans titre'}</div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="text-xs text-gray-400 font-mono truncate max-w-[200px] sm:max-w-xs" title={page.url}>
                                    {page.url.replace(`https://${activeSite?.domain}`, '') || '/'}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-right space-x-2">
                                  <button 
                                    onClick={(e) => handleEditPage(page.url, e)}
                                    className="text-[10px] bg-dark-800 hover:bg-gray-700 text-gray-300 px-2.5 py-1.5 rounded-lg border border-white/10 transition-colors"
                                  >
                                    Éditer
                                  </button>

                                  {/* Activate / Deactivate Toggle Button */}
                                  <button
                                    onClick={() => handleTogglePageActivation(page.url)}
                                    className={`text-[10px] px-2.5 py-1.5 rounded-lg font-semibold border transition-colors ${
                                      isIncluded
                                        ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20'
                                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                                    }`}
                                  >
                                    {isIncluded ? 'Désactiver' : 'Activer'}
                                  </button>

                                  {/* Page Status Badge: loading | loaded | empty | protected | disabled */}
                                  {currentStatus === 'protected' ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20" title="Page protégée par mot de passe ou connexion / Auth Wall">
                                      <Lock className="w-3 h-3 text-rose-400" /> Protégé (Auth)
                                    </span>
                                  ) : currentStatus === 'empty' ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-dark-900 text-gray-400 border border-gray-700/60" title="Aucun contenu textuel extrait de cette page">
                                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span> Vide (0 chunk)
                                    </span>
                                  ) : currentStatus === 'loading' ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                      <RefreshCw className="w-3 h-3 animate-spin" /> Chargement...
                                    </span>
                                  ) : currentStatus === 'loaded' ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      <Check className="w-3 h-3" /> Indexé
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20">
                                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span> Désactivé
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULL-SCREEN LIVE SITE PREVIEW WITH FUNCTIONAL CHATBOT */}
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
                ← Retour au Dashboard
              </button>
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 font-mono">
                <Globe className="w-4 h-4 text-emerald-400" /> https://{activeSite.domain}
              </div>
            </div>

            {/* Viewport Switcher */}
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
                title="Aperçu Site Web"
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
                          <div className="text-sm font-bold text-white">Assistant Virtuel</div>
                          <div className="text-[11px] text-emerald-400">En ligne sur {activeSite.domain}</div>
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
                                <span>🛠️ Tool Call:</span>
                                <span className="bg-brand-500/20 px-1.5 py-0.5 rounded text-white">{m.tool_call.name}</span>
                              </div>
                              {m.tool_call.name === 'search_knowledge_base' && (
                                <div className="space-y-1">
                                  <div>🔍 Mots-clés RAG : "{m.tool_call.keywords || m.tool_call.query}"</div>
                                  <div className="text-[10px] text-gray-400 mb-1">📄 {m.tool_call.matched_chunks} blocs trouvés ({m.tool_call.sources?.length || 0} sources)</div>
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
                                  <div>👤 Lead extrait : {m.tool_call.lead?.name || m.tool_call.lead?.email || m.tool_call.lead?.phone || 'Prospect'}</div>
                                  <div className="text-[10px] text-emerald-400">✓ Enregistré dans Supabase</div>
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
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
                        placeholder="Posez une question à votre assistant..."
                        value={previewInput}
                        onChange={(e) => setPreviewInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendPreviewChat()}
                        className="flex-1 bg-dark-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-500"
                      />
                      <button
                        onClick={handleSendPreviewChat}
                        disabled={!previewInput.trim() || previewStreaming}
                        className="p-2 rounded-xl text-white disabled:opacity-50"
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

      {/* INTEGRATION MODAL */}
      {showIntegrationModal && activeSite && (
        <div className="fixed inset-0 z-[9999999] bg-black/80 flex items-center justify-center p-4">
          <div className="glass-card p-8 rounded-3xl w-full max-w-2xl border border-white/10 shadow-2xl relative">
            <button
              onClick={() => setShowIntegrationModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Code className="w-6 h-6 text-brand-400" /> Intégration sur votre site
            </h3>
            <p className="text-sm text-gray-400 mb-6">
              Copiez ce code et collez-le juste avant la balise de fermeture <code className="text-indigo-300 font-mono text-xs bg-dark-800 px-1 py-0.5 rounded">&lt;/body&gt;</code> de toutes les pages de votre site web où vous souhaitez afficher l'assistant.
            </p>

            <div className="relative group">
              <pre className="bg-dark-900 border border-white/10 p-4 rounded-xl text-xs text-emerald-400 font-mono overflow-x-auto">
                {`<script src="${window.location.origin}/widget.iife.js" data-tenant-key="${activeSite.public_key}" data-api-url="${window.location.origin}/api/chat" data-theme-color="${themeColor}"></script>`}
              </pre>
              <button
                onClick={() => copyWidgetScript(activeSite.public_key)}
                className="absolute top-3 right-3 bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-semibold backdrop-blur-md"
              >
                {copiedScriptKey === activeSite.public_key ? <><Check className="w-4 h-4 text-emerald-400" /> Copié</> : <><Copy className="w-4 h-4" /> Copier le code</>}
              </button>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowIntegrationModal(false)}
                className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all shadow-lg"
              >
                Terminer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PAGE MODAL */}
      {editingPage && (
        <div className="fixed inset-0 z-[9999999] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-dark-900 p-6 rounded-2xl w-full max-w-3xl border border-white/10 shadow-2xl relative flex flex-col h-[80vh]">
            <button
              onClick={() => setEditingPage(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-white mb-1">Modifier le contenu indexé</h3>
            <p className="text-xs text-gray-400 font-mono mb-4 truncate pr-10">{editingPage.url}</p>

            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <textarea
                value={editingPage.content}
                onChange={(e) => setEditingPage({ ...editingPage, content: e.target.value })}
                disabled={editingPage.saving || editingPage.content === 'Chargement...'}
                className="flex-1 w-full bg-dark-800 border border-white/10 rounded-xl p-4 text-sm text-gray-200 font-mono resize-none outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setEditingPage(null)}
                className="px-5 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleSavePageContent}
                disabled={editingPage.saving || editingPage.content === 'Chargement...'}
                className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all shadow-sm flex items-center gap-2"
              >
                {editingPage.saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
