export const config = {
  runtime: 'edge',
};

function normalizePageUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    let uStr = rawUrl.split('#')[0].split('?')[0].trim();
    if (!uStr.startsWith('http://') && !uStr.startsWith('https://')) {
      uStr = `https://${uStr}`;
    }
    const parsed = new URL(uStr);
    parsed.pathname = parsed.pathname.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
    if (parsed.pathname === '' || parsed.pathname === '/') {
      parsed.pathname = '/';
    } else if (parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.href;
  } catch (e) {
    return rawUrl;
  }
}

function isValidPageUrl(urlStr, cleanHost) {
  try {
    const u = new URL(urlStr);
    if (u.hostname.replace(/^www\./, '') !== cleanHost) return false;
    const p = u.pathname.toLowerCase();
    // Exclude static assets (css, js, images, fonts, pdfs, etc.)
    if (/\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|ico|xml|json|woff|woff2|ttf|eot|mp4|webm|mp3|wav)($|\?|#)/i.test(p)) return false;
    // Exclude WP system junk, cart, account, job offer lists & internal ERP order lists
    if (p.includes('/feed') || p.includes('/wp-json') || p.includes('/wp-content') || p.includes('/wp-includes') || p.includes('xmlrpc') || p.includes('/cart') || p.includes('/checkout') || p.includes('/my-account') || p.includes('/account') || p.includes('?add-to-cart') || p.includes('&add-to-cart') || p.includes('/sales-orders') || p.includes('/sales-lines') || p.includes('/job/') || p.includes('/job_cat/')) return false;

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

    if (process.env.TEST_MODE === 'true') {
      const cleanHost = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      return new Response(JSON.stringify({
        url,
        pages: [
          { url: `https://${cleanHost}`, title: 'Page d\'accueil - Portes Delafontaine' },
          { url: `https://${cleanHost}/portes-coupe-feu`, title: 'Portes Coupe-Feu UL/ULC' },
          { url: `https://${cleanHost}/portes-acoustiques`, title: 'Portes Acoustiques STC 35-55' },
          { url: `https://${cleanHost}/contact`, title: 'Contact & Siège Social' }
        ]
      }), {
        status: 200,
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

    const fetchWithTimeout = async (urlStr, timeoutMs = 2500) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(urlStr, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        clearTimeout(id);
        return res;
      } catch (_e) {
        clearTimeout(id);
        return null;
      }
    };

    // 1. Discover via sitemaps & direct HTML extraction in parallel
    const sitemapCandidates = [
      `https://${cleanHost}/sitemap.xml`,
      `https://${cleanHost}/sitemap_index.xml`,
      `https://${cleanHost}/wp-sitemap.xml`
    ];

    const subSitemapUrls = new Set();

    // Fetch sitemaps and direct HTML simultaneously
    const [sitemapResults, htmlRes] = await Promise.all([
      Promise.allSettled(sitemapCandidates.map(url => fetchWithTimeout(url, 2500))),
      fetchWithTimeout(initialParsed.href, 3000)
    ]);

    for (const result of sitemapResults) {
      if (result.status === 'fulfilled' && result.value && result.value.ok) {
        try {
          const xml = await result.value.text();
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
        } catch (_e) {}
      }
    }

    // Fetch sub-sitemaps in parallel if needed (up to 50 sub-sitemaps for comprehensive multi-section sites)
    if (subSitemapUrls.size > 0) {
      const subPromises = Array.from(subSitemapUrls).slice(0, 50).map(async (subUrl) => {
        const res = await fetchWithTimeout(subUrl, 2500);
        if (res && res.ok) {
          try {
            const xml = await res.text();
            const locMatches = xml.match(/<loc>([^<]+)<\/loc>/gi) || [];
            for (const m of locMatches) {
              const loc = m.replace(/<\/?loc>/gi, '').trim();
              if (!loc.endsWith('.xml') && isValidPageUrl(loc, cleanHost)) {
                discoveredUrls.add(loc.split('#')[0]);
              }
            }
          } catch (_e) {}
        }
      });
      await Promise.all(subPromises);
    }

    // Extract links from homepage HTML
    if (htmlRes && htmlRes.ok) {
      try {
        const html = await htmlRes.text();
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
      } catch (_e) {}
    }

    // Deduplicate and normalize discovered URLs cleanly
    const normalizedSet = new Set();
    discoveredUrls.forEach(url => {
      const norm = normalizePageUrl(url);
      if (norm && isValidPageUrl(norm, cleanHost)) {
        normalizedSet.add(norm);
      }
    });

    const pages = Array.from(normalizedSet).map((pageUrl) => {
      const u = new URL(pageUrl);
      let pageTitle = (u.pathname === '/' || u.pathname === '') ? "Page d'accueil" : u.pathname;
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
