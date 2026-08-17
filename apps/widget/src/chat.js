import { fetchEventSource } from '@microsoft/fetch-event-source';

// SSE Chat Stream Manager
export class ChatManager {
  constructor(endpoint, tenantPublicKey) {
    this.endpoint = endpoint;
    this.tenantPublicKey = tenantPublicKey;
    this.sessionId = this.getOrCreateSessionId();
  }

  getOrCreateSessionId() {
    let id = localStorage.getItem("b2b_chat_session_id");
    if (!id) {
      id = "sess_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      localStorage.setItem("b2b_chat_session_id", id);
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
            throw new Error(errJson.error || `Erreur HTTP ${response.status}`);
          } else if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status}`);
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
      onError(err.message || "Erreur de connexion réseau");
      if (!doneCalled) {
        doneCalled = true;
        onDone();
      }
    }
  }
}
