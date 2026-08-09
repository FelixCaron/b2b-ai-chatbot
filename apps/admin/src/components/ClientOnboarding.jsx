import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Globe, Eye, CheckCircle2, ArrowRight, Settings2, ShieldCheck, ToggleLeft, ToggleRight, Check, RefreshCw, Copy, Layers, Laptop, Smartphone, X, Send, Code } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SUPABASE_URL = "https://xuvueegdokgiyedwvmkm.supabase.co";

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
  const [isIndexing, setIsIndexing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [showIntegrationModal, setShowIntegrationModal] = useState(false);

  // Auto-fetch indexed pages when site changes
  useEffect(() => {
    if (!activeSite) return;
    async function fetchIndexedPages() {
      const { data } = await supabase.from('documents').select('url, metadata').eq('site_id', activeSite.id);
      if (data && data.length > 0) {
        const uniqueUrls = new Set();
        const pages = [];
        data.forEach(d => {
          if (!uniqueUrls.has(d.url)) {
            uniqueUrls.add(d.url);
            pages.push({ url: d.url, title: d.metadata?.title || d.url });
          }
        });
        setDiscoveredPages(pages);
        setSelectedUrls(new Set(pages.map(p => p.url)));
      }
    }
    fetchIndexedPages();
  }, [activeSite]);

  // Full-Screen Preview & Live Bot Testing State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewViewport, setPreviewViewport] = useState('desktop'); // 'desktop' | 'mobile'
  const [copiedScriptKey, setCopiedScriptKey] = useState(null);

  // Live Preview Chatbot State
  const [previewChatOpen, setPreviewChatOpen] = useState(true); // Open chatbot by default in preview!
  const [previewMessages, setPreviewMessages] = useState([
    { role: 'assistant', text: 'Bonjour! Je suis l\'assistant virtuel de votre site. Posez-moi une question pour tester mes réponses en direct!' }
  ]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewStreaming, setPreviewStreaming] = useState(false);
  const chatMessagesEndRef = useRef(null);

  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [previewMessages, previewChatOpen]);

  // 1-Click Seamless Onboarding: Client enters URL -> Assistant created & live preview opens!
  const handleAnalyzeSite = async (e) => {
    e.preventDefault();
    if (!siteUrl) return;

    let formattedUrl = siteUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
      setSiteUrl(formattedUrl);
    }

    setIsAnalyzing(true);
    setStatusMsg('Analyse du site web et apprentissage des connaissances...');

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

        // 3. Trigger initial scan & wait for indexing to complete
        await onTriggerScan(siteObj.id, formattedUrl).catch(() => null);

        // 4. Background crawling of discovered pages
        fetch(`${window.location.origin}/api/crawl-site`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: formattedUrl })
        })
          .then((r) => r.json())
          .then(async (crawlData) => {
            if (crawlData.pages && crawlData.pages.length > 0) {
              setDiscoveredPages(crawlData.pages);
              setSelectedUrls(new Set(crawlData.pages.map((p) => p.url)));
              for (const p of crawlData.pages) {
                await onTriggerScan(siteObj.id, p.url).catch(() => null);
              }
            }
          })
          .catch(() => null);

        setStatusMsg('✓ Assistant configuré avec succès !');
        setStep('dashboard');
        setShowPreviewModal(true); // Open live full-screen preview immediately!
      } else {
        setStatusMsg('Erreur : Impossible d\'ajouter ce site.');
      }
    } catch (err) {
      console.error('Onboarding error:', err);
      setStatusMsg(`Erreur : ${err.message}`);
    } finally {
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
        await onTriggerScan(primarySite.id, pageUrl);
      }
    }
    setSelectedUrls(next);
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
          session_id: 'preview_sess_' + Date.now()
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
        <div className="relative max-w-2xl mx-auto">
          {/* Animated Glow Backdrop */}
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-brand-600 via-indigo-500 to-emerald-500 opacity-30 blur-2xl animate-glow pointer-events-none"></div>

          <div className="relative glass-card p-8 rounded-3xl border border-brand-500/20 text-center shadow-2xl overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-400 flex items-center justify-center mx-auto mb-6 text-white shadow-xl shadow-brand-500/30">
              <Sparkles className="w-8 h-8" />
            </div>
            
            <h2 className="text-2xl font-extrabold text-white tracking-tight mb-2">
              Configurez votre Assistant IA en 30 secondes
            </h2>
            <p className="text-sm text-gray-400 mb-8">
              Entrez l'adresse de votre site web. Nous analysons automatiquement son contenu et sa charte graphique pour vous.
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
                  className="w-full max-w-lg mx-auto bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all"
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

            {statusMsg && <div className="mt-4 text-xs text-indigo-300 font-medium">{statusMsg}</div>}
          </div>
        </div>
      ) : (
        /* MAIN DASHBOARD CLIENT VIEW */
        <div className="space-y-8">
          {/* Active Site Header & Fullscreen Preview Button */}
          <div className="glass-card p-6 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-emerald-500/20 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold shadow-md" style={{ backgroundColor: themeColor }}>
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
                onClick={() => setShowPreviewModal(true)}
                className="flex-1 sm:flex-initial bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <Eye className="w-4 h-4" /> Aperçu Plein Écran & Test Live
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
            <div className="glass-card p-6 rounded-2xl flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-4 h-4 text-brand-400" /> Capture Automatique des Prospects
                </h3>
                <p className="text-xs text-gray-400">
                  Propose au client de transmettre son email ou téléphone en fin d'échange.
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
            <div className="glass-card p-6 rounded-2xl flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                  <Settings2 className="w-4 h-4 text-indigo-400" /> Couleur de Marque du Widget
                </h3>
                <p className="text-xs text-gray-400">Personnalisez la couleur du bouton de chat.</p>
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
          </div>

          {/* Collapsible Page Selection Drawer */}
          <div className="glass-card p-6 rounded-2xl">
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

            {showPageManager && (
              <div className="mt-6 pt-6 border-t border-white/5 space-y-4">
                {discoveredPages.length === 0 ? (
                  <div className="text-center py-8 bg-dark-900/40 rounded-xl border border-dashed border-white/10">
                    <p className="text-sm text-gray-400 mb-4">La base de données est vide pour le moment.</p>
                    <button
                      onClick={async () => {
                        const crawlRes = await fetch(`${window.location.origin}/api/crawl-site`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: `https://${activeSite.domain}` })
                        });
                        const crawlData = await crawlRes.json();
                        if (crawlData.pages) {
                          setDiscoveredPages(crawlData.pages);
                          setSelectedUrls(new Set(crawlData.pages.map((p) => p.url)));
                        }
                      }}
                      className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mx-auto transition-all shadow-lg shadow-brand-900/50"
                    >
                      <RefreshCw className="w-4 h-4" /> Lancer un scan complet du site
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 shadow-inner">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-dark-800/80 text-gray-400 text-xs uppercase tracking-wider border-b border-white/5">
                        <tr>
                          <th className="py-3 px-4 font-semibold w-12 text-center">Inclus</th>
                          <th className="py-3 px-4 font-semibold">Titre de la page</th>
                          <th className="py-3 px-4 font-semibold">URL</th>
                          <th className="py-3 px-4 font-semibold text-right">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-gray-300">
                        {discoveredPages.map((page) => {
                          const isSelected = selectedUrls.has(page.url);
                          return (
                            <tr
                              key={page.url}
                              onClick={() => handleTogglePage(page.url)}
                              className={`hover:bg-white/[0.03] transition-colors cursor-pointer ${isSelected ? 'bg-brand-500/5' : ''}`}
                            >
                              <td className="py-3 px-4 text-center">
                                <input 
                                  type="checkbox" 
                                  checked={isSelected} 
                                  readOnly 
                                  className="w-4 h-4 rounded accent-brand-500 cursor-pointer" 
                                />
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-medium text-white line-clamp-1">{page.title || 'Page sans titre'}</div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="text-xs text-gray-400 font-mono truncate max-w-[200px] sm:max-w-xs" title={page.url}>
                                  {page.url.replace(`https://${activeSite.domain}`, '') || '/'}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                {isSelected ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Indexé
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20">
                                    Ignoré
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                      {previewMessages.map((m, idx) => (
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
                      ))}

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
    </div>
  );
}
