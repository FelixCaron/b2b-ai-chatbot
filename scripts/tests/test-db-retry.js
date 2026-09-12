// A database that is behind the code must not take the feature down with it.
//
// PostgREST fails the WHOLE query with 42703 when a column is missing — the
// SELECT as well as the ORDER BY — so a read that merely SORTS by a newly
// added column returns nothing at all where its migration hasn't landed. That
// is what made the Additional Information box tell every customer to "check
// your connection", permanently, on a perfectly good connection.
import { withMissingColumnFallback, UNDEFINED_COLUMN } from '../../apps/admin/src/lib/db-retry.js';

let passed = 0;
let failed = 0;

function check(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`PASS: ${label}`); passed++; })
    .catch((err) => { console.error(`FAIL: ${label} — ${err.message}`); failed++; });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ok = (data) => async () => ({ data, error: null });
const fails = (code, message = 'nope') => async () => ({ data: null, error: { code, message } });

await check('a query that works is not retried', async () => {
  let fallbackRuns = 0;
  const result = await withMissingColumnFallback(ok(['ordered']), async () => { fallbackRuns++; return { data: [], error: null }; });
  assert(result.data[0] === 'ordered', 'the preferred result should be returned as-is');
  assert(fallbackRuns === 0, 'the fallback ran when nothing was wrong');
});

await check('a missing column falls back to the query that does not need it', async () => {
  const result = await withMissingColumnFallback(fails(UNDEFINED_COLUMN, 'column documents.chunk_index does not exist'), ok(['unordered']));
  assert(result.error === null, `still errored: ${result.error?.message}`);
  assert(result.data[0] === 'unordered', 'the fallback data should come back');
});

await check('the fallback says so, so a schema that is behind is visible', async () => {
  const warnings = [];
  await withMissingColumnFallback(fails(UNDEFINED_COLUMN), ok([]), (message) => warnings.push(message));
  assert(warnings.length === 1, `expected one warning, got ${warnings.length}`);
});

await check('any other failure is still a failure — it is not retried away', async () => {
  let fallbackRuns = 0;
  const result = await withMissingColumnFallback(fails('500', 'boom'), async () => { fallbackRuns++; return ok(['masked'])(); });
  assert(fallbackRuns === 0, 'a real error was hidden behind a retry');
  assert(result.error?.message === 'boom', 'the original error should survive');
});

await check('a permission error is not mistaken for a missing column', async () => {
  // 42501 — insufficient privilege. Retrying without a column would not help,
  // and pretending it did would show an empty box the owner could overwrite.
  const result = await withMissingColumnFallback(fails('42501', 'permission denied'), ok(['masked']));
  assert(result.error?.code === '42501', 'a permission error was swallowed');
});

console.log(`\nDB Retry Test Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
