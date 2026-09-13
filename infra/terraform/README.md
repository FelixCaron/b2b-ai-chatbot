# The environments, as code

Two environments — `production` and `preview` — each with its own Postgres, its
own domains, its own Stripe mode and its own captcha keys. Four Vercel projects
serve both, because Vercel already gives every project a Production and a
Preview environment; the split lives in the *variables*, not in a second set of
projects.

```
locals.environments          the map everything iterates over — add an
                             environment by adding an entry
supabase.tf                  one database per environment, plus their auth
                             configuration, plus reading their API keys
vercel.tf                    the four projects, their per-environment variables,
                             their domains
github.tf                    the Actions environments, variables and secrets the
                             pipeline needs
```

The part worth understanding: `data.supabase_apikeys` reads each database's keys
and `vercel.tf` feeds them straight into that environment's Vercel variables.
Nothing is copied by hand from one dashboard to another, which is what makes a
new environment reproducible rather than a checklist someone has to follow
correctly.

## Run this from your own machine

Not from a Claude Code session: the agent proxy blocks every GitHub Actions and
environments API path (read and write, whatever the token), so `github.tf` — the
environments, the variables, the approval gate — cannot be applied from there.
Confirmed on 2026-09-13. The Vercel and Supabase halves work fine from either.

## Before the first apply

```bash
cp terraform.tfvars.example terraform.tfvars   # git-ignored; fill it in
cp imports.tf.example imports.tf               # then put the real ids in
terraform init
terraform plan                                  # read all of it
```

**The first `plan` will want to create things that already exist.** Four Vercel
projects and the production database were made by hand, long before this
directory. `imports.tf.example` explains how to adopt them and — more
importantly — how to stage the rollout so that no single apply is doing five
things at once to a live site. Read it before applying anything.

The rule that matters: **a plan that shows anything under "destroy" is not one
to apply.** These resources carry `prevent_destroy`, so Terraform will refuse
rather than take a database or a project with it, but a refused apply in the
middle of a run is still a bad afternoon.

## What this does not manage

- **DNS.** Vercel needs `preview.dorafi.logafi.com` and `preview.logafi.com`
  pointed at it. `terraform output domain_verification` prints whatever records
  Vercel is still waiting for.
- **Stripe products and prices.** No official provider. `npm run setup:stripe`
  creates them idempotently; run it once per mode and paste the ids it prints
  into `terraform.tfvars`.
- **Stripe webhook endpoints.** One per environment, registered in the Stripe
  dashboard against that environment's domain. Each has its own signing secret.
- **Accounts and tokens.** Creating the Vercel and Supabase accounts, and
  minting the tokens at the top of `terraform.tfvars`, is the bootstrapping step
  that necessarily comes before anything here can authenticate.
- **Database schema.** That is `supabase/migrations/`, applied by the pipeline.

## Standing up a third environment

Add an entry to `locals.environments` with its own domains and Stripe set, add
its database password to `supabase_db_passwords`, apply. Everything else —
Supabase project, auth configuration, Vercel variables scoped to it, GitHub
environment, secrets — follows from the map.

The one real constraint is Supabase's free plan: two active projects per
organisation, which production and preview already use.

## A note on the state file

It is the only record linking these resources to the live projects. Lose it and
the next `apply` tries to create everything again, collides on the names, and
you are back to importing by hand. `versions.tf` has two commented backend
blocks; configure one before this matters.
