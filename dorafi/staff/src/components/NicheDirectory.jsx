import React, { useState } from 'react';
import { Link2, Copy, Check, ExternalLink } from 'lucide-react';
import { NICHE_REGISTRY, nicheUrl } from '@b2b-ai-chatbot/contracts';

/**
 * The segment landing pages and, more to the point, their links.
 *
 * These pages are unlisted: nothing in the customer-facing app links to them
 * and they ask not to be indexed, because they are outreach material — one
 * segment, one link — rather than something every customer should browse.
 * That makes "where do I get the link" a real question, and this is the
 * answer: the staff console, next to the tenants the outreach is aimed at.
 *
 * Read-only on purpose. A segment is a landing page in the codebase
 * (dorafi/admin/src/content/niches.js supplies the copy, NICHE_REGISTRY in
 * contracts the identity), so it ships with a deploy — there is nothing here
 * that could be edited at runtime without inventing a CMS to edit it with.
 */
export default function NicheDirectory() {
  const [copied, setCopied] = useState(null);

  const copy = async (niche) => {
    const url = nicheUrl(niche);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard permission can be refused (or unavailable over plain http).
      // The URL is on screen and selectable either way — don't pretend it
      // worked.
      window.prompt('Copy this link:', url);
      return;
    }
    setCopied(niche.view);
    setTimeout(() => setCopied((v) => (v === niche.view ? null : v)), 2000);
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Link2 className="w-4 h-4 text-brand-600" /> Niche landing pages
        </h2>
        <p className="text-xs text-gray-500 mt-1 max-w-2xl">
          One page per segment, reachable by link only — they are not linked
          anywhere in the product and are marked <code>noindex</code>. Send the
          link that matches the prospect; the page speaks their language and
          drops them into the normal onboarding.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {NICHE_REGISTRY.map((niche) => {
          const url = nicheUrl(niche);
          return (
            <article
              key={niche.view}
              className="rounded-xl border border-dark-900/10 bg-white p-4 space-y-3"
            >
              <div>
                <h3 className="text-sm font-semibold">{niche.label}</h3>
                <p className="text-xs text-gray-500">{niche.audience}</p>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">{niche.pitch}</p>

              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-[11px] bg-surface-100 border border-dark-900/10 rounded-lg px-2.5 py-1.5 text-gray-700">
                  {url}
                </code>
                <button
                  type="button"
                  onClick={() => copy(niche)}
                  className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg border border-dark-900/10 hover:bg-surface-100 flex items-center gap-1.5 transition-colors"
                  aria-label={`Copy the ${niche.label} link`}
                >
                  {copied === niche.view ? (
                    <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Copy</>
                  )}
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg border border-dark-900/10 hover:bg-surface-100 flex items-center gap-1.5 transition-colors"
                  aria-label={`Open the ${niche.label} page`}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
