import React from 'react';
import { FileText, MessageSquare, Users, AlertCircle, ArrowUpRight } from 'lucide-react';

/**
 * Is the assistant working? Four numbers, in the order an owner cares about.
 *
 * The dashboard could already tell them the assistant existed. It couldn't
 * tell them it was doing anything — how much it had read, whether anyone was
 * talking to it, whether that turned into business, and whether it was
 * failing at questions it should be able to answer. The last of those is the
 * only one that ever asks for their attention, so it's the only one that
 * turns into a button.
 */
export default function AssistantHealth({
  pagesCount,
  isCrawling,
  conversationsThisWeek,
  leadsCount,
  unansweredCount,
  onViewConversations,
  onViewLeads
}) {
  const needsAttention = unansweredCount > 0;

  return (
    <div className="bg-surface-100 rounded-xl border border-dark-900/5 p-4 sm:p-5 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={FileText}
          value={pagesCount}
          label={pagesCount === 1 ? 'page understood' : 'pages understood'}
          hint={isCrawling ? 'still reading' : null}
        />
        <Stat
          icon={MessageSquare}
          value={conversationsThisWeek}
          label={conversationsThisWeek === 1 ? 'conversation this week' : 'conversations this week'}
          onClick={onViewConversations}
        />
        <Stat
          icon={Users}
          value={leadsCount}
          label={leadsCount === 1 ? 'lead captured' : 'leads captured'}
          onClick={onViewLeads}
        />
        <Stat
          icon={AlertCircle}
          value={unansweredCount}
          label={unansweredCount === 1 ? 'question unanswered' : 'questions unanswered'}
          tone={needsAttention ? 'warn' : 'ok'}
          onClick={needsAttention ? onViewConversations : undefined}
        />
      </div>

      {needsAttention && (
        <button
          type="button"
          onClick={onViewConversations}
          className="w-full sm:w-auto text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 border border-amber-500/30 px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <AlertCircle className="w-4 h-4" />
          {unansweredCount === 1
            ? 'One visitor asked something your website doesn’t cover'
            : `${unansweredCount} visitors asked things your website doesn’t cover`}
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label, hint, tone = 'ok', onClick }) {
  const interactive = typeof onClick === 'function';
  const Element = interactive ? 'button' : 'div';

  return (
    <Element
      {...(interactive ? { type: 'button', onClick } : {})}
      className={`text-left bg-white rounded-xl border p-3.5 transition-colors ${
        tone === 'warn' ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-dark-900/5'
      } ${interactive ? 'hover:border-brand-500/40 hover:bg-brand-500/[0.04] cursor-pointer' : ''}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${tone === 'warn' ? 'text-amber-600' : 'text-brand-600'}`} />
        <span className={`text-xl font-bold leading-none ${tone === 'warn' ? 'text-amber-900' : 'text-dark-900'}`}>
          {value}
        </span>
      </div>
      <div className="text-[11px] text-gray-500 mt-1.5 leading-tight">{label}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </Element>
  );
}
