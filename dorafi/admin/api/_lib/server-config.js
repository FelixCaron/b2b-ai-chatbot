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

export async function requireTenantOwnership(req, tenantId) {
  if (!tenantId) throw new Error('tenant_id is required');

  const { user, supabase } = await requireAuthentication(req);

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .eq('owner_user_id', user.id)
    .maybeSingle();
  if (tenantError || !tenant) {
    const error = new Error('Tenant access denied');
    error.statusCode = 403;
    throw error;
  }

  return { user, supabase };
}

export async function requireSiteOwnership(req, tenantId, siteId) {
  if (!siteId) throw new Error('site_id is required');
  const { user, supabase } = await requireTenantOwnership(req, tenantId);
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

  return { user, supabase };
}

