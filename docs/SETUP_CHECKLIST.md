# Setup checklist — new environment, start to finish

For standing up a brand new environment (a fresh Supabase project + Vercel projects), in
the order you'd actually do it. Each step links to the detailed guide for that piece.
Scripted/declarative paths are called out — see `docs/INTEGRATION_REVIEW.md`'s "What's
missing" section for the handful of things that stay inherently manual (account creation,
DNS, business verification).

## 1. Supabase — database, auth
- [ ] Create a personal access token + find your org id (see `docs/setup/supabase.md`)
- [ ] `npm run setup:supabase` — creates the project (or reuses it) and applies
      `supabase/migrations/20260905000000_consolidated_schema.sql`
- [ ] Enable email auth (magic link) in the dashboard
- [ ] Copy `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`
- [ ] Confirm your own account landed in `internal.staff_admins` (the migration seeds
      `caron.felix2@gmail.com` automatically; add teammates by inserting into that table
      as your team grows)
- [ ] **Circle back after step 5** (once real Vercel domains exist) to finish
      Authentication → URL Configuration (Site URL + Redirect URLs) and SMTP setup — see
      `docs/setup/supabase.md` steps 3-4. Skipping this is exactly what breaks magic-link
      login: emails redirect to whatever `Site URL` defaults to (`localhost`) until a
      real domain is added to Redirect URLs, and Supabase's default email sender rate-limits
      after a handful of logins until custom SMTP is configured — both confirmed live
      2026-09-05.

## 2. Stripe — billing
- [ ] `STRIPE_SECRET_KEY=sk_test_... VITE_APP_URL=... npm run setup:stripe` (test mode)
- [ ] Copy the printed `STRIPE_PRICE_ID_BASIC` / `_PRO` / `_PREMIUM` /
      `STRIPE_WEBHOOK_SECRET` values
- [ ] (Later, before real customers) complete Stripe business verification, decide on
      tax, re-run the script against your live key — see `docs/setup/stripe.md`

## 3. OpenRouter — LLM
- [ ] Create an account + API key → `OPENROUTER_API_KEY`
- [ ] Pick `DEFAULT_MODEL` / `PREMIUM_MODEL` — see `docs/setup/openrouter.md`

## 4. Resend — transactional email
- [ ] Create an account + API key → `RESEND_API_KEY`
- [ ] Verify a sending domain (skip only for early testing) → set `ADMIN_EMAIL`

## 5. Vercel — the three deployable apps
- [ ] Fill in `infra/terraform/vercel/terraform.tfvars` with everything gathered in steps
      1-4 (see `terraform.tfvars.example`)
- [ ] `terraform init && terraform plan && terraform apply` from
      `infra/terraform/vercel/` — creates `repondo-admin`, `repondo-widget`,
      `repondo-internal-admin` with their env vars set
- [ ] Point real domains at `repondo-admin` and `repondo-widget` (never at
      `repondo-internal-admin` — that one stays unlisted/internal-only)
- [ ] Deploy: `vercel --prod` from repo root, `apps/widget/`, and
      `apps/internal-admin/` (or let CI handle the first two)

## 6. First real smoke test
- [ ] Open the deployed admin app, complete onboarding for a real URL, confirm a chat
      response comes back (proves Supabase + OpenRouter + widget are wired correctly)
- [ ] Run a test-mode Stripe checkout end to end, confirm the tenant's `plan`/
      `plan_status` actually updates after `checkout.session.completed` fires (this used
      to silently fail — see `docs/INTEGRATION_REVIEW.md`'s critical-bug note — confirm
      the fix is deployed before trusting this step)
- [ ] Sign into `repondo-internal-admin` with a staff account, confirm the tenant you
      just created shows up in the list

## Local development

`npm install` at repo root, then:
```bash
npm run build --workspace=@b2b-ai-chatbot/shared   # packages/shared's dist/ isn't committed
npm run dev                                         # runs every app's dev server
```
`npm test` needs that shared build to exist first (`test-schemas.js` imports from
`packages/shared/dist`) — if you see `ERR_MODULE_NOT_FOUND` for that path, that's why.
