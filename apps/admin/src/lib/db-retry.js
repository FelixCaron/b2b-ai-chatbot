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
 * Run the queries in order, best first, stopping at the first one that is not
 * refused for a missing column.
 *
 * A CHAIN rather than a pair, because the first version of this helper assumed
 * it knew which column was missing: it dropped chunk_index and kept ordering by
 * created_at, and in production BOTH were absent — so both attempts failed and
 * the feature stayed broken. Every entry after the first should therefore ask
 * for strictly less than the one before it, ending with something that cannot
 * fail this way (a primary key, or no ordering at all).
 *
 * Each entry is a thunk returning a Supabase query result (`{ data, error }`),
 * so the caller decides what "without that column" means.
 *
 * @param {Array<() => Promise<{data: any, error: any}>>} attempts - best first.
 * @param {(message: string) => void} [warn] - told each time a fallback is
 *   taken: a schema that is behind the code is worth seeing in a console even
 *   while the feature keeps working.
 */
export async function withMissingColumnFallback(attempts, warn) {
  const queries = Array.isArray(attempts) ? attempts : [attempts];
  let result;

  for (let index = 0; index < queries.length; index++) {
    result = await queries[index]();
    if (result?.error?.code !== UNDEFINED_COLUMN) return result;
    // The last attempt has nothing left to fall back to — return its error.
    if (index < queries.length - 1) {
      warn?.(result.error.message || 'a column this query needs does not exist');
    }
  }

  return result;
}
