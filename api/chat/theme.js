import { extractThemeColors } from '../lib/llm.js';
import { assertSafeExternalUrl, fetchSafeExternalUrl } from '../lib/url-security.js';
import { verifyTurnstileToken } from '../lib/captcha.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cf-turnstile-token',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      }
    });
  }

  try {
    const { url, cf_turnstile_token } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing required field: url' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const token = cf_turnstile_token || req.headers.get('cf-turnstile-token');
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || '';
    const captchaCheck = await verifyTurnstileToken(token, clientIp);
    if (!captchaCheck.success) {
      return new Response(JSON.stringify({ error: 'Captcha verification failed. Please try again.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (process.env.TEST_MODE === 'true') {
      return new Response(JSON.stringify({ primary_color: '#1e3a8a', org_name: 'Portes Delafontaine' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
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
    let primaryColor = '#6366f1';
    let themeMode = 'light';
    let backgroundColor = '#ffffff';
    let textColor = '#0f172a';

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

    return new Response(
      JSON.stringify({
        success: true,
        url: targetUrl,
        org_name: detectedOrgName,
        primary_color: primaryColor,
        theme_mode: themeMode,
        background_color: backgroundColor,
        text_color: textColor
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
