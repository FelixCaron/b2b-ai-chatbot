import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// How many raw messages to pull per tenant. Conversations are reconstructed
// from these, so this is a ceiling on history, not on conversation count.
// Deliberately bounded: the view is "what have my visitors been asking
// lately", not an archive, and an unbounded select over a busy tenant would
// be paid for on every visit to the page.
const MESSAGE_LIMIT = 1000;

/**
 * The tenant's chat history, grouped into conversations.
 *
 * `messages` carries tenant_id, session_id, role, content and created_at —
 * no site_id (see migration 20260905030000, which notes the omission is
 * deliberate) — so a conversation belongs to the tenant, not to one of its
 * sites. That matches how the assistant actually answers: every site under a
 * tenant shares the same knowledge.
 *
 * Reads go straight through RLS on the publishable key, exactly like leads:
 * the "Tenant owner access" policy on public.messages already restricts a
 * signed-in user to the tenants they own.
 */
export default function useConversations(tenantId) {
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !supabase) {
      setConversations([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('messages')
      .select('id, session_id, role, content, created_at, answer_status')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_LIMIT);

    if (queryError) {
      console.error('[useConversations] failed to load messages:', queryError);
      setError('Could not load conversations.');
      setConversations([]);
      setIsLoading(false);
      return;
    }

    const rows = data || [];
    setTruncated(rows.length === MESSAGE_LIMIT);
    setConversations(groupIntoConversations(rows));
    setIsLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  return { conversations, isLoading, error, truncated, reload: load };
}

/**
 * Turn newest-first message rows into conversations, each ordered the way it
 * was said. Exported for the sake of being testable on its own.
 */
export function groupIntoConversations(rows) {
  const bySession = new Map();

  // Walk oldest-first so each conversation's messages come out in order.
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!bySession.has(row.session_id)) {
      bySession.set(row.session_id, []);
    }
    bySession.get(row.session_id).push(row);
  }

  return Array.from(bySession.entries())
    .map(([sessionId, messages]) => {
      const firstQuestion = messages.find((m) => m.role === 'user');
      // 'no_match' means the site had nothing on the subject; 'failed' means
      // the assistant couldn't produce an answer at all. Both are worth an
      // owner's attention, for the same reason and with the same fix —
      // content. Messages written before answer_status existed are null, and
      // are not retroactively accused of anything.
      const unanswered = messages.filter(
        (m) => m.answer_status === 'no_match' || m.answer_status === 'failed'
      );
      return {
        sessionId,
        messages,
        unansweredCount: unanswered.length,
        needsAttention: unanswered.length > 0,
        // What the visitor opened with is the only useful label we have; a
        // session id tells the owner nothing.
        title: firstQuestion?.content?.trim() || 'No question asked',
        startedAt: messages[0]?.created_at || null,
        lastAt: messages[messages.length - 1]?.created_at || null,
        visitorMessageCount: messages.filter((m) => m.role === 'user').length
      };
    })
    // Most recently active first — an owner checking in wants today's first.
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}
