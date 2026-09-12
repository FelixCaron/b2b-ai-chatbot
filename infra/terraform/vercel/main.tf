# Dorafi + logafi — Vercel projects as code.
#
# One project per deployable directory, which is also how the repository is
# laid out (see CLAUDE.md's Deployment section):
#
#   dorafi-admin   — root directory "dorafi/admin", the customer-facing SPA
#                    *and* the serverless functions in dorafi/admin/api
#   dorafi-staff   — root directory "dorafi/staff", the staff-only
#                    cross-tenant dashboard (see docs/INTEGRATION_REVIEW.md
#                    for why this is a separate project rather than a route
#                    inside the admin app)
#   dorafi-widget  — root directory "dorafi/widget", the embeddable chat widget
#   logafi         — root directory "logafi", the parent company's site. No
#                    prefix: it is a different company, not a Dorafi surface.
#
# This is idempotent by construction: `terraform apply` reconciles the
# resources below against whatever already exists in Vercel, so re-running it
# is a no-op once state matches. That guarantee depends on the state file
# persisting between runs — see the backend note at the bottom of this file.
#
# ⚠️ If these projects were created by hand in the Vercel dashboard (they were,
# before this file was updated), `terraform apply` will try to CREATE them and
# fail on the name collision. Import them first, once each:
#
#   terraform import vercel_project.admin  <project-id-or-name>
#   terraform import vercel_project.staff  <project-id-or-name>
#   terraform import vercel_project.widget <project-id-or-name>
#   terraform import vercel_project.logafi <project-id-or-name>
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
  #   workspaces { name = "dorafi-vercel" }
  # }
  #
  # backend "s3" {                     # Any S3-compatible bucket you already have
  #   bucket = "your-terraform-state-bucket"
  #   key    = "dorafi/vercel.tfstate"
  #   region = "us-east-1"
  # }
}

provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team_id
}

# The staff console used to be `vercel_project.internal_admin` here, back when
# its directory was apps/internal-admin. Renaming the resource without this
# block would destroy the project (and its domains) and create a new one.
moved {
  from = vercel_project.internal_admin
  to   = vercel_project.staff
}

moved {
  from = vercel_project_environment_variables.internal_admin
  to   = vercel_project_environment_variables.staff
}

# ---------------------------------------------------------------------------
# dorafi-admin — the product: SPA + serverless API (dorafi/admin)
#
# `npm run build` resolves to that workspace's own script (`vite build`); the
# widget bundle it serves is the committed dorafi/admin/public/widget.iife.js,
# which CI refuses to let go stale.
# ---------------------------------------------------------------------------
resource "vercel_project" "admin" {
  name      = "${var.project_prefix}-admin"
  framework = "vite"
  git_repository = {
    type = "github"
    repo = var.github_repo
  }
  root_directory   = "dorafi/admin"
  build_command    = "npm run build"
  output_directory = "dist"
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
# dorafi-widget — the embeddable widget (dorafi/widget)
# A static asset bundle with no server-side secrets: nothing to set here
# beyond the project itself.
# ---------------------------------------------------------------------------
resource "vercel_project" "widget" {
  name      = "${var.project_prefix}-widget"
  framework = "vite"
  git_repository = {
    type = "github"
    repo = var.github_repo
  }
  root_directory   = "dorafi/widget"
  build_command    = "npm run build"
  output_directory = "dist"
}

# ---------------------------------------------------------------------------
# dorafi-staff — the internal cross-tenant console (dorafi/staff)
# Deliberately never linked from the public product. Its own URL, own env.
# ---------------------------------------------------------------------------
resource "vercel_project" "staff" {
  name      = "${var.project_prefix}-staff"
  framework = "vite"
  git_repository = {
    type = "github"
    repo = var.github_repo
  }
  root_directory   = "dorafi/staff"
  build_command    = "npm run build"
  output_directory = "dist"
}

resource "vercel_project_environment_variables" "staff" {
  project_id = vercel_project.staff.id
  variables = [
    for key, value in var.staff_env : {
      key       = key
      value     = value
      target    = ["production", "preview"]
      sensitive = true
    }
  ]
}

# ---------------------------------------------------------------------------
# logafi — the parent company's site (logafi/)
#
# No framework, no build command, no environment: the directory is the site,
# served exactly as committed. `null` on both fields is how Vercel is told
# "there is nothing to build here" — it must match logafi/vercel.json.
# ---------------------------------------------------------------------------
resource "vercel_project" "logafi" {
  name      = var.logafi_project_name
  framework = null
  git_repository = {
    type = "github"
    repo = var.github_repo
  }
  root_directory   = "logafi"
  build_command    = null
  output_directory = "."
}
