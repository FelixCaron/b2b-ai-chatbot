// Shared "does this request actually come from the tenant's own website?"
// helpers — used everywhere a widget request's Origin has to be checked
// against a site's registered domain (strict domain locking in
// api/chat/index.js, and the install-detection stamp in api/chat/init.js).
// Kept in one place so the two never quietly drift on what counts as a match
// (e.g. subdomains, or a stray "www.").

export function normalizedHostname(value) {
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function requestOrigin(req) {
  const rawOrigin = req.headers.get('origin') || req.headers.get('referer');
  if (!rawOrigin) return null;
  try {
    return new URL(rawOrigin).origin;
  } catch {
    return null;
  }
}

/** True when `origin` is the site's own domain, or a subdomain of it. */
export function isOwnDomainOrigin(origin, siteDomain) {
  const originHost = origin ? normalizedHostname(origin) : '';
  const siteHost = normalizedHostname(siteDomain || '');
  if (!originHost || !siteHost) return false;
  return originHost === siteHost || originHost.endsWith(`.${siteHost}`);
}
