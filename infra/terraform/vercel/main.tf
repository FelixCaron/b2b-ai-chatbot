# Repondo — Vercel projects as code.
#
# Manages the three Vercel projects this monorepo deploys as (see CLAUDE.md's
# Deployment section for the manual-deploy commands these projects run):
#   1. admin   — root directory ".", the admin SPA + root /api serverless functions
#   2. widget  — root directory "apps/widget", the embeddable chat widget
#   3. internal-admin — root directory "apps/internal-admin", the staff-only
#      cross-tenant dashboard (see docs/INTEGRATION_REVIEW.md for why this is
#      a separate project rather than a route inside "admin")
#
# This is idempotent by construction: `terraform apply` reconciles the
# resources below against whatever already exists in Vercel, so re-running it
# is a no-op once state matches. That guarantee depends on the state file
# persisting between runs — see the backend note at the bottom of this file.
#
# One-time bootstrapping this can't do for you: creating the Vercel account/
# team itself and minting the API token below. See docs/setup/vercel.md.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.9"
    }
  }

  # No backend configured here on purpose — this repo doesn't know your team's
  # infra conventions. Uncomment and configure ONE of these before your first
  # `terraform apply`, otherwise state stays local (fine solo, risky for a
  # team: two people applying from local state will fight each other and can
  # each think they're re-creating a project that already exists).
  #
  # backend "remote" {                 # Terraform Cloud / HCP Terraform (free tier is enough)
  #   organization = "your-org"
  #   workspaces { name = "repondo-vercel" }
  # }
  #
  # backend "s3" {                     # Any S3-compatible bucket you already have
  #   bucket = "your-terraform-state-bucket"
  #   key    = "repondo/vercel.tfstate"
  #   region = "us-east-1"
  # }
}

provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team_id
}

# ---------------------------------------------------------------------------
# Project 1 — Admin SPA + root API (deployed from repo root)
# ---------------------------------------------------------------------------
resource "vercel_project" "admin" {
  name      = "${var.project_prefix}-admin"
  framework = "vite"
  git_repository = {
    type = "github"
    repo = var.github_repo
  }
  root_directory   = "."
  build_command    = "npm run build"
  output_directory = "apps/admin/dist"
}

resource "vercel_project_environment_variables" "admin" {
  project_id = vercel_project.admin.id
  variables = [
    for key, value in merge(var.admin_env, { NODE_ENV = "production" }) : {
      key       = key
      value     = value
      target    = ["production", "preview"]
      sensitive = true
    }
  ]
}

# ---------------------------------------------------------------------------
# Project 2 — Widget (deployed from apps/widget)
# ---------------------------------------------------------------------------
resource "vercel_project" "widget" {
  name      = "${var.project_prefix}-widget"
  framework = "vite"
  git_repository = {
    type = "github"
    repo = var.github_repo
  }
  root_directory   = "apps/widget"
  build_command    = "npm run build"
  output_directory = "dist"
}

# Widget is a static asset bundle with no server-side secrets — nothing to
# set here beyond the project itself.

# ---------------------------------------------------------------------------
# Project 3 — Internal staff admin dashboard (deployed from apps/internal-admin)
# Deliberately never linked from the public product. Its own URL, own env.
# ---------------------------------------------------------------------------
resource "vercel_project" "internal_admin" {
  name      = "${var.project_prefix}-internal-admin"
  framework = "vite"
  git_repository = {
    type = "github"
    repo = var.github_repo
  }
  root_directory   = "apps/internal-admin"
  build_command    = "npm run build"
  output_directory = "dist"
}

resource "vercel_project_environment_variables" "internal_admin" {
  project_id = vercel_project.internal_admin.id
  variables = [
    for key, value in var.internal_admin_env : {
      key       = key
      value     = value
      target    = ["production", "preview"]
      sensitive = true
    }
  ]
}
