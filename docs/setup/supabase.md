# Supabase setup

Supabase is the database (Postgres + pgvector + full-text search), auth (magic-link sign-in
for tenants and staff alike), and file-free storage layer for this product. One project
serves both the tenant-facing product and the internal staff console — they're isolated by
schema, not by separate infrastructure (see `docs/INTEGRATION_REVIEW.md`).

## Scripted (preferred)

```bash
# One-time: create a personal access token at
# https://supabase.com/dashboard/account/tokens
# and find your org id at https://supabase.com/dashboard/org/_/general

export SUPABASE_ACCESS_TOKEN=sbp_...
export SUPABASE_ORG_ID=...
export SUPABASE_DB_PASSWORD='a-strong-password'   # save this somewhere safe — it's the Postgres password

npm run setup:supabase              # creates "repondo" in us-east-1 (or reuses it if it exists)
# or: node scripts/ops/setup-supabase.mjs my-project-name us-west-1
```

This finds-or-creates the project via the Supabase Management API, links the local
Supabase CLI to it, and runs `supabase db push` to apply
`supabase/migrations/20260905000000_consolidated_schema.sql` — the single migration that
creates every table, index, RPC, and RLS policy this product needs, including the `vector`
and `pgmq` extensions. Safe to re-run (see the script's header comment for why).

## What you still have to do manually

Nothing here is scriptable via the Management API yet:

1. **Enable email auth (magic link).** Dashboard → Authentication → Providers → Email.
   Turn off "Confirm email" only if you want guests to convert without clicking a
   confirmation link first (the product also supports anonymous sign-in, converted to a
   real account on first "save").
2. **Copy your keys.** Dashboard → Project Settings → API:
   - `Project URL` → `SUPABASE_URL` (server) and `VITE_SUPABASE_URL` (client)
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` — **never** put this behind
     a `VITE_` prefix or anywhere that ships to the browser.
3. **Set the redirect URL** for magic links: Dashboard → Authentication → URL
   Configuration → Redirect URLs, add your admin app's real domain (and
   `http://localhost:3000` for local dev).

## Manual fallback (no Management API access)

Dashboard → New Project → pick org/name/region/db password → wait for provisioning →
Project Settings → Database → connect the Supabase CLI (`supabase link --project-ref
<ref>`) → `supabase db push`.

## Resetting an existing database

This migration **replaces** the 9 incremental migrations that used to be in
`supabase/migrations/` — it is not an upgrade path for a database that already has those
applied under their original names. If you have an existing project from before this
consolidation: `supabase db reset` (destroys and rebuilds from the migrations folder) or
drop and recreate the project, then run the steps above.

After a reset, regenerate the shared TypeScript types:

```bash
supabase gen types typescript --project-id <ref> > packages/shared/src/database.types.ts
```
