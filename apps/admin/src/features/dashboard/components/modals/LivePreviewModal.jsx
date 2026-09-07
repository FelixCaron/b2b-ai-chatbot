import React from 'react';
import { Globe, ExternalLink, X, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../../../../lib/api';
import { rootUrlForDomain } from '../../lib/page-url';

/** 4. FULL-SCREEN LIVE SITE PREVIEW WITH FUNCTIONAL CHATBOT */
export default function LivePreviewModal({
  show,
  activeSite,
  themeColor,
  previewContainerRef,
  autoScale,
  previewChatOpen,
  setPreviewChatOpen,
  previewMessages,
  previewStreaming,
  previewInput,
  setPreviewInput,
  onSendMessage,
  chatMessagesEndRef,
  onClose
}) {
  if (!show || !activeSite) return null;

  return (
    <div className="fixed inset-0 z-[999999] w-screen h-screen bg-black flex flex-col">
      {/* Top Control Bar */}
      <div className="h-14 px-2.5 sm:px-6 bg-dark-900 border-b border-white/10 flex items-center justify-between text-white shrink-0 gap-1.5 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-2.5 sm:px-4 py-2 rounded-xl flex items-center gap-1.5 sm:gap-2 transition-all shrink-0"
          >
            ← <span className="hidden sm:inline">Back to Dashboard</span><span className="sm:hidden">Back</span>
          </button>
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-400 font-mono min-w-0">
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" /> <span className="truncate">https://{activeSite.domain}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <a
            href={`${window.location.origin}/preview.html?domain=${encodeURIComponent(activeSite.domain)}&tenant_key=${encodeURIComponent(activeSite.public_key)}&theme_color=${encodeURIComponent(themeColor)}&api_url=${encodeURIComponent(api.chat.endpointUrl())}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-2.5 sm:px-3.5 py-1.5 rounded-xl flex items-center gap-2 transition-all border border-white/5 shadow-sm"
            title="Open site preview with chatbot"
          >
            <ExternalLink className="w-3.5 h-3.5 text-brand-400" />
            <span className="hidden sm:inline">Open in new tab</span>
          </a>
        </div>

        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-2 rounded-lg shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Viewport */}
      <div ref={previewContainerRef} className="flex-1 bg-white flex items-center justify-center relative overflow-hidden">
        <div className="w-full h-full relative overflow-auto">
          <iframe
            src={rootUrlForDomain(activeSite.domain)}
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

          {/* LIVE FUNCTIONAL CHATBOT WIDGET OVERLAY */}
          <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 z-[100000] flex flex-col items-end max-w-[calc(100vw-24px)]">
            {/* Chat Panel Modal */}
            {previewChatOpen && (
              <div 
                className="w-[calc(100vw-32px)] sm:w-[360px] h-[70vh] sm:h-[500px] max-h-[540px] bg-white text-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-3 animate-in fade-in slide-in-from-bottom-4 border border-slate-200/80"
                style={{
                  boxShadow: `0 18px 40px -10px rgba(0, 0, 0, 0.12), 0 0 18px -4px ${themeColor}20`
                }}
              >
                {/* Header */}
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

                {/* Messages Feed */}
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
                            <span>🛠️  Tool Call:</span>
                            <span className="px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: `${themeColor}99` }}>{m.tool_call.name}</span>
                          </div>
                          {m.tool_call.name === 'search_knowledge_base' && (
                            <div className="space-y-1">
                              <div>🔍  Search keywords: "{m.tool_call.keywords || m.tool_call.query}"</div>
                              <div className="text-[10px] text-slate-500 mb-1">📄 {m.tool_call.matched_chunks} chunks matched ({m.tool_call.sources?.length || 0} sources)</div>
                              {m.tool_call.sources && m.tool_call.sources.length > 0 && (
                                <div className="mt-1 flex flex-col gap-1">
                                  {m.tool_call.sources.map((src, i) => (
                                    <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="text-[9px] truncate max-w-[200px] flex items-center gap-1 px-1.5 py-0.5 rounded border" style={{ color: themeColor, backgroundColor: `${themeColor}10`, borderColor: `${themeColor}25` }}>
                                      🔗 {src.replace(`https://${activeSite.domain}`, '') || '/'}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {m.tool_call.name === 'capture_lead' && (
                            <div className="space-y-0.5">
                              <div>👤 Lead captured: {m.tool_call.lead?.name || m.tool_call.lead?.email || m.tool_call.lead?.phone || 'Visitor'}</div>
                              <div className="text-[10px] text-emerald-600 font-semibold">✓ Saved in Supabase database</div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={idx}
                        className={`max-w-[85%] p-3 rounded-2xl leading-relaxed ${
                          m.role === 'user'
                            ? 'ml-auto text-white rounded-br-none shadow-sm'
                            : 'mr-auto bg-white text-slate-700 border border-slate-200/80 rounded-bl-none shadow-sm prose prose-sm max-w-none'
                        }`}
                        style={m.role === 'user' ? {
                          backgroundColor: themeColor,
                          boxShadow: `0 4px 12px -2px ${themeColor}40`
                        } : {}}
                      >
                        {m.role === 'user' ? m.text : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ node, ...props }) => (
                                <a {...props} target="_blank" rel="noopener noreferrer" className="underline font-semibold transition-colors" style={{ color: themeColor }} />
                              ),
                              strong: ({ node, ...props }) => (
                                <strong {...props} className="font-bold text-slate-900" />
                              ),
                              ul: ({ node, ...props }) => (
                                <ul {...props} className="list-disc pl-4 my-1.5 space-y-1" />
                              ),
                              ol: ({ node, ...props }) => (
                                <ol {...props} className="list-decimal pl-4 my-1.5 space-y-1" />
                              ),
                              li: ({ node, ...props }) => (
                                <li {...props} className="text-slate-700 leading-relaxed" />
                              ),
                              code: ({ node, inline, ...props }) => (
                                inline
                                  ? <code {...props} className="bg-slate-100 text-[11px] px-1.5 py-0.5 rounded font-mono" style={{ color: themeColor }} />
                                  : <code {...props} className="block bg-slate-900 text-slate-100 p-2 rounded text-[11px] font-mono overflow-x-auto my-1.5 border border-slate-800" />
                              ),
                              p: ({ node, ...props }) => (
                                <p {...props} className="mb-2 last:mb-0 leading-relaxed" />
                              )
                            }}
                          >
                            {m.text}
                          </ReactMarkdown>
                        )}
                      </div>
                    );
                  })}

                  {/* Typing indicator dots when AI is thinking */}
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

                {/* Input */}
                <div className="p-2.5 border-t border-slate-100 bg-white flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Ask your assistant anything..."
                    value={previewInput}
                    onChange={(e) => setPreviewInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSendMessage()}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:bg-white"
                    style={{ borderColor: `${themeColor}44` }}
                  />
                  <button
                    onClick={onSendMessage}
                    disabled={!previewInput.trim() || previewStreaming}
                    className="p-2 rounded-xl text-white disabled:opacity-40 transition-all hover:scale-105 active:scale-95 shadow-sm"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Floating Launcher Pill Button */}
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
