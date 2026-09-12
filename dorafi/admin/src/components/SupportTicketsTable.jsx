import React, { useState } from 'react';
import { LifeBuoy, Search, Calendar, Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useT } from '../i18n/LanguageContext';

/**
 * Every support request the assistant's send_support_email tool has ever
 * tried to deliver — not just the ones that made it to an inbox. A ticket
 * shows up here the moment the bot calls the tool, whether or not the email
 * actually went out (see api/chat/index.js), so the "did it fail to send" vs
 * "the bot never tried" question this table exists to answer is answerable
 * from the request list itself, not from guessing.
 */
export default function SupportTicketsTable({ tickets }) {
  const { t } = useT();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTickets = tickets.filter((ticket) => {
    const q = searchQuery.toLowerCase();
    return (
      (ticket.name && ticket.name.toLowerCase().includes(q)) ||
      (ticket.email && ticket.email.toLowerCase().includes(q)) ||
      (ticket.message && ticket.message.toLowerCase().includes(q))
    );
  });

  return (
    <div className="glass-card p-6 rounded-2xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-dark-900 flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-brand-600" /> {t('Support Requests ({n})', { n: filteredTickets.length })}
          </h2>
          <p className="text-xs text-gray-500">{t('Every time a visitor asked your assistant for human help — and whether the email actually reached you.')}</p>
        </div>

        <div className="relative flex-1 sm:w-64 sm:flex-none">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder={t('Search by name, email, or message...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-4 py-2 text-sm text-dark-900 placeholder-gray-500 outline-none focus:border-brand-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTickets.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500 text-sm border border-dashed border-dark-900/10 rounded-2xl">
            {t('No support requests yet. They show up here as soon as a visitor asks your assistant for help.')}
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <div key={ticket.id} className="bg-surface-100 border border-dark-900/5 rounded-2xl p-5 flex flex-col h-full shadow-lg">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-dark-900">{ticket.name || t('Unknown visitor')}</h3>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3" /> {new Date(ticket.created_at).toLocaleString('en-US')}
                  </p>
                </div>
                {ticket.delivered ? (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-700 px-2 py-1 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> {t('Emailed to you')}
                  </span>
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-800 px-2 py-1 rounded-full">
                    <AlertTriangle className="w-3 h-3" /> {t('Email failed')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm mb-3">
                <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                {ticket.email ? (
                  <a href={`mailto:${ticket.email}`} className="text-brand-700 hover:text-brand-800 truncate">{ticket.email}</a>
                ) : (
                  <span className="text-gray-600 italic">{t('Not provided')}</span>
                )}
              </div>

              <div className="mt-auto bg-surface-200 p-3 rounded-xl border border-dark-900/5">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{t('Message')}</h4>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">
                  {ticket.message || <span className="text-gray-600 italic">{t('No message given.')}</span>}
                </p>
              </div>

              {/* Whose problem this is matters: the send failed on our side,
                  so the customer gets the request and a way to act on it —
                  not a troubleshooting checklist for infrastructure they
                  don't own. The failure itself alerts us (api/lib/email.js). */}
              {!ticket.delivered && (
                <p className="text-[11px] text-amber-800 mt-3">
                  {t("We couldn't get this into your inbox, so it's kept here instead — you can reply to the visitor directly at the address above. Our team has been notified.")}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
