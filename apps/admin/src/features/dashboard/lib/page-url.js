/** True when the string already carries a protocol we can fetch. */
export function hasProtocol(rawUrl) {
  return rawUrl.startsWith('http://') || rawUrl.startsWith('https://');
}

/** What the user typed, with the protocol they left out. */
export function ensureHttps(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  return hasProtocol(trimmed) ? trimmed : `https://${trimmed}`;
}

/** The bare hostname a `sites` row is keyed by. */
export function domainFromUrl(rawUrl) {
  return rawUrl.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];
}

/** Display form of a URL — protocol dropped, everything else kept. */
export function stripProtocol(rawUrl) {
  return rawUrl.replace('https://', '').replace('http://', '');
}

/** A stored domain turned back into something an iframe or a crawler can load. */
export function rootUrlForDomain(domain) {
  return domain.startsWith('http') ? domain : `https://${domain}`;
}

/** One canonical spelling per page, so the same page indexed as `/about`,
 *  `/about/` and `/about.html` collapses to a single row in the UI. */
export function normalizePageUrl(rawUrl) {
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

/** Fallback title for a page whose crawl left no metadata title behind.
 *  Throws on an unparseable URL, like the `new URL` it wraps. */
export function titleForPageUrl(normUrl) {
  const u = new URL(normUrl);
  return (u.pathname === '/' || u.pathname === '') ? "Home Page" : u.pathname.replace(/^\//, '');
}
