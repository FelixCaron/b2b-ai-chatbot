variable "vercel_api_token" {
  description = "Vercel API token (Account Settings -> Tokens). Sensitive — set via terraform.tfvars (git-ignored) or TF_VAR_vercel_api_token."
  type        = string
  sensitive   = true
}

variable "vercel_team_id" {
  description = "Vercel team ID/slug, if these projects belong to a team rather than a personal account. Leave null for a personal account."
  type        = string
  default     = null
}

variable "github_repo" {
  description = "GitHub repo Vercel should track, as \"owner/name\" (e.g. \"FelixCaron/b2b-ai-chatbot\")."
  type        = string
}

variable "project_prefix" {
  description = "Prefix for the three Vercel project names, so this can be re-applied for a staging/prod pair without name collisions."
  type        = string
  default     = "repondo"
}

variable "admin_env" {
  description = <<-EOT
    Server + client env vars for the admin/root-API project. Matches .env.example
    at the repo root. Keep values out of version control — populate via
    terraform.tfvars (git-ignored) or TF_VAR_admin_env.
  EOT
  type        = map(string)
  sensitive   = true
  default     = {}
}

variable "internal_admin_env" {
  description = <<-EOT
    Env vars for the internal staff-admin project — same Supabase project as
    admin_env (VITE_SUPABASE_URL / SUPABASE_SECRET_KEY / VITE_SUPABASE_PUBLISHABLE_KEY),
    no Stripe/OpenRouter/Resend keys needed here since this app only ever reads
    tenant metadata, never calls those integrations.
  EOT
  type        = map(string)
  sensitive   = true
  default     = {}
}
