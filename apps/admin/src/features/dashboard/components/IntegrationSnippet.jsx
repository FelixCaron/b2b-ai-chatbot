import React, { useState } from 'react';
import { Code, AlertTriangle, Check, Copy, X, Sparkles } from 'lucide-react';

export default function IntegrationSnippet({
  showIntegrationModal,
  setShowIntegrationModal,
  activeSite,
  themeColor,
  discoveredPages,
  selectedUrls,
  tenantPlan,
  getMaxPagesForPlan,
  onShowPricing,
  setShowAdvancedSettings
}) {
  const [copiedScriptKey, setCopiedScriptKey] = useState(null);

  if (!showIntegrationModal || !activeSite) return null;

  const copyWidgetScript = (key) => {
    const snippet = `<script src="${window.location.origin}/widget.iife.js" data-tenant-key="${key}" data-api-url="${window.location.origin}/api/chat" data-theme-color="${themeColor}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCopiedScriptKey(key);
    setTimeout(() => setCopiedScriptKey(null), 2000);
  };

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
                  if (setShowAdvancedSettings) setShowAdvancedSettings(true);
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
}
