#!/usr/bin/env node
// ---------------------------------------------------------------------------
// A static file server, for directories that have no build step — today that
// is logafi, which Vercel also serves as-is.
//
// Used two ways: `node scripts/dev/serve-static.mjs logafi 5174` to look
// at the page locally, and by playwright.config.js as the second webServer so
// tests/e2e/logafi-page.spec.js exercises the real thing over HTTP rather than
// a file:// URL.
//
// It mirrors the two Vercel behaviours the page depends on: `cleanUrls`
// (/foo -> foo.html) and a directory serving its index.html. No dependencies
// on purpose — one file, `node` and nothing else.
// ---------------------------------------------------------------------------

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [dirArg, portArg] = process.argv.slice(2);
if (!dirArg) {
  console.error('usage: node scripts/dev/serve-static.mjs <directory> [port]');
  process.exit(1);
}

const ROOT = path.resolve(process.cwd(), dirArg);
const PORT = Number(portArg) || 5174;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2'
};

/** Resolves a URL path to a file inside ROOT, or null. Anything that escapes
 *  ROOT (`..`, an absolute path, a symlink pointing out) resolves to null —
 *  this serves a public directory, so it may only ever read from it. */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.resolve(ROOT, `.${path.posix.normalize(decoded)}`);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;

  const candidates = [target, `${target}.html`, path.join(target, 'index.html')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const file = resolveFile(new URL(req.url, `http://localhost:${PORT}`).pathname);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Serving ${ROOT} at http://127.0.0.1:${PORT}`);
});
