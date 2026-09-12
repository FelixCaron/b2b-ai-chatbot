import { contracts, MAX_DISCOVERABLE_PAGES } from '@b2b-ai-chatbot/contracts';
import { edgeRoute } from '../lib/http.js';
import { assertSafeExternalUrl, fetchSafeExternalUrl } from '../lib/url-security.js';
import { verifyTurnstileToken } from '../lib/captcha.js';

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

// A same-origin catch-all rewrite (the default Vite/CRA/Vue SPA config on
// Vercel/Netlify: "serve index.html for any unmatched path") answers
// /sitemap.xml with HTTP 200 and the app's own HTML shell instead of a 404
// or real XML. Treated as "found a sitemap" that response yields zero <loc>
// matches today, so it's harmless, but it's also not a sitemap — checking
// the shape before trusting it avoids silently "succeeding" at nothing.
function looksLikeXmlSitemap(text) {
  const head = text.slice(0, 300).toLowerCase();
  return head.includes('<?xml') || head.includes('<urlset') || head.includes('<sitemapindex');
}

// Markdown link syntax, e.g. "[Pricing](https://site.com/pricing)" —
// excludes image embeds ("![alt](src)") via the negative lookbehind on "!".
const MARKDOWN_LINK_REGEX = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

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

export default edgeRoute(contracts.crawler.discover, async (req, { data, json }) => {
  const { url, cf_turnstile_token } = data;

  // Some call sites send the Turnstile token as a header instead of a body
  // field (see dorafi/admin Dashboard.jsx); accept either.
  const token = cf_turnstile_token || req.headers.get('cf-turnstile-token');
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || '';
  const captchaCheck = await verifyTurnstileToken(token, clientIp);
  if (!captchaCheck.success) {
    return json({ error: 'Captcha verification failed. Please try again.' }, 403);
  }

  if (process.env.TEST_MODE === 'true') {
    const cleanHost = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    return json({
      url,
      pages: [
        { url: `https://${cleanHost}`, title: 'Home' },
        { url: `https://${cleanHost}/products`, title: 'Products' },
        { url: `https://${cleanHost}/services`, title: 'Services' },
        { url: `https://${cleanHost}/contact`, title: 'Contact & Head Office' }
      ]
    });
  }

  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  const initialParsed = assertSafeExternalUrl(targetUrl);
  const cleanHost = initialParsed.hostname.replace(/^www\./, '');

  const discoveredUrls = new Set();
  discoveredUrls.add(initialParsed.href.split('#')[0]);

  // Set once any of the loops below stop early because discoveredUrls hit
  // MAX_DISCOVERABLE_PAGES — a massive site (tens or hundreds of thousands of
  // pages) genuinely has more pages than we discovered, and the response says
  // so via `truncated` rather than quietly presenting a partial list as the
  // whole site.
  let discoveryTruncated = false;
  const atCap = () => discoveredUrls.size >= MAX_DISCOVERABLE_PAGES;

  const fetchWithTimeout = async (urlStr, timeoutMs = 2500) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchSafeExternalUrl(urlStr, {
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

  // Renders the homepage through a headless browser (the same Jina Reader
  // proxy api/crawler/scan.js uses for content) and reads its nav/footer
  // links out of the resulting Markdown. Raw-HTML link extraction below
  // only sees what the server actually sent — on a client-rendered SPA
  // (React/Vue/etc. with a router, no server-side rendering) that's just an
  // empty <div id="root"> and a <script> tag, so it discovers nothing past
  // the homepage itself. A post-render fetch is the general fix: it works
  // the same way for a server-rendered site (nothing new to find, harmless)
  // and a client-rendered one (the only way to see its real nav at all) —
  // no per-site special-casing.
  async function discoverViaRenderedPage(pageUrl, timeoutMs = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`https://r.jina.ai/${pageUrl}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/plain',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) return [];
      const markdown = await res.text();
      const found = [];
      let match;
      MARKDOWN_LINK_REGEX.lastIndex = 0;
      while ((match = MARKDOWN_LINK_REGEX.exec(markdown)) !== null) {
        try {
          found.push(new URL(match[1], pageUrl).href.split('#')[0]);
        } catch (_e) {}
      }
      return found;
    } catch (_e) {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  // 1. Discover via sitemaps, direct HTML extraction, and a rendered pass in parallel
  const sitemapCandidates = [
    `https://${cleanHost}/sitemap.xml`,
    `https://${cleanHost}/sitemap_index.xml`,
    `https://${cleanHost}/wp-sitemap.xml`
  ];

  const subSitemapUrls = new Set();

  // Fetch sitemaps, direct HTML and the rendered homepage simultaneously
  const [sitemapResults, htmlRes, renderedLinks] = await Promise.all([
    Promise.allSettled(sitemapCandidates.map(url => fetchWithTimeout(url, 2500))),
    fetchWithTimeout(initialParsed.href, 3000),
    discoverViaRenderedPage(initialParsed.href)
  ]);

  for (const link of renderedLinks) {
    if (atCap()) { discoveryTruncated = true; break; }
    if (isValidPageUrl(link, cleanHost)) discoveredUrls.add(link);
  }

  // Sitemaps are parsed with a manual exec loop rather than `xml.match(/g)`
  // on purpose: `.match` with a global flag allocates an array holding every
  // match up front, and the sitemap protocol allows up to 50,000 <loc>
  // entries per file — for a genuinely huge site that's an array (and a
  // parse pass) sized to the whole site before the cap below ever gets a
  // chance to stop anything. Breaking out of exec()'s loop actually bounds
  // the work, not just the result.
  for (const result of sitemapResults) {
    if (atCap()) { discoveryTruncated = true; break; }
    if (result.status === 'fulfilled' && result.value && result.value.ok) {
      try {
        const xml = await result.value.text();
        if (!looksLikeXmlSitemap(xml)) continue;
        const locRegex = /<loc>([^<]+)<\/loc>/gi;
        let locMatch;
        while ((locMatch = locRegex.exec(xml)) !== null) {
          if (atCap()) { discoveryTruncated = true; break; }
          const loc = locMatch[1].trim();
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
  if (subSitemapUrls.size > 0 && !atCap()) {
    const subPromises = Array.from(subSitemapUrls).slice(0, 50).map(async (subUrl) => {
      if (atCap()) { discoveryTruncated = true; return; }
      const res = await fetchWithTimeout(subUrl, 2500);
      if (res && res.ok) {
        try {
          const xml = await res.text();
          if (!looksLikeXmlSitemap(xml)) return;
          const locRegex = /<loc>([^<]+)<\/loc>/gi;
          let locMatch;
          while ((locMatch = locRegex.exec(xml)) !== null) {
            if (atCap()) { discoveryTruncated = true; break; }
            const loc = locMatch[1].trim();
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
  if (htmlRes && htmlRes.ok && !atCap()) {
    try {
      const html = await htmlRes.text();
      const hrefRegex = /href=["']([^"']+)["']/gi;
      let match;
      while ((match = hrefRegex.exec(html)) !== null) {
        if (atCap()) { discoveryTruncated = true; break; }
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

  // The per-loop cap checks above bound collection to MAX_DISCOVERABLE_PAGES
  // in the common case, but loops that ran concurrently (the sub-sitemap
  // fetches) can each see the count as "not yet at cap" and add a batch
  // before any of them re-checks — this slice is the actual hard guarantee
  // the response never exceeds the cap the admin UI is built to render.
  if (normalizedSet.size > MAX_DISCOVERABLE_PAGES) discoveryTruncated = true;
  const cappedUrls = Array.from(normalizedSet).slice(0, MAX_DISCOVERABLE_PAGES);

  const pages = cappedUrls.map((pageUrl) => {
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


  return json({
    success: true,
    root_url: targetUrl,
    total_discovered: pages.length,
    truncated: discoveryTruncated,
    pages: pages
  });
});
