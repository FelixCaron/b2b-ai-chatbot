import React, { useState, useEffect, useRef } from 'react';
import { X, Globe, Laptop, Smartphone, ExternalLink, Send } from 'lucide-react';
import { fetchEventSource } from '@microsoft/fetch-event-source';

export default function ChatPreview({
  showPreviewModal,
  setShowPreviewModal,
  activeSite,
  themeColor,
  isGuest,
  onRequireLogin
}) {
  const [previewViewport, setPreviewViewport] = useState('desktop');
  const [previewSessionId, setPreviewSessionId] = useState(() => 'preview_sess_' + Date.now());
  const [previewChatOpen, setPreviewChatOpen] = useState(true);
  const [previewMessages, setPreviewMessages] = useState([
    { role: 'assistant', text: "Hello! I am your website's virtual assistant. Ask me any question to test my live responses!" }
  ]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewStreaming, setPreviewStreaming] = useState(false);

  const chatMessagesEndRef = useRef(null);

  useEffect(() => {
    const adminBot = document.getElementById('b2b-chatbot-host');
    if (adminBot) {
      adminBot.style.display = showPreviewModal ? 'none' : '';
    }
    return () => {
      if (adminBot) adminBot.style.display = '';
    };
  }, [showPreviewModal]);

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

  if (!showPreviewModal || !activeSite) return null;

  const handleSendPreviewChat = async () => {
    if (!previewInput.trim() || previewStreaming || !activeSite) return;

    const userText = previewInput.trim();
    setPreviewInput('');
    setPreviewMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setPreviewStreaming("Thinking...");

    let assistantText = '';
    let hasAssistantBubble = false;

    try {
      const authHeaders = await authenticatedHeaders();
      await fetchEventSource(`${window.location.origin}/api/chat`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          message: userText,
          tenant_public_key: activeSite.public_key,
          session_id: previewSessionId
        }),
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

  return (
    <div className="fixed inset-0 z-[999999] w-screen h-screen bg-black flex flex-col">
      <div className="h-14 px-6 bg-dark-900 border-b border-white/10 flex items-center justify-between text-white shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setShowPreviewModal(false);
              if (isGuest) onRequireLogin();
            }}
            className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all"
          >
            ← Back to Dashboard
          </button>
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 font-mono">
            <Globe className="w-4 h-4 text-emerald-400" /> https://{activeSite.domain}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-dark-800 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setPreviewViewport('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                previewViewport === 'desktop' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" /> Desktop
            </button>
            <button
              onClick={() => setPreviewViewport('mobile')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                previewViewport === 'mobile' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> Mobile
            </button>
          </div>

          <a
            href={`${window.location.origin}/preview.html?domain=${encodeURIComponent(activeSite.domain)}&tenant_key=${encodeURIComponent(activeSite.public_key)}&theme_color=${encodeURIComponent(themeColor)}&api_url=${encodeURIComponent(`${window.location.origin}/api/chat`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl flex items-center gap-2 transition-all border border-white/5 shadow-sm"
            title="Open site preview with chatbot"
          >
            <ExternalLink className="w-3.5 h-3.5 text-brand-400" />
            <span className="hidden sm:inline">Open in new tab</span>
          </a>
        </div>

        <button
          onClick={() => {
            setShowPreviewModal(false);
            if (isGuest) onRequireLogin();
          }}
          className="text-gray-400 hover:text-white p-2 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 bg-gray-950 flex items-center justify-center relative overflow-hidden">
        <div
          className={`h-full transition-all duration-300 relative ${
            previewViewport === 'mobile' ? 'w-[390px] h-[780px] my-auto rounded-3xl border-8 border-gray-800 overflow-hidden shadow-2xl' : 'w-full h-full'
          }`}
        >
          <iframe
            src={activeSite.domain.startsWith('http') ? activeSite.domain : `https://${activeSite.domain}`}
            className="w-full h-full border-0 bg-white"
            title="Website Preview"
          />

          <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 z-[100000] flex flex-col items-end max-w-[calc(100vw-24px)]">
            {previewChatOpen && (
              <div 
                className="w-[calc(100vw-24px)] sm:w-[380px] h-[70vh] sm:h-[520px] max-h-[600px] bg-dark-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-3 sm:mb-4 animate-in fade-in slide-in-from-bottom-4"
                style={{
                  border: `1px solid ${themeColor}44`,
                  boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 25px -5px ${themeColor}33`
                }}
              >
                <div 
                  className="p-4 border-b flex items-center justify-between"
                  style={{
                    background: `linear-gradient(135deg, ${themeColor}22 0%, rgba(15, 23, 42, 0.95) 100%)`,
                    borderBottomColor: `${themeColor}33`
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-md"
                      style={{ backgroundColor: themeColor }}
                    >
                      AI
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">Virtual Assistant</div>
                      <div className="text-[11px] flex items-center gap-1" style={{ color: themeColor }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: themeColor }}></span>
                        Live on {activeSite.domain}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setPreviewChatOpen(false)} className="text-gray-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
                  {previewMessages.map((m, idx) => {
                    if (m.role === 'tool') {
                      return (
                        <div 
                          key={idx} 
                          className="mr-auto my-1.5 p-3 rounded-xl font-mono text-[11px] space-y-1 shadow-inner animate-in fade-in"
                          style={{
                            backgroundColor: `${themeColor}15`,
                            border: `1px solid ${themeColor}33`,
                            color: themeColor
                          }}
                        >
                          <div className="flex items-center gap-1.5 font-bold">
                            ⚙️ tool_call
                          </div>
                        </div>
                      );
                    }
                    const isUser = m.role === 'user';
                    return (
                      <div 
                        key={idx} 
                        className={`max-w-[85%] p-3 rounded-xl ${
                          isUser 
                            ? 'ml-auto text-white rounded-br-none' 
                            : 'mr-auto bg-dark-800 text-gray-200 border border-white/5 rounded-bl-none'
                        }`}
                        style={isUser ? {
                          backgroundColor: themeColor,
                          boxShadow: `0 4px 12px ${themeColor}44`
                        } : {}}
                      >
                        {m.text}
                      </div>
                    );
                  })}

                  {previewStreaming && (
                    <div className="mr-auto bg-dark-800 text-gray-400 border border-white/5 rounded-xl rounded-bl-none p-3 max-w-[200px] flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: themeColor, animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: themeColor, animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: themeColor, animationDelay: '300ms' }}></span>
                      </div>
                      <span className="text-[10px] text-gray-500 italic">{typeof previewStreaming === 'string' ? previewStreaming : '...'}</span>
                    </div>
                  )}
                  <div ref={chatMessagesEndRef} />
                </div>

                <div 
                  className="p-3 border-t flex items-center gap-2"
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    borderTopColor: `${themeColor}22`
                  }}
                >
                  <input
                    type="text"
                    placeholder="Ask your assistant anything..."
                    value={previewInput}
                    onChange={(e) => setPreviewInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendPreviewChat()}
                    className="flex-1 bg-dark-900 border rounded-xl px-3 py-2 text-xs text-white outline-none"
                    style={{ borderColor: `${themeColor}44` }}
                  />
                  <button
                    onClick={handleSendPreviewChat}
                    disabled={!previewInput.trim() || previewStreaming}
                    className="p-2 rounded-xl text-white disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setPreviewChatOpen(!previewChatOpen)}
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl shadow-2xl hover:scale-105 transition-transform"
              style={{ backgroundColor: themeColor, boxShadow: `0 10px 25px -5px ${themeColor}88` }}
            >
              💬
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
