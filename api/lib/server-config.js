import { createClient } from '@supabase/supabase-js';

export function requireServerEnv(...names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required server configuration: ${missing.join(', ')}`);
  }

  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

export function createServiceRoleClient() {
  const { VITE_SUPABASE_URL, SUPABASE_SECRET_KEY } = requireServerEnv(
    'VITE_SUPABASE_URL',
    'SUPABASE_SECRET_KEY'
  );

  return createClient(VITE_SUPABASE_URL.trim(), SUPABASE_SECRET_KEY.trim());
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

/**
 * Whether this user is on the internal staff allow-list.
 *
 * internal.staff_admins is not reachable over PostgREST by design (the
 * `internal` schema is absent from config.toml's [api].schemas), so this goes
 * through the SECURITY DEFINER bridge granted to service_role only — see
 * supabase/migrations/20260905000000_consolidated_schema.sql section 16. A
 * failure to answer is treated as "not staff": this function only ever widens
 * access, so it must fail closed.
 */
async function isStaffAdmin(supabase, userId) {
  try {
    const { data, error } = await supabase.rpc('is_staff_admin', { check_user_id: userId });
    if (error) throw error;
    return data === true;
  } catch (err) {
    console.warn('[auth] staff check failed, treating as non-staff:', err.message);
    return false;
  }
}

/**
 * The caller must own this tenant — or be internal staff acting on the
 * customer's behalf.
 *
 * The staff branch exists so support can do for a customer what the customer
 * can do for themselves (re-index a page whose content changed, fix an
 * assistant that answers from stale text) from the staff console, instead of
 * asking for their password or walking them through it on the phone. It is
 * narrow on purpose: staff membership lives in a schema PostgREST cannot
 * reach, the check fails closed, and every route that acts on this branch
 * records who did what in internal.staff_audit — the returned
 * `actingAsStaff` flag is how a handler knows it has to.
 */
export async function requireTenantOwnership(req, tenantId) {
  if (!tenantId) throw new Error('tenant_id is required');

  const { user, supabase } = await requireAuthentication(req);

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (!tenantError && tenant) return { user, supabase, actingAsStaff: false };

  if (await isStaffAdmin(supabase, user.id)) {
    console.log(`[auth] staff ${user.email} acting on tenant ${tenantId}`);
    return { user, supabase, actingAsStaff: true };
  }

  const error = new Error('Tenant access denied');
  error.statusCode = 403;
  throw error;
}

export async function requireSiteOwnership(req, tenantId, siteId) {
  if (!siteId) throw new Error('site_id is required');
  const { user, supabase, actingAsStaff } = await requireTenantOwnership(req, tenantId);
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (siteError || !site) {
    const error = new Error('Site access denied');
    error.statusCode = 403;
    throw error;
  }

  return { user, supabase, actingAsStaff };
}

