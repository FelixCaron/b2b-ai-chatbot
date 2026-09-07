-- ===========================================================================
-- Backfill sites' optional personality/pro-plan columns
-- ===========================================================================
-- 20260905000000_consolidated_schema.sql declares `sites` with
-- CREATE TABLE IF NOT EXISTS, including enable_lead_capture,
-- theme_primary_color, bot_goal, bot_tone, support_email and calendar_link
-- in that one statement. Its own header says as much: it is a RESET
-- migration, safe only against a freshly reset database — "do not run this
-- against a database that already has the old migrations applied under
-- their original names". Production was never reset (it holds real tenant
-- data), so `sites` already existed from the pre-consolidation incremental
-- migrations, and CREATE TABLE IF NOT EXISTS silently no-opped: none of
-- those six columns actually reached the live table.
--
-- The effect in production: api/chat/index.js's `sites` SELECT names all
-- six columns, Postgres returns 42703 (undefined_column) for every single
-- chat request, and the code falls back to hardcoded defaults for the whole
-- personality/lead-capture/pro-integrations feature set on every tenant —
-- surfaced to visitors as the widget's generic "technical issue" message.
--
-- Fixed here with plain ALTER TABLE ... ADD COLUMN IF NOT EXISTS, which is
-- safe and a no-op whether or not the consolidated migration's CREATE TABLE
-- already put these columns in place — unlike the CREATE TABLE statement
-- itself, this actually reaches a table that predates it.
-- ===========================================================================

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS enable_lead_capture BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS theme_primary_color TEXT    DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS bot_goal             TEXT    DEFAULT 'support',
  ADD COLUMN IF NOT EXISTS bot_tone             TEXT    DEFAULT 'professionnel',
  ADD COLUMN IF NOT EXISTS support_email        TEXT,
  ADD COLUMN IF NOT EXISTS calendar_link        TEXT;

COMMENT ON COLUMN public.sites.support_email IS 'Email address to receive support requests from the chatbot';
COMMENT ON COLUMN public.sites.calendar_link IS 'Booking link (Calendly, Cal.com…) provided by the chatbot for appointments';
COMMENT ON COLUMN public.sites.bot_goal IS 'lead | support';
COMMENT ON COLUMN public.sites.bot_tone IS 'amical | professionnel';
