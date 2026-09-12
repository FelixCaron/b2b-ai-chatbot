// GET/POST /api/staff/admins — list current staff, or grant staff access to
// a teammate by email. Both verbs require the caller to already be staff
// (requireStaff) — this page manages who else can see cross-tenant data, so
// it's gated the same way everything else in this app is, not opened up to
// any authenticated user.
import { requireStaff } from '../_lib/server-config.js';

export default async function handler(req, res) {
  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireStaff(req));
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message || 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase.rpc('list_staff_admins');
      if (error) throw error;
      return res.status(200).json({ admins: data || [] });
    } catch (err) {
      console.error('[staff/admins] list error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const email = req.body?.email?.trim();
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    try {
      // One-button flow: don't make staff separately ask the teammate to
      // sign in first. If nobody has a Supabase Auth account under this
      // email yet, create one right here — inviteUserByEmail() creates the
      // auth.users row and emails them a link to set their password, so
      // grant_staff_admin (below) always has an account to attach to.
      const { data: existing, error: lookupError } = await supabase.rpc('find_auth_user_by_email', {
        target_email: email,
      });
      if (lookupError) throw lookupError;

      let created = false;
      if (!existing || existing.length === 0) {
        const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
        if (inviteError) {
          return res.status(400).json({ error: `Couldn't create an account for ${email}: ${inviteError.message}` });
        }
        created = true;
      }

      const { data, error } = await supabase.rpc('grant_staff_admin', {
        target_email: email,
        granted_by: user.email,
      });
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(200).json({ admin: data?.[0] || null, created });
    } catch (err) {
      console.error('[staff/admins] grant error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
