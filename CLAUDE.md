# CLAUDE.md - Development & Architecture Guide

## Project Overview
Dorafi — a multi-tenant B2B AI Chatbot SaaS built with Supabase (pgvector, FTS, RLS, Raw SQL), Vercel Edge Functions, OpenRouter Free Models (`openrouter/free`), Vanilla JS Widget, and React Admin SPA. "Dorafi" is the working brand name (see `ADR.md` and `TODO.md`'s "Administratif" section) — repo/package names still use the original `b2b-ai-chatbot` identifier and are out of scope for the rename.

## Monorepo Layout
One directory per deployable, and the directory names are the Vercel project names:

- `/dorafi/admin`: The product — React/Vite admin SPA **and** its Vercel serverless functions in `dorafi/admin/api/`. Deployed as `dorafi-admin`.
- `/dorafi/staff`: Staff-only cross-tenant console, with its own `api/` (see `docs/INTEGRATION_REVIEW.md` for why it is a separate project, not a route in the admin app). Deployed as `dorafi-staff`.
- `/dorafi/widget`: Embeddable Vanilla JS chat widget (standalone IIFE bundle). Deployed as `dorafi-widget`.
- `/logafi`: The parent company's site (`logafi.com`) — hand-written static HTML, no build step, no `package.json`. Deployed as `logafi`. Outside `/dorafi` on purpose: a different company, not a Dorafi surface.
- `/packages/contracts`: Request/response contracts shared by the handlers and the browser clients.
- `/packages/shared`: Shared Zod schemas & TypeScript types.
- `/supabase/migrations`: Raw SQL migrations (pgvector, FTS, RLS, usage RPCs).
- `/scripts`: `scripts/tests` is exactly what `npm test` runs — nothing else lives there. `scripts/dev` (local servers), `scripts/ops` (setup, seeding and smoke-check tooling), `scripts/live` (scripts that need real credentials and a real database, never run in CI).
- `/tests/e2e`: Playwright suite, covering both the Dorafi app and the logafi site.
- `/infra/terraform`: Both environments as code — the Supabase projects, the four Vercel projects, and the GitHub Actions variables and secrets the deploy pipeline reads.
- `/docs`: `DEPLOYMENT.md` (environments and the pipeline), `ARCHITECTURE.md` (components and API contracts), `SETUP_CHECKLIST.md` and `setup/` (standing one up from scratch).

The repository root holds no deployable of its own: no `api/`, no `vercel.json`. Everything shipped lives in the directory of the project that ships it.

## API Architecture
Serverless functions live in the `api/` directory of the project that deploys them — Vercel turns `<project root>/api/**` into functions, so there is no other place they can live.

**`dorafi/admin/api/`** (deployed with the admin SPA, as `dorafi-admin`):
- `chat/index.js` — Agentic loop: the LLM decides when to call the `search_knowledge_base` tool → RAG → synthesized answer. SSE streaming.
- `chat/init.js` — Read-only: serves the widget's pregenerated, site-language greeting/labels (from `site_summaries`) so the opening screen isn't hardcoded English.
- `chat/theme.js` — Extracts brand colour and org name from a website's HTML using the LLM.
- `crawler/scan.js` — Fetches a page via Jina Reader, chunks the text, inserts into `documents` with FTS indexing.
- `crawler/crawl.js` — Discovers subpages via sitemaps and HTML link extraction.
- `crawler/summarize.js`, `crawler/update.js`, `crawler/delete-site.js` — Site summary generation, chunk edits, cascade deletion.
- `billing/checkout.js`, `billing/portal.js`, `billing/webhook.js` — Stripe.
- `sites/claim.js` — Moves a guest workspace into the account that just signed in.
- `lib/llm.js` — OpenRouter abstraction layer (chat, lead extraction, theme extraction); the rest of `lib/` is captcha, email, HTTP, RAG, server config, site origin/summary and URL security.

**`dorafi/staff/api/`** (deployed with the staff console, as `dorafi-staff`): `staff/tenants.js`, `staff/sites.js`, `staff/admins.js`.

Every handler's request/response shape comes from `packages/contracts`, which both sides import — `scripts/tests/test-contracts.js` and `scripts/tests/test-api-imports.cjs` fail the build if a handler drifts from it.

## Database & RLS Rules
- NO external ORMs (No Prisma, No Drizzle).
- Use Supabase CLI and Raw SQL migrations.
- Strict RLS enabled on `tenants`, `sites`, `documents`, `messages`, `leads`.
- `SUPABASE_SECRET_KEY` used ONLY in server-side API routes with manual tenant isolation (`tenant_id`).
- Frontend uses `VITE_SUPABASE_PUBLISHABLE_KEY` only (via `import.meta.env`).
- Use Supabase's new-format API keys (`sb_publishable_...` / `sb_secret_...`, Project Settings → API Keys), not the legacy anon/service_role JWTs.

## Environments
Two, and they share only the code: **production** (`dorafi.logafi.com`,
`logafi.com`) and **preview** (`preview.dorafi.logafi.com`,
`preview.logafi.com`). Each has its own Supabase project, its own Stripe mode
and its own captcha keys. Both are declared in `infra/terraform/` — including
the GitHub Actions variables and secrets the pipeline reads — so no value is
ever copied by hand from one dashboard into another.

Rules that follow from that, and that are easy to break by accident:
- **A deployment must never reach another environment.** Nothing in shipped code
  may hardcode a domain, a database URL or a tenant key. Derive it: from the
  origin that served the script (the widget does this), from the request, or
  from an environment variable with a production fallback. `tests/e2e/widget-origin.spec.js`
  pins the widget's half of this.
- **Environment variables are scoped to one Vercel target**, never to both at
  once. A value on `["production", "preview"]` means preview writes to the
  production database.
- **Don't edit Supabase auth settings in the dashboard.** `supabase_settings` in
  Terraform owns Site URL, the redirect allow-list, the email rate limit, the
  email-change behaviour and the three branded templates. `supabase db push`
  does not apply any of it, and `supabase config push` would overwrite Terraform
  — don't run it.

`.env.example` lists every variable the code actually reads. The ones worth
knowing about here: `VITE_SUPABASE_URL` is not a secret and is read both
server-side (`process.env`) and client-side (`import.meta.env`) — one var, no
separate server-only name; `SUPABASE_SECRET_KEY` is server-side only, never
behind a `VITE_` prefix; `VITE_APP_URL` is how a deployment knows its own public
address.

## ⚠️ Core Engineering & Bug Fixing Guidelines
1. **General Solutions Only**: When addressing bugs, ALWAYS fix the underlying system architecture. NEVER write one-off scripts to populate specific domains or create domain-specific hardcoded fallbacks.
2. **Seamless User Flow**: The onboarding and crawling pipeline must work automatically for ANY URL entered by ANY user without manual intervention.
3. **Strict Tenant Data Isolation**: `documents` queries ALWAYS enforce `tenant_id` matching. All sites under one tenant share knowledge. No cross-tenant data leakage.
4. **API next to the app that deploys it**: serverless functions MUST live in `dorafi/admin/api/` (or `dorafi/staff/api/` for the staff console), because Vercel only turns `<project root directory>/api/**` into functions. Never put API routes at the monorepo root — the root is not a deployable.
5. **Shared server code goes in `api/_lib/`, and the underscore is load-bearing.** Vercel makes a serverless function out of *every* `.js` file under `api/`, shared modules included. With the directory named `lib/`, `dorafi/admin` built 21 functions instead of 12 and could not deploy at all: the Hobby plan rejects a deployment above 12. The `_` prefix is what excludes a path from route detection. Never add a directory under `api/` that is not meant to be routes without prefixing it.

## Deployment
Four Vercel projects, one per deployable directory, each declared in
`infra/terraform/`:

| Vercel project | Root directory | Build | Serves |
|---|---|---|---|
| `dorafi-admin` | `dorafi/admin` | `vite build` | the SPA and `api/**` |
| `dorafi-staff` | `dorafi/staff` | `vite build` | staff-only console, plus its own `api/**` |
| `dorafi-widget` | `dorafi/widget` | `vite build` | `widget.iife.js` as a CDN asset |
| `logafi` | `logafi` | none | the directory, served as committed |

**GitHub Actions is the only way anything deploys.** A push to `main` runs the
tests, applies migrations to the preview database, deploys preview, smoke-tests
it, and then waits for an approval before touching production. Vercel's own git
integration is off: it deployed on push whether or not CI passed. See
`docs/DEPLOYMENT.md` for the pipeline, the limits of the preview environment,
and how to roll back.

- **Root Directory is load-bearing.** Vercel turns `<root directory>/api/**`
  into functions and nothing else, so `dorafi-admin` pointed anywhere else
  deploys an SPA with no API behind it. The pipeline counts the functions it
  built against the route files on disk and refuses to ship a mismatch.
- The widget bundle the admin app serves is the **committed**
  `dorafi/admin/public/widget.iife.js`. Deploying does not rebuild it; CI fails
  if the committed copy differs from a fresh build. Rebuild with
  `npm run build:widget` and commit the result.
- `vercel.json`'s `buildCommand` says `vite build`, not `npm run build` — the
  latter means two different things depending on which directory resolves it,
  and one of them rewrites the committed widget bundle mid-deploy.
