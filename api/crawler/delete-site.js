import { requireSiteOwnership } from '../lib/server-config.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const { site_id, tenant_id } = await req.json();

    if (!site_id || !tenant_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields: site_id, tenant_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Always require authentication AND verify the caller actually owns this
    // tenant/site before deleting anything. There is no "unauthenticated
    // fallback" here: every real user (including guests) goes through
    // Supabase anonymous auth, so a valid bearer token is always present.
    // Skipping this check previously meant any authenticated user could
    // delete any site by guessing/knowing its id (IDOR).
    let supabase;
    try {
      ({ supabase } = await requireSiteOwnership(req, tenant_id, site_id));
    } catch (authErr) {
      const status = authErr.statusCode || 401;
      return new Response(JSON.stringify({ error: authErr.message || 'Unauthorized' }), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Single atomic transaction: either everything (documents, site_summaries,
    // leads, scan_jobs, and the site row itself) is deleted, or nothing is —
    // no more partial deletes from swallowed per-table errors.
    const { data, error } = await supabase.rpc('delete_site_cascade', {
      p_site_id: site_id,
      p_tenant_id: tenant_id
    });

    if (error) {
      console.error('[delete-site] Cascade delete failed:', error);
      return new Response(JSON.stringify({ error: error.message || 'Failed to delete site' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        site_id,
        deleted: data || null
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      }
    );
  } catch (err) {
    console.error('[delete-site] Handler exception:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
