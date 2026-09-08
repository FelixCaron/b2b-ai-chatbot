-- ===========================================================================
-- Enforce Pro/Premium-gated site features server-side
-- ===========================================================================
-- Lead capture (sites.enable_lead_capture), lead-gen as a conversation
-- objective (sites.bot_goal = 'lead'), and the Pro Integrations fields
-- (sites.support_email, sites.calendar_link) were only ever gated in the
-- dashboard UI (apps/admin's FeatureToggles.jsx) — a client that bypassed
-- that UI (or called Supabase directly) could set any of them regardless of
-- plan, and the value would then sit in the `sites` row indefinitely,
-- including through a later plan downgrade.
--
-- Two layers, matching how sites_enforce_limit already does this for the
-- website-count limit:
--   1. A BEFORE INSERT OR UPDATE trigger on `sites` that silently clamps
--      these columns back to their off/empty state whenever the owning
--      tenant's plan isn't pro or premium — holds regardless of which
--      client makes the write, and self-heals a stale value the next time
--      anything on that row is saved (e.g. changing the theme color after a
--      downgrade also clears a lingering enable_lead_capture=true).
--   2. api/chat/index.js additionally checks the tenant's plan at request
--      time before acting on these columns — belt and suspenders for a row
--      the trigger hasn't reprocessed yet (a plan downgrade itself doesn't
--      touch the `sites` table, so a stale TRUE can outlive it until the
--      next save).
--
-- Idempotent, like every migration in this folder: safe to re-run.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.enforce_pro_features()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT plan INTO v_plan FROM public.tenants WHERE id = NEW.tenant_id;

  IF lower(coalesce(v_plan, 'basic')) NOT IN ('pro', 'premium') THEN
    NEW.enable_lead_capture := FALSE;
    IF NEW.bot_goal = 'lead' THEN
      NEW.bot_goal := 'support';
    END IF;
    NEW.support_email := NULL;
    NEW.calendar_link := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sites_enforce_pro_features ON public.sites;
CREATE TRIGGER sites_enforce_pro_features
  BEFORE INSERT OR UPDATE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pro_features();

-- One-time cleanup: reset any existing sites that already hold a Pro-only
-- value while their tenant isn't on a Pro/Premium plan — most plausibly
-- from a downgrade since the value was set, but the trigger above closes
-- the same gap this row-update flows through either way.
UPDATE public.sites s
   SET enable_lead_capture = FALSE,
       bot_goal = CASE WHEN s.bot_goal = 'lead' THEN 'support' ELSE s.bot_goal END,
       support_email = NULL,
       calendar_link = NULL
  FROM public.tenants t
 WHERE t.id = s.tenant_id
   AND lower(coalesce(t.plan, 'basic')) NOT IN ('pro', 'premium')
   AND (
     s.enable_lead_capture IS TRUE
     OR s.bot_goal = 'lead'
     OR s.support_email IS NOT NULL
     OR s.calendar_link IS NOT NULL
   );
