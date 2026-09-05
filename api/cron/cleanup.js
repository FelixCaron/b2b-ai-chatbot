import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
  : null;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    });
  }

  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Delete guest tenants older than 24 hours
    // ON DELETE CASCADE will clean up sites, documents, messages, leads automatically
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: expiredGuests, error: selectErr } = await supabase
      .from('tenants')
      .select('id, name, created_at')
      .like('name', 'Guest_%')
      .lt('created_at', cutoff);

    if (selectErr) throw selectErr;

    if (!expiredGuests || expiredGuests.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No expired guests found', deleted: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const ids = expiredGuests.map(g => g.id);
    const { error: deleteErr } = await supabase
      .from('tenants')
      .delete()
      .in('id', ids);

    if (deleteErr) throw deleteErr;

    return new Response(
      JSON.stringify({ success: true, deleted: ids.length, guest_ids: ids }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
