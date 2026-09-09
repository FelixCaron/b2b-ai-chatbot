// GET /api/chat/init?tenant_public_key=... — the widget calls this once
// on load, before the visitor has said anything, to render its opening state
// (greeting bubble, header title, status line, input placeholder) in the
// site's own language instead of a hardcoded English default. Read-only,
// no LLM call here — that already happened once at scan time (see
// api/lib/llm.js's generateWelcomeExperience, called from
// api/crawler/scan.js and summarize.js) and is just served back from
// site_summaries. Public/unauthenticated like api/chat/index.js — anonymous
// site visitors are exactly who calls this — but scoped to the one site a
// public_key identifies, same as the chat endpoint itself.
import { contracts, resolveTenantPlan } from '@b2b-ai-chatbot/contracts';
import { createClient } from '@supabase/supabase-js';
import { edgeRoute } from '../lib/http.js';
import { isOwnDomainOrigin, requestOrigin } from '../lib/site-origin.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const supabase = (SUPABASE_URL && SECRET_KEY) ? createClient(SUPABASE_URL, SECRET_KEY) : null;

const FALLBACK = {
  welcome_message: 'Hello! How can I help you today?',
  ui_status_title: 'Virtual Assistant',
  ui_status_online: 'Online',
  ui_input_placeholder: 'Ask a question...',
  language: 'en',
  // Safe default: show the badge. Only a confirmed pro/premium plan (below)
  // ever turns this true, so an unknown site/key never accidentally hides it
  // for a tenant who should still be showing it.
  hide_branding: false,
};

export const config = {
  runtime: 'edge',
};

// `validate: false` on purpose: the contract requires a tenant_public_key, but
// this route must never answer a widget with a 400. A missing or malformed key
// is just "show the English defaults", so the query payload arrives unvalidated
// and every failure below lands on the same 200 + FALLBACK.
export default edgeRoute(contracts.chat.init, async (req, { data, json }) => {
  const tenantPublicKey = data.tenant_public_key;

  if (!tenantPublicKey || !supabase) {
    // Never a hard error for the widget over this — a missing key or unset
    // server config just means "show the English defaults", the same
    // experience every tenant had before this feature existed.
    return json(FALLBACK);
  }

  try {
    let { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, tenant_id, domain, is_active, theme_primary_color, widget_last_seen_at, tenants(plan, plan_status, trial_ends_at, stripe_subscription_id)')
      .eq('public_key', tenantPublicKey)
      .maybeSingle();

    // A database that predates the site-limit migration has no is_active
    // column (42703); there is no parked state there, so re-read the core
    // columns and treat the site as active — same shape as the fallback in
    // api/chat/index.js.
    if (siteError?.code === '42703') {
      const { data: coreSite } = await supabase
        .from('sites')
        .select('id, tenant_id')
        .eq('public_key', tenantPublicKey)
        .maybeSingle();
      site = coreSite ? { ...coreSite, is_active: true, tenants: null } : null;
    }

    if (!site) {
      return json(FALLBACK);
    }

    // Install detection: a widget init call whose Origin is the site's own
    // domain is live proof the embed snippet is actually on the site — the
    // one honest signal the "Install" modal can check instead of asking the
    // tenant to just confirm they pasted it. The admin's own preview runs on
    // our origin, not the tenant's, so it never falsely marks a site
    // installed. Throttled to once per 5 minutes so a busy site doesn't turn
    // every page load into a write, and awaited (not fire-and-forget) since
    // an Edge function can be torn down right after its response is sent.
    const originHeader = requestOrigin(req);
    if (isOwnDomainOrigin(originHeader, site.domain)) {
      const lastSeenMs = site.widget_last_seen_at ? new Date(site.widget_last_seen_at).getTime() : 0;
      if (Date.now() - lastSeenMs > 5 * 60 * 1000) {
        try {
          await supabase.from('sites').update({ widget_last_seen_at: new Date().toISOString() }).eq('id', site.id);
        } catch (e) {
          console.warn('[chat/init] widget_last_seen_at update warning:', e.message);
        }
      }
    }

    // "Powered by" badge is a growth lever: shown on Basic (default), hidden
    // on Pro/Premium — driven by the tenant's live plan, not the embed
    // snippet, so a plan change takes effect without re-pasting anything.
    const tenantRow = Array.isArray(site.tenants) ? site.tenants[0] : site.tenants;
    const { effectivePlan, trialExpiredUnpaid } = resolveTenantPlan(tenantRow);
    const hideBranding = effectivePlan === 'pro' || effectivePlan === 'premium';

    // Parked by a plan downgrade: the widget must not open as if it were ready
    // to answer, and the reason has to be legible to the tenant looking at
    // their own site. Still a 200 with the full label shape — the widget reads
    // these keys unconditionally — but flagged, and the chat endpoint refuses
    // the conversation itself (api/chat/index.js).
    if (site.is_active === false) {
      const message = 'This assistant is paused because the workspace plan no longer covers this website.';
      return json({
        ...FALLBACK,
        site_inactive: true,
        code: 'site_inactive',
        welcome_message: message,
        ui_status_online: 'Paused',
        theme_primary_color: site.theme_primary_color || null,
        hide_branding: hideBranding,
      });
    }

    // A self-serve Business trial that lapsed without converting: the widget
    // must not open as if ready to answer (api/chat/index.js refuses the
    // conversation with the same code). Same paused shape as a parked site,
    // with its own code so the message can be about subscribing rather than
    // about a plan downgrade.
    if (trialExpiredUnpaid) {
      const message = 'This assistant\'s free trial has ended. It will be back once a plan is chosen.';
      return json({
        ...FALLBACK,
        trial_ended: true,
        code: 'trial_ended',
        welcome_message: message,
        ui_status_online: 'Unavailable',
        theme_primary_color: site.theme_primary_color || null,
        hide_branding: hideBranding,
      });
    }

    // Conversation quota: read-only, side-effect-free check (never registers
    // a slot — only api/chat/index.js's register_conversation() does that,
    // when a message is actually sent). A session_id that already has a slot
    // this month always comes back FALSE, so a returning visitor mid-
    // conversation never gets hidden here, only a new visitor the plan has
    // no room left to answer. No session_id (older cached embed) skips this
    // check entirely rather than guessing.
    if (data.session_id) {
      try {
        const { data: quotaReached, error: quotaError } = await supabase.rpc('conversation_quota_reached', {
          p_tenant_id: site.tenant_id,
          p_session_id: data.session_id
        });
        if (quotaError) {
          console.warn('[chat/init] conversation_quota_reached warning:', quotaError.message);
        } else if (quotaReached === true) {
          const message = "This assistant has reached its plan's monthly conversation limit. It will be back once the plan renews or is upgraded.";
          return json({
            ...FALLBACK,
            conversation_limit_reached: true,
            code: 'conversation_limit_reached',
            welcome_message: message,
            ui_status_online: 'Unavailable',
            theme_primary_color: site.theme_primary_color || null,
            hide_branding: hideBranding,
          });
        }
      } catch (e) {
        console.warn('[chat/init] conversation_quota_reached warning:', e.message);
      }
    }

    const { data: summary } = await supabase
      .from('site_summaries')
      .select('language, welcome_message, ui_status_title, ui_status_online, ui_input_placeholder')
      .eq('tenant_id', site.tenant_id)
      .eq('site_id', site.id)
      .maybeSingle();

    return json({
      welcome_message: summary?.welcome_message || FALLBACK.welcome_message,
      ui_status_title: summary?.ui_status_title || FALLBACK.ui_status_title,
      ui_status_online: summary?.ui_status_online || FALLBACK.ui_status_online,
      ui_input_placeholder: summary?.ui_input_placeholder || FALLBACK.ui_input_placeholder,
      language: summary?.language || FALLBACK.language,
      // Read live on every widget load so a color change in the dashboard
      // takes effect immediately — not baked into the embed snippet's
      // static data-theme-color attribute, which only reflects whatever
      // the color was at copy-paste time.
      theme_primary_color: site.theme_primary_color || null,
      hide_branding: hideBranding,
    });
  } catch (err) {
    console.error('[chat/init] Error:', err);
    return json(FALLBACK);
  }
}, { validate: false });
