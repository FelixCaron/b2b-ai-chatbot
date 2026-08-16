/**
 * Frame Security Checker API
 * Performs a lightweight HEAD/GET request to the target website to check
 * if X-Frame-Options or Content-Security-Policy headers block iframing.
 * Returns { canFrame: boolean } so the frontend can fallback to a screenshot.
 */

export default async function handler(req, res) {
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
    const msg = JSON.stringify({ error: 'Missing url query parameter' });
    if (res && res.status) return res.status(400).send(msg);
    return new Response(msg, { status: 400 });
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    // We do a GET instead of HEAD because some servers reject HEAD requests or omit headers.
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      redirect: 'follow'
    });

    const xfo = response.headers.get('x-frame-options');
    const csp = response.headers.get('content-security-policy');
    
    let canFrame = true;

    // Check X-Frame-Options
    if (xfo) {
      const xfoUpper = xfo.toUpperCase();
      if (xfoUpper.includes('DENY') || xfoUpper.includes('SAMEORIGIN')) {
        canFrame = false;
      }
    }

    // Check CSP frame-ancestors
    if (canFrame && csp) {
      const cspLower = csp.toLowerCase();
      // If it has frame-ancestors but doesn't explicitly allow *, it's likely blocking us.
      if (cspLower.includes('frame-ancestors') && !cspLower.includes('frame-ancestors *')) {
        canFrame = false;
      }
    }

    const payload = JSON.stringify({ canFrame, status: response.status });

    if (res && res.setHeader && res.send) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(payload);
    }

    return new Response(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    // If it fails to fetch (e.g. CORS/network error), assume we can't frame it reliably, or fallback to screenshot.
    const payload = JSON.stringify({ canFrame: false, error: err.message });
    if (res && res.status) return res.status(200).send(payload);
    return new Response(payload, { status: 200 });
  }
}
