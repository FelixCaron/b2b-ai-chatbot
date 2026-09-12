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
- `/scripts`: Dev, ops and test tooling (`scripts/dev`, `scripts/ops`, `scripts/tests`, `scripts/adhoc`).
- `/tests/e2e`: Playwright suite, covering both the Dorafi app and the logafi site.
- `/infra/terraform/vercel`: The four Vercel projects as code.

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

## Environment Variables
- `VITE_SUPABASE_URL` — Supabase project URL. Not a secret — one var, read both
  server-side (`process.env`, `api/` routes) and client-side (`import.meta.env`,
  `dorafi/admin`/`dorafi/staff`); no separate server-only name for it.
- `SUPABASE_SECRET_KEY` — Secret key, new format `sb_secret_...`. Server-side only
  (never exposed to the frontend).
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Publishable key, new format `sb_publishable_...`.
  Client-side, safe to expose in the Vite bundle.
- `OPENROUTER_API_KEY` — OpenRouter API key (server-side only).

## ⚠️ Core Engineering & Bug Fixing Guidelines
1. **General Solutions Only**: When addressing bugs, ALWAYS fix the underlying system architecture. NEVER write one-off scripts to populate specific domains or create domain-specific hardcoded fallbacks.
2. **Seamless User Flow**: The onboarding and crawling pipeline must work automatically for ANY URL entered by ANY user without manual intervention.
3. **Strict Tenant Data Isolation**: `documents` queries ALWAYS enforce `tenant_id` matching. All sites under one tenant share knowledge. No cross-tenant data leakage.
4. **API next to the app that deploys it**: serverless functions MUST live in `dorafi/admin/api/` (or `dorafi/staff/api/` for the staff console), because Vercel only turns `<project root directory>/api/**` into functions. Never put API routes at the monorepo root — the root is not a deployable.

## Deployment
Four Vercel projects, one per deployable directory — each deployed with `vercel --prod` from that directory, and each declared in `infra/terraform/vercel/main.tf`:

| Vercel project | Root directory | Build | Serves |
|---|---|---|---|
| `dorafi-admin` | `dorafi/admin` | `vite build` | `dorafi.logafi.com` — the SPA and `api/**` |
| `dorafi-staff` | `dorafi/staff` | `vite build` | staff-only console, plus its own `api/**` |
| `dorafi-widget` | `dorafi/widget` | `vite build` | `widget.iife.js` as a CDN asset |
| `logafi` | `logafi` | none | `logafi.com` — the directory, served as-is |

- The widget bundle the admin app serves is the **committed** `dorafi/admin/public/widget.iife.js`. Deploying the admin app does not rebuild it; CI fails instead if the committed copy differs from a fresh build. Rebuild it with `npm run build:widget` and commit the result.
- **CI/CD**: `.github/workflows/ci.yml` runs the tests and builds every app on push/PR. Deployment itself stays manual, per project.
