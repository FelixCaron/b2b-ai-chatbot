// GET/POST /api/staff/admins — list current staff, or grant staff access to
// a teammate by email. Both verbs require the caller to already be staff
// (requireStaff) — this page manages who else can see cross-tenant data, so
// it's gated the same way everything else in this app is, not opened up to
// any authenticated user.
import { requireStaff } from '../lib/server-config.js';

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
      const { data, error } = await supabase.rpc('grant_staff_admin', {
        target_email: email,
        granted_by: user.email,
      });
      if (error) {
        // grant_staff_admin raises a plain-language exception when nobody has
        // signed in with this email yet — surface that message as-is rather
        // than a generic 500, since it's the actionable, expected case.
        return res.status(400).json({ error: error.message });
      }
      return res.status(200).json({ admin: data?.[0] || null });
    } catch (err) {
      console.error('[staff/admins] grant error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
