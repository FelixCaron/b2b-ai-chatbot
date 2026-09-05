import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY)
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
  : null;

// Lists every Supabase Auth user via the admin API (auth.users isn't
// queryable through PostgREST/supabase-js .from() — same restriction as
// internal.staff_admins elsewhere in this product), paginating until a
// short page confirms there's nothing left.
async function listAllUsers() {
  const perPage = 1000;
  let page = 1;
  const users = [];
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }
  return users;
}

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
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const deletedTenantIds = [];
    const deletedUserIds = [];
    const skippedConvertedUserIds = [];

    // 1. Guest tenants older than 24h — ON DELETE CASCADE cleans up their
    // sites, documents, messages, leads automatically.
    //
    // A tenant's name is only ever set once, at creation (see
    // apps/admin/src/App.jsx's handleAddSite: `user.email ||
    // 'Guest_<timestamp>'`) — apps/admin now renames it the moment its
    // owner converts (adds and confirms an email), but data created before
    // that fix, or any other path that could leave a real account under a
    // stale "Guest_" name, would otherwise have its real data deleted here.
    // Guard against that directly rather than trusting the name alone:
    // confirm the owner is still actually anonymous before deleting.
    const { data: candidateGuests, error: selectErr } = await supabase
      .from('tenants')
      .select('id, name, owner_user_id, created_at')
      .like('name', 'Guest_%')
      .lt('created_at', cutoff);
    if (selectErr) throw selectErr;

    for (const tenant of candidateGuests || []) {
      let stillAnonymous = true;
      if (tenant.owner_user_id) {
        const { data: ownerData, error: ownerErr } = await supabase.auth.admin.getUserById(tenant.owner_user_id);
        if (ownerErr) {
          // Owner lookup failing (e.g. already deleted some other way) —
          // treat as "can't confirm it's still a guest", skip rather than
          // risk deleting a real user's data.
          skippedConvertedUserIds.push(tenant.owner_user_id);
          continue;
        }
        stillAnonymous = Boolean(ownerData?.user?.is_anonymous);
      }
      if (!stillAnonymous) {
        skippedConvertedUserIds.push(tenant.owner_user_id);
        continue;
      }

      const { error: deleteErr } = await supabase.from('tenants').delete().eq('id', tenant.id);
      if (deleteErr) throw deleteErr;
      deletedTenantIds.push(tenant.id);
    }

    // 2. Anonymous Supabase Auth accounts that never provided an email,
    // older than the same cutoff — whether or not they ever got as far as
    // creating a tenant (most don't: an anonymous session starts on every
    // visit, before anyone enters a URL to scan). Tenants for any that had
    // one were just removed above, so this is safe: owner_user_id has
    // ON DELETE RESTRICT, so a user still linked to a tenant simply fails
    // to delete here rather than cascading unexpectedly — caught and
    // skipped per-user rather than aborting the whole sweep.
    const allUsers = await listAllUsers();
    const staleAnonymousUsers = allUsers.filter(
      (user) => user.is_anonymous && !user.email && new Date(user.created_at).toISOString() < cutoff
    );

    for (const user of staleAnonymousUsers) {
      const { error: deleteUserErr } = await supabase.auth.admin.deleteUser(user.id);
      if (deleteUserErr) {
        skippedConvertedUserIds.push(user.id);
        continue;
      }
      deletedUserIds.push(user.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted_tenants: deletedTenantIds.length,
        tenant_ids: deletedTenantIds,
        deleted_auth_users: deletedUserIds.length,
        auth_user_ids: deletedUserIds,
        skipped: skippedConvertedUserIds.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
