import React from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { useT } from '../../../../i18n/LanguageContext';

/** 4. Danger Zone: Reset Website & Delete Website */
export default function DangerZone({ activeSite, isCrawling, onRequestDelete, onRequestReset }) {
  const { t } = useT();
  return (
    <div className="space-y-3">
      {/* Reset — a full re-onboarding: wipes what the assistant learned AND
          every customization (settings, favicon, widget color), then
          re-detects and re-scans from scratch. Keeps the site's install
          snippet working (its id/domain/public_key never change) and this
          site's leads and conversation history. Less drastic than Delete,
          so it gets its own row rather than sitting inside the same red
          block. */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-amber-700 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-amber-700" /> {t('Reset Website')}
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            {t("Clears everything {domain}'s assistant has learned (indexed pages, business summary) and every customized setting (tone, goal, lead capture, integrations, widget color, favicon), then re-detects and re-scans it from scratch. Your install code, leads, and conversation history stay put.", { domain: activeSite?.domain })}
          </p>
        </div>

        <button
          type="button"
          disabled={isCrawling}
          onClick={onRequestReset}
          className="bg-amber-600/90 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shrink-0 shadow-md shadow-amber-900/20 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" /> {t('Reset Website')}
        </button>
      </div>

      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" /> {t('Danger Zone: Delete Website')}
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            {t('Permanently remove {domain}, everything your assistant learned from it, and the code installed on your website.', { domain: activeSite?.domain })}
          </p>
        </div>

        <button
          type="button"
          onClick={onRequestDelete}
          className="bg-red-600/80 hover:bg-red-600 text-white font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shrink-0 shadow-md shadow-red-900/30 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" /> {t('Delete Website')}
        </button>
      </div>
    </div>
  );
}
