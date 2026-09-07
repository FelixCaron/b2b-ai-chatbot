import React from 'react';
import { Users } from 'lucide-react';
import LeadsTable from '../../components/LeadsTable';

/** The full Leads view. */
export default function LeadsPage({ leads, onBack }) {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-700 border border-brand-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-dark-900">Captured Leads & Contacts</h2>
            <p className="text-xs text-gray-500">Prospects and inquiries collected automatically by your AI assistants</p>
          </div>
        </div>
        <button
          onClick={onBack}
          className="text-xs text-gray-500 hover:text-dark-900 bg-surface-200 hover:bg-surface-300 px-3 py-1.5 rounded-lg border border-dark-900/10"
        >
          ← Back to Dashboard
        </button>
      </div>
      <LeadsTable leads={leads} />
    </main>
  );
}
