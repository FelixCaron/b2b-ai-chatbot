# Resend setup

Resend sends the two transactional emails this product generates: new-lead notifications
to a tenant, and internal bug-alert emails (`api/lib/email.js`).

## Manual (no scriptable resource creation needed beyond DNS, which is inherently manual)

1. Create an account at https://resend.com.
2. **Verify a sending domain** (Domains → Add Domain → add the DKIM/SPF/DMARC DNS records
   it gives you at your DNS provider). Skippable only for early testing using Resend's
   shared `onboarding@resend.dev` sender, which is rate-limited and not meant for
   production — verify your own domain before real customers rely on lead-notification
   emails arriving.
3. Dashboard → API Keys → Create API Key → copy it into `RESEND_API_KEY`.
4. Set `ADMIN_EMAIL` to the address that should receive internal bug-alert emails.

There's nothing else to provision beyond the key + domain verification, so no setup
script exists for this integration — domain verification specifically can't be scripted
since it depends on DNS propagation at a registrar this repo has no access to.
