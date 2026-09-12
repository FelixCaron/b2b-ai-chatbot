# ---------------------------------------------------------------------------
# One Postgres per environment.
#
# This is the point of the whole exercise: production and preview must not
# share a database, or "preview" is just production with a different hostname.
#
# Note for the free plan: two active projects per organisation, which is exactly
# what this creates — a third environment needs a paid plan. Free projects also
# pause after a week with no traffic, so a preview database that only sees merge
# days will need waking; the first deploy after a pause is slow rather than
# broken.
# ---------------------------------------------------------------------------

resource "supabase_project" "this" {
  for_each = local.environments

  organization_id   = var.supabase_organization_id
  name              = each.value.supabase_project_name
  region            = var.supabase_region
  database_password = var.supabase_db_passwords[each.key]

  lifecycle {
    # A `terraform destroy`, or a rename that forces replacement, would take the
    # database with it. Nothing in this repository is worth that.
    prevent_destroy = true

    ignore_changes = [database_password]
  }
}

# The keys each project's apps need, read back rather than copied by hand from
# a dashboard into a variable file. This is what makes standing up a new
# environment reproducible instead of a checklist.
data "supabase_apikeys" "this" {
  for_each = supabase_project.this

  project_ref = each.value.id
}

# ---------------------------------------------------------------------------
# Auth configuration, as code.
#
# Everything below used to be "what you still have to do manually" in
# docs/setup/supabase.md — and all four items bit real sign-ins on 2026-09-05,
# because a new project's defaults are wrong for this product in four separate
# ways. They are declarative now.
#
# Two API quirks, both confirmed the hard way, encoded here so they are not
# rediscovered:
#   - the SMTP fields do not merge. Sending smtp_pass alone silently nulls
#     smtp_host/port/user. All six go together or none do.
#   - smtp_port must be a string. A number is rejected with a 400.
# ---------------------------------------------------------------------------

resource "supabase_settings" "this" {
  for_each = local.environments

  project_ref = supabase_project.this[each.key].id

  auth = jsonencode(merge(
    {
      # Where magic links land when the request's own redirect isn't in the
      # allow list below. Left at its default (http://localhost:3000), every
      # link emailed from a deployed app silently goes to localhost.
      site_url = each.value.app_url

      # Every origin allowed to be redirected back to. Deployed domains plus
      # the two local dev ports, plus Vercel's generated preview URLs so a
      # per-branch deployment can be signed into.
      uri_allow_list = join(",", concat(
        [for d in each.value.domains.admin : "https://${d}/**"],
        [for d in each.value.domains.staff : "https://${d}/**"],
        [
          "https://*.vercel.app/**",
          "http://localhost:3000/**",
          "http://localhost:3100/**",
          "http://127.0.0.1:5173/**",
        ],
      ))

      # The product signs visitors in anonymously before onboarding, and
      # converts that account to a real one on first save.
      external_anonymous_users_enabled = true

      # Supabase's own throttle, separate from whichever SMTP provider is
      # configured. Its default of 2/hour caps every project regardless.
      rate_limit_email_sent = var.auth_rate_limit_email_sent

      # Default true, which demands confirmation from BOTH the old and new
      # address on any change. A guest converting to a registered account has
      # no old address at all, so that conversion — the "Save My Assistant"
      # flow every guest goes through — fails outright with a generic
      # "Error sending email change email".
      mailer_secure_email_change_enabled = false

      # The three branded templates. They are declared in supabase/config.toml
      # as well, but `supabase db push` never applies auth configuration, so
      # until now they only existed locally and deployed environments sent
      # Supabase's stock emails. Read from the same files, so there is one copy.
      mailer_subjects_invite                = "You've been invited to the Dorafi staff console"
      mailer_templates_invite_content       = file("${path.module}/../../supabase/templates/invite.html")
      mailer_subjects_magic_link            = "Your Dorafi sign-in link"
      mailer_templates_magic_link_content   = file("${path.module}/../../supabase/templates/magic_link.html")
      mailer_subjects_email_change          = "Confirm your email to secure your Dorafi workspace"
      mailer_templates_email_change_content = file("${path.module}/../../supabase/templates/email_change.html")
    },
    # All six SMTP fields, or none. Supabase's built-in sender is rate-limited
    # to a handful of mails an hour — enough for the first test sign-ins, not
    # for use.
    var.smtp == null ? {} : {
      smtp_host        = var.smtp.host
      smtp_port        = tostring(var.smtp.port)
      smtp_user        = var.smtp.user
      smtp_pass        = var.smtp.password
      smtp_sender_name = var.smtp.sender_name
      smtp_admin_email = var.smtp.sender_email
    },
  ))

  api = jsonencode({
    # `internal` is deliberately absent: the staff tables live there precisely
    # so PostgREST has no route to them at all, whatever the grants say.
    db_schema            = "public,graphql_public"
    db_extra_search_path = "public,extensions"
    max_rows             = 1000
  })
}
