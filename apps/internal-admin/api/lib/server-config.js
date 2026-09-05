// Local copy of the auth-check pattern from the root api/lib/server-config.js.
// Duplicated rather than imported across the app boundary: Vercel bundles
// each project's serverless functions starting from that project's own root
// directory, so a relative import reaching into ../../../api would be
// fragile at best and silently broken at worst depending on how the
// function bundler traces dependencies. This file is intentionally small.
import { createClient } from '@supabase/supabase-js';

export function requireServerEnv(...names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required server configuration: ${missing.join(', ')}`);
  }
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

export function createServiceRoleClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = requireServerEnv(
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  );
  return createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_ROLE_KEY.trim());
}

function readAuthorizationHeader(req) {
  if (typeof req.headers?.get === 'function') return req.headers.get('authorization');
  return req.headers?.authorization;
}

export async function requireAuthentication(req) {
  const authorization = readAuthorizationHeader(req);
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }

  const supabase = createServiceRoleClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    const error = new Error('Invalid authentication token');
    error.statusCode = 401;
    throw error;
  }

  return { user, supabase };
}

// The actual security boundary for this whole app: being a valid, logged-in
// Supabase user is NOT enough (that's true of every guest/tenant user in the
// product) — the user's id must also be present in internal.staff_admins.
// That table lives in a schema PostgREST never exposes (see supabase/migrations
// — section 16 of the consolidated schema), so even the service-role client
// can't query it directly over the REST/JS-client path — there's no route
// for it at all. Instead we go through public.is_staff_admin(), a
// SECURITY DEFINER bridge function restricted to service_role, which is the
// only way this check (or any other read of that table) can happen. Every
// api/staff/* handler must call this before touching any cross-tenant data.
export async function requireStaff(req) {
  const { user, supabase } = await requireAuthentication(req);

  const { data: isStaff, error } = await supabase.rpc('is_staff_admin', {
    check_user_id: user.id,
  });

  if (error || !isStaff) {
    const err = new Error('Not authorized for staff access');
    err.statusCode = 403;
    throw err;
  }

  return { user, supabase };
}
