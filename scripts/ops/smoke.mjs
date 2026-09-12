#!/usr/bin/env node
/**
 * Post-deploy smoke checks, over HTTP, against a real deployment.
 *
 * Deliberately narrow. The E2E suite mocks the entire backend, so it proves the
 * app's behaviour and nothing about a deployment; these checks prove the
 * opposite — that the thing on the end of that URL is wired to what it should
 * be wired to — and say nothing about behaviour.
 *
 * What each check exists to catch, all of them real failure modes of this
 * project rather than hypotheticals:
 *
 *  - Wrong database. The single worst outcome of having two environments is a
 *    preview deployment writing into production. VITE_SUPABASE_URL is inlined
 *    into the bundle at build time, so the bundle can be asked which database
 *    it will talk to. This is the check that makes the split trustworthy.
 *  - No API at all. Vercel turns `<root directory>/api/**` into functions and
 *    nothing else, so a wrong Root Directory ships the SPA with no API behind
 *    it — and looks completely normal until someone tries to chat.
 *  - A tree-shaken build. vite.config.js documents it: without Supabase
 *    variables the build succeeds and produces a bundle containing only the
 *    "Configuration required" screen, 218 KB where the real one is 665 KB.
 *    The build-time guard catches missing variables; it cannot catch wrong
 *    ones, and neither can a 200 on the homepage.
 *  - An indexable preview. Duplicate content on a preview host, in Google.
 *
 *   node scripts/ops/smoke.mjs --app https://… --site https://… \
 *        --supabase-ref abcdefgh [--expect-noindex]
 */

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg, i, all) =>
    arg.startsWith('--') ? [[arg.slice(2), all[i + 1]?.startsWith('--') === false ? all[i + 1] : true]] : []
  )
);

const failures = [];
const ok = (what) => console.log(`  ok   ${what}`);
const fail = (what, detail) => {
  console.log(`  FAIL ${what}\n       ${detail}`);
  failures.push(what);
};

// A host that does not resolve, or refuses the connection, is a failed check —
// not an unhandled rejection that takes the whole run down before the remaining
// checks report. `preview.logafi.com` having no DNS record yet is exactly the
// condition this script exists to tell you about.
const UNREACHABLE = Symbol('unreachable');

async function get(url, options = {}) {
  try {
    const res = await fetch(url, { redirect: 'follow', ...options });
    return { res, body: options.method === 'HEAD' ? '' : await res.text() };
  } catch (err) {
    const reason = err?.cause?.code === 'ENOTFOUND'
      ? 'the hostname does not resolve — is DNS pointed at Vercel?'
      : `${err?.cause?.code || err.message}`;
    return { res: { ok: false, status: UNREACHABLE, statusText: reason, headers: new Headers() }, body: '' };
  }
}

const describe = (res) => (res.status === UNREACHABLE ? res.statusText : `HTTP ${res.status}`);

// --- the product ------------------------------------------------------------
if (args.app) {
  console.log(`\n${args.app}`);
  const { res, body } = await get(args.app);

  if (!res.ok) {
    fail('homepage answers 200', describe(res));
  } else {
    ok('homepage answers 200');
  }

  const scripts = [...body.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
  const entry = scripts.find((s) => s.includes('/assets/'));
  if (!entry) {
    fail('the page loads a built JS bundle', `found: ${scripts.join(', ') || 'no scripts'}`);
  } else {
    const bundleUrl = new URL(entry, args.app).toString();
    const { res: bundleRes, body: bundle } = await get(bundleUrl);

    if (!bundleRes.ok) {
      fail('the bundle is served', `${bundleUrl} -> ${describe(bundleRes)}`);
    } else {
      // Wrong database.
      if (args['supabase-ref']) {
        bundle.includes(args['supabase-ref'])
          ? ok(`the bundle points at database ${args['supabase-ref']}`)
          : fail(
              `the bundle points at database ${args['supabase-ref']}`,
              'this deployment was built against a different Supabase project — ' +
                'the most likely cause is environment variables scoped to the wrong target'
            );
      }
      // A tree-shaken build. The real bundle is several hundred KB; the
      // config-error-only one is a fraction of that.
      const kb = Math.round(bundle.length / 1024);
      kb > 300
        ? ok(`the bundle is the whole app (${kb} KB)`)
        : fail(
            `the bundle is the whole app (${kb} KB)`,
            'too small — this is the shape of a build whose Supabase variables were wrong, ' +
              'which ships only the "Configuration required" screen'
          );
    }
  }

  // No API at all. OPTIONS is answered uniformly by every contract route
  // (api/_lib/http.js) and costs nothing, so it is the cheapest proof that
  // functions exist and route.
  for (const route of ['/api/chat/init', '/api/crawler/scan', '/api/billing/checkout']) {
    const { res: optRes } = await get(new URL(route, args.app).toString(), { method: 'OPTIONS' });
    optRes.status < 400 && optRes.headers.has('access-control-allow-origin')
      ? ok(`${route} is a function`)
      : fail(
          `${route} is a function`,
          `${describe(optRes)}, CORS header ${optRes.headers.has('access-control-allow-origin') ? 'present' : 'absent'} ` +
            '— a Root Directory that is not dorafi/admin deploys the SPA with no API'
        );
  }

  if (args['expect-noindex']) {
    const { res: headRes } = await get(args.app, { method: 'HEAD' });
    const tag = headRes.headers.get('x-robots-tag') || '';
    tag.includes('noindex')
      ? ok('preview is not indexable')
      : fail('preview is not indexable', `X-Robots-Tag: ${tag || '(absent)'}`);
  }
}

// --- the parent company's site ----------------------------------------------
if (args.site) {
  console.log(`\n${args.site}`);
  const { res, body } = await get(args.site);
  if (!res.ok) {
    fail('homepage answers 200', describe(res));
  } else {
    ok('homepage answers 200');
    body.includes('logafi')
      ? ok('it is the logafi site')
      : fail('it is the logafi site', 'the page does not mention logafi — wrong project?');
  }

  if (args['expect-noindex']) {
    const tag = res.headers.get('x-robots-tag') || '';
    tag.includes('noindex')
      ? ok('preview is not indexable')
      : fail('preview is not indexable', `X-Robots-Tag: ${tag || '(absent)'}`);
  }
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('All smoke checks passed.');
