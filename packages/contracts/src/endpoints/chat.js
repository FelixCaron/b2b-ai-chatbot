// The chat products: what a deployed widget talks to.
import { defineEndpoint, AUTH } from '../endpoint.js';
import { f, optional } from '../schema.js';

/** POST /api/chat — the agentic loop. Answers as an SSE stream. */
export const chatSend = defineEndpoint({
  name: 'chat.send',
  summary: 'Ask the tenant assistant a question; answers as a token stream (SSE).',
  method: 'POST',
  path: '/api/chat',
  auth: AUTH.PUBLIC,
  runtime: 'edge',
  streaming: true,
  request: {
    message: f.string({ min: 1, max: 4000 }),
    tenant_public_key: f.uuid(),
    session_id: f.string({ min: 1, max: 128 }),
    // Where the widget was loaded. Optional — older embeds don't send it, and
    // it is never trusted as given: api/chat/index.js keeps it only when its
    // hostname is the site's own, and strips query string and fragment first.
    page_url: optional(f.string({ max: 2048 }))
  },
  // Streamed, so there is no single JSON body to describe. The frames are:
  //   data: {"content":"…"}          incremental tokens
  //   data: {"tool_call":{…}}        a tool the client may act on
  //   data: [DONE]                   end of stream
  response: {},
  errors: {
    400: 'Fields required: message, tenant_public_key, session_id',
    403: 'The calling origin is not the site this key belongs to',
    404: 'Unknown tenant_public_key, or the site is parked',
    429: 'Rate limited (per-IP, per-isolate)'
  }
});

/** GET /api/chat/init — the widget's opening screen, in the site's language. */
export const chatInit = defineEndpoint({
  name: 'chat.init',
  summary: "Pregenerated greeting and UI labels for a site's widget. Never errors — falls back to English defaults.",
  method: 'GET',
  path: '/api/chat/init',
  auth: AUTH.PUBLIC,
  runtime: 'edge',
  request: {
    tenant_public_key: f.uuid(),
    // The widget's persisted session id (see ChatManager.getOrCreateSessionId
    // in apps/widget/src/chat.js). Optional — an older cached embed bundle
    // that predates this field simply never gets the conversation_limit_reached
    // check below; everything else in the response still works.
    session_id: optional(f.string({ min: 1, max: 128 }))
  },
  response: {
    welcome_message: f.string(),
    ui_status_title: f.string(),
    ui_status_online: f.string(),
    ui_input_placeholder: f.string(),
    language: f.string({ min: 2, max: 8 }),
    theme_primary_color: optional(f.hexColor()),
    // Whether the "Powered by Dorafi" badge should be hidden — driven by the
    // tenant's plan (see api/chat/init.js), never by the embed snippet.
    hide_branding: optional(f.boolean()),
    // TRUE when this session_id has no conversation slot yet and the plan's
    // monthly conversation quota is already spent — the widget hides itself
    // entirely rather than show a launcher that can't start a conversation
    // (apps/widget/src/main.js). A session already mid-conversation never
    // gets this — see conversation_quota_reached() in migration
    // 20260909010000.
    conversation_limit_reached: optional(f.boolean()),
    // TRUE when a self-serve Business trial has lapsed without converting to a
    // paid plan — the widget hides itself, same as a parked site, until the
    // owner subscribes (see api/chat/init.js and resolveTenantPlan in plans.js).
    trial_ended: optional(f.boolean())
  }
});

/** POST /api/chat/theme — brand extraction from a public website. */
export const chatTheme = defineEndpoint({
  name: 'chat.theme',
  summary: "Extract a site's brand colour, palette and organisation name from its HTML.",
  method: 'POST',
  path: '/api/chat/theme',
  auth: AUTH.PUBLIC,
  runtime: 'edge',
  request: {
    url: f.url(),
    // Invisible Turnstile token — this endpoint is reachable before signup.
    cf_turnstile_token: optional(f.string({ max: 4096 }))
  },
  response: {
    success: f.boolean(),
    url: f.url(),
    org_name: f.string(),
    primary_color: f.hexColor(),
    theme_mode: f.oneOf(['light', 'dark']),
    background_color: f.hexColor(),
    text_color: f.hexColor(),
    // The site's own declared favicon, read out of its HTML — null when the
    // page couldn't be fetched or declares none.
    favicon_url: optional(f.url())
  },
  errors: {
    400: 'Missing or unusable url',
    403: 'Captcha verification failed'
  }
});

// chat.proxy (GET /api/chat/proxy, an iframe same-origin proxy for the old
// live-preview implementation) was removed 2026-09-08: LivePreviewModal.jsx
// was rewritten to render the real widget bundle via public/preview.html
// instead of proxying a customer page into an iframe, and nothing has called
// this endpoint since (grepped the whole frontend — zero references). It was
// the safest of the two functions cut to fit under Vercel Hobby's 12-
// Serverless-Function-per-deployment cap (see api/cron/cleanup.js's own note
// for the other one, and TODO.md for the plan to restore/replace both). This
// one doesn't need restoring — it's genuinely dead — but if a real preview-
// in-iframe need resurfaces, its last working version is in git history.

export default [chatSend, chatInit, chatTheme];
