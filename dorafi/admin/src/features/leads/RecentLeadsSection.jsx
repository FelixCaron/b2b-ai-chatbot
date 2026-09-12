import React from 'react';
import { Users } from 'lucide-react';
import LeadsTable from '../../components/LeadsTable';
import { useT } from '../../i18n/LanguageContext';

/** The leads recap that follows the dashboard once there is anything to recap. */
export default function RecentLeadsSection({ leads, onViewAll }) {
  const { t } = useT();
  if (leads.length === 0) return null;

  return (
    <section className="border-t border-dark-900/10 pt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-700 border border-brand-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-dark-900">{t('Recent leads')}</h2>
            <p className="text-xs text-gray-500">
              {t(leads.length > 1 ? '{n} prospects captured' : '{n} prospect captured', { n: leads.length })}
            </p>
          </div>
        </div>
        <button
          onClick={onViewAll}
          className="text-xs text-brand-700 hover:text-brand-800 font-semibold"
        >
          {t('View all leads')} →
        </button>
      </div>
      <LeadsTable leads={leads} />
    </section>
  );
}
