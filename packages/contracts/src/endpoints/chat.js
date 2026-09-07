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
    session_id: f.string({ min: 1, max: 128 })
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
    tenant_public_key: f.uuid()
  },
  response: {
    welcome_message: f.string(),
    ui_status_title: f.string(),
    ui_status_online: f.string(),
    ui_input_placeholder: f.string(),
    language: f.string({ min: 2, max: 8 }),
    theme_primary_color: optional(f.hexColor())
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
    text_color: f.hexColor()
  },
  errors: {
    400: 'Missing or unusable url',
    403: 'Captcha verification failed'
  }
});

/** GET /api/chat/proxy — same-origin fetch of a public page, for the preview iframe. */
export const chatProxy = defineEndpoint({
  name: 'chat.proxy',
  summary: 'Same-origin proxy used by the live preview to load a customer page in an iframe.',
  method: 'GET',
  path: '/api/chat/proxy',
  auth: AUTH.PUBLIC,
  runtime: 'nodejs',
  request: {
    url: f.url()
  },
  response: {},
  errors: {
    400: 'Missing url query parameter'
  }
});

export default [chatSend, chatInit, chatTheme, chatProxy];
