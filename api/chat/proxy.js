import { fetchSafeExternalUrl } from '../lib/url-security.js';

/**
 * Preview capability check. It intentionally never returns third-party HTML:
 * serving it from the admin origin would expose the dashboard to XSS.
 */

export default async function handler(req, res) {
  // Support both Node (req.query) and Edge (req.url / Request) runtimes
  let targetUrl = '';
  if (req.query && req.query.url) {
    targetUrl = req.query.url;
  } else if (req.url) {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      targetUrl = urlObj.searchParams.get('url') || '';
    } catch {}
  }

  if (!targetUrl) {
    if (res && res.status) {
      return res.status(400).send('Missing url query parameter');
    }
    return new Response('Missing url query parameter', { status: 400 });
  }

  // Normalize URL
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    const response = await fetchSafeExternalUrl(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      const errMsg = `Failed to fetch target site (${response.status} ${response.statusText})`;
      if (res && res.status) return res.status(response.status).send(errMsg);
      return new Response(errMsg, { status: response.status });
    }

    const xFrameOptions = response.headers.get('x-frame-options') || '';
    const contentSecurityPolicy = response.headers.get('content-security-policy') || '';
    const canFrame = !/deny|sameorigin/i.test(xFrameOptions)
      && !/frame-ancestors\s+['"]?none|frame-ancestors\s+['"]?self/i.test(contentSecurityPolicy);
    const payload = JSON.stringify({ canFrame, url: targetUrl });

    if (res && res.status) return res.status(200).json(payload ? JSON.parse(payload) : {});
    return new Response(payload, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, s-maxage=300' }
    });
  } catch (err) {
    const errText = `Proxy error loading ${targetUrl}: ${err.message}`;
    if (res && res.status) {
      return res.status(500).send(errText);
    }
    return new Response(errText, { status: 500 });
  }
}
