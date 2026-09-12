# Vercel setup

Four separate Vercel projects, one per deployable directory — the directory names and the
project names are deliberately the same:

| Project | Root directory | What it serves |
|---|---|---|
| `dorafi-admin` | `dorafi/admin` | The customer-facing SPA **and** its serverless functions (`dorafi/admin/api/**`) |
| `dorafi-staff` | `dorafi/staff` | Staff-only cross-tenant dashboard — **never link this anywhere in the public product** |
| `dorafi-widget` | `dorafi/widget` | The embeddable chat widget, as a CDN-style static bundle |
| `logafi` | `logafi` | The parent company's site. No build step: the directory is served as committed |

⚠️ **Root Directory is not optional here.** Vercel only turns `<root directory>/api/**` into
serverless functions, so `dorafi-admin` pointed anywhere but `dorafi/admin` deploys an SPA
with no API behind it. If you are updating a project created before the repository was
reorganised (when the admin app deployed from `.`), change its Root Directory in
Settings → General before the next deploy.

## Scripted (preferred) — Terraform

```bash
cd infra/terraform/vercel
cp terraform.tfvars.example terraform.tfvars   # then fill in real values — this file is git-ignored
terraform init
terraform plan     # review before applying
terraform apply
```

This creates (or, on a later run, reconciles) all three projects and every env var they
need in one step — see `infra/terraform/vercel/main.tf` for what each project maps to.
`terraform apply` is idempotent: re-running it after the first successful apply is a
no-op, **as long as the state file persists between runs** — configure a real backend
(Terraform Cloud's free tier, or an S3-compatible bucket you already have — see the
commented-out `backend` blocks in `main.tf`) before your first apply if more than one
person will ever run this, or if you're applying from a machine that might not stick
around (like this kind of sandbox).

You'll need your own Vercel API token: Account Settings → Tokens.

**Adopting projects that already exist** (created by hand before Terraform was
introduced): `terraform import vercel_project.admin <project-id>` (and similarly for
`vercel_project.widget` / `vercel_project.internal_admin`) before your first `apply`, so
Terraform reconciles instead of trying to create a duplicate.

## What you still have to do manually

1. **Create the Vercel account/team** and mint the API token above — inherently a
   one-time bootstrapping step before Terraform has anything to authenticate with.
2. **Point real domains at each project** (Vercel dashboard → Project → Domains) — DNS
   isn't something this Terraform config manages.
3. **Connect the GitHub repo** if you haven't already authorized Vercel's GitHub App for
   this repo (`git_repository` in `main.tf` assumes it's connectable).

## Manual fallback

Vercel dashboard → Add New → Project → import the repo → set the project's Root
Directory to the value in the table above → Environment Variables → paste each app's
`.env.example` values in (see `docs/setup/supabase.md` / `stripe.md` / `openrouter.md` /
`resend.md` for where each value comes from) → Deploy.

## Deploying after setup

Manual deploys (`CLAUDE.md`'s Deployment section):

```bash
cd dorafi/admin  && vercel --prod   # the product: SPA + API
cd dorafi/staff  && vercel --prod   # staff console
cd dorafi/widget && vercel --prod   # widget bundle
cd logafi        && vercel --prod   # parent company site
```

CI (`.github/workflows/ci.yml`) runs the tests and builds every app on push and pull
request, but deploys nothing — each project above is deployed manually, from its own
directory.
