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
export SUPABASE_DB_PASSWORD='a-strong-password'   # only read if the named project doesn't exist yet

npm run setup:supabase              # creates "repondo" in us-east-1 (or reuses it if it exists)
# or: node scripts/ops/setup-supabase.mjs my-project-name us-west-1
```

This finds-or-creates the project via the Supabase Management API, then applies
`supabase/migrations/20260905000000_consolidated_schema.sql` — the single migration that
creates every table, index, RPC, and RLS policy this product needs, including the `vector`
and `pgmq` extensions — via that same Management API's SQL endpoint. **No Supabase CLI
and no database password needed for the apply step**: an earlier version of this script
shelled out to `supabase db push`, which needs a direct Postgres connection and hung
waiting for a password interactively; verified against a real project on 2026-09-05 that
the Management API's `/database/query` endpoint does the same thing authenticated by the
access token alone. `SUPABASE_DB_PASSWORD` is only read if the named project doesn't
exist yet and needs creating (Postgres needs some initial password in that case).
Safe to re-run either way — see the migration file's own header comment for why.

## What you still have to do manually

Nothing here is scriptable via the Management API yet:

1. **Enable email auth (magic link).** Dashboard → Authentication → Providers → Email.
   Turn off "Confirm email" only if you want guests to convert without clicking a
   confirmation link first (the product also supports anonymous sign-in, converted to a
   real account on first "save").
2. **Copy your keys.** `npm run setup:supabase` deliberately does NOT print these (a secret
   in a script's stdout ends up in shell history, CI logs, anywhere output gets captured) —
   it only tells you which env vars to set and links to the dashboard page. Copy the actual
   values yourself: Dashboard → Project Settings → **API Keys** (not the "Legacy API keys" tab):
   - `Project URL` → `VITE_SUPABASE_URL` — one var, used server- and client-side alike
     (it's not a secret, so there's no separate server-only name for it)
   - `publishable` key (`sb_publishable_...`) → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `secret` key (`sb_secret_...`) → `SUPABASE_SECRET_KEY` — **never** put this behind
     a `VITE_` prefix or anywhere that ships to the browser. Its full value is only ever
     shown once (at creation, or via that `reveal=true` API call) — if you've lost it,
     generate a new secret key rather than trying to recover the old one.
   - Use these new-format keys, not the legacy `anon`/`service_role` JWTs — both still work,
     but the legacy ones are being phased out; see ADR.md's entry on this migration.
3. **Set the redirect URL** for magic links: Dashboard → Authentication → URL
   Configuration. Two separate fields, both matter:
   - **Site URL** — the fallback Supabase uses whenever `emailRedirectTo` isn't in the
     allowlist below. Set it to your main production domain. Left on its default
     (`http://localhost:3000`), every magic link silently redirects there instead of
     wherever the user actually requested it from — confirmed live 2026-09-05: a login
     attempt from the deployed `apps/internal-admin` console still emailed a
     `localhost:3000` link, because that domain wasn't in Redirect URLs yet.
   - **Redirect URLs** — add every real domain that calls `signInWithOtp`: `apps/admin`'s
     domain, `apps/internal-admin`'s domain, and `http://localhost:3000` /
     `http://localhost:3100` for local dev of each. Wildcards work
     (`https://*.vercel.app/**` covers preview deployments too).
4. **Configure custom SMTP**, before relying on magic-link login for anything real.
   Supabase's built-in email sender is rate-limited hard (a handful of emails/hour) —
   fine for the first couple of test sign-ins, not for actual usage; confirmed live
   2026-09-05, hit the limit after a handful of test logins in one session. This project
   already has a Resend account for its other transactional email (`docs/setup/resend.md`)
   — reuse it: Dashboard → Authentication → Emails → SMTP Settings:
   ```
   Host: smtp.resend.com
   Port: 465 (or 587)
   Username: resend
   Password: <your Resend API key>
   Sender email: an address on your verified Resend domain
   Sender name: Repondo
   ```
   Same fix is reachable via the Management API's `PATCH /v1/projects/<ref>/config/auth`
   (`smtp_host`/`smtp_port`/`smtp_user`/`smtp_pass`/`smtp_sender_name`/`smtp_admin_email`),
   scriptable the same way as the rest of this setup if you want it in
   `scripts/ops/setup-supabase.mjs` later — not added there yet since it needs the Resend
   API key as an extra input this script doesn't otherwise take.

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
