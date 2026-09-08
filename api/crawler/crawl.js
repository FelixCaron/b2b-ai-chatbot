import { contracts } from '@b2b-ai-chatbot/contracts';
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
  // field (see apps/admin Dashboard.jsx); accept either.
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

  // Renders a page through a headless browser (the same Jina Reader proxy
  // api/crawler/scan.js uses for content) instead of trusting whatever the
  // server sent as raw HTML. On a client-rendered SPA (React/Vue/etc. with
  // a router, no server-side rendering) that raw HTML is just an empty
  // <div id="root"> and a <script> tag — the render is the only way to see
  // the page's real content or links at all. No-op for a server-rendered
  // page (nothing new to find there); the fix for a client-rendered one.
  async function renderPage(pageUrl, timeoutMs = 6000) {
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
      return res.ok ? await res.text() : null;
    } catch (_e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function linksFromRenderedMarkdown(markdown, pageUrl) {
    const found = [];
    let match;
    MARKDOWN_LINK_REGEX.lastIndex = 0;
    while ((match = MARKDOWN_LINK_REGEX.exec(markdown)) !== null) {
      try {
        found.push(new URL(match[1], pageUrl).href.split('#')[0]);
      } catch (_e) {}
    }
    return found;
  }

  // The part of a Jina Reader response that actually varies by page — the
  // rest ("Title:", "URL Source:", a cache-freshness "Warning:") is
  // boilerplate that would make two different pages look different even
  // when their content is identical.
  function renderedBody(markdown) {
    const marker = 'Markdown Content:';
    const idx = markdown.indexOf(marker);
    return (idx >= 0 ? markdown.slice(idx + marker.length) : markdown).replace(/\s+/g, ' ').trim();
  }

  // 1. Discover via sitemaps, direct HTML extraction, and a rendered pass in parallel
  const sitemapCandidates = [
    `https://${cleanHost}/sitemap.xml`,
    `https://${cleanHost}/sitemap_index.xml`,
    `https://${cleanHost}/wp-sitemap.xml`
  ];

  const subSitemapUrls = new Set();

  // Fetch sitemaps, direct HTML and the rendered homepage simultaneously
  const [sitemapResults, htmlRes, renderedHome] = await Promise.all([
    Promise.allSettled(sitemapCandidates.map(url => fetchWithTimeout(url, 2500))),
    fetchWithTimeout(initialParsed.href, 3000),
    renderPage(initialParsed.href)
  ]);

  if (renderedHome) {
    for (const link of linksFromRenderedMarkdown(renderedHome, initialParsed.href)) {
      if (isValidPageUrl(link, cleanHost)) discoveredUrls.add(link);
    }
  }

  for (const result of sitemapResults) {
    if (result.status === 'fulfilled' && result.value && result.value.ok) {
      try {
        const xml = await result.value.text();
        if (!looksLikeXmlSitemap(xml)) continue;
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
          if (!looksLikeXmlSitemap(xml)) return;
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

  // Sitemap, raw HTML, and rendered-homepage links all come up with nothing
  // beyond the homepage on a site whose other pages are real but simply
  // never linked from a plain <a> anywhere the homepage render can see —
  // a "Plans"/"Upgrade" pricing CTA wired to a client-side router via
  // onClick rather than an <a href>, common on SPA dashboards (this
  // project's own admin app among them), is exactly that shape. Pricing is
  // also the single page a support chatbot most needs, so a site that
  // stalls at "homepage only" is worth a second, more direct pass: probe a
  // short list of slugs that are near-universal on a SaaS/marketing site,
  // and keep whichever ones render as an actual distinct page rather than
  // a catch-all rewrite's same fallback shell (verified by content, not
  // status code — that fallback answers 200 for any path at all, sitemap
  // included, on a site like this).
  if (normalizedSet.size <= 1 && renderedHome) {
    const homeBody = renderedBody(renderedHome);
    const COMMON_PAGE_SLUGS = ['pricing', 'plans', 'about', 'about-us', 'contact', 'faq', 'features'];
    const probed = await Promise.all(
      COMMON_PAGE_SLUGS.map(async (slug) => {
        const candidateUrl = new URL(`/${slug}`, initialParsed.href).href;
        const markdown = await renderPage(candidateUrl, 4000);
        if (!markdown) return null;
        const body = renderedBody(markdown);
        return (body && body.length > 20 && body !== homeBody) ? candidateUrl : null;
      })
    );
    for (const found of probed) {
      const norm = found && normalizePageUrl(found);
      if (norm && isValidPageUrl(norm, cleanHost)) normalizedSet.add(norm);
    }
  }

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


  return json({
    success: true,
    root_url: targetUrl,
    total_discovered: pages.length,
    pages: pages
  });
});
