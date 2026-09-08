import { contracts } from '@b2b-ai-chatbot/contracts';
import { edgeRoute } from '../lib/http.js';
import { extractThemeColors } from '../lib/llm.js';
import { assertSafeExternalUrl, fetchSafeExternalUrl } from '../lib/url-security.js';
import { verifyTurnstileToken } from '../lib/captcha.js';

export const config = {
  runtime: 'edge',
};

// Reads the site's own declared favicon out of its real HTML — the same
// source of truth a browser tab uses — rather than guessing through a
// third-party lookup service (Google's s2/favicons endpoint, used as the
// dashboard's fallback, is known to sometimes hand back a generic/wrong
// icon instead of the site's actual one). Works for any URL automatically:
// nothing here is specific to a domain or requires the operator to upload
// anything.
function extractFaviconUrl(html, baseUrl) {
  if (!html) return null;

  const linkTagRegex = /<link\b[^>]*>/gi;
  // rel="icon" (the modern, most accurate declaration) is preferred outright;
  // "shortcut icon" / "apple-touch-icon" / etc. are only used if no plain
  // "icon" link ever shows up.
  let modernHref = null;
  let fallbackHref = null;
  let match;

  while ((match = linkTagRegex.exec(html)) !== null) {
    const tag = match[0];
    const relMatch = tag.match(/\brel=["']([^"']+)["']/i);
    const relValue = relMatch?.[1]?.toLowerCase().trim();
    if (!relValue || !relValue.includes('icon')) continue;

    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch || !hrefMatch[1]) continue;

    if (relValue === 'icon' && !modernHref) {
      modernHref = hrefMatch[1];
    } else if (!fallbackHref) {
      fallbackHref = hrefMatch[1];
    }
  }

  const bestHref = modernHref || fallbackHref;
  if (!bestHref) return null;
  try {
    return new URL(bestHref, baseUrl).toString();
  } catch (e) {
    return null;
  }
}

export default edgeRoute(contracts.chat.theme, async (req, { data, json }) => {
  const { url, cf_turnstile_token } = data;

  // Some call sites send the Turnstile token as a header instead of a body
  // field (see apps/admin Dashboard.jsx); accept either.
  const token = cf_turnstile_token || req.headers.get('cf-turnstile-token');
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || '';
  const captchaCheck = await verifyTurnstileToken(token, clientIp);
  if (!captchaCheck.success) {
    return json({ error: 'Captcha verification failed. Please try again.' }, 403);
  }

  if (process.env.TEST_MODE === 'true') {
    return json({ primary_color: '#1e3a8a', org_name: 'Portes Delafontaine' });
  }

  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  const initialParsed = assertSafeExternalUrl(targetUrl);
  const cleanHost = initialParsed.hostname.replace(/^www\./, '');

  const candidates = [
    targetUrl,
    `https://${cleanHost}`,
    `http://${cleanHost}`,
    `https://www.${cleanHost}`,
    `http://www.${cleanHost}`
  ];
  const uniqueCandidates = [...new Set(candidates)];

  let htmlSnippet = '';
  let successfulUrl = targetUrl;

  for (const candidate of uniqueCandidates) {
    try {
      const pageRes = await fetchSafeExternalUrl(candidate, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html'
        }
      });
      if (pageRes && pageRes.ok) {
        const fullHtml = await pageRes.text();
        htmlSnippet = fullHtml.substring(0, 8000);
        successfulUrl = candidate;
        break;
      }
    } catch (_e) {}
  }

  let detectedOrgName = cleanHost.charAt(0).toUpperCase() + cleanHost.slice(1);
  let primaryColor = '#293f68';
  let themeMode = 'light';
  let backgroundColor = '#ffffff';
  let textColor = '#0f172a';
  // Absolute (or null, never a bare relative path) so the dashboard can use
  // it directly as an <img src> with no further resolution.
  const faviconUrl = extractFaviconUrl(htmlSnippet, successfulUrl);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey && htmlSnippet) {
    const extracted = await extractThemeColors({ htmlSnippet, targetUrl, apiKey });
    if (extracted) {
      if (extracted.primary_color && extracted.primary_color.startsWith('#')) {
        primaryColor = extracted.primary_color;
      }
      if (extracted.org_name && extracted.org_name.length > 1) {
        detectedOrgName = extracted.org_name;
      }
      if (extracted.theme_mode === 'dark' || extracted.theme_mode === 'light') {
        themeMode = extracted.theme_mode;
      }
      if (extracted.background_color && extracted.background_color.startsWith('#')) {
        backgroundColor = extracted.background_color;
      }
      if (extracted.text_color && extracted.text_color.startsWith('#')) {
        textColor = extracted.text_color;
      }
    }
  }

  return json({
    success: true,
    url: targetUrl,
    org_name: detectedOrgName,
    primary_color: primaryColor,
    theme_mode: themeMode,
    background_color: backgroundColor,
    text_color: textColor,
    favicon_url: faviconUrl
  });
});
