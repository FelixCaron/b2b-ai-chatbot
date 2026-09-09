import React, { useEffect, useRef, useState } from 'react';
import { X, Code, AlertTriangle, Sparkles, Check, Copy, RefreshCw, ChevronDown } from 'lucide-react';
import { getMaxPagesForPlan } from '../../lib/plan-limits';
import { supabase } from '../../../../lib/supabase';

// Short, platform-specific "where do I paste this" instructions for
// non-technical site owners. Kept as plain data so new platforms can be
// added without touching the render logic.
const PLATFORM_GUIDES = [
  {
    id: 'wordpress',
    label: 'WordPress',
    steps: [
      'Install a header/footer script plugin, e.g. "WPCode" or "Insert Headers and Footers" (Plugins → Add New).',
      "Open the plugin's Footer scripts field.",
      'Paste the snippet in the footer field and save/publish.',
      "No plugin allowed? Ask your host or theme developer to add it to footer.php, just before </body>."
    ]
  },
  {
    id: 'wix',
    label: 'Wix',
    steps: [
      'Go to your site Dashboard → Settings → Custom Code (under "Advanced").',
      'Click "+ Add Custom Code" and paste the snippet.',
      'Set "Add Code to Pages" to All Pages, and "Place Code in" to Body - end.',
      'Click Apply, then publish your site.'
    ]
  },
  {
    id: 'squarespace',
    label: 'Squarespace',
    steps: [
      'Go to Settings → Advanced → Code Injection.',
      'Paste the snippet into the Footer box — this applies it to every page automatically.',
      'Save, then make sure your site is published.',
      'Note: Code Injection needs a Business or Commerce plan.'
    ]
  },
  {
    id: 'shopify',
    label: 'Shopify',
    steps: [
      'Go to Online Store → Themes, then click "Edit code" on your live theme.',
      'Open theme.liquid under the Layout folder.',
      'Paste the snippet right before the closing </body> tag.',
      'Save the file.'
    ]
  },
  {
    id: 'generic',
    label: 'Generic / raw HTML',
    steps: [
      "Open the HTML file(s) for your site, or your builder's page/template editor.",
      'Find the closing </body> tag near the bottom of the file.',
      'Paste the snippet immediately before </body>.',
      'Repeat on every page where the assistant should appear, then re-upload or publish.'
    ]
  }
];

/** 5. INTEGRATION MODAL */
export default function IntegrationModal({
  show,
  activeSite,
  tenantPlan,
  discoveredPages,
  selectedUrls,
  snippet,
  copied,
  onCopy,
  onClose,
  onManagePages,
  onShowPricing
}) {
  // Real signal, not a self-report: the widget itself calls api/chat/init on
  // load from the visitor's browser, and that route stamps
  // sites.widget_last_seen_at when the request's Origin is the site's own
  // domain (see api/chat/init.js). Polling for a change since the modal
  // opened is the same thing a "Checking installation..." spinner promises,
  // done for real instead of asking the tenant to just confirm they pasted
  // the snippet.
  const [installDetected, setInstallDetected] = useState(false);
  const openedAtRef = useRef(null);
  const [guidesOpen, setGuidesOpen] = useState(false);
  const [activePlatformId, setActivePlatformId] = useState(null);

  useEffect(() => {
    if (!show || !activeSite?.id) {
      setInstallDetected(false);
      openedAtRef.current = null;
      return;
    }

    openedAtRef.current = Date.now();
    setInstallDetected(false);

    let cancelled = false;
    const checkOnce = async () => {
      const { data } = await supabase
        .from('sites')
        .select('widget_last_seen_at')
        .eq('id', activeSite.id)
        .maybeSingle();
      if (cancelled || !data?.widget_last_seen_at) return;
      const seenAt = new Date(data.widget_last_seen_at).getTime();
      // Any sighting within the last 10 minutes counts — not just ones after
      // the modal opened, since a tenant who pasted the snippet and loaded
      // their site just before opening this modal shouldn't be told "not
      // installed" over a few seconds of timing.
      if (Date.now() - seenAt < 10 * 60 * 1000) {
        setInstallDetected(true);
      }
    };

    checkOnce();
    const interval = setInterval(checkOnce, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [show, activeSite?.id]);

  if (!show || !activeSite) return null;

  const activeIndexedPagesCount = discoveredPages.filter(p => p.status === 'loaded' || (selectedUrls && selectedUrls.has(p.url))).length;
  const allowedPagesForPlan = getMaxPagesForPlan(tenantPlan);
  const isOverPlanLimit = activeIndexedPagesCount > allowedPagesForPlan;

  return (
    <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white p-6 sm:p-8 rounded-3xl w-full max-w-2xl border border-dark-900/10 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-dark-900 p-2 rounded-lg hover:bg-dark-900/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-dark-900 mb-2 flex items-center gap-2">
          <Code className="w-6 h-6 text-brand-600" /> Add your assistant to your website
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          Copy this code snippet and paste it right before the closing <code className="text-brand-300 font-mono text-xs bg-dark-800 px-1 py-0.5 rounded">&lt;/body&gt;</code> tag on any pages where you want the assistant to appear.
        </p>

        {/* PLAN LIMIT WARNING BANNER */}
        {isOverPlanLimit && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-left space-y-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 text-xs">
                <h4 className="font-bold text-dark-900 text-sm mb-1 flex items-center gap-2">
                  Plan Limit Exceeded ({activeIndexedPagesCount} / {allowedPagesForPlan} pages)
                </h4>
                <p className="text-amber-800 leading-relaxed">
                  Your website has <strong>{activeIndexedPagesCount} active pages</strong>, which exceeds your current <strong>{tenantPlan.toUpperCase()}</strong> plan limit of <strong>{allowedPagesForPlan} pages</strong>.
                </p>
                <p className="text-gray-600 mt-1">
                  To deploy to your live website, either <strong>upgrade your plan</strong> or <strong>remove {activeIndexedPagesCount - allowedPagesForPlan} page(s)</strong> from your website content list.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-amber-500/20">
              <button
                onClick={onManagePages}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:text-dark-900 bg-white border border-dark-900/10 hover:bg-surface-200 transition-all"
              >
                Manage & Deactivate Pages
              </button>

              <button
                onClick={() => {
                  onClose();
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
            {snippet}
          </pre>
          <button
            onClick={onCopy}
            className="absolute top-3 right-3 bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-semibold backdrop-blur-md"
          >
            {copied ? <><Check className="w-4 h-4 text-emerald-400" /> Copied</> : <><Copy className="w-4 h-4" /> Copy Code</>}
          </button>
        </div>

        {/* HOW TO INSTALL ON MY PLATFORM (collapsible) */}
        <div className="mt-4 rounded-2xl border border-dark-900/10 bg-surface-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setGuidesOpen(o => !o)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-dark-900 hover:bg-dark-900/5 transition-colors"
          >
            <span>How to install on my platform</span>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${guidesOpen ? 'rotate-180' : ''}`} />
          </button>

          {guidesOpen && (
            <div className="px-4 pb-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {PLATFORM_GUIDES.map((platform) => (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => setActivePlatformId(id => (id === platform.id ? null : platform.id))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      activePlatformId === platform.id
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'bg-white border-dark-900/10 text-gray-500 hover:text-dark-900 hover:bg-white/60'
                    }`}
                  >
                    {platform.label}
                  </button>
                ))}
              </div>

              {activePlatformId && (
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-gray-500 bg-white border border-dark-900/10 rounded-xl p-3">
                  {PLATFORM_GUIDES.find((platform) => platform.id === activePlatformId).steps.map((step, index) => (
                    <li key={index} className="leading-relaxed">
                      <span className="text-dark-900">{step}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          {installDetected ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
              <Check className="w-3.5 h-3.5" /> Installation detected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking installation...
            </span>
          )}

          <button
            onClick={onClose}
            className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all shadow-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
