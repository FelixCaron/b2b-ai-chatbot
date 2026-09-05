#!/usr/bin/env node
// scripts/ops/setup-supabase.mjs
//
// Idempotent Supabase project bootstrap: finds-or-creates the project via the
// Supabase Management API (instead of the dashboard's "New Project" button,
// which has no "reuse if it already exists" concept), then applies the
// consolidated migration (supabase/migrations/20260905000000_consolidated_schema.sql)
// via the Management API's SQL endpoint.
//
// That last part deliberately does NOT shell out to `supabase db push` — this
// was tried first (2026-09-05, against a real project) and `supabase
// migration list`/`db push` both need a direct Postgres connection, which
// hangs waiting for the database password interactively. The Management
// API's /database/query endpoint runs arbitrary SQL authenticated by the
// same access token used everywhere else in this script, no DB password
// needed at all — verified working against a live project with real data
// already in it. The one place a DB password is still needed is creating a
// brand new project (Postgres needs some initial password), which is why
// SUPABASE_DB_PASSWORD is only required on the create path, not the push one.
//
// The migration file itself is already idempotent (IF NOT EXISTS / CREATE OR
// REPLACE throughout — see its header comment), so applying it is safe to
// re-run against an existing project, including one that already has all its
// tables from older migrations.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_ORG_ID=your-org-id \
//   SUPABASE_DB_PASSWORD=a-strong-password \
//     node scripts/ops/setup-supabase.mjs [project-name] [region]
//
// SUPABASE_DB_PASSWORD can be omitted if the named project already exists —
// it's only read when a new project actually needs creating.
//
// See docs/setup/supabase.md for the manual fallback and what this script
// cannot do for you (creating the Supabase account/org itself).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = path.resolve(__dirname, '../../supabase/migrations/20260905000000_consolidated_schema.sql');

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ORG_ID = process.env.SUPABASE_ORG_ID;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const PROJECT_NAME = process.argv[2] || process.env.SUPABASE_PROJECT_NAME || 'repondo';
const REGION = process.argv[3] || process.env.SUPABASE_REGION || 'us-east-1';

if (!ACCESS_TOKEN || !ORG_ID) {
  console.error(
    'Missing SUPABASE_ACCESS_TOKEN and/or SUPABASE_ORG_ID.\n' +
    'Get a personal access token at https://supabase.com/dashboard/account/tokens\n' +
    'and your org id at https://supabase.com/dashboard/org/_/general'
  );
  process.exit(1);
}

const API_BASE = 'https://api.supabase.com/v1';

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase Management API ${options.method || 'GET'} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

async function findProjectByName(name) {
  const projects = await api('/projects');
  return projects.find((p) => p.name === name) || null;
}

async function ensureProject() {
  const existing = await findProjectByName(PROJECT_NAME);
  if (existing) {
    console.log(`Project "${PROJECT_NAME}" already exists (${existing.id}, ${existing.region}) — reusing.`);
    return existing;
  }
  if (!DB_PASSWORD) {
    throw new Error(
      `No project named "${PROJECT_NAME}" exists yet, and SUPABASE_DB_PASSWORD wasn't set to create one. ` +
      `Either pass an existing project's name, or set SUPABASE_DB_PASSWORD to create a new one.`
    );
  }
  console.log(`Creating project "${PROJECT_NAME}" in ${REGION}...`);
  const project = await api('/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: PROJECT_NAME,
      organization_id: ORG_ID,
      db_pass: DB_PASSWORD,
      region: REGION,
    }),
  });
  console.log(`Created project ${project.id}. It may take a minute to finish provisioning before it accepts a migration push.`);
  return project;
}

async function runSql(projectRef, sql) {
  const res = await fetch(`${API_BASE}/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    throw new Error(`database/query -> ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  const project = await ensureProject();

  console.log(`Applying ${path.basename(MIGRATION_FILE)}...`);
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  // Wrapped in an explicit transaction so a failure partway through this
  // multi-statement file rolls back instead of leaving a half-applied schema.
  await runSql(project.id, `BEGIN;\n${sql}\nCOMMIT;`);
  console.log('Migration applied.');

  // Deliberately does NOT fetch or print the actual key values here — a
  // secret in a script's stdout ends up in shell history, CI logs, terminal
  // recordings, anywhere that output gets captured. Copy them yourself from
  // the dashboard instead; this only tells you which env vars to set and
  // where to find the values.
  console.log('\nDone. Project ref:', project.id);
  console.log(`\nSet these env vars (Vercel project settings, or terraform.tfvars) — copy the`);
  console.log(`actual values yourself from the dashboard, this script won't print them:`);
  console.log(`  https://supabase.com/dashboard/project/${project.id}/settings/api-keys`);
  console.log('');
  console.log('  SUPABASE_URL                  <- "Project URL" on that page');
  console.log('  SUPABASE_SECRET_KEY           <- the `secret` key (sb_secret_...), NOT the legacy service_role JWT');
  console.log('  VITE_SUPABASE_URL             <- same Project URL');
  console.log('  VITE_SUPABASE_PUBLISHABLE_KEY <- the `publishable` key (sb_publishable_...), NOT the legacy anon JWT');
  console.log('\nAfter this, regenerate packages/shared/src/database.types.ts with:');
  console.log(`  npx supabase gen types typescript --project-id ${project.id} > packages/shared/src/database.types.ts`);
}

main().catch((err) => {
  console.error('setup-supabase failed:', err.message);
  process.exit(1);
});
