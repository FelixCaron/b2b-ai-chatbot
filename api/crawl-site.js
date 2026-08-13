export const config = {
  runtime: 'edge',
};

function isValidPageUrl(urlStr, cleanHost) {
  try {
    const u = new URL(urlStr);
    if (u.hostname.replace(/^www\./, '') !== cleanHost) return false;
    const p = u.pathname.toLowerCase();
    // Exclude static assets
    if (/\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|ico|xml|json|woff|woff2|ttf|eot|mp4|webm|mp3|wav)$/i.test(p)) return false;
    // Exclude WP system junk & internal ERP order lists
    if (p.includes('/feed') || p.includes('/wp-json') || p.includes('/wp-content') || p.includes('/wp-includes') || p.includes('xmlrpc') || p.includes('/cart') || p.includes('/checkout') || p.includes('/sales-orders') || p.includes('/sales-lines')) return false;
    return true;
  } catch (e) {
    return false;
  }
}

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
    discoveredUrls.add(initialParsed.href.split('#')[0]);

    // 1. Discover via sitemaps
    const sitemapCandidates = [
      `https://${cleanHost}/sitemap.xml`,
      `https://${cleanHost}/sitemap_index.xml`,
      `https://${cleanHost}/wp-sitemap.xml`
    ];

    const subSitemapUrls = new Set();

    for (const smUrl of sitemapCandidates) {
      try {
        const res = await fetch(smUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
        if (res.ok) {
          const xml = await res.text();
          const locMatches = xml.match(/<loc>([^<]+)<\/loc>/gi) || [];
          for (const m of locMatches) {
            const loc = m.replace(/<\/?loc>/gi, '').trim();
            if (loc.endsWith('.xml') || loc.includes('sitemap')) {
              if (!loc.includes('sales-orders') && !loc.includes('sales-lines')) {
                subSitemapUrls.add(loc);
              }
            } else if (isValidPageUrl(loc, cleanHost)) {
              discoveredUrls.add(loc.split('#')[0]);
            }
          }
          if (locMatches.length > 0) break;
        }
      } catch (_e) {}
    }

    // Fetch sub-sitemaps in parallel
    const subPromises = Array.from(subSitemapUrls).slice(0, 15).map(async (subUrl) => {
      try {
        const res = await fetch(subUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
        if (res.ok) {
          const xml = await res.text();
          const locMatches = xml.match(/<loc>([^<]+)<\/loc>/gi) || [];
          for (const m of locMatches) {
            const loc = m.replace(/<\/?loc>/gi, '').trim();
            if (!loc.endsWith('.xml') && isValidPageUrl(loc, cleanHost)) {
              discoveredUrls.add(loc.split('#')[0]);
            }
          }
        }
      } catch (_e) {}
    });

    await Promise.all(subPromises);

    // 2. Direct HTML Link Extraction
    try {
      const res = await fetch(initialParsed.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      if (res.ok) {
        const html = await res.text();
        const hrefRegex = /href=["']([^"']+)["']/gi;
        let match;
        while ((match = hrefRegex.exec(html)) !== null) {
          try {
            const resolved = new URL(match[1], initialParsed.href);
            const cleanUrl = resolved.href.split('#')[0];
            if (isValidPageUrl(cleanUrl, cleanHost)) {
              discoveredUrls.add(cleanUrl);
            }
          } catch (_e) {}
        }
      }
    } catch (_e) {}

    // Helper to normalize canonical URL (stripping trailing .html / index.html duplicates)
    const normalizeUrl = (rawUrl) => {
      try {
        const u = new URL(rawUrl.split('#')[0]);
        u.pathname = u.pathname.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
        return u.href;
      } catch (_e) {
        return rawUrl;
      }
    };

    // Map discovered URLs to structured page objects (deduplicated by normalized URL)
    const canonicalUrls = new Set();
    discoveredUrls.forEach(url => canonicalUrls.add(normalizeUrl(url)));

    const pages = Array.from(canonicalUrls).map((pageUrl) => {
      const u = new URL(pageUrl);
      let pageTitle = u.pathname === '/' ? "Page d'accueil" : u.pathname;
      pageTitle = pageTitle
        .replace(/^\//, '')
        .replace(/\/$/, '')
        .replace(/-/g, ' ')
        .replace(/_/g, ' ');

      if (!pageTitle) pageTitle = "Page d'accueil";
      else pageTitle = pageTitle.charAt(0).toUpperCase() + pageTitle.slice(1);

      return {
        url: pageUrl,
        title: pageTitle
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        root_url: targetUrl,
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
