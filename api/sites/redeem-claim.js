// POST /api/sites/redeem-claim — second half of the guest → existing-account
// handoff started by api/sites/claim.js.
//
// Called from App.jsx once the recipient of the magic link actually signs
// in (a real, non-anonymous session). The claim id(s) travel from the guest
// browser to this moment via localStorage (see App.jsx) rather than the
// magic-link URL itself — Supabase's own redirect doesn't carry app state
// through the confirmation round trip. A device switch between requesting
// the link and clicking it means the claim is simply never redeemed here;
// it expires on its own (guest_site_claims.expires_at) and the guest
// workspace is swept by the normal 24h cleanup, same as if no claim had
// ever been created — not a security hole, just a dropped transfer.
import { requireAuthentication } from '../lib/server-config.js';

export const config = {
  runtime: 'edge',
};

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
    const { claim_ids } = await req.json();
    if (!Array.isArray(claim_ids) || claim_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'claim_ids (non-empty array) is required' }), { status: 400, headers: CORS_HEADERS });
    }

    let user, supabase;
    try {
      ({ user, supabase } = await requireAuthentication(req));
    } catch (authErr) {
      return new Response(JSON.stringify({ error: authErr.message || 'Unauthorized' }), {
        status: authErr.statusCode || 401,
        headers: CORS_HEADERS
      });
    }

    if (user.is_anonymous || !user.email) {
      return new Response(JSON.stringify({ error: 'Sign in with a real account before redeeming a workspace transfer.' }), { status: 400, headers: CORS_HEADERS });
    }

    // Find (or, for a brand-new account that never added a site itself,
    // create) this user's own tenant — the target every claim moves into.
    const { data: existingTenants } = await supabase
      .from('tenants')
      .select('id')
      .eq('owner_user_id', user.id)
      .limit(1);

    let tenantId = existingTenants?.[0]?.id;
    if (!tenantId) {
      const { data: newTenant, error: tErr } = await supabase
        .from('tenants')
        .insert({ name: user.email, owner_user_id: user.id })
        .select('id')
        .single();
      if (tErr || !newTenant) {
        return new Response(JSON.stringify({ error: `Could not prepare your workspace: ${tErr?.message || 'unknown error'}` }), { status: 500, headers: CORS_HEADERS });
      }
      tenantId = newTenant.id;
    }

    const results = [];
    for (const claimId of claim_ids) {
      // claim_guest_site() itself doesn't check who's calling it (it's
      // service-role only, called exclusively from here) — confirm this
      // session's own email matches the claim before redeeming, so a leaked
      // or guessed claim id can't be redeemed by anyone but its recipient.
      const { data: claimRow } = await supabase
        .from('guest_site_claims')
        .select('claimed_by_email')
        .eq('id', claimId)
        .maybeSingle();

      if (!claimRow || claimRow.claimed_by_email.toLowerCase() !== user.email.toLowerCase()) {
        results.push({ claim_id: claimId, status: 'forbidden' });
        continue;
      }

      const { data, error } = await supabase.rpc('claim_guest_site', {
        p_claim_id: claimId,
        p_new_tenant_id: tenantId
      });

      if (error) {
        results.push({ claim_id: claimId, status: 'error', error: error.message });
      } else {
        results.push({ claim_id: claimId, ...data });
      }
    }

    return new Response(JSON.stringify({ success: true, tenant_id: tenantId, results }), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    console.error('[sites/redeem-claim] Handler exception:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
  }
}
