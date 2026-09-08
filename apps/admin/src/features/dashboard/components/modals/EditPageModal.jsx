import React from 'react';
import { X, RefreshCw } from 'lucide-react';

/** 6. EDIT PAGE CONTENT MODAL */
export default function EditPageModal({
  editingPage,
  onChangeContent,
  onSave,
  onClose
}) {
  if (!editingPage) return null;

  return (
    <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-2xl w-full max-w-3xl border border-dark-900/10 shadow-2xl relative flex flex-col h-[80vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-dark-900 p-2 rounded-lg hover:bg-dark-900/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-dark-900 mb-1">Edit what this page tells your assistant</h3>
        <p className="text-xs text-gray-500 font-mono mb-4 truncate pr-10">{editingPage.url}</p>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <textarea
            value={editingPage.content}
            onChange={(e) => onChangeContent(e.target.value)}
            disabled={editingPage.saving || editingPage.content === 'Loading content...'}
            className="flex-1 w-full bg-surface-100 border border-gray-300 text-dark-900 rounded-xl p-4 text-sm font-mono resize-none outline-none focus:border-brand-500 transition-colors disabled:opacity-60"
          />
        </div>

        <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-dark-900/10">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm text-gray-500 hover:text-dark-900 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={editingPage.saving || editingPage.content === 'Loading content...'}
            className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all shadow-sm flex items-center gap-2"
          >
            {editingPage.saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
