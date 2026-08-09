# CLAUDE.md - Development & Architecture Guide

## Project Overview
Multi-tenant B2B AI Chatbot SaaS built with Supabase (pgvector, pgmq, RLS, Raw SQL), Deno Edge Functions, OpenRouter Free Models (`google/gemini-2.0-flash-lite:free`), Vanilla JS Widget, and React Admin SPA.

## Monorepo Layout
- `/packages/shared`: Shared Zod schemas & TypeScript types.
- `/apps/admin`: React / Vite administrative portal with Vercel Serverless Functions (`/api`).
- `/apps/widget`: Embeddable Vanilla JS chat widget.
- `/supabase`: Raw SQL migrations, pgvector setup, pgmq queues, and Deno Edge Functions.

## 🚀 Status & Advancement
- **LLM Integration**: Migrated from direct Google GenAI SDK to **OpenRouter API**.
  - Default Model: `openrouter/free` (auto-routes to the best available free model, zero API cost).
  - Vercel Serverless API (`api/lib/llm.js`): Moved from `apps/admin` to monorepo root to resolve Error 405 (Method Not Allowed) and ensure correct Vercel Monorepo Edge Functions deployment.
  - Supabase Edge Functions (`supabase/functions/chat/index.ts` & `ingestion-worker/index.ts`): Refactored to fetch OpenRouter chat completions & embeddings.
- **Backend & Database**:
  - Raw SQL migrations created for multi-tenant isolation, RLS rules, and usage RPCs (`increment_usage`, `increment_lead_usage`).
  - Vector hybrid search RPC `match_documents_hybrid` active with pgvector.
- **Frontend & Deployment**:
  - Admin dashboard on Vercel (`admin-seven-alpha-37.vercel.app`).
  - API Routes properly exposed natively through Vercel's root `/api` routing.
  - Chat Widget embed script configured for dynamic tenant loading.

## Database & RLS Rules
- NO external ORMs (No Prisma, No Drizzle).
- Use Supabase CLI and Raw SQL migrations.
- Strict RLS enabled on `tenants`, `sites`, `documents`, `messages`, `leads`.
- Service role key used in Edge Functions with manual tenant isolation (`tenant_id`).

## ⚠️ Core Engineering & Bug Fixing Guidelines
1. **General Solutions Only**: When addressing bugs or user feedback, ALWAYS fix the underlying system architecture, crawler pipelines, RLS queries, or code logic. NEVER write one-off scratch scripts to populate specific domains, mutate tenant data manually, or create domain-specific hardcoded fallbacks.
2. **Seamless User Flow**: The onboarding and crawling pipeline must work automatically for ANY URL entered by ANY user without manual intervention.
3. **Strict Tenant Data Isolation**: Ensure `documents` queries in Supabase ALWAYS enforce strict matching by `tenant_id` so all sites belonging to the same tenant share knowledge while preventing data from bleeding to other tenants.

## 📦 GitHub Deployment Instructions
To publish and deploy this repository on GitHub:

1. **Initialize Git repository**:
   ```bash
   cd c:\Users\felix\Desktop\Chatbots\Demos\b2b-ai-chatbot
   git init
   git add .
   git commit -m "feat: complete OpenRouter free tier migration and project setup"
   ```

2. **Create repository on GitHub**:
   - Go to [GitHub New Repository](https://github.com/new).
   - Name the repository (e.g. `b2b-ai-chatbot`).
   - Leave it empty (do NOT check "Add a README" or ".gitignore").

3. **Link & Push**:
   ```bash
   git remote add origin https://github.com/<your-username>/b2b-ai-chatbot.git
   git branch -M main
   git push -u origin main
   ```

