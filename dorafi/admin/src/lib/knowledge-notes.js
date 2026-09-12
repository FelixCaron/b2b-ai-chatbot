import { supabase } from './supabase';
import api from './api';
import { withMissingColumnFallback } from './db-retry';

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
 * Every chunk of one document, in the order it was written.
 *
 * Ordered by chunk_index (migration 20260909060000) because all chunks of one
 * save share a created_at, and an unordered read comes back shuffled.
 *
 * The catch: a database that has not had that migration applied yet has no
 * such column, and PostgREST answers the whole query with 42703 rather than
 * ignoring the ORDER BY. Every read here then failed — which is how the
 * Additional Information box came to tell people to "check your connection"
 * on a perfectly good connection, permanently. Ordering is a nicety;
 * READING IS NOT. So a missing column falls back to the older ordering
 * (arbitrary between chunks written in the same statement, but stable) and
 * the owner still sees their text.
 */
async function readDocumentChunks(siteId, url) {
  if (!supabase) return { ok: false, rows: [], error: 'No connection to your workspace.', detail: '' };

  const base = (columns) => supabase
    .from('documents')
    .select(columns)
    .eq('site_id', siteId)
    .eq('url', url);

  // Best ordering first, then strictly less each time. A missing column has to
  // come out of the SELECT as well as the ORDER BY — PostgREST fails the whole
  // query on either — and the last attempt names only the primary key, which
  // every version of this table has had. Ordering is a nicety; reading is not.
  const { data, error } = await withMissingColumnFallback(
    [
      () => base('content, chunk_index, created_at, id')
        .order('chunk_index', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
      () => base('content, chunk_index, id')
        .order('chunk_index', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true }),
      () => base('content, id').order('id', { ascending: true })
    ],
    (message) => console.warn(`[knowledge-notes] ${message} — reading with a simpler ordering. Are the migrations applied?`)
  );

  if (error) {
    console.error('[knowledge-notes] could not read documents:', error.code, error.message, error.details, error.hint);
    // `detail` is the part that actually identifies the fault. It used to be
    // thrown away one level up, so every report of this failure arrived as the
    // reassuring sentence and nothing else — unfixable without asking the
    // person to open a browser console. The friendly sentence stays; the code
    // rides along with it.
    return {
      ok: false,
      rows: [],
      error: error.message || 'Unknown database error',
      detail: [error.code, error.message, error.hint].filter(Boolean).join(' · ')
    };
  }
  return { ok: true, rows: data || [], error: '', detail: '' };
}

/** The chunks of one page, joined back into the text a person would edit. */
export async function readDocumentText(siteId, url) {
  const result = await readDocumentChunks(siteId, url);
  if (!result.ok) return { ok: false, text: '', error: result.error, detail: result.detail };
  return { ok: true, text: result.rows.map((row) => stripSourcePrefix(row.content)).join('\n\n'), error: '', detail: '' };
}

/**
 * Read the notes back. {ok, text, error}, not a bare string: saving replaces
 * this document with what was read, so a failed read must not look like an
 * empty one — that would delete everything the owner had.
 */
export async function readAdditionalInfo(site) {
  if (!site?.id || !supabase) return { ok: false, text: '', error: 'No website selected.' };

  const result = await readDocumentText(site.id, additionalInfoUrl(site));
  if (!result.ok) {
    // Say what actually happened. The old copy blamed the reader's network
    // for what was, every single time, a server-side error they could do
    // nothing about — and "check your connection" sends someone off to
    // restart their router over a schema problem.
    return {
      ok: false,
      text: '',
      error: 'Could not read what you saved here. Please try again in a moment.',
      detail: result.detail
    };
  }
  return result;
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
