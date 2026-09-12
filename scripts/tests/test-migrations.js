// Migration file hygiene — the checks that catch a migration which will never
// run, before it doesn't run in production for three days.
//
// Supabase records applied migrations by VERSION (the numeric prefix), not by
// filename. Two files sharing one version therefore means the second one is
// considered applied the moment the first is, and it silently never executes —
// while `supabase db push` reports success and the migrations list shows that
// version as done. That is exactly how production ended up with no
// trial_ends_at column, and so no trial, for every workspace created.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`PASS: ${label}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${label} — ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();

check('every migration has a version and a name', () => {
  for (const file of files) {
    assert(/^\d{14}_[a-z0-9_]+\.sql$/.test(file), `${file} is not <14-digit version>_<name>.sql`);
  }
});

check('no two migrations share a version', () => {
  const byVersion = new Map();
  for (const file of files) {
    const version = file.slice(0, 14);
    if (byVersion.has(version)) {
      throw new Error(
        `${file} and ${byVersion.get(version)} share version ${version}. ` +
        'Supabase keys applied migrations by version, so one of them will never run — ' +
        'renumber the newer one above the latest version already applied.'
      );
    }
    byVersion.set(version, file);
  }
  assert(byVersion.size === files.length, 'version count should match file count');
});

check('a migration is not empty', () => {
  for (const file of files) {
    const body = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('--'))
      .join('');
    assert(body.length > 0, `${file} contains no SQL — only comments`);
  }
});

console.log(`\nMigration Test Results: ${passed} passed, ${failed} failed (${files.length} migrations)`);
if (failed > 0) process.exit(1);
