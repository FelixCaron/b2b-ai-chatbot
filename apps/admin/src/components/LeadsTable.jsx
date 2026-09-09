import React, { useState } from 'react';
import { Users, Search, Download, Calendar, Mail, Phone, User } from 'lucide-react';
import { useT } from '../i18n/LanguageContext';

export default function LeadsTable({ leads }) {
  const { t } = useT();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLeads = leads.filter((lead) => {
    const q = searchQuery.toLowerCase();
    return (
      (lead.name && lead.name.toLowerCase().includes(q)) ||
      (lead.email && lead.email.toLowerCase().includes(q)) ||
      (lead.phone && lead.phone.toLowerCase().includes(q))
    );
  });

  // RFC 4180 quoting. Joining raw values with commas broke the export for any
  // lead whose name carried a comma, a quote or a newline (the row silently
  // gained a column), and the old `encodeURI` + `data:` URI truncated the file
  // at the first `#`. A Blob has neither problem and has no length ceiling.
  const csvCell = (value) => {
    const text = value == null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const exportToCSV = () => {
    if (leads.length === 0) return;
    const headers = [t("ID"), t("Name"), t("Email"), t("Phone"), t("Created Date")];
    const rows = leads.map(l => [l.id, l.name || '', l.email || '', l.phone || '', l.created_at]);
    const csvContent = [headers, ...rows]
      .map(row => row.map(csvCell).join(","))
      .join("\r\n");

    // The BOM keeps Excel from mangling accented names on open.
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `leads_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-card p-6 rounded-2xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-dark-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" /> {t('Leads ({n})', { n: filteredLeads.length })}
          </h2>
          <p className="text-xs text-gray-500">{t('Visitors who asked to be contacted, or left their details while chatting with your assistant.')}</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder={t('Search by name, email, or phone...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-4 py-2 text-sm text-dark-900 placeholder-gray-500 outline-none focus:border-brand-500"
            />
          </div>

          {/* Export CSV button */}
          <button
            onClick={exportToCSV}
            disabled={leads.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md"
          >
            <Download className="w-4 h-4" /> {t('Export CSV')}
          </button>
        </div>
      </div>

      {/* Grid of Business Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLeads.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500 text-sm border border-dashed border-dark-900/10 rounded-2xl">
            {t('No leads captured yet. Enable lead capture in your AI settings.')}
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <div key={lead.id} className="bg-surface-100 border border-dark-900/5 rounded-2xl p-5 hover:border-brand-500/30 transition-colors flex flex-col h-full shadow-lg">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-600/20 to-brand-400/20 border border-brand-500/20 flex items-center justify-center text-brand-700">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-dark-900">{lead.name || t('Unknown Name')}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {new Date(lead.created_at).toLocaleDateString('en-US')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-4 shrink-0">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-gray-500" />
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="text-brand-700 hover:text-brand-800 truncate">{lead.email}</a>
                  ) : (
                    <span className="text-gray-600 italic">{t('Not provided')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-gray-500" />
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="text-emerald-700 hover:text-emerald-800 truncate">{lead.phone}</a>
                  ) : (
                    <span className="text-gray-600 italic">{t('Not provided')}</span>
                  )}
                </div>
              </div>

              <div className="mt-auto bg-surface-200 p-3 rounded-xl border border-dark-900/5">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{t('Inquiry Summary')}</h4>
                <p className="text-xs text-gray-600 line-clamp-3">
                  {lead.summary || <span className="text-gray-600 italic">{t('No summary generated by AI.')}</span>}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
