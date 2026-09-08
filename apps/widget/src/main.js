import widgetStyles from "./widget.css?inline";
import { ChatManager } from "./chat.js";
import { parseMarkdown } from "./markdown.js";

(function () {
  const scriptTag = document.currentScript || document.querySelector("script[data-tenant-key]");
  const tenantPublicKey = scriptTag?.getAttribute("data-tenant-key") || "8d0d146d-2d1f-43e7-aab4-85e8663e0956";
  
  // Default API endpoint fallback to the production domain's Edge API route.
  // Vercel preview deployments (*.vercel.app) don't share that domain, so
  // they fall back to their own origin instead.
  let defaultApiUrl = "https://dorafi.logafi.com/api/chat";
  if (typeof window !== "undefined" && window.location.hostname.includes("vercel.app")) {
    defaultApiUrl = `${window.location.origin}/api/chat`;
  }
  
  const apiEndpoint = scriptTag?.getAttribute("data-api-url") || defaultApiUrl;
  // Mutable: the /chat/init fetch below can replace this with the site's
  // live theme_primary_color, and the one other consumer of this value
  // (the error-fallback button, built well after load) should track that
  // update too rather than freezing on the embed snippet's static color.
  let themeColor = scriptTag?.getAttribute("data-theme-color") || "#293f68";

  // Growth lever: a small "Powered by" badge shown on the free/basic tier,
  // removed on Pro/Premium. The embed snippet only carries data-tenant-key —
  // this is resolved from the tenant's live plan by the /chat/init fetch
  // below (api/chat/init.js's hide_branding), not baked into the snippet, so
  // a plan change takes effect without anyone re-pasting anything. The
  // data-hide-branding attribute is kept as a back-compat/no-flash override
  // for older snippets and internal tooling (see preview.html); absence of
  // both means "show it" — a safe default so a missing/stripped signal never
  // accidentally hides it for a tenant who should still be showing it. Note
  // this is a soft, client-side nudge like most embeddable widgets' badges,
  // not a hard anti-tamper mechanism.
  let hideBranding = scriptTag?.getAttribute("data-hide-branding") === "true";
  let brandingHost = "https://dorafi.logafi.com";
  try {
    brandingHost = new URL(apiEndpoint).origin;
  } catch (e) {
    // keep the fallback above
  }

  // Set only by the admin's preview page, which runs the widget on an origin
  // that isn't the customer's registered domain and so has to prove ownership.
  const previewAuthToken = scriptTag?.getAttribute("data-auth-token") || null;

  const chatManager = new ChatManager(apiEndpoint, tenantPublicKey, previewAuthToken);

  // Build Container
  const host = document.createElement("div");
  host.id = "b2b-chatbot-host";
  
  const targetContainer = document.getElementById("b2b-chatbot-injection-target") || document.body;
  targetContainer.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });

  const styleTag = document.createElement("style");
  styleTag.textContent = widgetStyles;
  shadowRoot.appendChild(styleTag);

  const container = document.createElement("div");
  container.id = "b2b-chatbot-container";

  // Applies a brand color to every themed CSS variable at once. Called once
  // below with the embed snippet's static data-theme-color (so there's a
  // correct color on first paint, no flash), and again from the /chat/init
  // fetch below with the site's live theme_primary_color — a tenant who
  // changes their color in the dashboard sees it on their own site without
  // having to re-copy and re-paste the embed snippet.
  function applyThemeColor(color) {
    themeColor = color;
    container.style.setProperty("--b2b-theme", color);
    container.style.setProperty("--b2b-theme-shadow", `${color}66`);
    container.style.setProperty("--b2b-theme-border", `${color}44`);
    container.style.setProperty("--b2b-theme-header", `${color}2a`);
    container.style.setProperty("--b2b-theme-light", `${color}1a`);
  }
  applyThemeColor(themeColor);

  // Dark-vs-light overrides for the panel's own surfaces (everything the
  // theme color doesn't already touch). Works for any host page — no
  // per-site configuration — by reading the page's actual computed
  // background rather than guessing from a domain or a stored setting.
  const DARK_SCHEME_VARS = {
    "--b2b-bg": "#111827",
    "--b2b-text": "#f1f5f9",
    "--b2b-text-muted": "#94a3b8",
    "--b2b-border": "rgba(255, 255, 255, 0.1)",
    "--b2b-header-bg": "linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, #111827 100%)",
    "--b2b-messages-bg": "#0b1220",
    "--b2b-assistant-bg": "#1e293b",
    "--b2b-assistant-text": "#e2e8f0",
    "--b2b-footer-bg": "#111827",
    "--b2b-input-bg": "#1e293b",
    "--b2b-input-border": "#334155",
    "--b2b-input-text": "#f1f5f9"
  };

  function applyColorScheme(isDark) {
    if (isDark) {
      Object.entries(DARK_SCHEME_VARS).forEach(([prop, value]) => container.style.setProperty(prop, value));
    } else {
      // No overrides — widget.css's own light-theme defaults apply.
      Object.keys(DARK_SCHEME_VARS).forEach((prop) => container.style.removeProperty(prop));
    }
  }

  // Reads the host page's *actual* rendered background (walking up past
  // transparent ancestors) rather than trusting a class name or a media
  // query alone — a page can be light with the OS in dark mode, or vice
  // versa, and the widget should match what a visitor is actually looking
  // at. `prefers-color-scheme` is only the fallback for when the page's own
  // background can't be read (e.g. it's set via a background image).
  function detectHostIsDark() {
    try {
      let el = document.body || document.documentElement;
      let bg = el ? getComputedStyle(el).backgroundColor : "";
      while (el && (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
        el = el.parentElement;
        bg = el ? getComputedStyle(el).backgroundColor : "";
      }
      const match = bg && bg.match(/rgba?\(([^)]+)\)/);
      if (match) {
        const [r, g, b] = match[1].split(",").map((n) => parseFloat(n.trim()));
        if ([r, g, b].every((n) => !Number.isNaN(n))) {
          const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          return luminance < 0.45;
        }
      }
    } catch (e) {
      // fall through to the media-query fallback below
    }
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (e) {
      return false;
    }
  }

  applyColorScheme(detectHostIsDark());

  // Generic assistant icon shown until (or instead of) the host's own
  // favicon loads — never the literal text "AI".
  const FALLBACK_AVATAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  container.innerHTML = `
    <div class="b2b-chat-panel" id="b2b-panel">
      <div class="b2b-chat-header">
        <div class="b2b-chat-header-info">
          <div class="b2b-avatar" id="b2b-avatar"><img class="b2b-avatar-img" id="b2b-avatar-img" alt="" /></div>
          <div>
            <div class="b2b-status-title" id="b2b-status-title">Virtual Assistant</div>
            <div class="b2b-status-sub"><span class="b2b-status-dot"></span><span id="b2b-status-online">Online</span></div>
          </div>
        </div>
        <button class="b2b-close-btn" id="b2b-close-btn" aria-label="Close chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="b2b-chat-messages" id="b2b-messages">
        <div class="b2b-msg assistant">
          <p class="b2b-p" id="b2b-welcome-msg">Hello! How can I help you today?</p>
        </div>
      </div>
      <div class="b2b-chat-footer">
        <input type="text" class="b2b-chat-input" id="b2b-input" placeholder="Ask a question..." />
        <button class="b2b-send-btn" id="b2b-send-btn" aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
      <a class="b2b-branding" id="b2b-branding" href="${brandingHost}" target="_blank" rel="noopener noreferrer" ${hideBranding ? "hidden" : ""}>
        Powered by <strong>dorafi</strong>
      </a>
    </div>
    <button class="b2b-chat-launcher" id="b2b-launcher" aria-label="Open chat assistant">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>
  `;

  shadowRoot.appendChild(container);

  // UI Element Selectors
  const launcher = shadowRoot.getElementById("b2b-launcher");
  const panel = shadowRoot.getElementById("b2b-panel");
  const closeBtn = shadowRoot.getElementById("b2b-close-btn");
  const messagesFeed = shadowRoot.getElementById("b2b-messages");
  const input = shadowRoot.getElementById("b2b-input");
  const sendBtn = shadowRoot.getElementById("b2b-send-btn");
  const statusTitleEl = shadowRoot.getElementById("b2b-status-title");
  const statusOnlineEl = shadowRoot.getElementById("b2b-status-online");
  const welcomeMsgEl = shadowRoot.getElementById("b2b-welcome-msg");
  const brandingEl = shadowRoot.getElementById("b2b-branding");
  const avatarEl = shadowRoot.getElementById("b2b-avatar");
  const avatarImgEl = shadowRoot.getElementById("b2b-avatar-img");

  // Brand the launcher/header with the host site's own favicon instead of a
  // generic "AI" badge — works for any domain, nothing to configure. The
  // widget script executes directly in the host page (not an iframe), so
  // its own <link rel="icon"> is readable; falls back to the conventional
  // /favicon.ico path, and to a generic assistant icon if neither loads.
  function resolveHostFaviconUrl() {
    try {
      const link = document.querySelector("link[rel~='icon']") || document.querySelector("link[rel='shortcut icon']");
      if (link && link.href) return link.href;
    } catch (e) {}
    try {
      return `${window.location.origin}/favicon.ico`;
    } catch (e) {
      return null;
    }
  }

  const hostFaviconUrl = resolveHostFaviconUrl();
  if (hostFaviconUrl && avatarImgEl) {
    avatarImgEl.referrerPolicy = "no-referrer";
    avatarImgEl.onerror = () => {
      avatarEl.innerHTML = FALLBACK_AVATAR_SVG;
    };
    avatarImgEl.src = hostFaviconUrl;
  } else if (avatarEl) {
    avatarEl.innerHTML = FALLBACK_AVATAR_SVG;
  }

  // Fetch the site's own greeting/labels (pregenerated once at scan time,
  // see api/lib/llm.js's generateWelcomeExperience — this is a fast DB read,
  // not a live LLM call) and swap them in for the English defaults above.
  // Fire-and-forget: if it's slow or fails, the English defaults already
  // rendered are a perfectly fine widget, not a broken one.
  const initEndpoint = apiEndpoint.replace(/\/chat\/?$/, "/chat/init");
  fetch(`${initEndpoint}?tenant_public_key=${encodeURIComponent(tenantPublicKey)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;
      if (data.ui_status_title) statusTitleEl.textContent = data.ui_status_title;
      if (data.ui_status_online) statusOnlineEl.textContent = data.ui_status_online;
      if (data.ui_input_placeholder) input.placeholder = data.ui_input_placeholder;
      // Only a real 6-digit hex — never trust a DB value into a CSS custom
      // property without validating its shape first.
      if (data.theme_primary_color && /^#[0-9a-fA-F]{6}$/.test(data.theme_primary_color)) {
        applyThemeColor(data.theme_primary_color);
      }
      // Only replace the greeting bubble if the visitor hasn't started
      // chatting yet (it's still the only message in the feed) — once a
      // real conversation is underway, swapping the first bubble's text
      // under it would be a confusing thing to happen mid-read.
      if (data.welcome_message && messagesFeed.children.length === 1) {
        welcomeMsgEl.textContent = data.welcome_message;
      }
      // The DB is authoritative for this once it answers — overrides
      // whatever data-hide-branding said (or didn't say) at first paint.
      if (typeof data.hide_branding === "boolean" && brandingEl) {
        hideBranding = data.hide_branding;
        brandingEl.hidden = hideBranding;
      }
    })
    .catch(() => { /* keep the English defaults already on screen */ });

  let isOpen = scriptTag?.hasAttribute("data-auto-open") || false;
  let isStreaming = false;

  function toggleWidget() {
    isOpen = !isOpen;
    panel.classList.toggle("active", isOpen);
    if (isOpen) input.focus();
  }

  // Force initial state if auto-open is enabled
  if (isOpen) {
    panel.classList.add("active");
  }

  launcher.addEventListener("click", toggleWidget);
  closeBtn.addEventListener("click", toggleWidget);

  function appendMessage(role, text) {
    const msgEl = document.createElement("div");
    msgEl.className = `b2b-msg ${role}`;
    if (role === 'assistant') {
      msgEl.innerHTML = parseMarkdown(text);
    } else {
      msgEl.innerText = text;
    }
    messagesFeed.appendChild(msgEl);
    messagesFeed.scrollTop = messagesFeed.scrollHeight;
    return msgEl;
  }

  async function handleSend() {
    const text = input.value.trim();
    if (!text || isStreaming) return;

    input.value = "";
    appendMessage("user", text);

    const assistantMsgEl = appendMessage("assistant", "...");
    assistantMsgEl.innerHTML = '<span style="opacity:0.6;">...</span>';

    isStreaming = true;
    sendBtn.disabled = true;

    await chatManager.sendMessage(
      text,
      // On Chunk (live markdown parsing during stream)
      (chunk) => {
        assistantMsgEl.innerHTML = parseMarkdown(chunk);
        messagesFeed.scrollTop = messagesFeed.scrollHeight;
      },
      // On Tool Event (hidden from conversation feed for clean UX)
      () => {},
      // On Error
      (errText, meta = {}) => {
        // Every real failure reason (rate limit, paused site, unauthorized
        // origin, DB error, network drop, ...) collapsed into the same
        // silent "technical issue" bubble below, with nothing in the
        // console either — making every incident look identical and
        // impossible to diagnose from a user's bug report alone. Log the
        // real reason, and give the two common, non-catastrophic cases
        // (rate limiting, a deliberately paused site) their own accurate
        // message instead of the generic "sorry, leave your email" fallback,
        // which is misleading when there's nothing actually broken.
        console.error('[Dorafi widget] chat request failed:', errText, meta);

        if (meta.status === 429) {
          assistantMsgEl.innerHTML = `<span>You're sending messages a little too fast. Please wait a moment and try again. 🙏</span>`;
          isStreaming = false;
          sendBtn.disabled = false;
          return;
        }

        if (meta.code === 'site_inactive') {
          assistantMsgEl.innerHTML = `<span>${errText}</span>`;
          isStreaming = false;
          sendBtn.disabled = false;
          return;
        }

        const id = Date.now();
        assistantMsgEl.innerHTML = `<span>Sorry! A technical issue occurred. 😔<br><br><b>Leave us your email so our team can follow up with you:</b></span>
        <div style="display:flex; gap:5px; margin-top:10px;">
           <input type="email" id="fallback-email-${id}" placeholder="your@email.com" class="b2b-chat-input" style="flex:1; padding:8px; border-radius:6px; border:1px solid #334155; font-size:12px; color:#fff; background:#0f172a;" />
           <button id="fallback-btn-${id}" style="padding:8px 12px; border-radius:6px; background:${themeColor}; color:white; border:none; cursor:pointer; font-weight:bold; font-size:12px;">Submit</button>
        </div>`;

        const btn = shadowRoot.getElementById(`fallback-btn-${id}`);
        const inputFallback = shadowRoot.getElementById(`fallback-email-${id}`);
        if (btn && inputFallback) {
          btn.addEventListener('click', () => {
            if (inputFallback.value.includes('@')) {
              assistantMsgEl.innerHTML = `Thank you! We will get back to you shortly at <b>${inputFallback.value}</b>.`;
            } else {
              inputFallback.style.border = "1px solid red";
            }
          });
        }

        isStreaming = false;
        sendBtn.disabled = false;
      },
      // On Done
      () => {
        isStreaming = false;
        sendBtn.disabled = false;
      }
    );
  }

  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });
})();
