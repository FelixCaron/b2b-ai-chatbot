import { authenticatedHeaders } from '../../../lib/supabase';

/**
 * Brand colour + organisation name for a website the user has just typed in.
 *
 * Deliberately a raw fetch and not `api.chat.theme(...)`: this endpoint is
 * reachable before signup and pairs the token in the body with a
 * `cf-turnstile-token` *header*, which the contract-backed client does not
 * send (it owns its headers). Routing this call through the client would
 * silently drop the captcha header.
 *
 * Resolves to the theme payload, or null when the server refused it. Throws
 * only on a transport failure, exactly as `fetch` does.
 */
export async function fetchBrandTheme(formattedUrl, captchaToken) {
  const authHeaders = await authenticatedHeaders();
  const themeRes = await fetch(`${window.location.origin}/api/chat/theme`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'cf-turnstile-token': captchaToken
    },
    body: JSON.stringify({ url: formattedUrl, cf_turnstile_token: captchaToken })
  });
  if (!themeRes.ok) return null;
  return themeRes.json();
}
