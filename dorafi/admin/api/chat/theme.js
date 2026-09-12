import { contracts } from '@b2b-ai-chatbot/contracts';
import { edgeRoute } from '../_lib/http.js';
import { extractThemeColors } from '../_lib/llm.js';
import { assertSafeExternalUrl, fetchSafeExternalUrl } from '../_lib/url-security.js';
import { verifyTurnstileToken } from '../_lib/captcha.js';

export const config = {
  runtime: 'edge',
};

/** Our own navy — what a site gets when it declares nothing readable. */
const DEFAULT_BRAND_COLOR = '#293f68';

// Reads the site's own declared favicon out of its real HTML — the same
// source of truth a browser tab uses — rather than guessing through a
// third-party lookup service (Google's s2/favicons endpoint, used as the
// dashboard's fallback, is known to sometimes hand back a generic/wrong
// icon instead of the site's actual one). Works for any URL automatically:
// nothing here is specific to a domain or requires the operator to upload
// anything.
function extractFaviconUrl(html, baseUrl) {
  if (!html) return null;

  const linkTagRegex = /<link\b[^>]*>/gi;
  // rel="icon" (the modern, most accurate declaration) is preferred outright;
  // "shortcut icon" / "apple-touch-icon" / etc. are only used if no plain
  // "icon" link ever shows up.
  let modernHref = null;
  let fallbackHref = null;
  let match;

  while ((match = linkTagRegex.exec(html)) !== null) {
    const tag = match[0];
    const relMatch = tag.match(/\brel=["']([^"']+)["']/i);
    const relValue = relMatch?.[1]?.toLowerCase().trim();
    if (!relValue || !relValue.includes('icon')) continue;

    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch || !hrefMatch[1]) continue;

    if (relValue === 'icon' && !modernHref) {
      modernHref = hrefMatch[1];
    } else if (!fallbackHref) {
      fallbackHref = hrefMatch[1];
    }
  }

  const bestHref = modernHref || fallbackHref;
  if (!bestHref) return null;
  try {
    return new URL(bestHref, baseUrl).toString();
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Brand colour: read it, then check it is usable.
//
// This used to be one LLM call over the first 8 KB of a page's HTML, and
// whatever came back starting with "#" was taken as the site's brand colour —
// no validation of the shape, none of the value. Three ways that went wrong,
// all of them visible to the customer as "that isn't my colour":
//
//   * 8 KB of a modern page is mostly <head> and script tags. The colour is
//     usually further down or in a stylesheet, so the model was routinely
//     guessing a plausible hex rather than reading one.
//   * A short form ("#fff") was stored as-is, and every consumer builds alpha
//     variants by string concatenation (`${color}66` in the widget), which
//     turns "#fff" into the invalid "#fff66" — the widget then falls back to
//     an unstyled state.
//   * White, near-white and other unusable values were accepted. The widget
//     paints white content on this colour: a pale accent is an invisible
//     launcher.
//
// So: read the page's OWN declarations first (they are facts, not guesses),
// keep the model as a fallback for sites that declare nothing, and put every
// candidate through the same validation before it can win.
// ---------------------------------------------------------------------------

/** '#abc' / 'abc' / '#AABBCC' → '#aabbcc'. Anything else → null. */
export function normalizeHexColor(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value.split('').map((c) => c + c).join('').toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value.toLowerCase()}`;
  // 8-digit (with alpha): keep the colour, drop the alpha — the widget applies
  // its own.
  if (/^[0-9a-fA-F]{8}$/.test(value)) return `#${value.slice(0, 6).toLowerCase()}`;
  return null;
}

function relativeLuminance(hex) {
  const channel = (c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(hex.slice(1, 3));
  const g = channel(hex.slice(3, 5));
  const b = channel(hex.slice(5, 7));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Usable as the widget's accent, which is a background for white text and
 * icons. The bar is contrast, not taste: a dark or muted brand colour is a
 * legitimate choice and is left alone, but anything too pale to carry white
 * content would render an invisible launcher on the customer's site.
 * 3:1 is the WCAG threshold for large text and UI components.
 */
export function isUsableBrandColor(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return false;
  const contrastWithWhite = 1.05 / (relativeLuminance(normalized) + 0.05);
  return contrastWithWhite >= 3;
}

// Custom properties that name a brand colour, in the order they deserve to be
// trusted. Covers hand-written CSS as well as what WordPress, Elementor and
// the common page builders emit — which is most of the market this sells to.
const BRAND_CSS_VARIABLES = [
  '--e-global-color-primary',
  '--wp--preset--color--primary',
  '--color-primary',
  '--primary-color',
  '--brand-color',
  '--theme-color',
  '--main-color',
  '--accent-color',
  '--primary',
  '--brand',
  '--accent'
];

/**
 * The brand colour a site declares about itself, or null.
 *
 * Everything here is a fact stated by the page: the theme-color meta browsers
 * use to tint their own chrome, Safari's pinned-tab colour, the Windows tile
 * colour, and the CSS variables a theme defines for its own accent. Read over
 * the whole document rather than a truncated head.
 */
export function brandColorFromHtml(html) {
  if (!html) return null;

  const candidates = [];

  // <meta name="theme-color" content="#0f766e"> — and its media-scoped twins;
  // a dark-scheme variant is skipped so a site's dark mode doesn't decide the
  // colour for everyone.
  const metaRegex = /<meta\b[^>]*>/gi;
  let tag;
  while ((tag = metaRegex.exec(html)) !== null) {
    const nameMatch = tag[0].match(/\bname=["']([^"']+)["']/i);
    const name = nameMatch?.[1]?.toLowerCase();
    if (name !== 'theme-color' && name !== 'msapplication-tilecolor') continue;
    if (/prefers-color-scheme:\s*dark/i.test(tag[0])) continue;
    const content = tag[0].match(/\bcontent=["']([^"']+)["']/i)?.[1];
    if (content) candidates.push(content);
  }

  // <link rel="mask-icon" color="#0f766e"> — Safari pinned tabs, almost always
  // the real brand colour when present.
  const maskIcon = html.match(/<link\b[^>]*rel=["'][^"']*mask-icon[^"']*["'][^>]*>/i)?.[0];
  if (maskIcon) {
    const color = maskIcon.match(/\bcolor=["']([^"']+)["']/i)?.[1];
    if (color) candidates.push(color);
  }

  // CSS custom properties, in the order declared above.
  for (const variable of BRAND_CSS_VARIABLES) {
    const varRegex = new RegExp(`${variable}\\s*:\\s*(#[0-9a-fA-F]{3,8})`, 'i');
    const value = html.match(varRegex)?.[1];
    if (value) candidates.push(value);
  }

  for (const candidate of candidates) {
    const normalized = normalizeHexColor(candidate);
    if (normalized && isUsableBrandColor(normalized)) return normalized;
  }
  return null;
}

/**
 * Last resort before the default: the most-used colour on the page that could
 * plausibly BE a brand colour. Greys, blacks and whites are excluded — every
 * page is full of them (borders, text, shadows) and they are never what
 * someone means by "my colour".
 */
export function mostUsedBrandColorInHtml(html) {
  if (!html) return null;
  const counts = new Map();
  const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
  let match;
  while ((match = hexRegex.exec(html)) !== null) {
    const normalized = normalizeHexColor(match[0]);
    if (!normalized || !isUsableBrandColor(normalized)) continue;
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    // Saturation of the HSL sense: how far from grey this colour is.
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 30) continue; // grey, black, near-black — not a brand colour
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [color, count] of counts) {
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  // One lonely occurrence is as likely to be a decorative one-off as a brand.
  return bestCount >= 2 ? best : null;
}

export default edgeRoute(contracts.chat.theme, async (req, { data, json }) => {
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
    return json({ primary_color: '#1e3a8a', org_name: 'Portes Delafontaine' });
  }

  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  const initialParsed = assertSafeExternalUrl(targetUrl);
  const cleanHost = initialParsed.hostname.replace(/^www\./, '');

  const candidates = [
    targetUrl,
    `https://${cleanHost}`,
    `http://${cleanHost}`,
    `https://www.${cleanHost}`,
    `http://www.${cleanHost}`
  ];
  const uniqueCandidates = [...new Set(candidates)];

  let htmlSnippet = '';
  let fullHtml = '';
  let successfulUrl = targetUrl;

  for (const candidate of uniqueCandidates) {
    try {
      const pageRes = await fetchSafeExternalUrl(candidate, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html'
        }
      });
      if (pageRes && pageRes.ok) {
        const fetched = await pageRes.text();
        // The model gets the first 8 KB (its prompt has to stay small); the
        // deterministic colour pass gets the whole page, because what it is
        // looking for — a theme-color meta, a --primary variable — is as
        // likely to be at the bottom of a stylesheet as in the head.
        fullHtml = fetched.slice(0, 400_000);
        htmlSnippet = fetched.substring(0, 8000);
        successfulUrl = candidate;
        break;
      }
    } catch (_e) {}
  }

  let detectedOrgName = cleanHost.charAt(0).toUpperCase() + cleanHost.slice(1);
  let primaryColor = DEFAULT_BRAND_COLOR;
  let themeMode = 'light';
  let backgroundColor = '#ffffff';
  let textColor = '#0f172a';
  // Absolute (or null, never a bare relative path) so the dashboard can use
  // it directly as an <img src> with no further resolution.
  // Over the whole document, not the 8 KB the model gets: some page builders
  // emit their icon links well past the first few kilobytes.
  const faviconUrl = extractFaviconUrl(fullHtml, successfulUrl);

  // What the site says about itself, before anything guesses on its behalf.
  const declaredColor = brandColorFromHtml(fullHtml);
  if (declaredColor) primaryColor = declaredColor;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey && htmlSnippet) {
    const extracted = await extractThemeColors({ htmlSnippet, targetUrl, apiKey });
    if (extracted) {
      // The model only gets the colour if the page declared nothing usable:
      // a declaration is a fact, and this is an inference from 8 KB of HTML.
      // Either way it has to survive the same validation — an unusable or
      // malformed value is worse than our default, because it looks
      // deliberate.
      const modelColor = normalizeHexColor(extracted.primary_color);
      if (!declaredColor && modelColor && isUsableBrandColor(modelColor)) {
        primaryColor = modelColor;
      }
      if (extracted.org_name && extracted.org_name.length > 1) {
        detectedOrgName = extracted.org_name;
      }
      if (extracted.theme_mode === 'dark' || extracted.theme_mode === 'light') {
        themeMode = extracted.theme_mode;
      }
      const modelBackground = normalizeHexColor(extracted.background_color);
      if (modelBackground) backgroundColor = modelBackground;
      const modelText = normalizeHexColor(extracted.text_color);
      if (modelText) textColor = modelText;
    }
  }

  // Still on the default? Take the colour the page actually uses most, if it
  // has one that could be a brand colour at all. Better a real colour off
  // their own site than our navy on every customer's widget.
  if (primaryColor === DEFAULT_BRAND_COLOR) {
    const observedColor = mostUsedBrandColorInHtml(fullHtml);
    if (observedColor) primaryColor = observedColor;
  }

  return json({
    success: true,
    url: targetUrl,
    org_name: detectedOrgName,
    primary_color: primaryColor,
    theme_mode: themeMode,
    background_color: backgroundColor,
    text_color: textColor,
    favicon_url: faviconUrl
  });
});
