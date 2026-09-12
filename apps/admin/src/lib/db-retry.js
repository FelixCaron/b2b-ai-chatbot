// ---------------------------------------------------------------------------
// Surviving a database that is behind the code.
//
// Migrations and deploys are not atomic: the app can ship an hour (or a failed
// CI run) before the column it reads exists. PostgREST does not degrade in
// that situation — it fails the WHOLE query with 42703, including the SELECT,
// not just the ORDER BY that wanted the column. So a query that merely SORTS
// by a new column stops RETURNING anything at all.
//
// That is how the Additional Information box came to tell every customer to
// "check your connection" on a perfectly good connection: documents.chunk_index
// (migration 20260909060000) had not been applied, and the read that ordered by
// it failed for everyone, permanently.
//
// Ordering is a nicety. Reading is not.
// ---------------------------------------------------------------------------

/** Postgres "column does not exist" — PostgREST passes the SQLSTATE through. */
export const UNDEFINED_COLUMN = '42703';

/**
 * Run `preferred`; if it fails only because a column is missing, run `basic`.
 *
 * Both arguments are thunks returning a Supabase query result
 * (`{ data, error }`), so the caller decides what "without that column" means —
 * usually the same query with the column dropped from both the select and the
 * ordering.
 *
 * @param {() => Promise<{data: any, error: any}>} preferred
 * @param {() => Promise<{data: any, error: any}>} basic
 * @param {(message: string) => void} [warn] - told when the fallback is used,
 *   because a schema that is behind is worth seeing in a console even when the
 *   feature keeps working.
 */
export async function withMissingColumnFallback(preferred, basic, warn) {
  const first = await preferred();
  if (first?.error?.code !== UNDEFINED_COLUMN) return first;

  warn?.(first.error.message || 'a column this query needs does not exist');
  return await basic();
}
