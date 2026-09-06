import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react';

// The UI half of "a guest signed in with an email that already has an account"
// (ADR 057). App.jsx owns the state machine and the network calls; this file
// only renders the three states the user can land in on return from the
// magic link:
//
//   prompt      — TRANSFER_PROMPT. We know a workspace is waiting; ask before
//                 anything moves. The redeem call *is* the transfer (it is one
//                 transaction server-side), so the confirmation has to happen
//                 before it, not after.
//   at_limit    — TRANSFER_AT_LIMIT. The account has no room on its plan.
//                 Upgrading is the lead action; replacing an existing site is
//                 the escape hatch, behind a confirm that names what it
//                 destroys. The claim stays open server-side either way.
//   transferred — brief success notice.
//   duplicate   — the account already had this domain; nothing moved.
export default function WorkspaceTransfer({
  state,
  sites = [],
  busy = false,
  error = '',
  onConfirm,
  onDismiss,
  onUpgrade,
  onReplaceSite
}) {
  // Which site the user picked to sacrifice, and whether they have been shown
  // the destructive confirm for it yet. Local to this screen: nothing here is
  // worth lifting into App.jsx.
  const [replaceSiteId, setReplaceSiteId] = useState(null);
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  if (!state) return null;

  const domain = state.domain || 'your guest workspace';

  // --- Toasts: nothing to decide, just tell them what happened -------------
  if (state.phase === 'transferred' || state.phase === 'duplicate') {
    const transferred = state.phase === 'transferred';
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999999] flex items-center gap-3 bg-dark-800 border border-emerald-500/30 text-emerald-300 text-sm rounded-xl px-5 py-3 shadow-xl animate-in fade-in slide-in-from-bottom-4">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>
          {transferred
            ? `${domain} is now part of this account, with its pages and leads.`
            : `${domain} is already in this account — we opened the one you already had.`}
        </span>
        <button
          onClick={onDismiss}
          className="text-emerald-300/60 hover:text-emerald-200 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const shell = (children) => (
    <div className="fixed inset-0 z-[9999999] bg-black/80 flex items-center justify-center p-4">
      <div className="relative glass-card p-8 sm:p-10 rounded-3xl w-full max-w-lg border border-white/10 shadow-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/20 to-indigo-900/20 pointer-events-none" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );

  // --- TRANSFER_PROMPT ----------------------------------------------------
  if (state.phase === 'prompt') {
    return shell(
      <>
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-400 flex items-center justify-center text-white shadow-xl shadow-brand-500/30 mb-5">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Move {domain} into this account?</h2>
          <p className="text-gray-400 text-sm mt-2">
            You set this assistant up before signing in. We can move the website, its scanned
            pages and its captured leads into the account you just signed into. Your test
            conversations stay behind.
          </p>
        </div>

        {error && <p className="mb-4 text-center text-sm text-red-400">{error}</p>}

        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            disabled={busy}
            className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
          >
            {busy ? 'Moving…' : <>Yes, move it over <ArrowRight className="w-4 h-4" /></>}
          </button>
          <button
            onClick={onDismiss}
            disabled={busy}
            className="w-full text-gray-400 hover:text-white text-xs font-semibold py-2.5 rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            No thanks, leave it
          </button>
        </div>
      </>
    );
  }

  // --- TRANSFER_AT_LIMIT --------------------------------------------------
  const plan = state.plan || 'basic';
  const limit = state.limit ?? 1;
  const siteCount = state.siteCount ?? sites.length;
  const replaceTarget = sites.find((s) => s.id === replaceSiteId) || null;

  return shell(
    <>
      <div className="flex flex-col items-center text-center mb-7">
        <div className="w-14 h-14 rounded-2xl bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center text-yellow-400 mb-5">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-white">Your plan is full</h2>
        <p className="text-gray-400 text-sm mt-2">
          {domain} is ready to move into this account, but the {plan} plan covers{' '}
          {limit} website{limit > 1 ? 's' : ''} and you already have {siteCount}. Nothing has
          moved yet — we kept it waiting for you.
        </p>
      </div>

      {error && <p className="mb-4 text-center text-sm text-red-400">{error}</p>}

      <button
        onClick={onUpgrade}
        disabled={busy}
        className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
      >
        Upgrade and keep both <ArrowRight className="w-4 h-4" />
      </button>

      <div className="mt-6 pt-5 border-t border-white/10">
        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-3">
          Or replace an existing site
        </p>

        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {sites.length === 0 && (
            <p className="text-xs text-gray-500">No websites to replace in this account.</p>
          )}
          {sites.map((site) => (
            <label
              key={site.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                replaceSiteId === site.id
                  ? 'border-red-500/40 bg-red-500/10'
                  : 'border-white/5 bg-dark-900/60 hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="replace-site"
                className="accent-red-500"
                checked={replaceSiteId === site.id}
                onChange={() => {
                  setReplaceSiteId(site.id);
                  setConfirmingReplace(false);
                }}
                disabled={busy}
              />
              <span className="text-sm text-gray-200 truncate">{site.domain}</span>
            </label>
          ))}
        </div>

        {replaceTarget && !confirmingReplace && (
          <button
            onClick={() => setConfirmingReplace(true)}
            disabled={busy}
            className="mt-3 w-full text-xs font-semibold text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            Replace {replaceTarget.domain} with {domain}
          </button>
        )}

        {replaceTarget && confirmingReplace && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/30 p-4">
            <p className="text-xs text-red-200 leading-relaxed">
              This permanently deletes <span className="font-semibold">{replaceTarget.domain}</span>:
              all of its scanned pages, all of its captured leads, and its chat history. This
              cannot be undone. {domain} then takes its place.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onReplaceSite?.(replaceTarget.id)}
                disabled={busy}
                className="flex-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {busy ? 'Working…' : `Delete ${replaceTarget.domain} permanently`}
              </button>
              <button
                onClick={() => setConfirmingReplace(false)}
                disabled={busy}
                className="px-4 text-xs font-semibold text-gray-300 bg-white/5 hover:bg-white/10 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onDismiss}
        disabled={busy}
        className="mt-5 w-full text-gray-400 hover:text-white text-xs font-semibold py-2 rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50"
      >
        Decide later
      </button>
    </>
  );
}
