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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Votre session a expiré. Veuillez vous reconnecter.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}
