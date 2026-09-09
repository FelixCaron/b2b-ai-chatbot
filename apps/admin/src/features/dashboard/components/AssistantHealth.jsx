import React from 'react';
import { FileText, MessageSquare, Users, AlertCircle, ArrowUpRight, TrendingUp, MailWarning } from 'lucide-react';

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
  conversationsThisMonth,
  conversationLimit,
  leadsCount,
  unansweredCount,
  failedSupportTicketsCount = 0,
  onViewConversations,
  onViewLeads,
  onViewSupportTickets,
  onShowPricing
}) {
  const needsAttention = unansweredCount > 0;
  const supportEmailFailing = failedSupportTicketsCount > 0;

  return (
    <div className="bg-surface-100 rounded-xl border border-dark-900/5 p-4 sm:p-5 space-y-4">
      {typeof conversationLimit === 'number' && conversationLimit > 0 && (
        <ConversationQuota
          used={conversationsThisMonth}
          limit={conversationLimit}
          onShowPricing={onShowPricing}
        />
      )}

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
          label="unanswered this week"
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

      {/* Our email provider failed to deliver, which is our incident, not
          this customer's — so this says what it means for them (a visitor is
          waiting, the request is safe, here it is) and nothing about our
          mail setup. They have no Resend account to go fix; the platform
          alert that does reach someone who can is raised server-side in
          api/lib/email.js. */}
      {supportEmailFailing && (
        <button
          type="button"
          onClick={onViewSupportTickets}
          className="w-full sm:w-auto text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 border border-amber-500/30 px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <MailWarning className="w-4 h-4" />
          {failedSupportTicketsCount === 1
            ? 'A visitor asked for help and we couldn’t email it to you — read it here'
            : `${failedSupportTicketsCount} visitors asked for help and we couldn’t email them to you — read them here`}
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * The plan's monthly conversation quota — the resource that's actually
 * metered (see api/chat/index.js's register_conversation call and
 * ADR 058). Three states an owner needs to see coming, not discover when
 * the widget stops answering: comfortable, close to the limit, and spent.
 */
function ConversationQuota({ used, limit, onShowPricing }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const atLimit = used >= limit;
  const nearLimit = !atLimit && pct >= 80;
  const tone = atLimit ? 'over' : nearLimit ? 'warn' : 'ok';

  const barClass = tone === 'over' ? 'bg-red-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-brand-500';
  const textClass = tone === 'over' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-dark-900';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <TrendingUp className="w-3.5 h-3.5" />
          Conversations this month
        </div>
        <span className={`text-xs font-bold ${textClass}`}>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-dark-900/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      {(atLimit || nearLimit) && (
        <div className="flex items-center justify-between gap-2 mt-2">
          <p className={`text-[11px] ${tone === 'over' ? 'text-red-600' : 'text-amber-700'}`}>
            {atLimit
              ? "This plan's monthly limit is reached — the widget has stopped accepting new conversations."
              : 'Approaching this plan\'s monthly conversation limit.'}
          </p>
          {onShowPricing && (
            <button
              type="button"
              onClick={onShowPricing}
              className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                tone === 'over'
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 border border-amber-500/30'
              }`}
            >
              Upgrade
            </button>
          )}
        </div>
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
