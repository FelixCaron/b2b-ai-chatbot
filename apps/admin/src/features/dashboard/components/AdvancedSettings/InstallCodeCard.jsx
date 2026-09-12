import React from 'react';
import { Code } from 'lucide-react';
import { useT } from '../../../../i18n/LanguageContext';

/** Where the embed snippet lives once the hero card has stopped offering it.
 *
 *  The Install button disappears from the dashboard the moment the widget has
 *  actually been seen loading on the site — an owner who already pasted it has
 *  no use for a button telling them to paste it. But "already installed" is not
 *  "never needed again": a site gets rebuilt, a page template gets replaced, a
 *  developer asks for the line. So the code keeps a permanent, quiet home here
 *  rather than being reachable only while the product thinks you still need it. */
export default function InstallCodeCard({ activeSite, onShowInstallCode }) {
  const { t } = useT();
  if (!activeSite) return null;

  return (
    <div className="bg-surface-100 border border-dark-900/5 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h4 className="text-sm font-bold text-dark-900 flex items-center gap-2">
          <Code className="w-4 h-4 text-brand-600" /> {t('Installation code')}
        </h4>
        <p className="text-xs text-gray-500 mt-1">
          {t('The one line that puts your assistant on {domain}. You only need it again if your website is rebuilt or moves.', { domain: activeSite.domain })}
        </p>
      </div>

      <button
        type="button"
        onClick={onShowInstallCode}
        className="bg-white hover:bg-surface-200 border border-dark-900/10 text-gray-700 hover:text-dark-900 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shrink-0 shadow-sm"
      >
        <Code className="w-4 h-4 text-brand-600" /> {t('Show install code')}
      </button>
    </div>
  );
}
