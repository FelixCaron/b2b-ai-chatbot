# ---------------------------------------------------------------------------
# One Vercel project per deployable directory, each serving both environments.
#
# Vercel gives every project a Production and a Preview environment, so the
# split between prod and preview lives in the *variables*, not in a second set
# of projects. That is what makes it safe: the same commit, built twice, once
# against each database.
# ---------------------------------------------------------------------------

resource "vercel_project" "this" {
  for_each = local.vercel_projects

  name      = each.value.name
  framework = each.value.framework

  # Root Directory is not cosmetic. Vercel turns `<root>/api/**` into
  # serverless functions and nothing else, so dorafi-admin pointed anywhere but
  # dorafi/admin deploys the SPA with no API behind it — and says nothing.
  root_directory   = each.value.root_directory
  build_command    = each.value.build_command
  output_directory = each.value.framework == null ? "." : "dist"

  node_version = var.node_version

  git_repository = {
    type              = "github"
    repo              = var.github_repo
    production_branch = var.production_branch
  }

  git_provider_options = {
    # The repository stays connected — for commit statuses and for the
    # dashboard's "which commit is this" — but Vercel no longer deploys on
    # push. It used to deploy on every push regardless of whether CI passed,
    # which made CI advisory. GitHub Actions is the only deploy path now.
    #
    # Flip this last, and only once an Actions deploy has succeeded end to end:
    # turning it off before then leaves no way to ship at all.
    create_deployments = var.vercel_git_auto_deploy
  }

  # Preview deployments are behind Vercel's SSO gate by default, which answers
  # 401 to anything without a Vercel session — including the pipeline's own
  # smoke tests, and including a browser loading the widget cross-origin.
  vercel_authentication = {
    deployment_type = "none"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# ---------------------------------------------------------------------------
# What each app is told about the world it is running in.
#
# The important line in this file is `target = [env.vercel_target]`: every value
# is scoped to one environment. The previous config set one value on
# ["production", "preview"] at once, which meant a preview deployment read
# production's Supabase URL, production's secret key and production's Stripe
# keys — it would have written to the production database by construction.
# ---------------------------------------------------------------------------

locals {
  # Values that are safe to read back from the Vercel dashboard. Everything
  # not listed here is stored write-only.
  public_env_keys = toset([
    "VITE_SUPABASE_URL", "VITE_APP_URL", "VITE_PUBLIC_APP_URL",
    "VITE_TURNSTILE_SITE_KEY", "DEFAULT_MODEL", "PREMIUM_MODEL",
    "SYSTEM_EMAIL_FROM", "ADMIN_EMAIL", "NODE_ENV",
  ])

  supabase_url = {
    for key, project in supabase_project.this : key => "https://${project.id}.supabase.co"
  }

  # `secret_keys` is a list because a project can hold several; the one named
  # "default" is the one Supabase creates with the project.
  supabase_secret_key = {
    for key, keys in data.supabase_apikeys.this : key => one([
      for k in keys.secret_keys : k.api_key if k.name == "default"
    ])
  }

  env_for = {
    admin = {
      for env_key, env in local.environments : env_key => merge(
        {
          NODE_ENV                      = "production"
          VITE_SUPABASE_URL             = local.supabase_url[env_key]
          VITE_SUPABASE_PUBLISHABLE_KEY = data.supabase_apikeys.this[env_key].publishable_key
          SUPABASE_SECRET_KEY           = local.supabase_secret_key[env_key]
          VITE_APP_URL                  = env.app_url
          OPENROUTER_API_KEY            = var.openrouter_api_key
          JINA_API_KEY                  = var.jina_api_key
          DEFAULT_MODEL                 = var.default_model
          PREMIUM_MODEL                 = var.premium_model
          RESEND_API_KEY                = var.resend_api_key
          ADMIN_EMAIL                   = var.admin_email
          SYSTEM_EMAIL_FROM             = "noreply@${var.production_site_domains[0]}"
          VITE_TURNSTILE_SITE_KEY       = env.turnstile.site_key
          TURNSTILE_SECRET_KEY          = env.turnstile.secret_key
          STRIPE_SECRET_KEY             = env.stripe.secret_key
          STRIPE_WEBHOOK_SECRET         = env.stripe.webhook_secret
          STRIPE_PRICE_ID_BASIC         = env.stripe.price_id_basic
          STRIPE_PRICE_ID_PRO           = env.stripe.price_id_pro
          STRIPE_PRICE_ID_PREMIUM       = env.stripe.price_id_premium
        },
      )
    }

    # The staff console reads tenant metadata and nothing else — no Stripe, no
    # OpenRouter, no Resend. It is given exactly what it uses.
    staff = {
      for env_key, env in local.environments : env_key => {
        NODE_ENV                      = "production"
        VITE_SUPABASE_URL             = local.supabase_url[env_key]
        VITE_SUPABASE_PUBLISHABLE_KEY = data.supabase_apikeys.this[env_key].publishable_key
        SUPABASE_SECRET_KEY           = local.supabase_secret_key[env_key]
        # Which product deployment its niche links should point at. It cannot
        # infer this from its own origin: different project, different domain.
        VITE_PUBLIC_APP_URL = env.app_url
      }
    }

    # A static bundle and a static site. Nothing to configure, and giving them
    # a secret they do not read is how secrets end up somewhere they need not be.
    widget = { for env_key, env in local.environments : env_key => {} }
    logafi = { for env_key, env in local.environments : env_key => {} }
  }
}

resource "vercel_project_environment_variables" "this" {
  for_each = {
    for key, project in local.vercel_projects : key => project
    if length(flatten([for env_key, vars in local.env_for[key] : keys(vars)])) > 0
  }

  project_id = vercel_project.this[each.key].id

  variables = [
    for entry in flatten([
      for env_key, env in local.environments : [
        for name, value in local.env_for[each.key][env_key] : {
          key       = name
          value     = value
          target    = [env.vercel_target]
          sensitive = !contains(local.public_env_keys, name)
        }
      ]
    ]) : entry
  ]
}

# ---------------------------------------------------------------------------
# Domains.
#
# A project domain with no git_branch is a PRODUCTION domain: Vercel points it
# at whatever was last deployed with --prod. Setting git_branch is what makes
# one a Preview domain instead — which is the entire difference between
# preview.dorafi.logafi.com showing preview and it quietly showing production.
#
# Worth confirming in the dashboard after the first apply (Settings → Domains):
# the preview entries should read "Preview", not "Production".
# ---------------------------------------------------------------------------

resource "vercel_project_domain" "this" {
  for_each = local.project_domains

  project_id = vercel_project.this[each.value.project_key].id
  domain     = each.value.domain

  git_branch = local.environments[each.value.env_key].vercel_target == "preview" ? var.production_branch : null
}
