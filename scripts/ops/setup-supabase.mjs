#!/usr/bin/env node
// scripts/ops/setup-supabase.mjs
//
// Idempotent Supabase project bootstrap: finds-or-creates the project via the
// Supabase Management API (instead of the dashboard's "New Project" button,
// which has no "reuse if it already exists" concept), then links the local
// Supabase CLI to it and pushes the consolidated migration
// (supabase/migrations/20260905000000_consolidated_schema.sql).
//
// The migration file itself is already idempotent (IF NOT EXISTS / CREATE OR
// REPLACE throughout — see its header comment), and `supabase db push` only
// applies migrations it hasn't recorded as applied yet, so this whole script
// is safe to run more than once — including against a project that already
// exists, on a second machine, or after a partial earlier failure.
//
// Requires the Supabase CLI installed (`npm i -g supabase` or your platform's
// package manager) and a personal access token from
// https://supabase.com/dashboard/account/tokens.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_ORG_ID=your-org-id \
//   SUPABASE_DB_PASSWORD=a-strong-password \
//     node scripts/ops/setup-supabase.mjs [project-name] [region]
//
// See docs/setup/supabase.md for the manual fallback and what this script
// cannot do for you (creating the Supabase account/org itself).

import { execFileSync } from 'node:child_process';

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ORG_ID = process.env.SUPABASE_ORG_ID;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const PROJECT_NAME = process.argv[2] || process.env.SUPABASE_PROJECT_NAME || 'repondo';
const REGION = process.argv[3] || process.env.SUPABASE_REGION || 'us-east-1';

if (!ACCESS_TOKEN || !ORG_ID || !DB_PASSWORD) {
  console.error(
    'Missing one of SUPABASE_ACCESS_TOKEN, SUPABASE_ORG_ID, SUPABASE_DB_PASSWORD.\n' +
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
  console.log(`Created project ${project.id}. It may take a minute to finish provisioning before it accepts a db push.`);
  return project;
}

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
}

async function main() {
  const project = await ensureProject();

  // `supabase link` is itself idempotent — it just points the local CLI
  // config at this project ref, safe to re-run.
  run('supabase', ['link', '--project-ref', project.id]);

  // Applies only migrations not yet recorded as applied on this project.
  run('supabase', ['db', 'push']);

  console.log('\nDone. Project ref:', project.id);
  console.log('URL:', `https://${project.id}.supabase.co`);
  console.log('Fetch the anon key and service-role key from:');
  console.log(`  https://supabase.com/dashboard/project/${project.id}/settings/api`);
  console.log('\nAfter this, regenerate packages/shared/src/database.types.ts with:');
  console.log(`  supabase gen types typescript --project-id ${project.id} > packages/shared/src/database.types.ts`);
}

main().catch((err) => {
  console.error('setup-supabase failed:', err.message);
  process.exit(1);
});
