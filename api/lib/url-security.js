const MAX_REDIRECTS = 3;

function isPrivateIpv4(hostname) {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }

  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127);
}

export function assertSafeExternalUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP(S) URLs are allowed');
  }
  if (url.username || url.password) {
    throw new Error('URLs with embedded credentials are not allowed');
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !hostname
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || isPrivateIpv4(hostname)
    || hostname === '::1'
    || hostname.startsWith('fc')
    || hostname.startsWith('fd')
    || hostname.startsWith('fe80:')
  ) {
    throw new Error('This network destination is not allowed');
  }

  return url;
}

export async function fetchSafeExternalUrl(value, options = {}) {
  let url = assertSafeExternalUrl(value);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(url, { ...options, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get('location');
    if (!location) throw new Error('Redirect with no destination');
    if (redirectCount === MAX_REDIRECTS) throw new Error('Too many redirects');
    url = assertSafeExternalUrl(new URL(location, url).href);
  }

  throw new Error('Invalid redirect');
}
