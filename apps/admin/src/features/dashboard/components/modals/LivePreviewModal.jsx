import React, { useEffect, useRef, useState } from 'react';
import { Globe, ExternalLink, X } from 'lucide-react';
import api from '../../../../lib/api';
import { supabase } from '../../../../lib/supabase';
import { useT } from '../../../../i18n/LanguageContext';

/**
 * Full-screen preview of the customer's site with their assistant on it.
 *
 * This used to render a second, hand-built chat UI inside the dashboard —
 * its own header, message list, markdown renderer, input, typing indicator
 * and launcher — talking to /api/chat directly. That meant two chat
 * implementations to keep in step, and an owner could test one thing here
 * while their visitors saw another. It also surfaced the agent's internals
 * ("🛠️ Tool Call: search_knowledge_base", "✓ Saved in Supabase database"),
 * which is a debugging view, not a customer's view of their own product.
 *
 * Now this is a shell around public/preview.html, which injects the real
 * widget bundle. One implementation, so the preview cannot drift from
 * production. The only thing this component still has to do is hand the page
 * the owner's access token, because api/chat/index.js refuses a request from
 * any origin but the customer's registered domain unless it carries one.
 */
export default function LivePreviewModal({ show, activeSite, themeColor, onClose }) {
  const { t } = useT();
  const frameRef = useRef(null);
  const [previewSrc, setPreviewSrc] = useState(null);

  // Build the URL only while open, so closing the modal tears the iframe down
  // (and with it the widget's live session) instead of leaving it running.
  useEffect(() => {
    if (!show || !activeSite) {
      setPreviewSrc(null);
      return;
    }
    const params = new URLSearchParams({
      domain: activeSite.domain,
      tenant_key: activeSite.public_key,
      theme_color: themeColor || '',
      api_url: api.chat.endpointUrl()
    });
    setPreviewSrc(`${window.location.origin}/preview.html?${params.toString()}`);
  }, [show, activeSite?.id, activeSite?.public_key, activeSite?.domain, themeColor]);

  // preview.html announces itself when it's ready for the token; we answer
  // with the current session's access token, pinned to our own origin so it
  // can never reach the customer site rendered inside the nested iframe.
  useEffect(() => {
    if (!show) return;

    const onMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'dorafi:preview-ready') return;
      if (event.source !== frameRef.current?.contentWindow) return;

      let token = null;
      try {
        const { data } = await supabase.auth.getSession();
        token = data?.session?.access_token || null;
      } catch (err) {
        console.warn('[LivePreviewModal] could not read session for preview:', err);
      }
      event.source.postMessage(
        { type: 'dorafi:preview-auth', token },
        window.location.origin
      );
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [show]);

  if (!show || !activeSite) return null;

  return (
    <div className="fixed inset-0 z-[999999] w-screen h-screen bg-surface-100 flex flex-col">
      {/* Top Control Bar */}
      <div className="h-14 px-2.5 sm:px-6 glass-card rounded-none border-x-0 border-t-0 flex items-center justify-between text-dark-900 shrink-0 gap-1.5 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={onClose}
            className="bg-surface-200 hover:bg-surface-300 text-dark-700 text-xs font-semibold px-2.5 sm:px-4 py-2 rounded-xl flex items-center gap-1.5 sm:gap-2 transition-all shrink-0"
          >
            ← <span className="hidden sm:inline">{t('Back to Dashboard')}</span><span className="sm:hidden">{t('Back')}</span>
          </button>
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-500 font-mono min-w-0">
            <Globe className="w-4 h-4 text-emerald-600 shrink-0" /> <span className="truncate">https://{activeSite.domain}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <a
            href={`https://${activeSite.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-surface-200 hover:bg-surface-300 text-dark-700 text-xs font-semibold px-2.5 sm:px-3.5 py-1.5 rounded-xl flex items-center gap-2 transition-all border border-dark-900/10 shadow-sm"
            title={t('Open the live site in a new tab')}
          >
            <ExternalLink className="w-3.5 h-3.5 text-brand-600" />
            <span className="hidden sm:inline">{t('Open live site')}</span>
          </a>
        </div>

        <button
          onClick={onClose}
          className="text-gray-500 hover:text-dark-900 p-2 rounded-lg shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* The site, with the real widget on top of it */}
      <div className="flex-1 bg-white relative overflow-hidden">
        {previewSrc && (
          <iframe
            ref={frameRef}
            src={previewSrc}
            className="w-full h-full border-0 bg-white block"
            title={t('Assistant preview for {domain}', { domain: activeSite.domain })}
          />
        )}
      </div>
    </div>
  );
}
