import { useState, useEffect, useRef } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { authenticatedHeaders } from '../../../lib/supabase';
import api from '../../../lib/api';

/** The full-screen live preview: the scaled iframe viewport and the real chat
 *  session running against /api/chat inside it. */
export default function usePreviewChat(activeSite) {
  // Full-Screen Preview & Live Bot Testing State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [autoScale, setAutoScale] = useState(1);

  const previewContainerRef = useRef(null);

  // Live Preview Chatbot State
  const [previewSessionId, setPreviewSessionId] = useState(() => 'preview_sess_' + Date.now());
  const [previewChatOpen, setPreviewChatOpen] = useState(true);
  const [previewMessages, setPreviewMessages] = useState([
    { role: 'assistant', text: "Hello! I am your website's virtual assistant. Ask me any question to test my live responses!" }
  ]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewStreaming, setPreviewStreaming] = useState(false);

  // Automatically calculate ideal viewport scale so ANY website fits 100% horizontally without clipping
  useEffect(() => {
    if (!showPreviewModal) return;
    const calculateScale = () => {
      if (!previewContainerRef.current) return;
      const width = previewContainerRef.current.clientWidth;
      if (width && width < 1280) {
        setAutoScale(width / 1280);
      } else {
        setAutoScale(1);
      }
    };

    calculateScale();
    const ro = new ResizeObserver(calculateScale);
    if (previewContainerRef.current) ro.observe(previewContainerRef.current);
    window.addEventListener('resize', calculateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calculateScale);
    };
  }, [showPreviewModal]);

  // Hide the admin dashboard bot when in preview mode to prevent overlap
  useEffect(() => {
    const adminBot = document.getElementById('b2b-chatbot-host');
    if (adminBot) {
      adminBot.style.display = showPreviewModal ? 'none' : '';
    }
    return () => {
      if (adminBot) adminBot.style.display = '';
    };
  }, [showPreviewModal]);
  const chatMessagesEndRef = useRef(null);

  // Reset session and welcome message whenever activeSite changes
  useEffect(() => {
    if (activeSite) {
      setPreviewSessionId('preview_sess_' + Date.now());
      setPreviewMessages([
        { role: 'assistant', text: `Hello! I am the virtual assistant for ${activeSite.domain}. Ask me any question to test my live answers!` }
      ]);
    }
  }, [activeSite?.id]);

  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [previewMessages, previewChatOpen]);

  // Send test message directly to live /api/chat inside preview modal
  const handleSendPreviewChat = async () => {
    if (!previewInput.trim() || previewStreaming || !activeSite) return;

    const userText = previewInput.trim();
    setPreviewInput('');
    setPreviewMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setPreviewStreaming("Thinking...");

    let assistantText = '';
    let hasAssistantBubble = false;

    try {
      // /api/chat is a public endpoint, so the contract attaches no token — but
      // api/chat/index.js only authorizes a request coming from an origin other
      // than the customer's own domain (this admin, here) when it carries the
      // tenant owner's session. Hence the auth headers on top of the contract's.
      const authHeaders = await authenticatedHeaders();
      const { url, headers, body } = await api.chat.streamInit({
        message: userText,
        tenant_public_key: activeSite.public_key,
        session_id: previewSessionId
      });
      await fetchEventSource(url, {
        method: 'POST',
        headers: {
          ...headers,
          ...authHeaders,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body,
        async onopen(res) {
          if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
             const errJson = await res.json().catch(() => ({}));
             throw new Error(errJson.error || `Error ${res.status}`);
          } else if (!res.ok) {
             throw new Error(`Error ${res.status}`);
          }
        },
        onmessage(ev) {
          if (ev.data === '[DONE]') return;
          try {
            const parsed = JSON.parse(ev.data);
            if (ev.event === 'tool_start' || ev.event === 'tool_end' || parsed.tool_call) {
              setPreviewStreaming("Searching knowledge base & formulating answer...");
            }
            if (parsed.text) {
              if (previewStreaming) setPreviewStreaming(false);
              assistantText = parsed.text;
              if (!hasAssistantBubble) {
                hasAssistantBubble = true;
                setPreviewMessages((prev) => [...prev, { role: 'assistant', text: assistantText }]);
              } else {
                setPreviewMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', text: assistantText };
                  return updated;
                });
              }
            }
          } catch (e) {}
        },
        onerror(err) {
          throw err;
        }
      });
    } catch (err) {
      setPreviewMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${err.message}` }]);
    } finally {
      setPreviewStreaming(false);
    }
  };

  return {
    showPreviewModal,
    setShowPreviewModal,
    autoScale,
    previewContainerRef,
    chatMessagesEndRef,
    previewChatOpen,
    setPreviewChatOpen,
    previewMessages,
    previewInput,
    setPreviewInput,
    previewStreaming,
    handleSendPreviewChat
  };
}
