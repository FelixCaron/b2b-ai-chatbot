# Vercel setup

Four projects, one per deployable directory. The directory names and the project
names are deliberately the same.

| Project | Root directory | What it serves |
|---|---|---|
| `dorafi-admin` | `dorafi/admin` | The customer-facing SPA **and** its serverless functions (`dorafi/admin/api/**`) |
| `dorafi-staff` | `dorafi/staff` | Staff-only cross-tenant console — **never link this anywhere in the public product** |
| `dorafi-widget` | `dorafi/widget` | The embeddable widget, as a CDN-style static bundle |
| `logafi` | `logafi` | The parent company's site. No build step: the directory is served as committed |

Each project serves **both** environments: Vercel's own Production and Preview,
pointed at different databases by environment-scoped variables. See
`docs/DEPLOYMENT.md`.

⚠️ **Root Directory is not optional.** Vercel turns `<root directory>/api/**`
into serverless functions and nothing else, so `dorafi-admin` pointed anywhere
but `dorafi/admin` deploys an SPA with no API behind it — and nothing about the
deployment says so. The pipeline counts the functions it built against the route
files on disk and refuses to ship a mismatch, but a project whose Root Directory
was never updated after the 2026-09-12 reorganisation fails earlier and more
confusingly, at the build.

## Terraform

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # git-ignored; fill it in
cp imports.tf.example imports.tf               # then put the real project ids in
terraform init
terraform plan                                  # read all of it
```

This creates or reconciles all four projects, both environments' variables, and
the domains. **It is not a first-run-and-forget command** — these projects were
created by hand, so Terraform has to adopt them first, and the first apply would
otherwise be five simultaneous changes to a live site. `infra/terraform/README.md`
and `imports.tf.example` set out the staging; read them before applying.

You need a Vercel API token: Account Settings → Tokens.

## What Terraform does not do

1. **Create the account and mint the token** — necessarily before anything can
   authenticate.
2. **DNS.** Point `dorafi.logafi.com`, `logafi.com`, `www.logafi.com`,
   `preview.dorafi.logafi.com` and `preview.logafi.com` at Vercel.
   `terraform output domain_verification` prints whatever records Vercel is
   still waiting on.
3. **Authorise Vercel's GitHub App** for this repository, if it is not already.

## Manual fallback

Dashboard → Add New → Project → import the repo → set Root Directory from the
table above → Environment Variables (both Production and Preview scopes, with
*different* Supabase values — see `.env.example` for the list) → Deploy.

## Deploying

You don't, by hand. A push to `main` runs the pipeline in
`.github/workflows/deploy.yml`: tests, preview database, preview deployment,
smoke test, your approval, then production. Vercel's own git integration is
switched off, because it deployed on push whether or not the tests passed.

`docs/DEPLOYMENT.md` covers the pipeline, what the preview environment can and
cannot prove, and how to roll back (which *is* a dashboard action: promote an
older deployment).
