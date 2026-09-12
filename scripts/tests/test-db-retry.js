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
  const result = await withMissingColumnFallback([ok(['ordered']), async () => { fallbackRuns++; return { data: [], error: null }; }]);
  assert(result.data[0] === 'ordered', 'the preferred result should be returned as-is');
  assert(fallbackRuns === 0, 'the fallback ran when nothing was wrong');
});

await check('a missing column falls back to the query that does not need it', async () => {
  const result = await withMissingColumnFallback([fails(UNDEFINED_COLUMN, 'column documents.chunk_index does not exist'), ok(['unordered'])]);
  assert(result.error === null, `still errored: ${result.error?.message}`);
  assert(result.data[0] === 'unordered', 'the fallback data should come back');
});

await check('TWO missing columns still end up reading the rows', async () => {
  // The bug this chain exists for: the first version assumed it knew which
  // column was missing. Production was missing chunk_index's neighbour too
  // (documents.created_at), the single fallback named it as well, and both
  // attempts failed — so the feature stayed broken by a fix meant to save it.
  const result = await withMissingColumnFallback([
    fails(UNDEFINED_COLUMN, 'column documents.chunk_index does not exist'),
    fails(UNDEFINED_COLUMN, 'column documents.created_at does not exist'),
    ok(['by primary key'])
  ]);
  assert(result.error === null, `still errored: ${result.error?.message}`);
  assert(result.data[0] === 'by primary key', 'the last, simplest attempt should have answered');
});

await check('when every attempt fails, the error survives instead of a silent empty', async () => {
  const result = await withMissingColumnFallback([fails(UNDEFINED_COLUMN), fails(UNDEFINED_COLUMN)]);
  assert(result.error?.code === UNDEFINED_COLUMN, 'the failure must be reported, not swallowed');
  assert(!result.data, 'no data should be invented');
});

await check('each fallback says so, so a schema that is behind is visible', async () => {
  const warnings = [];
  await withMissingColumnFallback([fails(UNDEFINED_COLUMN), fails(UNDEFINED_COLUMN), ok([])], (message) => warnings.push(message));
  assert(warnings.length === 2, `expected two warnings, got ${warnings.length}`);
  // The last attempt has nothing to fall back to, so it never warns about
  // falling back — it just returns.
  const quiet = [];
  await withMissingColumnFallback([ok([])], (message) => quiet.push(message));
  assert(quiet.length === 0, 'a query that worked should not warn');
});

await check('any other failure is still a failure — it is not retried away', async () => {
  let fallbackRuns = 0;
  const result = await withMissingColumnFallback([fails('500', 'boom'), async () => { fallbackRuns++; return ok(['masked'])(); }]);
  assert(fallbackRuns === 0, 'a real error was hidden behind a retry');
  assert(result.error?.message === 'boom', 'the original error should survive');
});

await check('a permission error is not mistaken for a missing column', async () => {
  // 42501 — insufficient privilege. Retrying without a column would not help,
  // and pretending it did would show an empty box the owner could overwrite.
  const result = await withMissingColumnFallback([fails('42501', 'permission denied'), ok(['masked'])]);
  assert(result.error?.code === '42501', 'a permission error was swallowed');
});

console.log(`\nDB Retry Test Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
