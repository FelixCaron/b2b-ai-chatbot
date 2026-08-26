import React, { useState } from 'react';
import { Users, Search, Download, Calendar, Mail, Phone, User } from 'lucide-react';

export default function LeadsTable({ leads }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLeads = leads.filter((lead) => {
    const q = searchQuery.toLowerCase();
    return (
      (lead.name && lead.name.toLowerCase().includes(q)) ||
      (lead.email && lead.email.toLowerCase().includes(q)) ||
      (lead.phone && lead.phone.toLowerCase().includes(q))
    );
  });

  const exportToCSV = () => {
    if (leads.length === 0) return;
    const headers = ["ID", "Name", "Email", "Phone", "Created Date"];
    const rows = leads.map(l => [l.id, l.name || '', l.email || '', l.phone || '', l.created_at]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `leads_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="glass-card p-6 rounded-2xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" /> Captured Leads ({filteredLeads.length})
          </h2>
          <p className="text-xs text-gray-400">Contact information automatically collected by your AI chatbot during visitor conversations.</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-dark-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-brand-500"
            />
          </div>

          {/* Export CSV button */}
          <button
            onClick={exportToCSV}
            disabled={leads.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Grid of Business Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLeads.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500 text-sm border border-dashed border-white/10 rounded-2xl">
            No leads captured yet. Enable lead capture in your AI settings.
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <div key={lead.id} className="bg-dark-900/60 border border-white/5 rounded-2xl p-5 hover:border-brand-500/30 transition-colors flex flex-col h-full shadow-lg">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-600/20 to-indigo-500/20 border border-brand-500/20 flex items-center justify-center text-brand-400">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{lead.name || 'Unknown Name'}</h3>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {new Date(lead.created_at).toLocaleDateString('en-US')}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2 mb-4 shrink-0">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-gray-500" />
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="text-indigo-300 hover:text-indigo-200 truncate">{lead.email}</a>
                  ) : (
                    <span className="text-gray-600 italic">Not provided</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-gray-500" />
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="text-emerald-300 hover:text-emerald-200 truncate">{lead.phone}</a>
                  ) : (
                    <span className="text-gray-600 italic">Not provided</span>
                  )}
                </div>
              </div>

              <div className="mt-auto bg-dark-800/50 p-3 rounded-xl border border-white/5">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Inquiry Summary</h4>
                <p className="text-xs text-gray-300 line-clamp-3">
                  {lead.summary || <span className="text-gray-600 italic">No summary generated by AI.</span>}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
