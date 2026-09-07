-- ===========================================================================
-- Retire the "Admin Copilot" special persona — Dorafi now runs through the
-- exact same bot/RAG pipeline as every customer tenant
-- ===========================================================================
-- api/chat/index.js used to special-case one hardcoded public_key
-- (b2b00000-0000-4000-a000-000000000000) into an "isAdminCopilot" persona:
-- a hand-maintained PLATFORM SUMMARY prompt (pricing, plan names, etc.)
-- instead of the normal RAG-derived site summary, plus a bypass of the
-- domain lock and message persistence. That hardcoded prompt drifted from
-- reality (it said Pro was "$40/month" in two places close together, which
-- nudged the model into misreporting Basic's price as $40 too) — exactly
-- the kind of domain-specific hardcoded fallback this project's own
-- guidelines say to avoid. The code no longer special-cases that key at
-- all: it's now wired to the Dorafi team's own real tenant
-- (fa272051-6af7-4fab-80f5-8f64f6292f59, owned by caron.felix2@gmail.com,
-- already scanned and indexed with real, accurate site content from
-- admin-felix-fe3e.vercel.app/pricing) — the same widget embed, same
-- RAG/search_knowledge_base pipeline, same everything as any customer.
--
-- This migration:
--   1. Points that real site's `domain` at admin-felix-fe3e.vercel.app, the
--      domain apps/admin/index.html's widget embed now actually targets, so
--      the normal domain-lock check passes for real visitors without any
--      special-cased bypass.
--   2. Removes the orphaned tenant/site seeded for the retired persona
--      (20260907000000_seed_admin_copilot_site.sql) — nothing references
--      that key anymore.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

UPDATE public.sites
SET domain = 'admin-felix-fe3e.vercel.app'
WHERE public_key = 'fa272051-6af7-4fab-80f5-8f64f6292f59';

DELETE FROM public.sites WHERE public_key = 'b2b00000-0000-4000-a000-000000000000';
DELETE FROM public.tenants WHERE id = 'b2b00000-0000-4000-a000-00000000000a';
