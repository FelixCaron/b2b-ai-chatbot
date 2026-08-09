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
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: userMessage,
          tenant_public_key: this.tenantPublicKey,
          session_id: this.sessionId
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Erreur HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (!block.trim()) continue;

          let eventName = "message";
          let dataStr = "";

          const blockLines = block.split("\n");
          for (const line of blockLines) {
            if (line.startsWith("event: ")) {
              eventName = line.substring(7).trim();
            } else if (line.startsWith("data: ")) {
              dataStr = line.substring(6).trim();
            }
          }

          if (dataStr === "[DONE]") {
            onDone();
            return;
          }

          try {
            const data = JSON.parse(dataStr);
            if (eventName === "tool_start" || eventName === "tool_end") {
              onToolEvent(eventName, data);
            } else if (data.text) {
              onChunk(data.text);
            }
          } catch (_e) {
            // raw text chunk fallback
          }
        }
      }
      onDone();
    } catch (err) {
      onError(err.message || "Erreur de connexion réseau");
    }
  }
}
