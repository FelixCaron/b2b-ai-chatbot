# Integration review — Stripe, Supabase, API layer

Written 2026-09-05 while preparing the product for an enterprise sale. Covers what each
integration actually does today, what was found and fixed in this pass, and what's still
open before this is enterprise-ready. Cross-references `TODO.md`/`ADR.md` rather than
duplicating what's already tracked there.

## Stripe billing

Flow: `apps/admin`'s Pricing page → `POST /api/billing/checkout` (creates/reuses a Stripe
customer for the tenant, starts a Checkout Session) → Stripe-hosted checkout → webhook
(`POST /api/billing/webhook`) updates the tenant's `plan`/`plan_status` → `POST
/api/billing/portal` lets a customer manage/cancel from Stripe's own billing portal.
Tenant ownership is checked (`requireTenantOwnership`) before checkout/portal so one
tenant can't act on another's Stripe customer.

**Fixed in this pass — critical:** `api/billing/webhook.js`'s `checkout.session.completed`
handler built its tenant-update payload with `session.customer || tenant?.stripe_customer_id`,
but no `tenant` variable was ever declared in that branch. That's a `ReferenceError` while
building the object, before the update ever runs — caught by the outer `try/catch`, so the
webhook 500s. Stripe retries a failed webhook, but this failure is deterministic (the bug
is in the code, not a transient error), so **it never actually succeeds**: every completed
checkout failed to upgrade the tenant's `plan`/`plan_status` server-side. Fixed by dropping
the dead fallback — `session.customer` is always present on a completed session.

**Still open (tracked in `TODO.md`, not re-litigated here):** switching Stripe from
sandbox/test to live mode after business verification, and deciding whether GST/QST
applies to confirm `Pricing.jsx`'s tax-exclusive prices are correct once live. New IaC
script `scripts/ops/setup-stripe.mjs` (see `docs/setup/stripe.md`) creates the plan
products/prices/webhook idempotently instead of manual dashboard clicks.

## Database & RLS

Every tenant table (`tenants`, `sites`, `documents`, `messages`, `leads`, `usage`,
`site_summaries`, `usage_counters`, `scan_jobs`) has RLS enabled with a single "tenant
owner access" policy keyed off `owner_user_id = auth.uid()` (directly on `tenants`) or
`current_user_owns_tenant(tenant_id)` (everywhere else, a `SECURITY DEFINER` helper).
Service-role access (used only in `api/**` server code) bypasses RLS entirely, by design
— manual `tenant_id` filtering in every query is what actually enforces isolation there
(see `CLAUDE.md`'s rule on this), not RLS.

**Fixed in this pass:** the 9 migrations that built this up incrementally (2026-08-08
through 2026-08-25) are replaced with one final-state migration,
`supabase/migrations/20260905000000_consolidated_schema.sql` — see
"Migration consolidation" below.

**New in this pass:** an `internal` Postgres schema for the staff dashboard
(`apps/internal-admin`), holding `internal.staff_admins`. This schema is deliberately
**not** in `supabase/config.toml`'s `[api].schemas` (which stays `["public",
"graphql_public"]`), so PostgREST has no route to it at all — not via anon key, not via an
authenticated user's JWT, regardless of grants or RLS. That's a stronger isolation
guarantee than "RLS in `public`, hope the policy is right": a bug in the tenant-isolation
policies above has literally no path to this data, because the access mechanism is
different. A `SECURITY DEFINER` bridge function, `public.is_staff_admin(uuid)`, restricted
to `service_role` only, is the one way server code can check staff membership — see
`apps/internal-admin/api/lib/server-config.js`.

**Still open (tracked in `TODO.md`):** replacing magic-link + anonymous-guest auth with
full Supabase Auth password/email flows if the enterprise buyer's own staff need to log
in directly; distributed rate limiting (see below).

## Guest/anonymous account lifecycle

`api/cron/cleanup.js` (guest tenants older than 24h, cascade-deleted) and Supabase Auth's
anonymous sign-in (`signInAnonymously()` on every visit before onboarding) are the two
pieces here.

**Fixed in this pass — real data-loss risk, not hypothetical:** a tenant's name is set
once, at creation (`user.email || 'Guest_<timestamp>'`), and nothing ever renamed it when
its owner later converted (added and confirmed a real email). The cleanup cron decided
what to delete by matching that same stale name pattern — so a guest who converted more
than 24h after their first tenant was created kept a tenant that still looked unclaimed to
that job, and the next run would have deleted it (and every site/document/lead under it)
for a real, registered customer. Fixed by (1) renaming a tenant to its owner's real email
the moment `apps/admin` sees a confirmed, non-anonymous session for it, and (2) having the
cleanup job independently confirm via the Auth admin API that a candidate tenant's owner
is still actually anonymous before deleting, regardless of what the name says. Also added
the cleanup that was actually asked for: anonymous accounts that never provide an email,
tenant or not, removed after 24h via the same admin API. See ADR 055.

**Not done:** a one-time backfill for tenants that already went stale before this fix —
the running fix only re-checks a tenant's name the next time its owner has an active
session, so an already-converted account that hasn't logged back in yet may still show a
stale `Guest_` name until it does.

## API layer

Auth model: `api/lib/server-config.js`'s `requireAuthentication` (verifies a bearer JWT
against Supabase Auth) → `requireTenantOwnership` / `requireSiteOwnership` (confirms the
authenticated user owns the tenant/site being acted on) is applied to every admin-facing
mutation (checkout, portal, delete-site, scan, update-document, generate-summary).
Onboarding endpoints that run *before* a site exists (`crawl-site`, `analyze-theme`) are
protected by Turnstile captcha instead, since there's no tenant to own yet.

**Fixed in this pass:** `api/lib/rate-limiter.js` was dead code — not imported anywhere in
the codebase, and it queried `tenants.query_limit` / `tenants.current_query_count`,
columns that don't exist in any migration (so if it *had* been wired up, it would have
failed closed and denied every request). Deleted. The real, working rate limiting is
`api/chat/index.js`'s in-memory per-Edge-isolate IP map — already correctly flagged in
`TODO.md` as needing a distributed store (Upstash/Redis or similar) since a `Map` doesn't
protect across multiple Edge instances; not re-solved here, since it's a real design
decision (choice of store) rather than a quick fix.

**Also noted:** `.env.example`'s `ADMIN_ALLOWED_ORIGINS` is declared but never read
anywhere in `api/` — leftover from the not-yet-done work (also in `TODO.md`) to replace
the chat origin check's `.includes()` with a strict origin allowlist. Left as-is rather
than removed, since it documents the intended shape of that future fix.

**Documentation drift, not a runtime bug:** `CLAUDE.md`'s Core Engineering Guidelines say
API routes must live in `apps/admin/api/`, but the actual, deployed API lives at repo-root
`/api` (confirmed by the file layout and by the same file's own Deployment section, which
says the admin SPA + API deploy together via `vercel --prod` from the repository root).
Worth fixing that line in a follow-up; not a functional issue so left alone here.

## Migration consolidation

The 9 incremental migrations from 2026-08-08 through 2026-08-25, plus the separate,
partially-stale `supabase/consolidated_latest_migrations.sql` reference dump, are all
replaced by one migration:
`supabase/migrations/20260905000000_consolidated_schema.sql`. It's a verified merge of
their net effect (every table, index, RPC, and RLS policy was traced back to the migration
that introduced it) plus the one thing the old dump file was still missing
(`delete_site_cascade`), not a schema redesign. It also adds the new `internal` schema.

**This replaces migration history — it is not an upgrade path.** A database that already
has the old 9 migrations applied under their original names must be reset first
(`supabase db reset`, or drop and recreate) before this one is applied; see
`docs/SETUP_CHECKLIST.md`. Every statement in the new file is still idempotent
(`IF NOT EXISTS` / `CREATE OR REPLACE` throughout), so re-running it against an
already-consolidated database is safe.

**Follow-up not done here:** `packages/shared/src/database.types.ts` (Supabase's
generated TypeScript types) should be regenerated against the reset database — see the
command printed at the end of `scripts/ops/setup-supabase.mjs`.

## What's missing before an enterprise buyer signs off

Beyond what `TODO.md`/`ADR.md` already track (RLS/auth hardening items above, Stripe
live-mode switch, `preview-proxy`'s SSRF exposure, the legal-entity/ToS/Privacy-Policy
placeholders in `LegalPages.jsx`), an enterprise procurement/security review typically
also asks for:

- **Audit logging.** Nothing beyond `console.log` today — no record of who changed a
  tenant's plan, deleted a site, or accessed what, and no durable log storage. Matters
  most once staff (via `apps/internal-admin`) or more than one person per tenant have
  access to sensitive actions.
- **Data retention & deletion policy, written down.** `delete_site_cascade` does a real
  cascade delete technically, but there's no documented answer to "how long do we keep a
  cancelled tenant's data" or "what's the process when a customer asks for full deletion
  under GDPR/Loi 25."
- **Backup/restore, verified.** Supabase does automatic backups on paid tiers, but that
  hasn't been tested (restore to a fresh project, confirm data integrity) or written up
  anywhere a buyer's security team could read it.
- **Uptime monitoring + a status page.** Nothing currently watches whether chat/checkout/
  scan are actually up in production.
- **A named incident-response contact/process.** Related to the Loi 25 privacy-officer
  gap `TODO.md` already flags — an enterprise buyer's security questionnaire will ask who
  to call.
- **SSO/SAML.** Not needed immediately (magic-link auth is fine for a first enterprise
  pilot), but likely a later ask if the buyer's own staff need seats — worth knowing it's
  not there yet rather than being surprised by the question.
- **A subprocessor list.** Supabase, Vercel, OpenRouter, Resend, Stripe, Cloudflare
  Turnstile, Jina Reader are all subprocessors today; `LegalPages.jsx` has the start of
  this but it should be a complete, current list before a security review.
- **Supabase Auth's URL Configuration, SMTP, and rate limit are still on their
  new-project defaults.** Confirmed live 2026-09-05, all three bit real login attempts
  the same day: Site URL defaults to `http://localhost:3000`, so any magic link requested
  from a domain not yet in Redirect URLs silently redirects there instead — not a code
  bug, but blocks login from any newly-deployed app (like `apps/internal-admin`) until its
  domain is added. The default email sender rate-limits after a handful of sign-ins/hour,
  fine for initial testing but not actual usage — needs custom SMTP (this project already
  has a Resend account for other transactional email; reuse it). And even with custom
  SMTP working, `rate_limit_email_sent` — a separate Auth-level throttle, defaulting to
  2/hour, independent of which mail provider is behind it — still caps every project
  until raised. All three are one-time dashboard config, not something
  `scripts/ops/setup-supabase.mjs` does yet — see `docs/setup/supabase.md` steps 3-5.

Most of the above is organizational/process work, not code, which is why this list
documents rather than builds it — flagging it now so it's a deliberate decision rather
than a surprise mid-negotiation.
