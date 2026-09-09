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
 * Where an owner's hand-written answers live.
 *
 * Not a real page — a fragment URL on the site's own domain, the same
 * convention `#site-summary` already uses for the generated business
 * overview. It gives the notes a stable address so they can be re-read,
 * appended to and re-embedded through the ordinary document pipeline
 * (api/crawler/update.js) instead of needing a table and a retrieval path of
 * their own: the assistant searches them exactly like any crawled page.
 */
export function additionalInfoUrl(site) {
  const domain = (site?.domain || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${domain}/#additional-info`;
}

/** True for the synthetic URL above — the dashboard lists it differently. */
export function isAdditionalInfoUrl(url) {
  return typeof url === 'string' && url.includes('#additional-info');
}

/** Everything currently in the site's Additional Information, as one string. */
export async function readAdditionalInfo(site) {
  if (!site?.id || !supabase) return '';
  const { data, error } = await supabase
    .from('documents')
    .select('content, created_at')
    .eq('site_id', site.id)
    .eq('url', additionalInfoUrl(site))
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[knowledge-notes] could not read existing notes:', error.message);
    return '';
  }

  return (data || []).map((row) => stripSourcePrefix(row.content)).join('\n\n');
}

/**
 * Replace the site's Additional Information wholesale — what the editor in
 * the dashboard saves. Empty content is legal: it is how the section is
 * cleared (crawler.update deletes the old chunks either way).
 */
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

/**
 * Append one answer to the site's Additional Information and re-index it.
 *
 * Appends rather than replaces, and goes through `crawler.update` rather than
 * inserting a document straight from the browser: that endpoint owns the
 * chunking and the embedding call, so a note saved here is searchable the
 * same way a crawled page is. Blank-line separation is what makes each note
 * its own chunk (and so its own embedding) instead of one ever-growing blob
 * whose embedding means less with every addition.
 */
export async function appendAdditionalInfo(site, note) {
  const text = (note || '').trim();
  if (!text) return { ok: false, error: 'Nothing to save.' };
  if (!site?.id || !site?.tenant_id) return { ok: false, error: 'No website selected.' };

  const existing = await readAdditionalInfo(site);
  const combined = existing ? `${existing}\n\n${text}` : text;

  const result = await api.crawler.update({
    site_id: site.id,
    tenant_id: site.tenant_id,
    url: additionalInfoUrl(site),
    content: combined
  });

  if (!result.ok) {
    return { ok: false, error: result.error || "Could not save that to your assistant's knowledge." };
  }
  return { ok: true };
}
