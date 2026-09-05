-- ===========================================================================
-- Site limits, downgrade handling, and guest-workspace claims
-- ===========================================================================
-- Adds the server-side half of three user-flow transitions that previously had
-- no defined target state (see docs/user-flow-automaton.html):
--
--   1. "Add a site while at the plan limit" — enforced only in the browser
--      (Dashboard.jsx), so any client that skips that check could insert past
--      the limit through RLS. Now a trigger, which holds regardless of client.
--   2. "Plan downgraded below the number of sites you own" — nothing happened
--      at all; sites kept serving on a plan that no longer covered them. Now
--      sites carry is_active, and the widget entry points refuse an inactive
--      one. Sites are never deleted for this, so upgrading restores them.
--   3. "Guest signs in with an email that already has an account" — the guest
--      workspace was orphaned and swept 24h later. Now the guest's session
--      records a claim while it is still live and provably owns the tenant,
--      and claim_guest_site() moves the whole workspace in one transaction.
--
-- Idempotent, like every migration in this folder: safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. PLAN → SITE LIMIT, one source of truth for the database side
--    Mirrors getMaxSitesForPlan in apps/admin/src/features/dashboard/Dashboard.jsx
--    and the plan copy in apps/admin/src/components/Pricing.jsx. Unknown and
--    legacy plan values ('free', NULL, anything Stripe hasn't mapped yet) get
--    the most restrictive answer rather than an accidental free-for-all.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_site_limit(p_plan TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_plan, 'basic'))
    WHEN 'premium' THEN 10
    WHEN 'pro'     THEN 2
    ELSE 1
  END;
$$;

REVOKE ALL ON FUNCTION public.plan_site_limit(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_site_limit(TEXT) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. sites.is_active — a site the tenant's current plan no longer covers
--    Default TRUE so every existing site keeps working; only a downgrade (or
--    the user's own choice in the over-limit chooser) ever sets it FALSE.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.sites.is_active IS
  'FALSE when a plan downgrade left the tenant over its site limit and the user chose to park this site. Its widget stops answering (api/chat/index.js, api/chat/init.js) but nothing is deleted — upgrading and re-activating restores it untouched.';

CREATE INDEX IF NOT EXISTS sites_tenant_active_idx ON public.sites (tenant_id, is_active);

-- ---------------------------------------------------------------------------
-- 3. ENFORCE THE SITE LIMIT IN THE DATABASE
--    Fires on INSERT and on any change of tenant_id (which is how a claimed
--    guest site arrives in an account — an UPDATE, not an INSERT, so an
--    insert-only trigger would miss exactly the path most likely to overshoot).
--    Also fires when a parked site is re-activated, so a client can't simply
--    flip is_active back on for every site it owns and serve past the limit.
--
--    SECURITY DEFINER because it reads tenants/sites to count, and the row it
--    needs may be filtered differently under the caller's RLS context; the
--    function only ever counts rows for the tenant already named on NEW.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_site_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan  TEXT;
  v_limit INT;
  v_count INT;
BEGIN
  SELECT plan INTO v_plan FROM public.tenants WHERE id = NEW.tenant_id;
  v_limit := public.plan_site_limit(v_plan);

  IF TG_OP = 'INSERT' OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    -- A new site in this workspace: every site counts against the limit,
    -- parked ones included — the limit is how many sites you may own, and
    -- parking is a consequence of exceeding it, not a way around it.
    SELECT count(*) INTO v_count FROM public.sites WHERE tenant_id = NEW.tenant_id;
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'site_limit_reached: plan % allows % website(s); this workspace already has %',
        coalesce(v_plan, 'basic'), v_limit, v_count
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.is_active AND NOT OLD.is_active THEN
    -- Re-activating a parked site: only the active ones compete for the slots.
    SELECT count(*) INTO v_count
      FROM public.sites
     WHERE tenant_id = NEW.tenant_id AND is_active AND id <> NEW.id;
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'site_limit_reached: plan % allows % active website(s); % already active',
        coalesce(v_plan, 'basic'), v_limit, v_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sites_enforce_limit ON public.sites;
CREATE TRIGGER sites_enforce_limit
  BEFORE INSERT OR UPDATE OF tenant_id, is_active ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.enforce_site_limit();

-- ---------------------------------------------------------------------------
-- 4. ONE DOMAIN PER WORKSPACE
--    There was no constraint at all, so the same domain could be added twice
--    within one tenant (two widgets, two knowledge bases, one website). Scoped
--    to the tenant, not global: two different customers legitimately can both
--    register the same domain, and a global unique index would let one of them
--    discover that the other exists.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS sites_tenant_domain_uq
  ON public.sites (tenant_id, lower(domain));

-- ---------------------------------------------------------------------------
-- 5. GUEST WORKSPACE CLAIMS
--    Written by api/sites/claim.js at magic-link send time, while the
--    anonymous session that built the workspace is still live and provably
--    owns it. Redeemed after the link round trip by whoever proves they own
--    claimed_by_email. Neither half alone is enough, which is the point: a
--    forgeable tenant id in localStorage would let anyone claim anyone's
--    guest workspace, and an email alone doesn't prove you built one.
--
--    RLS is enabled with NO policy: nothing reaches this table through
--    PostgREST under an anon or authenticated key, only the service role in
--    api/ routes (which bypasses RLS by design).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guest_site_claims (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id           UUID        NOT NULL REFERENCES public.sites(id)   ON DELETE CASCADE,
    claimed_by_email  TEXT        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Deliberately shorter than the 24h guest-cleanup window (api/cron/cleanup.js):
    -- a claim should never outlive the workspace it points at.
    expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '12 hours',
    redeemed_at       TIMESTAMPTZ,
    outcome           TEXT
);

COMMENT ON TABLE public.guest_site_claims IS
  'Pending transfers of a guest (anonymous-auth) workspace to an existing account, created while the anonymous session is live and redeemed after the magic-link round trip. Service-role only.';

CREATE INDEX IF NOT EXISTS guest_site_claims_email_idx
  ON public.guest_site_claims (lower(claimed_by_email)) WHERE redeemed_at IS NULL;

-- One live claim per site: re-sending the link replaces the previous claim
-- rather than stacking a second one that could be redeemed later.
CREATE UNIQUE INDEX IF NOT EXISTS guest_site_claims_open_site_uq
  ON public.guest_site_claims (site_id) WHERE redeemed_at IS NULL;

ALTER TABLE public.guest_site_claims ENABLE ROW LEVEL SECURITY;

-- Belt and braces: RLS with zero policies already blocks anon/authenticated
-- outright, but Supabase's default privileges grant table access to those
-- roles on anything created in public, so drop that too. Only the service
-- role (which bypasses both) ever touches this table.
REVOKE ALL ON TABLE public.guest_site_claims FROM anon, authenticated;
GRANT ALL ON TABLE public.guest_site_claims TO service_role;

-- ---------------------------------------------------------------------------
-- 6. THE TRANSFER ITSELF — atomic, or nothing
--    Moving sites.tenant_id alone would be data loss on a 24-hour fuse:
--    documents, site_summaries, scan_jobs and leads each carry their own
--    tenant_id, and the guest tenant is deleted by api/cron/cleanup.js a day
--    later — taking the moved site's pages and leads with it. Every table
--    moves together here, in one transaction, the same shape as
--    delete_site_cascade above.
--
--    messages are deliberately NOT moved: they are the guest's own test
--    conversations with their own draft assistant, not the new owner's
--    customer history. (The schema agrees — messages has no site_id, only
--    tenant_id + session_id, so there is no way to move just this site's.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_guest_site(p_claim_id UUID, p_new_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim       public.guest_site_claims%ROWTYPE;
  v_domain      TEXT;
  v_plan        TEXT;
  v_limit       INT;
  v_count       INT;
  v_existing_id UUID;
BEGIN
  IF p_claim_id IS NULL OR p_new_tenant_id IS NULL THEN
    RAISE EXCEPTION 'claim_guest_site requires both claim_id and new_tenant_id';
  END IF;

  SELECT * INTO v_claim FROM public.guest_site_claims WHERE id = p_claim_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_claim.redeemed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_redeemed');
  END IF;
  IF v_claim.expires_at < NOW() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  -- The site must still be sitting in the guest workspace the claim was
  -- created from; if it has moved or been deleted, the claim is stale.
  SELECT domain INTO v_domain
    FROM public.sites
   WHERE id = v_claim.site_id AND tenant_id = v_claim.guest_tenant_id;

  IF NOT FOUND THEN
    UPDATE public.guest_site_claims
       SET redeemed_at = NOW(), outcome = 'stale'
     WHERE id = p_claim_id;
    RETURN jsonb_build_object('status', 'stale');
  END IF;

  -- Already have this domain? Nothing to transfer — the account's own copy is
  -- the one with their history. The guest copy expires on its own.
  SELECT id INTO v_existing_id
    FROM public.sites
   WHERE tenant_id = p_new_tenant_id AND lower(domain) = lower(v_domain)
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.guest_site_claims
       SET redeemed_at = NOW(), outcome = 'duplicate_domain'
     WHERE id = p_claim_id;
    RETURN jsonb_build_object(
      'status', 'duplicate_domain',
      'domain', v_domain,
      'existing_site_id', v_existing_id
    );
  END IF;

  -- Room on the plan? If not, the caller shows the upgrade-or-replace choice
  -- and comes back; the claim stays open (not redeemed) so it can be retried.
  SELECT plan INTO v_plan FROM public.tenants WHERE id = p_new_tenant_id;
  v_limit := public.plan_site_limit(v_plan);
  SELECT count(*) INTO v_count FROM public.sites WHERE tenant_id = p_new_tenant_id;

  IF v_count >= v_limit THEN
    RETURN jsonb_build_object(
      'status', 'at_limit',
      'domain', v_domain,
      'plan', coalesce(v_plan, 'basic'),
      'limit', v_limit,
      'site_count', v_count
    );
  END IF;

  UPDATE public.documents      SET tenant_id = p_new_tenant_id WHERE site_id = v_claim.site_id;
  UPDATE public.site_summaries SET tenant_id = p_new_tenant_id WHERE site_id = v_claim.site_id;
  UPDATE public.scan_jobs      SET tenant_id = p_new_tenant_id WHERE site_id = v_claim.site_id;
  UPDATE public.leads          SET tenant_id = p_new_tenant_id WHERE site_id = v_claim.site_id;
  -- Last, so the limit trigger on sites.tenant_id sees the final state.
  UPDATE public.sites
     SET tenant_id = p_new_tenant_id, is_active = TRUE
   WHERE id = v_claim.site_id;

  UPDATE public.guest_site_claims
     SET redeemed_at = NOW(), outcome = 'transferred'
   WHERE id = p_claim_id;

  RETURN jsonb_build_object(
    'status', 'transferred',
    'site_id', v_claim.site_id,
    'domain', v_domain,
    'tenant_id', p_new_tenant_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_guest_site(UUID, UUID) FROM PUBLIC;
-- service_role only, unlike delete_site_cascade: the whole security model here
-- is that the two halves of a claim are checked server-side (api/sites/claim.js
-- verifies the anonymous session owns the workspace when the claim is created,
-- and that the redeeming user owns claimed_by_email). Exposing this to anon or
-- authenticated would let a caller redeem a claim id it did not earn.
GRANT EXECUTE ON FUNCTION public.claim_guest_site(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. MAKE THE 24h GUEST SWEEP ACTUALLY ABLE TO DELETE
--    messages.tenant_id, leads.tenant_id and usage.tenant_id were declared as
--    plain REFERENCES tenants(id) — no ON DELETE clause, which in Postgres
--    means NO ACTION. Every other tenant-scoped table cascades. So
--    api/cron/cleanup.js's `delete from tenants` fails with a foreign key
--    violation for any guest workspace that actually got used (one chat
--    message is enough), and that guest is never swept — the opposite of the
--    intended lifecycle, and it accumulates silently because the job catches
--    the error per tenant. Fixed here rather than in the consolidated schema
--    alone so an already-provisioned database gets the fix too.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY['messages', 'leads', 'usage']) AS tbl
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      r.tbl, r.tbl || '_tenant_id_fkey'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE',
      r.tbl, r.tbl || '_tenant_id_fkey'
    );
  END LOOP;
END $$;
