import React, { useState, useEffect, useMemo } from 'react';
import { MessageSquare, Search, RefreshCw, User, Sparkles, ChevronLeft, AlertCircle, FileText, Wrench, Check, EyeOff, Loader2, Undo2 } from 'lucide-react';
import useConversations from './useConversations';
import { appendAdditionalInfo } from '../../lib/knowledge-notes';

/**
 * What visitors actually asked the assistant.
 *
 * The dashboard could show an owner how many pages were read and how many
 * leads came in, but not the one thing that tells them whether any of it is
 * working: the questions people are asking and the answers they got back.
 * Every one of those exchanges was already being written to `messages` — it
 * just had nowhere to be read.
 */
export default function ConversationsPage({ tenantId, sites = [], onBack, onImproveKnowledge }) {
  const { conversations, isLoading, error, truncated, reload, resolveMissingInfo } = useConversations(tenantId);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  // Below lg the list and the transcript share the screen, so only one can be
  // on it. Auto-selecting the newest conversation is right for the two-pane
  // desktop layout, but on a phone it would drop the owner straight into a
  // transcript with no way back to the list — so the transcript takes over
  // the screen only once they've actually opened one.
  const [openedByUser, setOpenedByUser] = useState(false);
  const [onlyNeedsAttention, setOnlyNeedsAttention] = useState(false);

  const needsAttentionCount = useMemo(
    () => conversations.filter((c) => c.needsAttention).length,
    [conversations]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (onlyNeedsAttention && !c.needsAttention) return false;
      if (!q) return true;
      return c.messages.some((m) => m.content?.toLowerCase().includes(q));
    });
  }, [conversations, query, onlyNeedsAttention]);

  // Land on the most recent conversation so the page opens on something to
  // read rather than an empty right-hand pane.
  useEffect(() => {
    if (!filtered.length) {
      setSelectedId(null);
      setOpenedByUser(false);
      return;
    }
    if (!filtered.some((c) => c.sessionId === selectedId)) {
      setSelectedId(filtered[0].sessionId);
      setOpenedByUser(false);
    }
  }, [filtered, selectedId]);

  const selected = filtered.find((c) => c.sessionId === selectedId) || null;

  // Only worth naming the website when the tenant has more than one; with a
  // single site it's the same word on every row.
  const showSiteName = sites.length > 1;
  const domainForSite = (siteId) => sites.find((site) => site.id === siteId)?.domain || null;

  // Which website an answer typed here belongs to. Messages carry their own
  // site_id, but older rows predate that column — a single-site tenant has
  // only one possible answer, so fall back to it rather than refusing to save.
  const siteForMessage = (message) =>
    sites.find((site) => site.id === message.site_id) ||
    sites.find((site) => site.id === selected?.siteId) ||
    (sites.length === 1 ? sites[0] : null);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-700 border border-brand-500/20 shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-dark-900">Conversations</h2>
            <p className="text-xs text-gray-500 truncate">
              {needsAttentionCount > 0
                ? `${needsAttentionCount} of these your assistant couldn't answer`
                : 'What your visitors asked, and how your assistant answered'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={reload}
            disabled={isLoading}
            className="text-xs text-gray-500 hover:text-dark-900 bg-surface-200 hover:bg-surface-300 px-3 py-1.5 rounded-lg border border-dark-900/10 flex items-center gap-1.5 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={onBack}
            className="text-xs text-gray-500 hover:text-dark-900 bg-surface-200 hover:bg-surface-300 px-3 py-1.5 rounded-lg border border-dark-900/10"
          >
            ← <span className="hidden sm:inline">Back to Dashboard</span><span className="sm:hidden">Back</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 rounded-2xl text-sm text-red-700 bg-red-50 border border-red-200">
          {error}
        </div>
      )}

      {!error && !isLoading && conversations.length === 0 && (
        <div className="glass-card p-10 rounded-2xl text-center">
          <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-dark-900 mb-1">No conversations yet</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Once your assistant is installed and a visitor asks it something, the
            whole exchange shows up here.
          </p>
        </div>
      )}

      {conversations.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-4">
          {/* Conversation list */}
          <div className={`glass-card rounded-2xl overflow-hidden ${openedByUser ? 'hidden lg:block' : ''}`}>
            <div className="p-3 border-b border-dark-900/5 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search what was said..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl pl-8 pr-3 py-1.5 text-xs text-dark-900 outline-none focus:border-brand-500"
                />
              </div>

              {needsAttentionCount > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyNeedsAttention((v) => !v)}
                  aria-pressed={onlyNeedsAttention}
                  className={`w-full text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
                    onlyNeedsAttention
                      ? 'bg-amber-500/15 text-amber-800 border-amber-500/30'
                      : 'bg-surface-200 text-gray-600 border-dark-900/10 hover:bg-surface-300'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  {needsAttentionCount} couldn't be answered
                </button>
              )}
            </div>

            <div className="max-h-[60vh] lg:max-h-[70vh] overflow-y-auto divide-y divide-dark-900/5">
              {filtered.length === 0 && (
                <p className="p-6 text-xs text-gray-500 text-center">
                  {onlyNeedsAttention && !query.trim()
                    ? 'Every conversation here was answered.'
                    : `Nothing matches "${query}".`}
                </p>
              )}
              {filtered.map((c) => (
                <button
                  key={c.sessionId}
                  onClick={() => { setSelectedId(c.sessionId); setOpenedByUser(true); }}
                  className={`w-full text-left p-3.5 transition-colors hover:bg-dark-900/[0.03] ${
                    c.sessionId === selectedId ? 'bg-brand-500/5 border-l-2 border-l-brand-500' : 'border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="text-xs font-semibold text-dark-900 line-clamp-2">{c.title}</div>
                  <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span>{formatWhen(c.lastAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{c.visitorMessageCount} {c.visitorMessageCount === 1 ? 'question' : 'questions'}</span>
                    {c.needsAttention && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 border border-amber-500/25 font-semibold">
                        <AlertCircle className="w-2.5 h-2.5" /> Unanswered
                      </span>
                    )}
                  </div>
                  {(c.pageUrl || (showSiteName && domainForSite(c.siteId))) && (
                    <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1 min-w-0">
                      <FileText className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">
                        {showSiteName && domainForSite(c.siteId) ? `${domainForSite(c.siteId)} ` : ''}
                        {describePage(c.pageUrl)}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {truncated && (
              <p className="p-3 text-[11px] text-gray-500 border-t border-dark-900/5">
                Showing your most recent conversations. Older ones aren't listed here.
              </p>
            )}
          </div>

          {/* Transcript */}
          <div className={`glass-card rounded-2xl overflow-hidden ${openedByUser ? '' : 'hidden lg:block'}`}>
            {selected ? (
              <>
                <div className="p-4 border-b border-dark-900/5 flex items-start gap-3">
                  <button
                    onClick={() => setOpenedByUser(false)}
                    className="lg:hidden text-gray-500 hover:text-dark-900 p-1 -ml-1 shrink-0"
                    aria-label="Back to all conversations"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-dark-900 line-clamp-1">{selected.title}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{formatWhen(selected.startedAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{selected.messages.length} messages</span>
                      {selected.pageUrl && (
                        <>
                          <span aria-hidden="true">·</span>
                          <a
                            href={selected.pageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-700 hover:underline inline-flex items-center gap-1 min-w-0"
                            title={selected.pageUrl}
                          >
                            <FileText className="w-3 h-3 shrink-0" />
                            <span className="truncate">{describePage(selected.pageUrl)}</span>
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-3 max-h-[60vh] lg:max-h-[70vh] overflow-y-auto bg-surface-100/60">
                  {selected.messages.map((m) => (
                    <div key={m.id} className={`flex gap-2.5 ${m.role === 'user' ? '' : 'flex-row-reverse'}`}>
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${
                          m.role === 'user'
                            ? 'bg-surface-200 text-gray-600 border-dark-900/10'
                            : 'bg-brand-500/10 text-brand-700 border-brand-500/20'
                        }`}
                        title={m.role === 'user' ? 'Visitor' : 'Your assistant'}
                      >
                        {m.role === 'user' ? <User className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                      </div>
                      <div className="max-w-[85%]">
                        <div
                          className={`p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words border ${
                            m.role === 'user'
                              ? 'bg-white text-dark-900 border-dark-900/10 rounded-tl-none'
                              : 'bg-brand-500/[0.07] text-gray-700 border-brand-500/15 rounded-tr-none'
                          }`}
                        >
                          {m.content}
                        </div>
                        {answerNote(m) && (
                          <div className="mt-1 flex flex-col items-end gap-1.5">
                            <div className="text-[10.5px] text-amber-800 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" /> {answerNote(m)}
                            </div>
                            <KnowledgeGapActions
                              message={m}
                              site={siteForMessage(m)}
                              onResolve={resolveMissingInfo}
                              onImproveKnowledge={onImproveKnowledge}
                              pageUrl={selected.pageUrl}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-10 text-center text-xs text-gray-500">
                Pick a conversation to read it.
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * What an owner can do about a question their assistant couldn't answer.
 *
 * The old answer was a single "Fix this in Knowledge" button that dropped
 * them on the dashboard with a page URL to re-crawl — which only helps when
 * the answer already exists somewhere on the website. Most of the time it
 * doesn't: the owner simply knows the answer. So the primary action is now to
 * type it, right here, into the site's Additional Information (a real,
 * searchable part of the assistant's knowledge — see lib/knowledge-notes.js),
 * and the gap is marked handled in the same gesture.
 *
 * 'Ignore' is the other honest outcome — out of scope, spam, a question the
 * owner doesn't want answered — and it matters as much as answering: without
 * it the unanswered count is a ratchet that only goes up.
 */
function KnowledgeGapActions({ message, site, onResolve, onImproveKnowledge, pageUrl }) {
  const [isWriting, setIsWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  const status = message.missing_info_status;

  if (status) {
    return (
      <div className="text-[10.5px] flex items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 font-semibold ${status === 'added' ? 'text-emerald-700' : 'text-gray-500'}`}>
          {status === 'added' ? <Check className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {status === 'added' ? 'Answer added to your assistant' : 'Ignored'}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onResolve(message.id, null);
            setBusy(false);
          }}
          className="text-gray-500 hover:text-dark-900 inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Undo2 className="w-3 h-3" /> Undo
        </button>
      </div>
    );
  }

  const save = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setFailure('');

    // The gap is only marked handled once the knowledge write actually
    // succeeded — marking first would quietly retire a question whose answer
    // never made it into the assistant.
    const saved = await appendAdditionalInfo(site, text);
    if (!saved.ok) {
      setFailure(saved.error);
      setBusy(false);
      return;
    }

    const marked = await onResolve(message.id, 'added');
    setBusy(false);
    if (!marked.ok) {
      setFailure(marked.error);
      return;
    }
    setIsWriting(false);
    setDraft('');
  };

  if (isWriting) {
    return (
      <div className="w-full sm:w-[22rem] bg-white border border-brand-500/25 rounded-xl p-2.5 space-y-2">
        <label className="text-[10.5px] font-semibold text-gray-600 block">
          What should your assistant have said?
        </label>
        <textarea
          autoFocus
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={message.missing_info ? `e.g. ${message.missing_info} — write the answer here.` : 'Write the answer in your own words…'}
          className="w-full bg-surface-100 border border-gray-300 rounded-lg px-2.5 py-2 text-xs text-dark-900 outline-none focus:border-brand-500 resize-y"
        />
        <p className="text-[10px] text-gray-500">
          Saved to your assistant's <strong>Additional Information</strong>. It can use this the next time someone asks.
        </p>
        {failure && <p className="text-[10px] text-red-600">{failure}</p>}
        {!site && <p className="text-[10px] text-red-600">Pick which website this belongs to from the dashboard first.</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy || !draft.trim() || !site}
            className="text-[10.5px] font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {busy ? 'Saving…' : 'Save to knowledge'}
          </button>
          <button
            type="button"
            onClick={() => { setIsWriting(false); setFailure(''); }}
            disabled={busy}
            className="text-[10.5px] text-gray-500 hover:text-dark-900 px-2 py-1.5 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      <button
        type="button"
        onClick={() => setIsWriting(true)}
        className="text-[10.5px] font-semibold text-brand-700 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/20 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors"
      >
        <Wrench className="w-3 h-3" /> Answer this
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onResolve(message.id, 'ignored');
          setBusy(false);
        }}
        className="text-[10.5px] font-semibold text-gray-500 hover:text-dark-900 bg-surface-200 hover:bg-surface-300 border border-dark-900/10 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
      >
        <EyeOff className="w-3 h-3" /> Ignore
      </button>
      {onImproveKnowledge && (
        <button
          type="button"
          onClick={() => onImproveKnowledge(pageUrl || '')}
          className="text-[10.5px] text-gray-500 hover:text-brand-700 px-1.5 py-1 underline decoration-dotted underline-offset-2"
          title={pageUrl ? `Re-read "${pageUrl}" instead` : "Review what your assistant knows"}
        >
          Edit pages instead
        </button>
      )}
    </div>
  );
}

/**
 * The page a conversation started on, as an owner would refer to it: the path,
 * or "your home page" for the root. The domain is redundant on most rows —
 * it's their own website — so it's only added when they have more than one.
 */
function describePage(pageUrl) {
  if (!pageUrl) return 'Page not recorded';
  try {
    const { pathname } = new URL(pageUrl);
    return pathname === '/' || pathname === '' ? 'Home page' : pathname;
  } catch {
    return 'Page not recorded';
  }
}

/**
 * Why an answer fell short, in the owner's terms. 'no_match' is the useful
 * one: it's not that the assistant malfunctioned, it's that the website has
 * nothing on the subject — which is something they can fix.
 */
function answerNote(message) {
  // missing_info is the assistant's own account of the gap (via the
  // flag_unanswered_question tool) — more useful to an owner than the
  // generic line, so prefer it whenever it's there.
  if (message.answer_status === 'no_match') return message.missing_info || "Nothing on your website covered this";
  if (message.answer_status === 'failed') return "Your assistant couldn't answer this";
  return null;
}

/** Short, human date — today's conversations shouldn't read like log lines. */
function formatWhen(timestamp) {
  if (!timestamp) return 'Unknown time';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
