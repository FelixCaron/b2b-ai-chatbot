// POST /api/sites/claim — the two halves of "a guest signs in with an email
// that already has an account".
//
// The security model is deliberately split across two requests made by two
// different sessions, and neither half is sufficient on its own:
//
//   action: 'create'  — run by the ANONYMOUS session that built the guest
//                       workspace, at magic-link send time, while it can still
//                       prove (via requireTenantOwnership) that it owns the
//                       guest tenant. It names the email it is about to send
//                       the link to. This proves "I built this workspace".
//   action: 'redeem'  — run after the magic-link round trip by the now
//                       AUTHENTICATED user. It supplies NOTHING: no claim id,
//                       no tenant id. The claim is looked up by the verified
//                       email on the caller's own token, and the destination
//                       tenant is derived from the caller's own user id. This
//                       proves "I own this email".
//
// A claim id or tenant id coming from the browser is never trusted here: it
// would let anyone who guessed one adopt someone else's guest workspace. The
// actual transfer is public.claim_guest_site() (see
// supabase/migrations/20260905030000_site_limits_and_guest_claims.sql), which
// is EXECUTE-granted to service_role only — so it can only ever be reached
// through this route, after both proofs.
//
// Both actions live on this one route on purpose: bracket-segment routes
// (`[id].js`) do not build in this project, so the action is a body field.
// requireAuthentication / requireTenantOwnership hand back the service-role
// client they used to verify the token (createServiceRoleClient under the
// hood), which is also the only role allowed to touch guest_site_claims and to
// execute claim_guest_site — so every query below runs through it.
import { requireAuthentication, requireTenantOwnership } from '../lib/server-config.js';

export const config = {
  runtime: 'edge',
};

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

// Deliberately permissive: this only guards against obvious junk. The real
// verification is the magic link itself — an address that isn't yours never
// produces a session, so a claim recorded against it can never be redeemed.
function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    let body = {};
    try {
      body = (await req.json()) || {};
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const action = body.action;
    if (action === 'create') return await createClaim(req, body);
    if (action === 'redeem') return await redeemClaim(req);

    return json({ error: "Unknown action. Expected 'create' or 'redeem'." }, 400);
  } catch (err) {
    console.error('[sites/claim] Handler exception:', err);
    return json({ error: err.message || 'Internal error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// create — called by the anonymous guest session, just before the magic link
// is sent. Records "the holder of this guest workspace intends to hand it to
// whoever proves they own <email>".
// ---------------------------------------------------------------------------
async function createClaim(req, body) {
  const { guest_tenant_id, site_id } = body;
  const email = normalizeEmail(body.email);

  if (!guest_tenant_id || !site_id) {
    return json({ error: 'Missing required fields: guest_tenant_id, site_id' }, 400);
  }
  if (!email) {
    return json({ error: 'A valid email is required' }, 400);
  }

  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireTenantOwnership(req, guest_tenant_id));
  } catch (authErr) {
    return json({ error: authErr.message || 'Unauthorized' }, authErr.statusCode || 401);
  }

  // Owning the tenant is not enough: only an anonymous session can create a
  // claim. A fully signed-in user has no guest workspace to hand over, and
  // letting them create claims would turn this into "email an arbitrary
  // address a pending transfer of one of my sites".
  if (!user.is_anonymous) {
    return json({ error: 'Only a guest (anonymous) session can create a workspace claim' }, 403);
  }

  // The site must actually live in the guest tenant. requireTenantOwnership
  // proves the tenant, not the site; without this a guest could file a claim
  // pointing at somebody else's site id.
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id, domain')
    .eq('id', site_id)
    .eq('tenant_id', guest_tenant_id)
    .maybeSingle();

  if (siteError) {
    console.error('[sites/claim] Site lookup failed:', siteError);
    return json({ error: 'Failed to verify site ownership' }, 500);
  }
  if (!site) {
    return json({ error: 'Site access denied' }, 403);
  }

  // guest_site_claims_open_site_uq allows exactly one unredeemed claim per
  // site, so re-sending the link replaces the previous claim instead of
  // stacking a second one that could be redeemed later by a different address.
  const { error: clearError } = await supabase
    .from('guest_site_claims')
    .delete()
    .eq('site_id', site_id)
    .is('redeemed_at', null);

  if (clearError) {
    console.error('[sites/claim] Failed to clear previous claims:', clearError);
    return json({ error: 'Failed to prepare workspace claim' }, 500);
  }

  const { data: claim, error: insertError } = await supabase
    .from('guest_site_claims')
    .insert({
      guest_tenant_id,
      site_id,
      claimed_by_email: email
    })
    .select('id')
    .single();

  if (insertError || !claim) {
    console.error('[sites/claim] Failed to record claim:', insertError);
    return json({ error: 'Failed to record workspace claim' }, 500);
  }

  // The browser does not need to keep this — redemption looks claims up by the
  // verified email on the new session's token. It is returned for logging and
  // tests only.
  return json({ claim_id: claim.id, domain: site.domain });
}

// ---------------------------------------------------------------------------
// redeem — called once after any real (non-anonymous) sign-in. Takes no input
// at all beyond the caller's own bearer token.
// ---------------------------------------------------------------------------
async function redeemClaim(req) {
  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireAuthentication(req));
  } catch (authErr) {
    return json({ error: authErr.message || 'Unauthorized' }, authErr.statusCode || 401);
  }

  // An anonymous caller has no verified email, therefore nothing to redeem
  // into and no identity to redeem with.
  if (user.is_anonymous) {
    return json({ status: 'anonymous' });
  }

  const email = normalizeEmail(user.email);
  if (!email) {
    return json({ status: 'no_email' });
  }

  // Newest open, unexpired claim for this verified address. Expired and
  // already-redeemed claims are filtered out here as well as inside the RPC.
  const { data: claim, error: claimError } = await supabase
    .from('guest_site_claims')
    .select('id')
    .eq('claimed_by_email', email)
    .is('redeemed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (claimError) {
    console.error('[sites/claim] Claim lookup failed:', claimError);
    return json({ error: 'Failed to look up workspace claim' }, 500);
  }

  // By far the common case: every ordinary login calls this and has nothing
  // waiting. Not an error, and the client should stay silent about it.
  if (!claim) {
    return json({ status: 'not_found' });
  }

  // The destination tenant is derived from the authenticated user id, never
  // from the request. If the account somehow owns several, the oldest is the
  // real one (a converted guest's tenant is always the newer row).
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (tenantError) {
    console.error('[sites/claim] Tenant lookup failed:', tenantError);
    return json({ error: 'Failed to resolve your workspace' }, 500);
  }
  if (!tenant) {
    return json({ status: 'no_tenant' });
  }

  // claim_guest_site is EXECUTE-granted to service_role only (see the GRANT at
  // the bottom of the migration); `supabase` here is the service-role client
  // requireAuthentication built to verify the token, so the call goes through.
  const { data: result, error: rpcError } = await supabase.rpc('claim_guest_site', {
    p_claim_id: claim.id,
    p_new_tenant_id: tenant.id
  });

  if (rpcError) {
    console.error('[sites/claim] claim_guest_site failed:', rpcError);
    return json({ error: rpcError.message || 'Failed to transfer the workspace' }, 500);
  }

  // Returned verbatim: not_found | already_redeemed | expired | stale |
  // duplicate_domain | at_limit | transferred, each with the RPC's own fields.
  return json(result || { status: 'not_found' });
}
