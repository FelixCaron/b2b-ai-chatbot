import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

/** 8. DELETE WEBSITE CONFIRMATION MODAL */
export default function DeleteSiteModal({
  show,
  activeSite,
  isDeletingSite,
  deleteSiteError,
  onCancel,
  onConfirm
}) {
  if (!show || !activeSite) return null;

  return (
    <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white p-8 rounded-3xl w-full max-w-md border border-red-500/30 shadow-2xl relative text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-600 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <h3 className="text-xl font-bold text-dark-900 mb-2">
          Delete Website?
        </h3>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Are you sure you want to delete <strong className="text-dark-900">{activeSite.domain}</strong>? All indexed knowledge pages, business summaries, and the chatbot API key will be permanently removed.
        </p>

        {deleteSiteError && (
          <div className="mb-5 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs font-medium text-red-700 text-left flex items-start gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{deleteSiteError}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            disabled={isDeletingSite}
            onClick={onCancel}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:text-dark-900 bg-white border border-dark-900/10 hover:bg-surface-200 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeletingSite}
            onClick={onConfirm}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-900/40 disabled:opacity-50"
          >
            {isDeletingSite ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
            ) : deleteSiteError ? (
              <><RefreshCw className="w-3.5 h-3.5" /> Retry Delete</>
            ) : (
              <><Trash2 className="w-3.5 h-3.5" /> Delete Permanently</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
