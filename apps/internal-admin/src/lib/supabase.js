import { createClient } from '@supabase/supabase-js';

// Same pattern as apps/admin/src/lib/supabase.js: only the publishable anon
// key ever reaches this bundle. Cross-tenant reads happen exclusively in
// api/staff/* (service-role key, server-side only, gated by requireStaff).
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigurationError =
  !url || !anonKey
    ? 'Supabase configuration is incomplete. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    : null;

export const supabase = supabaseConfigurationError ? null : createClient(url, anonKey);

export async function authenticatedHeaders() {
  if (!supabase) return { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      };
    }
  } catch (err) {
    console.warn('[authenticatedHeaders] failed to get session:', err);
  }
  return { 'Content-Type': 'application/json' };
}
