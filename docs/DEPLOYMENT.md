# Environments and deployment

Two environments. Each has its own Postgres, its own domains, its own Stripe
mode and its own captcha keys — they share only the code.

| | production | preview |
|---|---|---|
| Product | `dorafi.logafi.com` | `preview.dorafi.logafi.com` |
| Parent company site | `logafi.com` | `preview.logafi.com` |
| Staff console | its generated Vercel URL, unlisted | same, preview |
| Database | Supabase project `dorafi-production` | `dorafi-preview` |
| Stripe | live mode | test mode, its own webhook endpoint |
| Captcha | real Turnstile keys | Cloudflare's always-pass test pair |
| Indexable | yes | no (`X-Robots-Tag: noindex`) |

All of it is declared in `infra/terraform/` — including the GitHub Actions
variables and secrets the pipeline below reads. There is no step where a value
is copied by hand from one dashboard into another.

## What happens when you push to main

```
verify                     build all four apps, 9 unit suites, 142 E2E tests,
                           secret scan
  ↓
migrate preview DB         supabase db push, then a one-row seed
  ↓
deploy preview             the four projects, aliased onto preview.*
  ↓
smoke-test preview         over HTTP, against the real deployment
  ↓
⏸ APPROVAL                 the run stops here and waits for you
  ↓
migrate production DB
  ↓
deploy production
  ↓
smoke-test production
```

Approve in the run's page on GitHub — Actions → the run → "Review deployments".
The preview of that exact commit is live while you decide.

Nothing else deploys. Vercel's own git integration is switched off
(`create_deployments = false`), because two deploy paths race and Vercel's does
not wait for CI: before this, a push shipped to production whether the tests
passed or not.

### Why the same commit is built twice

`VITE_SUPABASE_URL` and friends are inlined into the JavaScript bundle at build
time, so a bundle built for preview is physically a different file from the one
built for production. The pipeline cannot promote the artifact it smoke-tested;
it rebuilds. What preview proves is that this commit *builds and wires up*
correctly, not that these exact bytes do.

### What the smoke test actually checks

`scripts/ops/smoke.mjs`, and the list is short on purpose:

- the bundle a deployment serves has the **right database** inlined in it —
  the check that makes two environments trustworthy;
- the bundle is the whole app, not the "Configuration required" screen a build
  with wrong Supabase variables silently produces;
- `/api/**` routes exist and answer — a wrong Root Directory ships the SPA with
  no API and looks perfectly normal;
- preview is not indexable.

It does not test behaviour. That is `tests/e2e/`, which mocks the entire backend
and therefore says nothing about a deployment — the two are deliberately
complementary.

## The limits of preview

Worth being explicit, so nobody trusts it for more than it does.

- **The preview database is nearly empty.** It is built from
  `supabase/migrations/` and then seeded with one tenant and one site, so the
  admin app's own embedded widget has something to answer for. There are no
  indexed documents, so the assistant has nothing to retrieve and will say so.
- **Preview verifies deployability and wiring, not behaviour.**
- **Its Stripe is test mode**, with its own webhook endpoint and its own price
  objects — test-mode prices are different objects from live ones, not the same
  ids with a different prefix.
- **Its captcha always passes.** Cloudflare's documented test pair, set
  explicitly rather than left unset, because with `TURNSTILE_SECRET_KEY` absent
  the server fails *open* and the two pre-tenant endpoints become unauthenticated.

## Rolling back

**The app**: Vercel keeps every deployment. Dashboard → the project →
Deployments → the last good one → Promote to Production. That is instant and
does not need this repository. Afterwards, revert the commit so the next push
does not put it straight back.

**The database**: migrations only go forward. There is no down-migration in
this project, by design — write the correcting migration and push it through
the pipeline, where it hits preview first.

**If a bad migration is already in production**, roll the app back first (above)
so the running code matches the schema it expects, then decide on the fix
without a clock running.

## Adding an environment

Add an entry to `locals.environments` in `infra/terraform/locals.tf` with its
domains and its Stripe set, add a database password for it, apply. The Supabase
project, its auth configuration, the Vercel variables scoped to it, the GitHub
environment and its secrets all follow.

Two constraints: Supabase's free plan allows two active projects per
organisation (production and preview already use both), and Vercel's Hobby plan
caps a deployment at 12 serverless functions, which `dorafi/admin` exactly
reaches.

## When something is off

- **The run stopped and nothing is happening** — it is waiting for the
  production approval. That is the design.
- **Every job was skipped** — `DEPLOY_PIPELINE_ENABLED` is not `true`. Terraform
  sets it; see `infra/terraform/README.md`.
- **"Built N functions from M route files"** — the Vercel project's Root
  Directory is wrong. It must be `dorafi/admin`, `dorafi/staff`,
  `dorafi/widget`, `logafi` respectively.
- **The smoke test says the bundle points at the wrong database** — an
  environment variable is scoped to the wrong Vercel target. Do not deploy past
  this.
- **`supabase db push` fails on preview after a quiet week** — free-tier
  projects pause when idle. Open the project once in the dashboard to wake it.
