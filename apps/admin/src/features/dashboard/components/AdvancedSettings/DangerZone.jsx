import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

/** 4. Danger Zone: Delete Website */
export default function DangerZone({ activeSite, onRequestDelete }) {
  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h4 className="text-sm font-bold text-red-600 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" /> Danger Zone: Delete Website
        </h4>
        <p className="text-xs text-gray-500 mt-1">
          Permanently remove <strong>{activeSite?.domain}</strong>, all indexed vector pages, custom business summaries, and revoke the public API key.
        </p>
      </div>

      <button
        type="button"
        onClick={onRequestDelete}
        className="bg-red-600/80 hover:bg-red-600 text-white font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shrink-0 shadow-md shadow-red-900/30 cursor-pointer"
      >
        <Trash2 className="w-4 h-4" /> Delete Website
      </button>
    </div>
  );
}
