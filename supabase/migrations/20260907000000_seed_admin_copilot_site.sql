-- ===========================================================================
-- Seed the Admin Copilot's own tenant/site row
-- ===========================================================================
-- apps/admin/index.html embeds the widget on Dorafi's OWN website with a
-- hardcoded key: data-tenant-key="b2b00000-0000-4000-a000-000000000000".
-- api/chat/index.js treats that public_key as the special "Admin Copilot"
-- persona (isAdminCopilot) and skips the domain-lock check for it — but it
-- still looks the key up in `sites` like any other tenant first, before that
-- flag ever matters. No migration or seed ever inserted that row, so the
-- lookup always came back empty and every message from our own site's
-- chatbot 404'd with "Site not found" — surfaced to visitors as the generic
-- "technical issue" bubble, indistinguishable from any other failure.
--
-- Idempotent: safe to re-run, and safe if someone already created this row
-- by hand (ON CONFLICT DO NOTHING leaves it untouched either way).
-- ===========================================================================

INSERT INTO public.tenants (id, name, owner_user_id, plan, plan_status)
VALUES (
  'b2b00000-0000-4000-a000-00000000000a',
  'Dorafi (Admin Copilot)',
  NULL,
  'premium',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sites (id, tenant_id, domain, public_key, is_active, enable_lead_capture, bot_goal, bot_tone)
VALUES (
  'b2b00000-0000-4000-a000-00000000000b',
  'b2b00000-0000-4000-a000-00000000000a',
  'admin-seven-alpha-37.vercel.app',
  'b2b00000-0000-4000-a000-000000000000',
  TRUE,
  FALSE,
  'support',
  'professionnel'
)
ON CONFLICT (public_key) DO NOTHING;
