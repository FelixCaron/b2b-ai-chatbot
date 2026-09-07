// The crawler products: how a customer's website becomes a knowledge base.
import { defineEndpoint, AUTH } from '../endpoint.js';
import { f, optional } from '../schema.js';

/** POST /api/crawler/crawl — page discovery (sitemaps + homepage links). */
export const crawlerDiscover = defineEndpoint({
  name: 'crawler.discover',
  summary: 'Discover the indexable pages of a website via its sitemaps and homepage links.',
  method: 'POST',
  path: '/api/crawler/crawl',
  auth: AUTH.PUBLIC,
  runtime: 'edge',
  request: {
    url: f.url(),
    cf_turnstile_token: optional(f.string({ max: 4096 }))
  },
  response: {
    success: f.boolean(),
    root_url: f.url(),
    total_discovered: f.number({ min: 0, integer: true }),
    pages: f.arrayOf(f.shape({
      url: f.url(),
      title: f.string({ min: 0 })
    }))
  },
  errors: {
    400: 'Missing or unreachable url',
    403: 'Captcha verification failed'
  }
});

/** POST /api/crawler/scan — fetch one page, chunk it, index it. */
export const crawlerScan = defineEndpoint({
  name: 'crawler.scan',
  summary: 'Fetch a single page through Jina Reader, chunk it, and index it for the tenant.',
  method: 'POST',
  path: '/api/crawler/scan',
  auth: AUTH.TENANT,
  runtime: 'edge',
  request: {
    site_id: f.uuid(),
    tenant_id: f.uuid(),
    url: f.url()
  },
  response: {
    success: f.boolean(),
    chunks_count: f.number({ min: 0, integer: true }),
    message: optional(f.string({ min: 0 })),
    // A page can be indexed as "seen but empty" or "seen but login-walled" —
    // both are successes with zero chunks, and the UI reports them apart.
    is_empty: optional(f.boolean()),
    is_protected: optional(f.boolean())
  },
  errors: {
    400: 'Missing required fields: site_id, url, tenant_id',
    403: 'The caller does not own this tenant'
  }
});

/** POST /api/crawler/update — replace one page's indexed content by hand. */
export const crawlerUpdate = defineEndpoint({
  name: 'crawler.update',
  summary: "Replace the indexed content of one page with an operator's edited text.",
  method: 'POST',
  path: '/api/crawler/update',
  auth: AUTH.TENANT,
  runtime: 'edge',
  request: {
    site_id: f.uuid(),
    tenant_id: f.uuid(),
    url: f.url(),
    // Empty is legal: it is how an operator clears a page's indexed content.
    content: f.string({ min: 0, max: 500_000, allowEmpty: true })
  },
  response: {
    success: f.boolean()
  },
  errors: {
    400: 'Missing fields: site_id, tenant_id, url, content',
    403: 'The caller does not own this tenant'
  }
});

/** POST /api/crawler/summarize — (re)generate the site summary used as RAG context. */
export const crawlerSummarize = defineEndpoint({
  name: 'crawler.summarize',
  summary: 'Generate or refresh the site summary that seeds every conversation with context.',
  method: 'POST',
  path: '/api/crawler/summarize',
  auth: AUTH.TENANT,
  runtime: 'edge',
  request: {
    tenant_id: f.uuid(),
    site_id: f.uuid(),
    url: optional(f.url()),
    raw_content: optional(f.string({ min: 0, max: 500_000 }))
  },
  response: {
    success: f.boolean(),
    summary: f.string({ min: 0 }),
    record: optional(f.any())
  },
  errors: {
    400: 'Missing required fields: tenant_id, site_id — or not enough content to summarize',
    403: 'The caller does not own this tenant',
    500: 'The model could not produce a summary'
  }
});

/** POST /api/crawler/delete-site — atomic cascade delete of a site. */
export const crawlerDeleteSite = defineEndpoint({
  name: 'crawler.deleteSite',
  summary: 'Delete a website and everything hanging off it, in one transaction (delete_site_cascade).',
  method: 'POST',
  path: '/api/crawler/delete-site',
  auth: AUTH.TENANT,
  runtime: 'edge',
  request: {
    site_id: f.uuid(),
    tenant_id: f.uuid()
  },
  response: {
    success: f.boolean(),
    deleted: optional(f.any())
  },
  errors: {
    400: 'Missing required fields: site_id, tenant_id',
    403: 'The caller does not own this tenant',
    500: 'The cascade delete failed — nothing was removed'
  }
});

export default [crawlerDiscover, crawlerScan, crawlerUpdate, crawlerSummarize, crawlerDeleteSite];
