-- ---------------------------------------------------------------------------
-- Self-serve 14-day Business trial
--
-- RENUMBERED 12 Sep 2026, from 20260909030000. It shared that version with
-- 20260909030000_leads_session_merge.sql, and Supabase keys applied migrations
-- by VERSION, not by filename: once leads_session_merge was recorded, this file
-- was considered done and never ran. Production therefore had no trial_ends_at
-- column and kept the old 'free' defaults — so every new workspace was created
-- with no trial at all, which is the one thing the whole onboarding promises.
-- Nothing said so: `supabase db push` reported success, and the migrations list
-- showed version 20260909030000 as applied.
--
-- Renumbered above the latest applied version rather than into a free slot
-- below it, so a plain `supabase db push` picks it up without --include-all.
-- Every statement is idempotent, so re-running it anywhere it did land is safe.
-- ---------------------------------------------------------------------------
-- The niche landing pages promise lead capture and booking redirection, but
-- those are Business ('pro') features and the paste-your-URL onboarding used
-- to create tenants on the free/basic default — so the very first thing a
-- prospect tried never delivered the promise. New self-serve tenants now
-- start on a Business trial for 14 days instead.
--
-- The onboarding insert (apps/admin/src/hooks/useWorkspace.js) writes a
-- tenants row with only name + owner_user_id, so changing the column DEFAULTS
-- is all it takes to put every new self-serve workspace on the trial — no code
-- change at the insert site, and existing explicit-plan inserts (the seeded
-- admin-copilot tenant, the Stripe webhook's updates) keep overriding it.
--
-- Expiry is enforced LAZILY at read time (api/lib/plan.js, read by
-- api/chat/index.js and api/chat/init.js), NOT by a scheduled job: the Vercel
-- cron slot that would sweep expired trials is currently unavailable (see
-- TODO.md — Vercel Hobby 12-function cap). A self-serve trial (plan_status
-- 'trialing' with NO stripe_subscription_id) whose trial_ends_at has passed is
-- treated as unpaid and the widget stops serving until the owner subscribes.
-- Stripe-managed subscriptions carry a stripe_subscription_id and flow through
-- the billing webhook (trialing -> active -> canceled), so this lazy expiry
-- never touches them.
--
-- Greenfield: there are no existing tenants to backfill. Rows created before
-- this migration (should any exist) simply have trial_ends_at = NULL, which
-- resolveTenantPlan() treats as "no self-serve trial to expire".
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

ALTER TABLE public.tenants
  ALTER COLUMN plan SET DEFAULT 'pro';

ALTER TABLE public.tenants
  ALTER COLUMN plan_status SET DEFAULT 'trialing';

ALTER TABLE public.tenants
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');

COMMENT ON COLUMN public.tenants.plan IS
  'Current plan slug: basic, pro, premium. Defaults to ''pro'' for the self-serve Business trial; the Stripe webhook overwrites it with the purchased tier, or ''basic'' on cancellation.';

COMMENT ON COLUMN public.tenants.plan_status IS
  'Billing status: free, trialing, active, canceled, past_due. Defaults to ''trialing'' for the self-serve trial. ''trialing'' with no stripe_subscription_id is a self-serve trial expired lazily via trial_ends_at (api/lib/plan.js); with a stripe_subscription_id it is Stripe-governed.';

COMMENT ON COLUMN public.tenants.trial_ends_at IS
  'When a self-serve Business trial ends (creation + 14 days by default). NULL for pre-migration rows and irrelevant once a Stripe subscription governs the account. Enforced lazily in api/lib/plan.js — no scheduled job flips the plan.';
