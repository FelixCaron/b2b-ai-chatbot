import React from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

/** 4. Danger Zone: Reset Website & Delete Website */
export default function DangerZone({ activeSite, isCrawling, onRequestDelete, onRequestReset }) {
  return (
    <div className="space-y-3">
      {/* Reset — wipes what the assistant learned and re-onboards from
          scratch, but keeps the site itself (its id, install snippet, and
          settings) intact. Less drastic than Delete, so it gets its own row
          rather than sitting inside the same red block. */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-amber-700 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-amber-700" /> Reset Website
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            Clears everything <strong>{activeSite?.domain}</strong>'s assistant has learned (indexed pages, business summary) and this website's leads, then re-scans it from scratch. Your install code, settings, and conversation history stay put.
          </p>
        </div>

        <button
          type="button"
          disabled={isCrawling}
          onClick={onRequestReset}
          className="bg-amber-600/90 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shrink-0 shadow-md shadow-amber-900/20 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" /> Reset Website
        </button>
      </div>

      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" /> Danger Zone: Delete Website
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            Permanently remove <strong>{activeSite?.domain}</strong>, everything your assistant learned from it, and the code installed on your website.
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
    </div>
  );
}
