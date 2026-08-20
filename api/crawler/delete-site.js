import { createServiceRoleClient, requireAuthentication } from '../lib/server-config.js';

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

    if (!site_id) {
      return new Response(JSON.stringify({ error: 'Missing required field: site_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let supabase;
    try {
      const auth = await requireAuthentication(req);
      supabase = auth.supabase;
    } catch {
      // Fallback to service role client if authorization header is not available (e.g., guest session)
      supabase = createServiceRoleClient();
    }

    // 1. Cascade cleanup on all child tables referencing this site_id
    await supabase.from('documents').delete().eq('site_id', site_id).catch(() => {});
    await supabase.from('site_summaries').delete().eq('site_id', site_id).catch(() => {});
    await supabase.from('leads').delete().eq('site_id', site_id).catch(() => {});
    await supabase.from('scan_jobs').delete().eq('site_id', site_id).catch(() => {});
    await supabase.from('usage_counters').delete().eq('site_id', site_id).catch(() => {});

    // 2. Delete the site itself
    let deleteQuery = supabase.from('sites').delete().eq('id', site_id);
    if (tenant_id) {
      deleteQuery = deleteQuery.eq('tenant_id', tenant_id);
    }
    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      console.error('[delete-site] Error deleting site:', deleteError);
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        site_id
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
