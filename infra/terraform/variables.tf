# ---------------------------------------------------------------------------
# Credentials. Set these in terraform.tfvars (git-ignored) or as TF_VAR_*.
# ---------------------------------------------------------------------------

variable "vercel_api_token" {
  description = "Vercel API token (Account Settings → Tokens)."
  type        = string
  sensitive   = true
}

variable "vercel_team_id" {
  description = "Vercel team ID or slug, if these projects belong to a team. null for a personal account."
  type        = string
  default     = null
}

variable "vercel_user_id" {
  description = <<-EOT
    Vercel account ID, used as VERCEL_ORG_ID for the CLI when there is no team.
    Find it under Account Settings → General, or in .vercel/project.json after
    `vercel link`. Ignored when vercel_team_id is set.
  EOT
  type        = string
  default     = null
}

variable "supabase_access_token" {
  description = "Supabase personal access token (https://supabase.com/dashboard/account/tokens)."
  type        = string
  sensitive   = true
}

variable "supabase_organization_id" {
  description = "Supabase organization slug (dashboard URL, or Organization → Settings)."
  type        = string
}

variable "github_token" {
  description = "GitHub PAT with `repo` scope, to manage this repository's Actions environments, secrets and variables."
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "The repository Vercel tracks and whose Actions this configures, as \"owner/name\"."
  type        = string
}

# ---------------------------------------------------------------------------
# Naming and topology.
# ---------------------------------------------------------------------------

variable "project_prefix" {
  description = "Prefix for the three Dorafi Vercel projects (admin/staff/widget). logafi is named separately — it is a different company, not a Dorafi surface."
  type        = string
  default     = "dorafi"
}

variable "logafi_project_name" {
  description = "Name of the parent company's Vercel project."
  type        = string
  default     = "logafi"
}

variable "production_branch" {
  description = "The branch deployments are made from. Also the branch the preview domains are bound to, since the pipeline deploys both environments from the same commit."
  type        = string
  default     = "main"
}

variable "node_version" {
  description = "Node version Vercel builds and runs functions with. Keep this equal to the version in .github/workflows/verify.yml, or CI builds on one runtime and production runs another."
  type        = string
  default     = "24.x"
}

variable "production_app_domain" {
  description = "Where the product is served in production."
  type        = string
  default     = "dorafi.logafi.com"
}

variable "production_site_domains" {
  description = "The parent company's domains, in production. The first is treated as canonical."
  type        = list(string)
  default     = ["logafi.com", "www.logafi.com"]
}

variable "preview_app_domain" {
  description = "Where the product is served in preview. Needs a DNS record pointing at Vercel before it resolves."
  type        = string
  default     = "preview.dorafi.logafi.com"
}

variable "preview_site_domain" {
  description = "The parent company's site, in preview."
  type        = string
  default     = "preview.logafi.com"
}

# ---------------------------------------------------------------------------
# Databases.
# ---------------------------------------------------------------------------

variable "supabase_region" {
  description = "Region for both Supabase projects."
  type        = string
  default     = "us-east-1"
}

variable "supabase_db_passwords" {
  description = <<-EOT
    Postgres password per environment, keyed by environment name
    ("production", "preview"). The production entry must be the password the
    existing project already has — this is the one value Terraform cannot read
    back, and an import does not discover it.
  EOT
  type        = map(string)
  sensitive   = true
}

variable "auth_rate_limit_email_sent" {
  description = "Supabase Auth's own hourly email cap. Its default of 2 is far too low to sign in with, whatever SMTP provider is configured."
  type        = number
  default     = 100
}

variable "smtp" {
  description = <<-EOT
    Custom SMTP for auth emails. Supabase's built-in sender allows a handful an
    hour. Reuse the Resend account this product already has: host
    smtp.resend.com, port 465, user "resend", password a Resend API key.
    Set to null to leave SMTP unconfigured.
  EOT
  type = object({
    host         = string
    port         = number
    user         = string
    password     = string
    sender_name  = string
    sender_email = string
  })
  sensitive = true
  default   = null
}

# ---------------------------------------------------------------------------
# Application secrets, shared across environments.
# ---------------------------------------------------------------------------

variable "openrouter_api_key" {
  type      = string
  sensitive = true
}

variable "jina_api_key" {
  type      = string
  sensitive = true
}

variable "resend_api_key" {
  type      = string
  sensitive = true
}

variable "admin_email" {
  description = "Where platform alerts are sent."
  type        = string
}

variable "default_model" {
  type    = string
  default = "openai/gpt-5.6-luna"
}

variable "premium_model" {
  type    = string
  default = "anthropic/claude-sonnet-5"
}

# ---------------------------------------------------------------------------
# Per-environment third-party credentials.
# ---------------------------------------------------------------------------

variable "stripe_production" {
  description = <<-EOT
    Live-mode Stripe. The price IDs come from `npm run setup:stripe` run against
    the live key; webhook_secret belongs to the endpoint registered at
    https://<production app domain>/api/billing/webhook.
  EOT
  type = object({
    secret_key       = string
    webhook_secret   = string
    price_id_basic   = string
    price_id_pro     = string
    price_id_premium = string
  })
  sensitive = true
}

variable "stripe_preview" {
  description = <<-EOT
    Test-mode Stripe. Not the same values with a different prefix: test-mode
    prices are different objects and need their own `npm run setup:stripe` run,
    and preview needs its own webhook endpoint (on the preview domain) with its
    own signing secret.
  EOT
  type = object({
    secret_key       = string
    webhook_secret   = string
    price_id_basic   = string
    price_id_pro     = string
    price_id_premium = string
  })
  sensitive = true
}

variable "turnstile_production" {
  description = "Cloudflare Turnstile keys for the production domains. A site key is scoped to its hostnames, so production's pair does not validate on preview."
  type = object({
    site_key   = string
    secret_key = string
  })
  sensitive = true
}

# ---------------------------------------------------------------------------
# Rollout switches. See infra/terraform/README.md — the order matters.
# ---------------------------------------------------------------------------

variable "vercel_git_auto_deploy" {
  description = <<-EOT
    Whether Vercel deploys on push to the connected repository. Start true (the
    behaviour that exists today) and set it to false only once a GitHub Actions
    deploy has succeeded end to end — otherwise there is briefly no way to ship
    at all. Leaving it true means two deploy paths race, and the Vercel one does
    not wait for CI.
  EOT
  type        = bool
  default     = true
}

variable "deploy_pipeline_enabled" {
  description = "Sets the DEPLOY_PIPELINE_ENABLED repository variable. deploy.yml does nothing while this is false, so the workflows can land before the infrastructure exists."
  type        = bool
  default     = false
}

variable "production_reviewers" {
  description = <<-EOT
    Numeric GitHub user IDs that may approve a production deployment. The run
    stops and waits for one of them. An empty list removes the gate and makes
    production deploy automatically.
    Find an ID with: https://api.github.com/users/<login>
  EOT
  type        = list(number)
  default     = []
}
