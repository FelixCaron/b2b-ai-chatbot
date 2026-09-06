// POST /api/sites/claim — first half of the guest → existing-account handoff.
//
// Called from App.jsx's handleLogin when a guest (anonymous-auth) tries to
// convert via supabase.auth.updateUser({ email }) and that fails because the
// email already belongs to a real account. Converting the anonymous session
// itself is impossible in that case (Supabase won't attach an email that's
// already taken), so instead we record a claim — proof, made while this
// anonymous session is still live, that it owns the tenant being handed
// off — and the caller then sends a normal magic-link sign-in to that email.
// Once the recipient signs in, api/sites/redeem-claim.js finishes the
// transfer via claim_guest_site() (see the site-limits migration).
//
// One claim per site in the tenant, not one per tenant: claim_guest_site
// moves a single site (plus its documents/summaries/scan_jobs/leads) at a
// time, so a guest workspace with several sites needs a claim for each.
import { requireTenantOwnership } from '../lib/server-config.js';

export const config = {
  runtime: 'edge',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { tenant_id, email } = await req.json();

    if (!tenant_id || !email || !EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: 'tenant_id and a valid email are required' }), { status: 400, headers: CORS_HEADERS });
    }

    let user, supabase;
    try {
      ({ user, supabase } = await requireTenantOwnership(req, tenant_id));
    } catch (authErr) {
      return new Response(JSON.stringify({ error: authErr.message || 'Unauthorized' }), {
        status: authErr.statusCode || 401,
        headers: CORS_HEADERS
      });
    }

    // This handoff only makes sense from a guest session: a signed-in user
    // claiming their own tenant into itself is a no-op that would just
    // clutter guest_site_claims with rows that never redeem to anything new.
    if (!user.is_anonymous) {
      return new Response(JSON.stringify({ error: 'Only a guest workspace can be handed off this way.' }), { status: 400, headers: CORS_HEADERS });
    }

    const { data: sites, error: sitesError } = await supabase
      .from('sites')
      .select('id')
      .eq('tenant_id', tenant_id);

    if (sitesError) {
      return new Response(JSON.stringify({ error: sitesError.message }), { status: 500, headers: CORS_HEADERS });
    }
    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ success: true, claim_ids: [] }), { status: 200, headers: CORS_HEADERS });
    }

    const claimIds = [];
    for (const site of sites) {
      // guest_site_claims_open_site_uq allows only one *open* claim per
      // site — replace it rather than stacking a second one a re-sent link
      // could later redeem alongside the first.
      await supabase.from('guest_site_claims').delete().eq('site_id', site.id).is('redeemed_at', null);

      const { data: claim, error: claimErr } = await supabase
        .from('guest_site_claims')
        .insert({ guest_tenant_id: tenant_id, site_id: site.id, claimed_by_email: email })
        .select('id')
        .single();

      if (claimErr || !claim) {
        return new Response(JSON.stringify({ error: `Could not prepare the transfer: ${claimErr?.message || 'unknown error'}` }), { status: 500, headers: CORS_HEADERS });
      }
      claimIds.push(claim.id);
    }

    return new Response(JSON.stringify({ success: true, claim_ids: claimIds }), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    console.error('[sites/claim] Handler exception:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
  }
}
