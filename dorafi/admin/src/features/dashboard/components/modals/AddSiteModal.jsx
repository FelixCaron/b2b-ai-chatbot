import React from 'react';
import { X, Globe, RefreshCw } from 'lucide-react';
import { useT } from '../../../../i18n/LanguageContext';

/** 7. NON-BLOCKING ADD WEBSITE MODAL */
export default function AddSiteModal({
  show,
  newSiteUrlInput,
  setNewSiteUrlInput,
  isAddingNewSite,
  newSiteError,
  onSubmit,
  onClose
}) {
  const { t } = useT();
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999999] bg-dark-900/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white p-8 rounded-3xl w-full max-w-lg border border-dark-900/10 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-dark-900 p-2 rounded-lg hover:bg-dark-900/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-dark-900 mb-2 flex items-center gap-2">
          <Globe className="w-6 h-6 text-brand-600" /> {t('Add a New Website')}
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          {t('Connect another website to your account without interrupting your active assistant.')}
        </p>

        {newSiteError && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-600 text-xs rounded-xl p-3">
            ⚠️ {newSiteError}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">{t('Website URL / Domain')}</label>
            <div className="relative">
              <Globe className="w-4 h-4 text-gray-500 absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                required
                placeholder="https://second-company.com"
                value={newSiteUrlInput}
                onChange={(e) => setNewSiteUrlInput(e.target.value)}
                className="w-full bg-white border border-gray-300 text-dark-900 placeholder-gray-400 rounded-xl pl-10 pr-4 py-2.5 text-xs outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-500 hover:text-dark-900"
            >
              {t('Cancel')}
            </button>
            <button
              type="submit"
              disabled={isAddingNewSite || !newSiteUrlInput.trim()}
              className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md disabled:opacity-50"
            >
              {isAddingNewSite ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {t('Adding & Learning...')}</>
              ) : (
                <>{t('Add & Learn Website →')}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
