import React from 'react';
import { RotateCcw, X } from 'lucide-react';

/** 12. RESET WEBSITE CONFIRMATION MODAL
    Confirms, then gets out of the way: the reset itself (deleting indexed
    content, then re-crawling) runs in the background afterward — same as
    onboarding — so this modal doesn't sit open waiting on it. */
export default function ResetSiteModal({ show, activeSite, onCancel, onConfirm }) {
  if (!show || !activeSite) return null;

  return (
    <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white p-8 rounded-3xl w-full max-w-md border border-amber-500/30 shadow-2xl relative text-center">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-500 hover:text-dark-900 p-2 rounded-lg hover:bg-dark-900/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-700 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
          <RotateCcw className="w-7 h-7" />
        </div>

        <h3 className="text-xl font-bold text-dark-900 mb-2">Reset {activeSite.domain}?</h3>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          This clears everything your assistant has learned from this website — every indexed page and its business summary — and every customization: tone, goal, lead capture, integrations, widget color, and favicon. It then re-detects your brand and starts a fresh scan right away. Your install code, leads, and conversation history are not affected.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:text-dark-900 bg-white border border-dark-900/10 hover:bg-surface-200 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 text-white font-semibold px-6 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-900/30"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset & Re-scan
          </button>
        </div>
      </div>
    </div>
  );
}
