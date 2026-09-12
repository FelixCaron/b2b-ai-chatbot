# ---------------------------------------------------------------------------
# The environments, as data.
#
# This map is the whole design. Everything else in this directory iterates over
# it: one Supabase project per entry, one set of Vercel environment variables
# per entry, one GitHub Actions environment per entry. Adding a third
# environment later is one more entry here, not a new set of files.
#
# What is NOT per environment: the Vercel projects themselves. Vercel gives each
# project a Production and a Preview environment of its own, so four projects
# carry both — which is why `vercel_target` exists below, naming the Vercel
# environment each entry maps onto.
# ---------------------------------------------------------------------------

locals {
  environments = {
    production = {
      supabase_project_name = "dorafi-production"
      # Where the product is served. Also what Stripe redirects back to and
      # what OpenRouter is told about.
      app_url = "https://${var.production_app_domain}"
      # Domains this environment answers on, per Vercel project. The staff
      # console deliberately has none: it stays on its generated Vercel URL,
      # unlisted, and is never linked from the product.
      domains = {
        admin  = [var.production_app_domain]
        site   = var.production_site_domains
        widget = []
        staff  = []
      }
      vercel_target = "production"
      stripe        = var.stripe_production
      # Production's Turnstile keys must be real and issued for the domains
      # above; Cloudflare scopes a site key to its hostnames.
      turnstile = var.turnstile_production
    }

    preview = {
      supabase_project_name = "dorafi-preview"
      app_url               = "https://${var.preview_app_domain}"
      domains = {
        admin  = [var.preview_app_domain]
        site   = [var.preview_site_domain]
        widget = []
        staff  = []
      }
      vercel_target = "preview"
      stripe        = var.stripe_preview
      # Cloudflare's documented always-pass test pair. Set explicitly rather
      # than left empty: with TURNSTILE_SECRET_KEY unset the server fails OPEN
      # (api/lib/captcha.js), which would leave preview's two pre-tenant
      # endpoints unauthenticated.
      turnstile = {
        site_key   = "1x00000000000000000000AA"
        secret_key = "1x0000000000000000000000000000000AA"
      }
    }
  }

  # Every Vercel project, and what it needs to know. `env` is evaluated per
  # environment further down, in vercel.tf.
  vercel_projects = {
    admin = {
      name           = "${var.project_prefix}-admin"
      root_directory = "dorafi/admin"
      framework      = "vite"
      build_command  = "vite build"
      description    = "The product: the React SPA and its serverless functions."
    }
    staff = {
      name           = "${var.project_prefix}-staff"
      root_directory = "dorafi/staff"
      framework      = "vite"
      build_command  = "vite build"
      description    = "Staff-only cross-tenant console. Never linked from the product."
    }
    widget = {
      name           = "${var.project_prefix}-widget"
      root_directory = "dorafi/widget"
      framework      = "vite"
      build_command  = "vite build"
      description    = "The embeddable widget bundle, served as a CDN asset."
    }
    logafi = {
      name           = var.logafi_project_name
      root_directory = "logafi"
      framework      = null
      build_command  = null
      description    = "The parent company's site. No build: the directory is served as committed."
    }
  }

  # Flattened {project, environment} pairs, so the domain resources below can
  # use a single for_each instead of four near-identical blocks.
  project_domains = merge([
    for env_key, env in local.environments : {
      for pair in flatten([
        for project_key, domains in env.domains : [
          for domain in domains : {
            key         = "${project_key}-${env_key}-${domain}"
            project_key = project_key
            env_key     = env_key
            domain      = domain
          }
        ]
      ]) : pair.key => pair
    }
  ]...)
}
