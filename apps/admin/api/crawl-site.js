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

    const discoveredUrls = new Set();
    discoveredUrls.add(targetUrl);

    // 1. Try discovering URLs via XML Sitemap (sitemap.xml / sitemap_index.xml / wp-sitemap.xml)
    const sitemapCandidates = [
      `https://${cleanHost}/sitemap.xml`,
      `https://www.${cleanHost}/sitemap.xml`,
      `https://${cleanHost}/sitemap_index.xml`,
      `https://www.${cleanHost}/sitemap_index.xml`,
      `https://${cleanHost}/wp-sitemap.xml`,
      `https://www.${cleanHost}/wp-sitemap.xml`
    ];

    for (const smUrl of sitemapCandidates) {
      try {
        const smRes = await fetch(smUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (smRes.ok) {
          const xml = await smRes.text();
          const locRegex = /<loc>([^<]+)<\/loc>/gi;
          let match;
          while ((match = locRegex.exec(xml)) !== null) {
            const loc = match[1].trim();
            if (loc.endsWith('.xml')) {
              // Fetch sub-sitemap
              try {
                const subRes = await fetch(loc, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (subRes.ok) {
                  const subXml = await subRes.text();
                  let subMatch;
                  while ((subMatch = locRegex.exec(subXml)) !== null) {
                    const subLoc = subMatch[1].trim();
                    if (!subLoc.endsWith('.xml')) {
                      discoveredUrls.add(subLoc);
                    }
                  }
                }
              } catch (_subErr) {}
            } else {
              discoveredUrls.add(loc);
            }
          }
          if (discoveredUrls.size > 5) break; // Successfully populated from sitemap
        }
      } catch (_smErr) {}
    }

    // 2. Fetch root HTML & parse href links using normalized clean host comparison
    let res = null;
    try {
      res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
    } catch (_e) {}

    let rootTitle = cleanHost;

    if (res && res.ok) {
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) rootTitle = titleMatch[1].trim();

      const hrefRegex = /href=["']([^"']+)["']/g;
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
          const linkHost = resolved.hostname.replace(/^www\./, '');
          if (linkHost === cleanHost) {
            resolved.hash = '';
            resolved.search = '';
            discoveredUrls.add(resolved.href);
          }
        } catch (_e) {}
      }
    }

    // Map discovered URLs to page objects
    const pages = Array.from(discoveredUrls).map((pageUrl) => {
      const u = new URL(pageUrl);
      let pageTitle = u.pathname === '/' ? "Page d'accueil" : u.pathname;
      pageTitle = pageTitle
        .replace(/^\//, '')
        .replace(/\/$/, '')
        .replace(/-/g, ' ');

      if (!pageTitle) pageTitle = "Page d'accueil";
      else pageTitle = pageTitle.charAt(0).toUpperCase() + pageTitle.slice(1);

      return {
        url: pageUrl,
        path: u.pathname,
        title: pageTitle
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
