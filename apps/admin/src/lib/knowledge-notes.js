import { supabase } from './supabase';
import api from './api';

// Every chunk written by api/crawler/update.js is prefixed with a
// `[Source URL: ...]` line so the assistant can cite where an answer came
// from. That prefix belongs to the stored chunk, not to what the owner
// typed — reading content back for editing without stripping it means the
// next save prefixes the prefix, and it stacks a line deeper on every edit.
const SOURCE_PREFIX = /^\[Source URL:[^\]]*\]\n?/;

/** Stored chunk text as the person who typed it would recognize it. */
export function stripSourcePrefix(content) {
  return (content || '').replace(SOURCE_PREFIX, '');
}

/**
 * Where an owner's hand-written notes live: a fragment URL on their own
 * domain, the same trick `#site-summary` already uses. That gives the notes
 * an address, so they go through the ordinary document pipeline
 * (api/crawler/update.js) and the assistant searches them like any page —
 * no separate table, no separate retrieval path.
 */
export function additionalInfoUrl(site) {
  const domain = (site?.domain || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${domain}/#additional-info`;
}

/** True for the synthetic URL above — the dashboard lists it differently. */
export function isAdditionalInfoUrl(url) {
  return typeof url === 'string' && url.includes('#additional-info');
}

/**
 * Read the notes back. {ok, text, error}, not a bare string: saving replaces
 * this document with what was read, so a failed read must not look like an
 * empty one — that would delete everything the owner had.
 *
 * Ordered by chunk_index (migration 20260909060000) because all chunks of one
 * save share a created_at, and an unordered read comes back shuffled.
 */
export async function readAdditionalInfo(site) {
  if (!site?.id || !supabase) return { ok: false, text: '', error: 'No website selected.' };
  const { data, error } = await supabase
    .from('documents')
    .select('content, chunk_index, created_at, id')
    .eq('site_id', site.id)
    .eq('url', additionalInfoUrl(site))
    .order('chunk_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error('[knowledge-notes] could not read existing notes:', error.message);
    return { ok: false, text: '', error: 'Could not read your existing information. Check your connection and try again.' };
  }

  return { ok: true, text: (data || []).map((row) => stripSourcePrefix(row.content)).join('\n\n'), error: '' };
}

/** Save the notes. Empty is legal — that's how the section gets cleared. */
export async function saveAdditionalInfo(site, content) {
  if (!site?.id || !site?.tenant_id) return { ok: false, error: 'No website selected.' };

  const result = await api.crawler.update({
    site_id: site.id,
    tenant_id: site.tenant_id,
    url: additionalInfoUrl(site),
    content: (content || '').trim()
  });

  if (!result.ok) {
    return { ok: false, error: result.error || 'Could not save your additional information.' };
  }
  return { ok: true };
}
