# ---------------------------------------------------------------------------
# The pipeline's half of the contract.
#
# Terraform creates the infrastructure, so Terraform is also what tells the
# pipeline how to reach it. Nothing here is copied by hand into the GitHub UI:
# the project IDs come from the resources created in vercel.tf, the Supabase
# refs from supabase.tf.
#
# Note that the Actions workflows need very few secrets, because `vercel pull`
# fetches the application's own environment variables from Vercel at build
# time. What is here is the minimum needed to authenticate as the deployer.
# ---------------------------------------------------------------------------

resource "github_repository_environment" "this" {
  for_each = local.environments

  repository  = split("/", var.github_repo)[1]
  environment = each.key

  # Production waits for a human. This is the gate: the run reaches
  # "migrate-production" and stops there until someone approves it in the
  # Actions UI, with the preview deployment already live to look at.
  #
  # Set production_reviewers = [] to make production deploy automatically.
  dynamic "reviewers" {
    for_each = each.key == "production" && length(var.production_reviewers) > 0 ? [1] : []
    content {
      users = var.production_reviewers
    }
  }

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

# Only the production branch may deploy to either environment. A branch cannot
# reach the production database by being pushed.
resource "github_repository_environment_deployment_policy" "this" {
  for_each = local.environments

  repository     = split("/", var.github_repo)[1]
  environment    = github_repository_environment.this[each.key].environment
  branch_pattern = var.production_branch
}

# --- Secrets ---------------------------------------------------------------

resource "github_actions_secret" "vercel_token" {
  repository      = split("/", var.github_repo)[1]
  secret_name     = "VERCEL_TOKEN"
  plaintext_value = var.vercel_api_token
}

resource "github_actions_secret" "supabase_access_token" {
  repository      = split("/", var.github_repo)[1]
  secret_name     = "SUPABASE_ACCESS_TOKEN"
  plaintext_value = var.supabase_access_token
}

# `supabase db push` connects to Postgres directly, so the access token alone
# is not enough — it needs the database password too, and a different one per
# environment. Scoped to the environment so a preview run cannot reach the
# production database even by accident.
resource "github_actions_environment_secret" "supabase_db_password" {
  for_each = local.environments

  repository      = split("/", var.github_repo)[1]
  environment     = github_repository_environment.this[each.key].environment
  secret_name     = "SUPABASE_DB_PASSWORD"
  plaintext_value = var.supabase_db_passwords[each.key]
}

# --- Variables (not secret; visible in the Actions UI, which is the point) ---

resource "github_actions_variable" "vercel_org_id" {
  repository    = split("/", var.github_repo)[1]
  variable_name = "VERCEL_ORG_ID"
  value         = var.vercel_team_id == null ? var.vercel_user_id : var.vercel_team_id
}

resource "github_actions_variable" "vercel_project_ids" {
  for_each = local.vercel_projects

  repository    = split("/", var.github_repo)[1]
  variable_name = "VERCEL_PROJECT_ID_${upper(each.key)}"
  value         = vercel_project.this[each.key].id
}

resource "github_actions_environment_variable" "supabase_project_ref" {
  for_each = local.environments

  repository    = split("/", var.github_repo)[1]
  environment   = github_repository_environment.this[each.key].environment
  variable_name = "SUPABASE_PROJECT_REF"
  value         = supabase_project.this[each.key].id
}

# The URLs the pipeline aliases a preview deployment onto and then smoke-tests.
resource "github_actions_environment_variable" "app_url" {
  for_each = local.environments

  repository    = split("/", var.github_repo)[1]
  environment   = github_repository_environment.this[each.key].environment
  variable_name = "APP_URL"
  value         = each.value.app_url
}

resource "github_actions_environment_variable" "site_url" {
  for_each = local.environments

  repository    = split("/", var.github_repo)[1]
  environment   = github_repository_environment.this[each.key].environment
  variable_name = "SITE_URL"
  value         = "https://${each.value.domains.site[0]}"
}

# The master switch. deploy.yml checks this and does nothing when it is not
# "true", so the workflows can be merged and reviewed before any of the
# infrastructure below them exists — a push does not then fail for want of a
# Vercel token. Terraform sets it to true, which is the moment the pipeline
# becomes real.
resource "github_actions_variable" "deploy_pipeline_enabled" {
  repository    = split("/", var.github_repo)[1]
  variable_name = "DEPLOY_PIPELINE_ENABLED"
  value         = var.deploy_pipeline_enabled ? "true" : "false"
}
