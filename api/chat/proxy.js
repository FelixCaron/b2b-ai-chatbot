import { contracts } from '@b2b-ai-chatbot/contracts';
import { nodeRoute } from '../lib/http.js';
import { fetchSafeExternalUrl } from '../lib/url-security.js';

/**
 * Preview capability check. It intentionally never returns third-party HTML:
 * serving it from the admin origin would expose the dashboard to XSS.
 */
export default nodeRoute(contracts.chat.proxy, async (req, res, { data }) => {
  // Normalize URL — the contract accepts a bare hostname the way the URL box does.
  let targetUrl = data.url;
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  const response = await fetchSafeExternalUrl(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  if (!response.ok) {
    return res.status(response.status).send(`Failed to fetch target site (${response.status} ${response.statusText})`);
  }

  const xFrameOptions = response.headers.get('x-frame-options') || '';
  const contentSecurityPolicy = response.headers.get('content-security-policy') || '';
  const canFrame = !/deny|sameorigin/i.test(xFrameOptions)
    && !/frame-ancestors\s+['"]?none|frame-ancestors\s+['"]?self/i.test(contentSecurityPolicy);

  return res.status(200).json({ canFrame, url: targetUrl });
});
