output "vercel_project_ids" {
  description = "Project id per deployable. Also written to GitHub Actions variables, which is how the pipeline finds them."
  value       = { for key, project in vercel_project.this : key => project.id }
}

output "supabase_project_refs" {
  description = "Database ref per environment. The URL is https://<ref>.supabase.co."
  value       = { for key, project in supabase_project.this : key => project.id }
}

output "environment_urls" {
  description = "Where each environment is served, once DNS points at Vercel."
  value = {
    for key, env in local.environments : key => {
      app  = env.app_url
      site = "https://${env.domains.site[0]}"
    }
  }
}

output "domain_verification" {
  description = "DNS challenges Vercel wants for any domain it does not yet consider verified. Empty once DNS is in place."
  value = {
    for key, domain in vercel_project_domain.this : key => domain.verification
    if !domain.verified
  }
}
