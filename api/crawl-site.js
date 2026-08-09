export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      }
    });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing required field: url' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    const initialParsed = new URL(targetUrl);
    const cleanHost = initialParsed.hostname.replace(/^www\./, '');

    // List of candidate URLs to try if the primary fails
    const candidates = [
      targetUrl,
      `https://${cleanHost}`,
      `http://${cleanHost}`,
      `https://www.${cleanHost}`,
      `http://www.${cleanHost}`
    ];

    // Remove duplicates
    const uniqueCandidates = [...new Set(candidates)];

    let res = null;
    let successfulUrl = targetUrl;

    for (const candidate of uniqueCandidates) {
      try {
        const response = await fetch(candidate, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml'
          }
        });
        if (response.ok) {
          res = response;
          successfulUrl = candidate;
          break;
        }
      } catch (_e) {}
    }

    if (!res || !res.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Impossible d'accéder au site web (${cleanHost}). Veuillez vérifier que le nom de domaine existe et est accessible publiquement.` 
        }), 
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    const parsedTarget = new URL(successfulUrl);
    const domainHost = parsedTarget.hostname;

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const rootTitle = titleMatch ? titleMatch[1].trim() : parsedTarget.hostname;

    const hrefRegex = /href=["']([^"']+)["']/g;
    const discoveredUrls = new Set();
    discoveredUrls.add(targetUrl);

    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      const link = match[1];
      if (
        !link ||
        link.startsWith('#') ||
        link.startsWith('mailto:') ||
        link.startsWith('tel:') ||
        link.startsWith('javascript:') ||
        /\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js)$/i.test(link)
      ) {
        continue;
      }

      try {
        const resolved = new URL(link, targetUrl);
        if (resolved.hostname === domainHost) {
          resolved.hash = '';
          resolved.search = '';
          discoveredUrls.add(resolved.href);
        }
      } catch (_e) {}
    }

    const pages = Array.from(discoveredUrls).map((pageUrl) => {
      const u = new URL(pageUrl);
      const pathname = u.pathname === '/' ? "Page d'accueil" : u.pathname;
      return {
        url: pageUrl,
        path: u.pathname,
        title: pathname
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        root_url: targetUrl,
        root_title: rootTitle,
        total_discovered: pages.length,
        pages: pages
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
