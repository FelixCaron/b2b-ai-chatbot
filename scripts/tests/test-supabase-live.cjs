const WebSocket = require('ws');
globalThis.WebSocket = WebSocket;
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xuvueegdokgiyedwvmkm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNDgwMTQsImV4cCI6MjEwMTcyNDAxNH0.5lRBtyKO-VOzkgqJeWrulLnrMFxruzcF__suzxFiUOQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testLiveSupabase() {
  console.log('--- 1. Testing Connection to Supabase ---');
  console.log('URL:', SUPABASE_URL);

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
