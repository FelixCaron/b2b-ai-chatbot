/**
 * Anti-Frame-Blocker Preview Proxy
 * Fetches target website HTML, strips X-Frame-Options & CSP headers,
 * injects <base href="..."> and neutralizes frame-busting scripts so
 * the site can render seamlessly inside preview iframes without browser blocks.
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
    const parsedTarget = new URL(targetUrl);
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      const errMsg = `Failed to fetch target site (${response.status} ${response.statusText})`;
      if (res && res.status) return res.status(response.status).send(errMsg);
      return new Response(errMsg, { status: response.status });
    }

    let html = await response.text();

    // 1. Inject <base href="..."> so relative paths (CSS, JS, images, fonts) resolve to original site
    const baseUrl = `${parsedTarget.protocol}//${parsedTarget.host}${parsedTarget.pathname.substring(0, parsedTarget.pathname.lastIndexOf('/') + 1) || '/'}`;
    const baseTag = `<base href="${baseUrl}">`;

    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/(<head[^>]*>)/i, `$1\n  ${baseTag}`);
    } else {
      html = `${baseTag}\n${html}`;
    }

    // 2. Remove meta tags that enforce CSP or X-Frame-Options
    html = html.replace(/<meta[^>]+http-equiv\s*=\s*["']?(?:Content-Security-Policy|X-Frame-Options)["']?[^>]*>/gi, '');

    // 3. Neutralize classic framebuster JS snippets (e.g. if (top != self) top.location = self.location)
    html = html.replace(/if\s*\(\s*(?:window\.)?top\s*!==?\s*(?:window\.)?self\s*\)/gi, 'if (false)');
    html = html.replace(/(?:window\.)?top\.location(?:\.href)?\s*=\s*(?:window\.)?location(?:\.href)?/gi, '/* neutralized framebuster */');
    html = html.replace(/(?:window\.)?top\.location\.replace/gi, '/* neutralized */ location.replace');

    // 4. Return clean HTML without restrictive framing headers
    if (res && res.setHeader && res.send) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.removeHeader?.('X-Frame-Options');
      res.removeHeader?.('Content-Security-Policy');
      return res.send(html);
    }

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60, s-maxage=300'
      }
    });
  } catch (err) {
    const errText = `Proxy error loading ${targetUrl}: ${err.message}`;
    if (res && res.status) {
      return res.status(500).send(errText);
    }
    return new Response(errText, { status: 500 });
  }
}
