# logafi

The parent company's site: `logafi.com`.

Its own Vercel project (`logafi`), deployed from this directory — one project per
deployable directory, like `dorafi/widget` (`dorafi-widget`) and `dorafi/staff`
(`dorafi-staff`), and separate from the product at `dorafi.logafi.com`
(`dorafi-admin`, deployed from `dorafi/admin`).

## What is here

| File | |
|---|---|
| `index.html` | The whole page: markup, styles and ~60 lines of JS, self-contained. |
| `logo.png` / `logo-white.png` | The wordmark, background cut out to alpha. The white one is for the dark footer. |
| `favicon.svg` | The monogram alone, retraced as two SVG paths. |
| `robots.txt`, `sitemap.xml` | Point at `logafi.com`, never at Dorafi's domain. |
| `vercel.json` | No build: Vercel serves this directory as it is. |

There is **no build step and no package.json** — deliberately. Nothing here is
compiled, bundled or templated, so what is committed is byte-for-byte what
production serves, and `npm ci` at the root has one less workspace to install.

## Deploy

```bash
cd logafi
vercel --prod
```

## Work on it

Open `index.html` in a browser, or serve the folder to exercise the clean URLs:

```bash
node scripts/dev/serve-static.mjs logafi 5174   # from the repo root
```

The E2E suite (`tests/e2e/logafi-page.spec.js`) runs against that same server.

## Editing the copy

The page is bilingual with no framework: **French is the markup**, English
lives in `data-en` attributes, and the toggle swaps `textContent`. So a new
sentence is written in French in place, with its English in `data-en` — and an
element carrying `data-en` must hold text only, never child elements, or the
swap will erase them. The two titles and meta descriptions are the exception:
they live in the `META` table at the bottom of the file.
