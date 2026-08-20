import React, { useState, useEffect, useRef } from 'react';
import { X, Globe, ExternalLink, Send } from 'lucide-react';
import { fetchEventSource } from '@microsoft/fetch-event-source';

export default function ChatPreview({
  showPreviewModal,
  setShowPreviewModal,
  activeSite,
  themeColor,
  isGuest,
  onRequireLogin
}) {
  const [previewSessionId, setPreviewSessionId] = useState(() => 'preview_sess_' + Date.now());
  const [autoScale, setAutoScale] = useState(1);
  const [previewChatOpen, setPreviewChatOpen] = useState(true);
  const [previewMessages, setPreviewMessages] = useState([
    { role: 'assistant', text: "Hello! I am your website's virtual assistant. Ask me any question to test my live responses!" }
  ]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewStreaming, setPreviewStreaming] = useState(false);

  const containerRef = useRef(null);
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

  // Automatically calculate ideal viewport scale so ANY website fits 100% horizontally without clipping
  useEffect(() => {
    if (!showPreviewModal) return;
    const calculateScale = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      // Standard desktop target width is 1280px
      if (width && width < 1280) {
        setAutoScale(width / 1280);
      } else {
        setAutoScale(1);
      }
    };

    calculateScale();
    const ro = new ResizeObserver(calculateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', calculateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calculateScale);
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

      <div ref={containerRef} className="flex-1 bg-white flex items-center justify-center relative overflow-hidden">
        <div className="w-full h-full relative overflow-auto">
          <iframe
            src={activeSite.domain.startsWith('http') ? activeSite.domain : `https://${activeSite.domain}`}
            className="border-0 bg-white block"
            style={{
              width: `${100 / autoScale}%`,
              height: `${100 / autoScale}%`,
              transform: `scale(${autoScale})`,
              transformOrigin: 'top left',
              transition: 'transform 0.15s ease, width 0.15s ease, height 0.15s ease'
            }}
            title="Website Preview"
          />

          <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 z-[100000] flex flex-col items-end max-w-[calc(100vw-24px)]">
            {previewChatOpen && (
              <div 
                className="w-[calc(100vw-32px)] sm:w-[360px] h-[70vh] sm:h-[500px] max-h-[540px] bg-white text-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-3 animate-in fade-in slide-in-from-bottom-4 border border-slate-200/80"
                style={{
                  boxShadow: `0 18px 40px -10px rgba(0, 0, 0, 0.12), 0 0 18px -4px ${themeColor}20`
                }}
              >
                <div 
                  className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-white"
                  style={{
                    background: `linear-gradient(135deg, ${themeColor}10 0%, #ffffff 100%)`
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm"
                      style={{ backgroundColor: themeColor }}
                    >
                      AI
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-slate-900 leading-tight">Virtual Assistant</div>
                      <div className="text-[10.5px] font-medium flex items-center gap-1 leading-tight mt-0.5" style={{ color: themeColor }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: themeColor }}></span>
                        Live on {activeSite.domain}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setPreviewChatOpen(false)} className="text-slate-400 hover:text-slate-700 transition-colors p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 p-3.5 overflow-y-auto space-y-3 text-xs bg-slate-50/70">
                  {previewMessages.map((m, idx) => {
                    if (m.role === 'tool') {
                      return (
                        <div 
                          key={idx} 
                          className="mr-auto my-1.5 p-2.5 rounded-xl font-mono text-[11px] space-y-1 shadow-sm animate-in fade-in border"
                          style={{
                            backgroundColor: `${themeColor}10`,
                            borderColor: `${themeColor}25`,
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
                        className={`max-w-[85%] p-3 rounded-2xl ${
                          isUser 
                            ? 'ml-auto text-white rounded-br-none shadow-sm' 
                            : 'mr-auto bg-white text-slate-700 border border-slate-200/80 rounded-bl-none shadow-sm'
                        }`}
                        style={isUser ? {
                          backgroundColor: themeColor,
                          boxShadow: `0 4px 12px -2px ${themeColor}40`
                        } : {}}
                      >
                        {m.text}
                      </div>
                    );
                  })}

                  {previewStreaming && (
                    <div className="mr-auto bg-white text-slate-500 border border-slate-200/80 rounded-xl rounded-bl-none p-2.5 max-w-[200px] flex items-center gap-2 shadow-sm">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: themeColor, animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: themeColor, animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: themeColor, animationDelay: '300ms' }}></span>
                      </div>
                      <span className="text-[10px] text-slate-500 italic">{typeof previewStreaming === 'string' ? previewStreaming : '...'}</span>
                    </div>
                  )}
                  <div ref={chatMessagesEndRef} />
                </div>

                <div className="p-2.5 border-t border-slate-100 bg-white flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Ask your assistant anything..."
                    value={previewInput}
                    onChange={(e) => setPreviewInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendPreviewChat()}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:bg-white"
                    style={{ borderColor: `${themeColor}44` }}
                  />
                  <button
                    onClick={handleSendPreviewChat}
                    disabled={!previewInput.trim() || previewStreaming}
                    className="p-2 rounded-xl text-white disabled:opacity-40 transition-all hover:scale-105 active:scale-95 shadow-sm"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setPreviewChatOpen(!previewChatOpen)}
              className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-xl shadow-xl hover:scale-105 transition-transform"
              style={{ backgroundColor: themeColor, boxShadow: `0 8px 20px -4px ${themeColor}88` }}
            >
              💬
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
