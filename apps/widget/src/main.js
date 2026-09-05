import widgetStyles from "./widget.css?inline";
import { ChatManager } from "./chat.js";
import { parseMarkdown } from "./markdown.js";

(function () {
  const scriptTag = document.currentScript || document.querySelector("script[data-tenant-key]");
  const tenantPublicKey = scriptTag?.getAttribute("data-tenant-key") || "8d0d146d-2d1f-43e7-aab4-85e8663e0956";
  
  // Default API endpoint fallback to working live Vercel Edge API route
  let defaultApiUrl = "https://admin-seven-alpha-37.vercel.app/api/chat";
  if (typeof window !== "undefined" && window.location.hostname.includes("vercel.app")) {
    defaultApiUrl = `${window.location.origin}/api/chat`;
  }
  
  const apiEndpoint = scriptTag?.getAttribute("data-api-url") || defaultApiUrl;
  const themeColor = scriptTag?.getAttribute("data-theme-color") || "#6366f1";

  // Growth lever: a small "Powered by" badge shown on the free/basic tier,
  // removed on Pro/Premium. The embed snippet (see Dashboard.jsx's
  // copyWidgetScript) sets data-hide-branding="true" for paid tenants above
  // basic; absence of the attribute means "show it" — a safe default so a
  // missing/stripped attribute never accidentally hides it for a tenant who
  // should still be showing it. Note this is a soft, client-side nudge like
  // most embeddable widgets' badges, not a hard anti-tamper mechanism.
  const hideBranding = scriptTag?.getAttribute("data-hide-branding") === "true";
  let brandingHost = "https://admin-seven-alpha-37.vercel.app";
  try {
    brandingHost = new URL(apiEndpoint).origin;
  } catch (e) {
    // keep the fallback above
  }

  const chatManager = new ChatManager(apiEndpoint, tenantPublicKey);

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
  container.style.setProperty("--b2b-theme", themeColor);
  container.style.setProperty("--b2b-theme-shadow", `${themeColor}66`);
  container.style.setProperty("--b2b-theme-border", `${themeColor}44`);
  container.style.setProperty("--b2b-theme-header", `${themeColor}2a`);
  container.style.setProperty("--b2b-theme-light", `${themeColor}1a`);

  container.innerHTML = `
    <div class="b2b-chat-panel" id="b2b-panel">
      <div class="b2b-chat-header">
        <div class="b2b-chat-header-info">
          <div class="b2b-avatar">AI</div>
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
      ${hideBranding ? "" : `
      <a class="b2b-branding" id="b2b-branding" href="${brandingHost}" target="_blank" rel="noopener noreferrer">
        Powered by <strong>Repondo</strong>
      </a>`}
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
      // Only replace the greeting bubble if the visitor hasn't started
      // chatting yet (it's still the only message in the feed) — once a
      // real conversation is underway, swapping the first bubble's text
      // under it would be a confusing thing to happen mid-read.
      if (data.welcome_message && messagesFeed.children.length === 1) {
        welcomeMsgEl.textContent = data.welcome_message;
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
      (errText) => {
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
