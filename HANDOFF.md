# HANDOFF — onboarding state machine work

Written 2026-09-06 to continue in a fresh conversation. Delete this file once the
remaining items are done.

## What this work was

The app was built around one happy path. Every other path a user can take was
undefined rather than decided: refresh mid-scan, hit Back, sign in with an email
that already has an account, add a site at the plan limit, get downgraded while
holding more sites than the new plan allows. The task was to enumerate all of it
as an automaton and make every transition land somewhere sensible.

## Decisions — locked in, do NOT re-litigate

- Site limits: **Basic 1 / Pro 2 / Premium 10**.
- Guest signs in with an **already-registered email** → send the sign-in link, then
  **ask to confirm** moving the workspace into that account.
- Transfer carries the site, its documents, `site_summaries`, `scan_jobs` and
  `leads` — **not** the guest's own test chat messages.
- Account **already has that domain** → no transfer, just sign in and open it.
- **At the limit** during a transfer → upgrade is the lead CTA; "replace an
  existing site" is secondary, behind a destructive confirm naming what is deleted.
- **Downgrade over the limit** → user picks which sites stay active; the rest are
  **parked (`is_active = false`), never deleted**, and restored on upgrade.
- Real URL routing is in scope.

## DONE — committed and pushed to `main`

| Commit | What |
|---|---|
| `9cccde9` | DB: `plan_site_limit()`, `sites_enforce_limit` trigger, `sites.is_active`, `sites_tenant_domain_uq`, `guest_site_claims`, `claim_guest_site()`, FK cascade fix |
| `b7e7f05` | `api/sites/claim.js` (create/redeem), `is_active` gate in `api/chat/index.js` + `init.js`, ADR 057, `docs/INTEGRATION_REVIEW.md` corrections |
| `815fbb3` | `Dashboard.jsx` limits 1/2/10, duplicate-domain guard, upgrade-first at-limit modal, `OVER_LIMIT_CHOOSE` park flow, reactivate; `Pricing.jsx` copy |
| `3e2d0a5` | `App.jsx` login branching via `signInWithOtp({shouldCreateUser:false})`, claim create/redeem, `<WorkspaceTransfer />`, removal of the cross-tenant `tenant_id` fallback, pushState/popstate routing |

All four are on `origin/main`. Working tree was clean at handoff.

Verified so far: shared build, `npm test` (4/4 schemas, 24/24 API imports incl. the
new route), `npm run test:secrets`, and `npm run build --workspace=@b2b-ai-chatbot/admin`
all green. The SQL was exercised against a scratch Postgres 16 covering the limit
trigger on insert and on tenant transfer, the re-activation guard, per-tenant domain
uniqueness, tenant cascade delete, and every `claim_guest_site` status including the
at-limit retry; idempotent across three applications.

## NOT DONE — pick up here

### 1. `docs/user-flow-automaton.html` — written, but its status markers are stale

**The document exists and is committed** (`72c6feb`, ~109KB): 206 numbered transitions
across 7 tables, 5 mermaid diagrams, each row carrying source state, event, guard,
target state and an implemented / partial / missing marker. The transitions and target
states are correct and reviewed.

**What is wrong with it:** the markers were captured against the codebase *before* the
four commits below landed, so work that now exists still reads as `partial` or
`missing`. Current tally: 92 implemented / 58 partial / 47 missing — several of which
are no longer true. Rows known to need re-marking (by their `num` column):

- Guest → already-registered email and the claim round trip: **14, 25, 26, 27, 28**
- At-limit add-site and the upgrade-first flow: **16, 31, 42, 77, 78, 81, 82**
- `OVER_LIMIT_CHOOSE` (downgrade parking): **38, 88, 89, 90, 91**
- Parked sites (`is_active`) in dashboard and preview: **71, 73**
- URL routing — Back/Forward/refresh/direct entry: **123** and the other view rows that
  say "View switches; URL does not"

Re-verify each against the code before flipping it; do not bulk-replace. Rows genuinely
still missing (mid-scan refresh with no resume, expired/used magic-link handling,
malformed-URL validation) must stay marked missing — that honesty is the point of the
document.

Optional: publish it as an Artifact. Note the file is a full standalone HTML page with
`<html>`/`<head>`/`<body>`; the Artifact publisher wants page content only, so it needs
a stripped variant rather than the file as-is.

For reference, the spec it was built to — reuse if regenerating any part:

- State table **plus** a mermaid diagram (`<pre class="mermaid">` blocks render natively).
- Exhaustive over states × events. States: session/identity (`ANON`,
  `GUEST_WITH_SITE`, `GUEST_PENDING_CONFIRM`, `REGISTERED`, `REGISTERED_AT_LIMIT`);
  Dashboard onboarding steps (`INPUT`, `ANALYZING`, `CRAWLING`, `PAGE_SELECT`,
  `READY`, `PREVIEW`, `INTEGRATION`, `ADD_SITE`, `AT_LIMIT`, `DELETE_CONFIRM`,
  `OVER_LIMIT_CHOOSE`); auth sub-states (`LOGIN_MODAL`, `LINK_SENT`, `LINK_RETURN`,
  `TRANSFER_PROMPT`, `TRANSFER_AT_LIMIT`); views (`DASHBOARD`, `LEADS`, `PRICING`,
  `ABOUT`, `PRIVACY`, `TERMS`, `PAYMENT_SUCCESS`, `PAYMENT_CANCEL`); billing
  (`CHECKOUT`, `PORTAL`).
- Events: submit URL; scan succeeds/fails/times out; Test/Preview/Embed; enter email
  (new / already registered / malformed); magic link (valid / expired / already used);
  confirm or decline transfer; add site (under / at limit); upgrade vs replace; delete
  site; sign out; refresh; Back/Forward; direct URL entry; session expiry; Stripe
  webhook plan change; 24h cleanup sweep.
- Every row: source state, event, guard, target state, and an
  **implemented / partial / missing-today** marker verified against the code, not assumed.
- House style: match `docs/explore-repondo.html`. Self-contained single HTML file,
  theme-aware, wide tables scroll in their own `overflow-x` container.
- Also publish it as an Artifact.

Guards come from `supabase/migrations/20260905030000_site_limits_and_guest_claims.sql`
— that migration is the source of truth. Claims expire after 12h; guest workspaces are
swept at 24h.

### 2. End-to-end tests never run against the combined change

`npm run test:e2e` (70 specs) has **not** been run since any of this landed. Run it.
`scripts/e2e/niche-landing.spec.js` deep-links `/solutions/osteopathes`, which the new
pushState routing must still resolve on first load — that is the most likely breakage.

### 3. The migration has NOT been applied to the live database

`9cccde9` is only committed, not applied. Apply it via the Management API
(`POST /v1/projects/frcollnxlzqgussqqsmi/database/query`, see
`scripts/ops/setup-supabase.mjs`) once the UI is deployed.

**Ordering matters:** applying it before the UI ships would enforce Basic = 1 site
while the pricing page still advertised five. The UI is now pushed, so that ordering
constraint is satisfied — but redeploy before applying.

Needs a fresh `SUPABASE_ACCESS_TOKEN` from the user; the one from 2026-09-05 was valid
24h and has expired. This container holds no credentials. Pass the token inline in the
shell command — **never** write it to a file, and never print live key values.

### 4. Manual walkthrough

The guest → existing-email transfer spans an email round trip no local test covers.
Walk it on the deployed app.

**Blocked:** Resend has `repondo.com` unverified, so `onboarding@resend.dev` only
delivers to caron.felix2@gmail.com. Signup for any other address stays broken until
the DNS records are added. This gates the walkthrough.

## Notes for whoever continues

- `App.jsx` and `Dashboard.jsx` were written by separate agents. `Dashboard.jsx` keeps
  a local `siteActiveOverrides` map for immediate feedback because `sites` is owned by
  `App.jsx` and is not refetched after a direct Supabase update; the next tenant load
  reads `is_active` from the DB and the map becomes a no-op. If you touch the sites
  data flow, collapse that.
- `claim_guest_site` is granted to `service_role` **only** — unlike `delete_site_cascade`,
  which anon/authenticated may call — because it moves data between tenants. Keep it
  unreachable from the browser.
- `sites_tenant_domain_uq` is per-tenant on purpose, not global: two unrelated customers
  may legitimately register the same domain, and a global constraint would leak one
  tenant's site to another.
- Bracket-segment API routes (`[id].js`) do not build in this project — see ADR 054.
- `npm run build --workspace=@b2b-ai-chatbot/shared` must run **first** or `npm test`
  fails with `ERR_MODULE_NOT_FOUND` (`dist/` is not committed).
- The user pushes to `main` directly and has said so repeatedly; the branch
  `claude/enterprise-readiness-admin-dashboard-ff06a7` is stale (21 behind, 0 ahead).
