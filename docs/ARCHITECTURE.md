# Architecture — components and API contracts

This document is the map. It says where a thing lives and why, so a change lands
in one place instead of five.

Two ideas carry the whole structure:

1. **The UI is components, composed by a shell.** No screen owns the page chrome;
   no component reaches around its props for state.
2. **Every API is a product with a data contract.** One definition describes an
   endpoint's address, auth posture, request shape, response shape and errors —
   and both the server handler and the browser client import that same
   definition.

---

## 1. API products

### The catalogue — `packages/contracts`

```
packages/contracts/
├── src/
│   ├── schema.js          the field vocabulary (uuid, url, email, oneOf, …)
│   ├── endpoint.js        defineEndpoint() / registry() / AUTH
│   ├── client.js          createApiClient() — the shared browser transport
│   ├── endpoints/
│   │   ├── chat.js        chat.send · chat.init · chat.theme
│   │   ├── crawler.js     crawler.discover · scan · update · summarize · deleteSite
│   │   ├── sites.js       sites.claim
│   │   ├── billing.js     billing.checkout · portal · webhook
│   │   └── staff.js       staff.* (dorafi/staff's own Vercel project)
│   ├── plans.js           the plan catalogue (slugs, limits, display names)
│   ├── widget-status.js   the shared "is this widget actually live" rule
│   ├── niches.js          the segment landing pages, as a registry
│   └── index.js           the registry, grouped as `contracts.<family>.<product>`
```

Zero dependencies and **no build step**, deliberately: the Vercel Edge handlers,
the Vite bundles and the plain-node test scripts all import this source
directly. That is also why it has its own ~150-line field vocabulary instead of
Zod — every dependency here is cold-start weight on the server and download
weight in the browser.

An endpoint definition reads as a product sheet:

```js
export const crawlerScan = defineEndpoint({
  name: 'crawler.scan',
  summary: 'Fetch a single page through Jina Reader, chunk it, and index it.',
  method: 'POST',
  path: '/api/crawler/scan',
  auth: AUTH.TENANT,          // the caller must own the tenant_id in the payload
  request: { site_id: f.uuid(), tenant_id: f.uuid(), url: f.url() },
  response: { success: f.boolean(), chunks_count: f.number({ integer: true }), … },
  errors: { 400: '…', 403: 'The caller does not own this tenant' }
});
```

`auth` is the security posture, enforced by the runtime rather than by each
handler remembering to: `public` · `user` · `tenant` · `staff` · `webhook` ·
`cron`.

### The server end — `dorafi/admin/api/lib/http.js`

`edgeRoute(endpoint, handler)` and `nodeRoute(endpoint, handler)` wrap a handler
in its contract and do, once, what every route used to repeat: the `OPTIONS`
branch, the method check, JSON parsing, request validation, authentication and
tenant-ownership, the error → JSON shaping, and the CORS headers on every reply.

```js
export default edgeRoute(contracts.crawler.scan, async (req, { data, supabase, json }) => {
  // `data` is validated; the caller is already known to own data.tenant_id
});
```

What is left in a route file is the part that is actually about that product.

### The browser end — `createApiClient`

One transport, in the package, bound per app to that app's Supabase session:

```js
// dorafi/admin/src/lib/api/client.js
const client = createApiClient({ getAuthHeaders: authenticatedHeaders });
```

and one grouped surface per app (`dorafi/*/src/lib/api/index.js`):

```js
const result = await api.crawler.scan({ site_id, tenant_id, url });
if (!result.ok) setError(result.error);
```

Every call resolves to the same envelope and **never throws**:

```
{ ok: true,  status, data }
{ ok: false, status, error, issues?, data? }
```

The client validates the payload *before* it leaves the browser, so a mistyped
field is a console error at the call site rather than a 400 in production. In
dev it also warns when a response drifts from its contract — a warning, never a
rejection: a server that grew a field must not break a tab opened before the
deploy.

**Rule: components never call `fetch('/api/...')`.** If a component needs a new
API, add the contract, add it to the grouped surface, then call it.

### Tests

`npm test` runs `scripts/tests/test-contracts.js`, which proves every endpoint in
the registry has a handler file on disk, that every tenant-scoped endpoint
actually carries a tenant id, and that the shared transport puts each request on
the wire the way its contract says (URL, method, bearer token, query/body split).

---

## 2. The admin SPA — `dorafi/admin/src`

```
src/
├── App.jsx                    the composition root — wiring and a view switch
├── app/routes.js              views ↔ URLs (VIEW_PATHS, viewForPath, pathForView)
├── hooks/
│   ├── useRouter.js           currentView + navigate + popstate
│   ├── useAuthSession.js      the Supabase session, magic-link login, logout
│   ├── useWorkspace.js        tenants · sites · leads · usage, and their writes
│   ├── useGuestSiteClaim.js   the guest → account workspace transfer (ADR 057)
│   ├── usePaymentToast.js     the Stripe redirect notice
│   └── useCopilotNavigation.js  `navigate_to` tool calls from the admin Copilot
├── components/
│   ├── layout/
│   │   ├── AppShell.jsx       header + content + footer — the page chrome
│   │   ├── Header.jsx         THE header: picks the shape from `isAuthenticated`
│   │   ├── AppHeader.jsx      signed-in: workspace selector, plan badge, billing
│   │   ├── GuestHeader.jsx    guest: same nav, a Sign In call to action
│   │   ├── Footer.jsx         THE footer
│   │   └── navigation.js      the nav items, defined once for both headers
│   └── …                      LoginModal, Pricing, LegalPages, PlanBadge, …
├── features/
│   ├── dashboard/             see §3 below
│   └── leads/                 LeadsPage · RecentLeadsSection
└── lib/
    ├── api/                   the contract client + grouped surface
    ├── supabase.js            the browser Supabase client (publishable key only)
    └── pending-claim.js       the local note behind the workspace transfer
```

### The shell

`App.jsx` owns no data beyond "is the login modal open". It wires the hooks and
decides which view goes inside `<AppShell>`; the shell owns the frame.

The header is one component with two shapes. A signed-in session gets
`AppHeader`, a guest gets `GuestHeader`, and both take their tabs from
`navigation.js` — previously each carried its own copy of the tab list, in two
files, which is how they drifted. `Header` also accepts `hidden`, because the
header is deliberately absent on the landing pages and on the root onboarding
hero before a workspace exists.

### State

Each hook owns one concern and hands back an explicit surface. The one seam
worth knowing about: filing a guest claim has to happen *during* sign-in, while
the anonymous session can still prove it owns the guest tenant — so `App` passes
`useAuthSession` an `onBeforeConvertGuest` callback that reaches
`useGuestSiteClaim` through a ref.

---

## 3. The dashboard — `dorafi/admin/src/features/dashboard`

The dashboard was one 2,736-line component. It is now a composition root of
~420 lines that wires four hooks and renders the sections:

```
features/dashboard/
├── Dashboard.jsx              the composition root — same props as before
├── lib/
│   ├── plan-limits.js         plan → website/page limits, as data
│   ├── page-url.js            URL normalisation (pure)
│   ├── brand-theme.js         the theme-extraction call
│   └── turnstile.js           the invisible captcha challenge
├── hooks/
│   ├── useSiteSummary.js      load · save · regenerate the site summary
│   ├── useCrawlPipeline.js    discovery · scan · indexed pages · learning progress
│   ├── usePreviewChat.js      the live-preview viewport and its SSE chat session
│   └── useSiteLifecycle.js    add · delete · park · reactivate a website
└── components/
    ├── OnboardingHero.jsx     the URL-paste hero, before any site exists
    ├── SiteTabs.jsx           the multi-site selector
    ├── SiteHeroCard.jsx       the active site and its actions
    ├── ParkedSiteBanner.jsx   why a parked widget stopped answering
    ├── GuidedRoadmap.jsx      the three-step roadmap
    ├── ChatPreview.jsx · IntegrationSnippet.jsx
    ├── AdvancedSettings/      FeatureToggles · SiteSummaryCard ·
    │                          KnowledgeBasePanel · DangerZone, composed by
    │                          AdvancedSettingsPanel
    └── modals/                LearningProgress · LivePreview · Integration ·
                               EditPage · AddSite · DeleteSite · PageSelection ·
                               UpgradeRequired · OverLimit
```

Sections and modals are presentational: explicit named props, no reaching
around them for state. The state that genuinely travels together lives in the
hooks; what is shared across sections stays in `Dashboard.jsx`.

---

## 4. The staff console — `dorafi/staff/src`

The same shape, smaller: `components/layout/{AppShell,Header,Footer}.jsx`,
`lib/api/` built on the same `createApiClient`, and an `App.jsx` left holding
the staff gate and the tab state.

---

## Where to make a change

| You want to…                        | Edit                                                    |
|-------------------------------------|---------------------------------------------------------|
| add or rename an API field          | `packages/contracts/src/endpoints/*.js` (both ends follow) |
| add an endpoint                     | the contract, a handler wrapped in `edgeRoute`/`nodeRoute`, one line in `lib/api/index.js` |
| change the auth posture of a route  | the contract's `auth` — the runtime enforces it          |
| add a nav tab                       | `components/layout/navigation.js`                        |
| change the header or footer         | `components/layout/`                                     |
| add a page                          | `app/routes.js`, then a case in `App.jsx`'s switch        |
| change how a call is made           | `packages/contracts/src/client.js` — once, for every app  |
