import "./widget.css";
import { ChatManager } from "./chat.js";

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

  const chatManager = new ChatManager(apiEndpoint, tenantPublicKey);

  // Build Container
  const container = document.createElement("div");
  container.id = "b2b-chatbot-container";

  container.innerHTML = `
    <div class="b2b-chat-panel" id="b2b-panel">
      <div class="b2b-chat-header" style="background: rgba(30, 41, 59, 0.9);">
        <div class="b2b-chat-header-info">
          <div class="b2b-avatar" style="background: ${themeColor}; shadow: 0 4px 12px ${themeColor}44;">AI</div>
          <div>
            <div class="b2b-status-title">Assistant Virtuel</div>
            <div class="b2b-status-sub"><span class="b2b-status-dot"></span>En ligne</div>
          </div>
        </div>
        <button class="b2b-close-btn" id="b2b-close-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="b2b-chat-messages" id="b2b-messages">
        <div class="b2b-msg assistant">Bonjour! Comment puis-je vous aider aujourd'hui?</div>
      </div>
      <div class="b2b-chat-footer">
        <input type="text" class="b2b-chat-input" id="b2b-input" placeholder="Posez une question..." />
        <button class="b2b-send-btn" id="b2b-send-btn" style="background: ${themeColor};">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    </div>
    <button class="b2b-chat-launcher" id="b2b-launcher" style="background: ${themeColor}; box-shadow: 0 10px 25px -5px ${themeColor}66;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>
  `;

  document.body.appendChild(container);

  // UI Element Selectors
  const launcher = document.getElementById("b2b-launcher");
  const panel = document.getElementById("b2b-panel");
  const closeBtn = document.getElementById("b2b-close-btn");
  const messagesFeed = document.getElementById("b2b-messages");
  const input = document.getElementById("b2b-input");
  const sendBtn = document.getElementById("b2b-send-btn");

  let isOpen = false;
  let isStreaming = false;

  function toggleWidget() {
    isOpen = !isOpen;
    panel.classList.toggle("active", isOpen);
    if (isOpen) input.focus();
  }

  launcher.addEventListener("click", toggleWidget);
  closeBtn.addEventListener("click", toggleWidget);

  function appendMessage(role, text) {
    const msgEl = document.createElement("div");
    msgEl.className = `b2b-msg ${role}`;
    msgEl.innerText = text;
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
    assistantMsgEl.innerText = "";

    isStreaming = true;
    sendBtn.disabled = true;

    await chatManager.sendMessage(
      text,
      // On Chunk
      (chunk) => {
        assistantMsgEl.innerText += chunk;
        messagesFeed.scrollTop = messagesFeed.scrollHeight;
      },
      // On Tool Event
      (event, data) => {
        if (event === "tool_start" && data.tool === "search_knowledge_base") {
          const badge = document.createElement("div");
          badge.className = "b2b-tool-badge";
          badge.innerText = "🔍 Recherche des informations...";
          assistantMsgEl.appendChild(badge);
        } else if (event === "tool_end" && data.tool === "capture_lead") {
          const badge = document.createElement("div");
          badge.className = "b2b-tool-badge";
          badge.innerText = "✅ Coordonnées enregistrées";
          assistantMsgEl.appendChild(badge);
        }
      },
      // On Error
      (errText) => {
        assistantMsgEl.innerText = `Erreur: ${errText}`;
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
