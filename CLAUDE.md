# CLAUDE.md - Development & Architecture Guide

## Project Overview
Repondo — a multi-tenant B2B AI Chatbot SaaS built with Supabase (pgvector, FTS, RLS, Raw SQL), Vercel Edge Functions, OpenRouter Free Models (`openrouter/free`), Vanilla JS Widget, and React Admin SPA. "Repondo" is the working brand name (see `ADR.md` and `TODO.md`'s "Administratif" section) — repo/package names still use the original `b2b-ai-chatbot` identifier and are out of scope for the rename.

## Monorepo Layout
- `/packages/shared`: Shared Zod schemas & TypeScript types.
- `/apps/admin`: React / Vite admin portal + Vercel Serverless API (`/apps/admin/api/`).
- `/apps/widget`: Embeddable Vanilla JS chat widget (standalone IIFE bundle).
- `/supabase/migrations`: Raw SQL migrations (pgvector, FTS, RLS, usage RPCs).
- `/scripts`: Admin dev tools & E2E tests.

## API Architecture
All API endpoints live in `/api/` and are deployed with the root Vercel project:
- `chat.js` — Agentic loop: LLM decides when to call `search_knowledge_base` tool → RAG → synthesize response. SSE streaming.
- `start-scan.js` — Fetches page via Jina Reader, chunks text, inserts into `documents` table with FTS indexing.
- `crawl-site.js` — Discovers subpages via sitemaps and HTML link extraction.
- `analyze-theme.js` — Extracts brand color and org name from website HTML using LLM.
- `cleanup-guests.js` — Deletes guest tenants (name starts with `Guest_`) older than 24h. CASCADE deletes all related data.
- `lib/llm.js` — OpenRouter abstraction layer (chat, lead extraction, theme extraction).

## Database & RLS Rules
- NO external ORMs (No Prisma, No Drizzle).
- Use Supabase CLI and Raw SQL migrations.
- Strict RLS enabled on `tenants`, `sites`, `documents`, `messages`, `leads`.
- Secret key used ONLY in server-side API routes with manual tenant isolation (`tenant_id`).
- Frontend uses the publishable key only (via `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`).
- Use Supabase's new-format API keys (`sb_publishable_...` / `sb_secret_...`, Project Settings → API Keys), not the legacy anon/service_role JWTs — the env var *names* below are unchanged (still `SUPABASE_SECRET_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`), only the key *format* they hold has moved on.

## Environment Variables
### Vercel (Server-side, api/ routes):
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SECRET_KEY` — Secret key, new format `sb_secret_...` (never exposed to frontend)
- `OPENROUTER_API_KEY` — OpenRouter API key

### Vite (Client-side, apps/admin):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Public publishable key, new format `sb_publishable_...`

## ⚠️ Core Engineering & Bug Fixing Guidelines
1. **General Solutions Only**: When addressing bugs, ALWAYS fix the underlying system architecture. NEVER write one-off scripts to populate specific domains or create domain-specific hardcoded fallbacks.
2. **Seamless User Flow**: The onboarding and crawling pipeline must work automatically for ANY URL entered by ANY user without manual intervention.
3. **Strict Tenant Data Isolation**: `documents` queries ALWAYS enforce `tenant_id` matching. All sites under one tenant share knowledge. No cross-tenant data leakage.
4. **API in apps/admin/api/**: All serverless functions MUST live in `apps/admin/api/` since deployment runs from `apps/admin/`. Never put API routes at monorepo root.

## Deployment
- **Admin SPA + API**: Deployed via `vercel --prod` from the repository root. The root build writes the SPA to `apps/admin/dist` and Vercel discovers the root `api/` functions.
- **Widget**: Deployed via `vercel --prod` from `apps/widget/` directory. Serves `widget.iife.js` as CDN asset.
- **CI/CD**: GitHub Actions workflow (`.github/workflows/deploy.yml`) runs tests, builds, and deploys both apps.
