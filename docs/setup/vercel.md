# Vercel setup

Three separate Vercel projects, matching the monorepo's three deployable apps:

| Project | Root directory | What it serves |
|---|---|---|
| `repondo-admin` | `.` (repo root) | Admin SPA (`apps/admin`) + root `/api` serverless functions |
| `repondo-widget` | `apps/widget` | The embeddable chat widget, as a CDN-style static bundle |
| `repondo-internal-admin` | `apps/internal-admin` | Staff-only cross-tenant dashboard — **never link this anywhere in the public product** |

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
vercel --prod                        # from repo root — admin + API
cd apps/widget && vercel --prod      # widget
cd apps/internal-admin && vercel --prod  # staff console
```

CI (`.github/workflows/deploy.yml`) runs tests/builds and deploys the first two; wire the
internal-admin project into that workflow once it exists in Vercel, or keep deploying it
manually — it changes rarely.
