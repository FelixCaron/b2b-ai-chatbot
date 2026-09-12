import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfigurationError =
  !url || !anonKey
    ? 'Supabase configuration is incomplete. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
    : null;

// Only the publishable anon key may be supplied to Vite. Server credentials
// always stay in Vercel environment variables and must never enter this bundle.
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
  return {
    'Content-Type': 'application/json',
  };
}
