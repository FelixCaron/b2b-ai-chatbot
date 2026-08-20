import { createClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  let trimmed = rawUrl.trim();
  if (trimmed.includes('supabase.com/dashboard/project/')) {
    const ref = trimmed.split('/dashboard/project/')[1]?.split('/')[0]?.split('?')[0];
    if (ref) return `https://${ref}.supabase.co`;
  }
  if (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const url = normalizeSupabaseUrl(rawUrl);
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

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
