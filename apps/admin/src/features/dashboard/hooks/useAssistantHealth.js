import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

// A week is the window an owner actually thinks in ("has it been busy this
// week?"). Long enough that a quiet Tuesday doesn't read as a broken
// assistant, short enough that the number still means something today.
const WINDOW_DAYS = 7;

// Ceiling on the session-id scan behind the conversation count. Well past
// what a week looks like for the plans this serves, and it keeps a runaway
// tenant from turning a dashboard visit into a large download.
const SESSION_SCAN_LIMIT = 2000;

/**
 * The handful of numbers that answer "is my assistant working?".
 *
 * Deliberately not part of useWorkspace: these are dashboard-only, and
 * loading them alongside every tenant switch would put two more queries in
 * front of every page in the app.
 *
 * Reads go through RLS on the publishable key, like leads and conversations —
 * public.messages' "Tenant owner access" policy scopes a signed-in user to
 * their own tenants.
 */
export default function useAssistantHealth(tenantId) {
  const [health, setHealth] = useState({
    conversationsThisWeek: 0,
    conversationsThisMonth: 0,
    unansweredCount: 0,
    failedSupportTicketsCount: 0,
    hasEverBeenUsed: false
  });
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !supabase) {
      setHealth({ conversationsThisWeek: 0, conversationsThisMonth: 0, unansweredCount: 0, failedSupportTicketsCount: 0, hasEverBeenUsed: false });
      return;
    }

    setIsLoading(true);
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Exact and cheap, unlike the weekly figure below: `conversations` holds
    // one row per tenant+session_id (register_conversation(), migration
    // 20260909000000), so this is a plain count against the same billing-
    // cycle window the plan's monthly quota is checked against — not a
    // distinct-session scan over messages.
    const monthlyConversationsQuery = supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('started_at', monthStart.toISOString());

    // Conversations, not messages: a visitor who asks six questions in one
    // sitting is one conversation, and counting them as six would flatter the
    // number into meaninglessness. PostgREST has no COUNT(DISTINCT), so the
    // session ids come back and are deduplicated here.
    const sessionsQuery = supabase
      .from('messages')
      .select('session_id')
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .limit(SESSION_SCAN_LIMIT);

    // Unanswered is deliberately all-time, not this week: a question the site
    // couldn't answer stays unanswered until someone writes the content, and
    // ageing it out of the count would quietly retire the work rather than
    // the problem. What *does* retire it is the owner actually handling it —
    // answering it into the knowledge base or dismissing it (migration
    // 20260909050000) — so resolved gaps drop out. Otherwise this number
    // could only ever grow, and a number that never goes down stops being
    // read.
    const unansweredQuery = supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('answer_status', ['no_match', 'failed'])
      .is('missing_info_status', null);

    // Has anyone ever talked to this assistant? All-time, and separate from
    // the weekly figure, because it decides which dashboard the owner gets:
    // an assistant nobody has used yet needs instructions, not statistics,
    // and an established site that happened to have a quiet week should not
    // be sent back to the setup guide.
    const everUsedQuery = supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'user');

    // All-time, same reasoning as unansweredQuery above: a support request
    // that failed to deliver stays a mystery to the tenant until someone
    // looks, not just for the week it happened in. This is what actually
    // answers "is support email not working?" — a code bug in the tool
    // itself would show up as the assistant never calling it at all (no rows
    // here), while a config/deliverability problem (missing RESEND_API_KEY,
    // an unverified sending domain, Resend rejecting the send) shows up as
    // rows with delivered = false.
    const failedSupportTicketsQuery = supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('delivered', false);

    const [sessions, monthlyConversations, unanswered, everUsed, failedSupportTickets] = await Promise.all([
      sessionsQuery,
      monthlyConversationsQuery,
      unansweredQuery,
      everUsedQuery,
      failedSupportTicketsQuery
    ]);

    if (sessions.error) console.warn('[useAssistantHealth] sessions:', sessions.error.message);
    if (monthlyConversations.error) console.warn('[useAssistantHealth] monthlyConversations:', monthlyConversations.error.message);
    if (unanswered.error) console.warn('[useAssistantHealth] unanswered:', unanswered.error.message);
    if (everUsed.error) console.warn('[useAssistantHealth] everUsed:', everUsed.error.message);
    // Missing table (pre-migration database) isn't worth warning about —
    // just means nothing to report yet, same as a tenant with zero tickets.
    if (failedSupportTickets.error && failedSupportTickets.error.code !== '42P01') {
      console.warn('[useAssistantHealth] failedSupportTickets:', failedSupportTickets.error.message);
    }

    setHealth({
      conversationsThisWeek: new Set((sessions.data || []).map((row) => row.session_id)).size,
      conversationsThisMonth: monthlyConversations.count || 0,
      unansweredCount: unanswered.count || 0,
      failedSupportTicketsCount: failedSupportTickets.count || 0,
      hasEverBeenUsed: (everUsed.count || 0) > 0
    });
    setIsLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...health, isLoading, reload: load };
}
