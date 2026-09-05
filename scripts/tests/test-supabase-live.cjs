const WebSocket = require('ws');
globalThis.WebSocket = WebSocket;
const { createClient } = require('@supabase/supabase-js');

// Read from env rather than hardcoding — even though the publishable key is
// meant to be public, hardcoding *any* credential (even a benign one) in a
// script makes it indistinguishable from a real leak at a glance, and trips
// the repo's committed-secrets scanner (scripts/ops/check-no-secrets.cjs) on
// every run. Set VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (same
// values apps/admin uses) before running this.
const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!VITE_SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required');
}

const supabase = createClient(VITE_SUPABASE_URL, SUPABASE_ANON_KEY);

async function testLiveSupabase() {
  console.log('--- 1. Testing Connection to Supabase ---');
  console.log('URL:', VITE_SUPABASE_URL);

  console.log('\n--- 2. Testing Anonymous Sign-In ---');
  const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
  if (authError) {
    console.error('❌ Anonymous Sign-in Failed:', authError.message);
    return;
  }
  console.log('✅ Anonymous Sign-in Succeeded! User ID:', authData.user.id);
  const userId = authData.user.id;

  console.log('\n--- 3. Testing Tenant Insertion with owner_user_id ---');
  const tenantName = `Test_Guest_${Date.now()}`;
  const { data: tenantData, error: tenantError } = await supabase
    .from('tenants')
    .insert({ name: tenantName, owner_user_id: userId })
    .select()
    .single();

  if (tenantError) {
    console.error('❌ Tenant Insertion Failed:', tenantError.message);
    return;
  }
  console.log('✅ Tenant Insert Succeeded! Tenant ID:', tenantData.id);

  console.log('\n--- 4. Testing Site Insertion for this Tenant ---');
  const domain = `test-site-${Date.now()}.com`;
  const { data: siteData, error: siteError } = await supabase
    .from('sites')
    .insert({
      tenant_id: tenantData.id,
      domain: domain,
      theme_primary_color: '#6366f1',
      enable_lead_capture: false
    })
    .select()
    .single();

  if (siteError) {
    console.error('❌ Site Insertion Failed:', siteError.message);
    return;
  }
  console.log('✅ Site Insert Succeeded! Site ID:', siteData.id, 'Domain:', siteData.domain);

  console.log('\n--- 5. Testing Sites Query with RLS ---');
  const { data: querySites, error: queryError } = await supabase
    .from('sites')
    .select('*')
    .eq('tenant_id', tenantData.id);

  if (queryError) {
    console.error('❌ Query Sites Failed:', queryError.message);
    return;
  }
  console.log('✅ Query Sites Succeeded! Found', querySites.length, 'sites.');

  // Cleanup test site and tenant
  await supabase.from('sites').delete().eq('id', siteData.id);
  await supabase.from('tenants').delete().eq('id', tenantData.id);
  console.log('✅ Cleaned up temporary test records.');

  console.log('\n🎉 ALL LIVE SUPABASE AUTH & RLS TESTS PASSED 100%!');
}

testLiveSupabase();
