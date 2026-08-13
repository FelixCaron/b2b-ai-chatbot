export const config = {
  runtime: 'edge',
};

function isValidPage(urlStr) {
  try {
    const u = new URL(urlStr);
    const p = u.pathname.toLowerCase();
    // Exclude static assets
    if (/\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|ico|xml|json|woff|woff2|ttf|eot|mp4|webm|mp3|wav)$/i.test(p)) return false;
    // Exclude WordPress system URLs & feeds
    if (p.includes('/feed') || p.includes('/wp-json') || p.includes('/wp-content') || p.includes('/wp-includes') || p.includes('xmlrpc') || p.includes('/cart') || p.includes('/checkout')) return false;
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
    discoveredUrls.add(targetUrl);

    // 1. Extensive XML Sitemap Discovery
    const sitemapCandidates = [
      `https://${cleanHost}/sitemap.xml`,
      `https://www.${cleanHost}/sitemap.xml`,
      `https://${cleanHost}/sitemap_index.xml`,
      `https://www.${cleanHost}/sitemap_index.xml`,
      `https://${cleanHost}/wp-sitemap.xml`,
      `https://www.${cleanHost}/wp-sitemap.xml`,
      `https://${cleanHost}/page-sitemap.xml`,
      `https://${cleanHost}/post-sitemap.xml`
    ];

    const parseSitemapXml = async (xmlText, depth = 0) => {
      if (depth > 2 || !xmlText) return;
      const locRegex = /<loc>([^<]+)<\/loc>/gi;
      let match;
      const subSitemaps = [];

      while ((match = locRegex.exec(xmlText)) !== null) {
        const loc = match[1].trim();
        if (loc.endsWith('.xml') || loc.includes('sitemap')) {
          subSitemaps.push(loc);
        } else {
          try {
            const u = new URL(loc);
            if (u.hostname.replace(/^www\./, '') === cleanHost) {
              const cleanUrl = u.href.split('#')[0];
              if (isValidPage(cleanUrl)) discoveredUrls.add(cleanUrl);
            }
          } catch (_e) {}
        }
      }

      // Fetch sub-sitemaps recursively up to depth 2
      for (const subLoc of subSitemaps.slice(0, 10)) {
        try {
          const subRes = await fetch(subLoc, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          if (subRes.ok) {
            const subXml = await subRes.text();
            await parseSitemapXml(subXml, depth + 1);
          }
        } catch (_subErr) {}
      }
    };

    for (const smUrl of sitemapCandidates) {
      try {
        const smRes = await fetch(smUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (smRes.ok) {
          const xml = await smRes.text();
          await parseSitemapXml(xml, 0);
        }
      } catch (_smErr) {}
    }

    // 2. Direct HTML Parsing (href links)
    try {
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      if (res.ok) {
        const html = await res.text();
        const hrefRegex = /href=["']([^"']+)["']/g;
        let match;
        while ((match = hrefRegex.exec(html)) !== null) {
          const link = match[1];
          if (!link || link.startsWith('#') || link.startsWith('mailto:') || link.startsWith('tel:') || link.startsWith('javascript:')) {
            continue;
          }
          try {
            const resolved = new URL(link, targetUrl);
            if (resolved.hostname.replace(/^www\./, '') === cleanHost) {
              resolved.hash = '';
              if (isValidPage(resolved.href)) discoveredUrls.add(resolved.href);
            }
          } catch (_e) {}
        }
      }
    } catch (_e) {}

    // 3. Jina Reader Link Extraction (Renders JavaScript navigation menus!)
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
        headers: {
          'Accept': 'text/plain',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (jinaRes.ok) {
        const jinaText = await jinaRes.text();
        const mdLinkRegex = /\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
        let match;
        while ((match = mdLinkRegex.exec(jinaText)) !== null) {
          try {
            const linkUrl = match[1].trim();
            const u = new URL(linkUrl);
            if (u.hostname.replace(/^www\./, '') === cleanHost) {
              u.hash = '';
              if (isValidPage(u.href)) discoveredUrls.add(u.href);
            }
          } catch (_e) {}
        }
      }
    } catch (_jinaErr) {}

    // Map discovered URLs to structured page objects
    const pages = Array.from(discoveredUrls).map((pageUrl) => {
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
        path: u.pathname,
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
