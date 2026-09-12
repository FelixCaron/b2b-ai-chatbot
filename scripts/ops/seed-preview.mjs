#!/usr/bin/env node
/**
 * Give the preview database the one row that makes the preview environment
 * demonstrable rather than merely deployed.
 *
 * A database built from supabase/migrations/ is empty of tenants. The admin app
 * embeds its own widget (dorafi/admin/index.html) with a fixed tenant key, and
 * the chat API refuses any request whose Origin doesn't match the site's
 * registered domain (api/lib/site-origin.js) — so on a fresh database that
 * widget has no site to answer for, /chat/init falls back to English defaults
 * and /chat 404s. The flagship visible feature is dead by construction.
 *
 * This inserts a tenant and a site for that key, registered to the preview
 * domain. It does NOT try to make preview a copy of production: there are no
 * documents, so the assistant has nothing to retrieve and will say so. Preview
 * proves deployability and wiring. Behaviour is the mocked E2E suite's job.
 *
 * Idempotent: safe to run on every deploy, which is how the pipeline runs it.
 *
 * Deliberately refuses to touch production — it takes the project ref as an
 * argument and checks it is not the production one it was told about.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/ops/seed-preview.mjs <project-ref> <domain>
 */

const [, , projectRef, siteDomain] = process.argv;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRODUCTION_REF = process.env.PRODUCTION_SUPABASE_REF || '';

// The key dorafi/admin/index.html embeds. Not a secret: it is a public key,
// visible in the page source of every deployment.
const TENANT_PUBLIC_KEY = '75b897f8-9559-462a-955e-6e193acf51bb';

if (!projectRef || !siteDomain) {
  console.error('Usage: seed-preview.mjs <supabase-project-ref> <site-domain>');
  process.exit(1);
}
if (!ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is not set.');
  process.exit(1);
}
if (PRODUCTION_REF && projectRef === PRODUCTION_REF) {
  console.error(`Refusing to seed ${projectRef}: that is the production database.`);
  process.exit(1);
}

const SQL = `
-- Idempotent by construction: the tenant is keyed by name, the site by its
-- public key, and both upsert.
do $$
declare
  v_tenant_id uuid;
begin
  select id into v_tenant_id from public.tenants where name = 'Preview workspace';

  if v_tenant_id is null then
    insert into public.tenants (name, plan, plan_status)
    values ('Preview workspace', 'pro', 'active')
    returning id into v_tenant_id;
  end if;

  insert into public.sites (tenant_id, domain, public_key, is_active)
  values (v_tenant_id, '${siteDomain}', '${TENANT_PUBLIC_KEY}'::uuid, true)
  on conflict (public_key) do update
    set tenant_id = excluded.tenant_id,
        domain    = excluded.domain,
        is_active = true;
end $$;
`;

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: SQL }),
});

if (!res.ok) {
  console.error(`Seed failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}

console.log(`Seeded ${projectRef}: site ${siteDomain} for tenant key ${TENANT_PUBLIC_KEY}.`);
