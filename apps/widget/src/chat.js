import { fetchEventSource } from '@microsoft/fetch-event-source';

// SSE Chat Stream Manager
export class ChatManager {
  constructor(endpoint, tenantPublicKey) {
    this.endpoint = endpoint;
    this.tenantPublicKey = tenantPublicKey;
    this.sessionId = this.getOrCreateSessionId();
  }

  getOrCreateSessionId() {
    // Scope the session key by tenant public key rather than a single global
    // key. A single shared key means any two sites/tenants tested in the same
    // browser (e.g. the admin's own preview.html, which re-injects this same
    // widget bundle on ONE origin for every site being previewed) would reuse
    // the exact same session_id — so a deleted site's conversation could keep
    // being extended, or two unrelated sites' chat histories could bleed into
    // each other. Scoping by tenant key means a new/different/recreated site
    // always starts its own fresh, isolated session automatically.
    const storageKey = `b2b_chat_session_id_${this.tenantPublicKey || "default"}`;
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = "sess_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      localStorage.setItem(storageKey, id);
    }
    // Best-effort cleanup of the old unscoped key from previous widget versions
    // so it doesn't linger around or get confused with the new scoped ones.
    try {
      localStorage.removeItem("b2b_chat_session_id");
    } catch (e) {
      // ignore
    }
    return id;
  }

  async sendMessage(userMessage, onChunk, onToolEvent, onError, onDone) {
    let doneCalled = false;
    try {
      await fetchEventSource(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          message: userMessage,
          tenant_public_key: this.tenantPublicKey,
          session_id: this.sessionId
        }),
        async onopen(response) {
          if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || `HTTP Error ${response.status}`);
          } else if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
          }
        },
        onmessage(ev) {
          if (ev.data === '[DONE]') {
            if (!doneCalled) {
              doneCalled = true;
              onDone();
            }
            return;
          }
          try {
            const data = JSON.parse(ev.data);
            if (ev.event === "tool_start" || ev.event === "tool_end") {
              onToolEvent(ev.event, data);
            } else if (data.tool_call) {
              window.dispatchEvent(new CustomEvent('b2b_tool_call', { detail: data.tool_call }));
            } else if (data.text) {
              onChunk(data.text);
            }
          } catch (e) {
            // fallback
          }
        },
        onclose() {
          if (!doneCalled) {
            doneCalled = true;
            onDone();
          }
        },
        onerror(err) {
          throw err; // throw to trigger outer catch
        }
      });
    } catch (err) {
      onError(err.message || "Network connection error");
      if (!doneCalled) {
        doneCalled = true;
        onDone();
      }
    }
  }
}
