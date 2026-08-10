const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://xuvueegdokgiyedwvmkm.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnVlZWdkb2tnaXllZHd2bWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE0ODAxNCwiZXhwIjoyMTAxNzI0MDE0fQ.Z9CsCniLkOuPJZajLzUMfN2FUTbZsvwZC8KD5CXh-7E";

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
