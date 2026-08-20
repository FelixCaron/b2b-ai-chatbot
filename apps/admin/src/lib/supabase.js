import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigurationError =
  !url || !anonKey
    ? 'La configuration Supabase est incomplète. Définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.'
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
