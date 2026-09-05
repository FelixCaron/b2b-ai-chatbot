const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function test() {
  const { data: docs, error } = await supabase.from('documents').select('id, site_id, tenant_id, url, content').limit(10);
  console.log("Documents error:", error);
  console.log("Documents count:", docs?.length);
  if (docs && docs.length > 0) {
    console.log("Sample doc content:", docs[0].content.substring(0, 200));
  }

  const { data: sites } = await supabase.from('sites').select('*');
  console.log("Sites:", sites);
}

test();
