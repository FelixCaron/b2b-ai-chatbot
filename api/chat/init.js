// GET/POST /api/chat/init?tenant_public_key=... — the widget calls this once
// on load, before the visitor has said anything, to render its opening state
// (greeting bubble, header title, status line, input placeholder) in the
// site's own language instead of a hardcoded English default. Read-only,
// no LLM call here — that already happened once at scan time (see
// api/lib/llm.js's generateWelcomeExperience, called from
// api/crawler/scan.js and summarize.js) and is just served back from
// site_summaries. Public/unauthenticated like api/chat/index.js — anonymous
// site visitors are exactly who calls this — but scoped to the one site a
// public_key identifies, same as the chat endpoint itself.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const supabase = (SUPABASE_URL && SECRET_KEY) ? createClient(SUPABASE_URL, SECRET_KEY) : null;

const FALLBACK = {
  welcome_message: 'Hello! How can I help you today?',
  ui_status_title: 'Virtual Assistant',
  ui_status_online: 'Online',
  ui_input_placeholder: 'Ask a question...',
  language: 'en',
};

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      }
    });
  }

  const url = new URL(req.url);
  let tenantPublicKey = url.searchParams.get('tenant_public_key');
  if (!tenantPublicKey && req.method === 'POST') {
    try {
      const body = await req.json();
      tenantPublicKey = body?.tenant_public_key;
    } catch { /* no body sent, fall through to the missing-key response below */ }
  }

  if (!tenantPublicKey || !supabase) {
    // Never a hard error for the widget over this — a missing key or unset
    // server config just means "show the English defaults", the same
    // experience every tenant had before this feature existed.
    return new Response(JSON.stringify(FALLBACK), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const { data: site } = await supabase
      .from('sites')
      .select('id, tenant_id')
      .eq('public_key', tenantPublicKey)
      .maybeSingle();

    if (!site) {
      return new Response(JSON.stringify(FALLBACK), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const { data: summary } = await supabase
      .from('site_summaries')
      .select('language, welcome_message, ui_status_title, ui_status_online, ui_input_placeholder')
      .eq('tenant_id', site.tenant_id)
      .eq('site_id', site.id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        welcome_message: summary?.welcome_message || FALLBACK.welcome_message,
        ui_status_title: summary?.ui_status_title || FALLBACK.ui_status_title,
        ui_status_online: summary?.ui_status_online || FALLBACK.ui_status_online,
        ui_input_placeholder: summary?.ui_input_placeholder || FALLBACK.ui_input_placeholder,
        language: summary?.language || FALLBACK.language,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (err) {
    console.error('[chat/init] Error:', err);
    return new Response(JSON.stringify(FALLBACK), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
