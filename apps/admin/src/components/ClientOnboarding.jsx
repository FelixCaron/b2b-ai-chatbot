@@
-              <a
-                href={activeSite.domain.startsWith('http') ? activeSite.domain : `https://${activeSite.domain}`}
-                target="_blank"
-                rel="noopener noreferrer"
-                className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl flex items-center gap-2 transition-all border border-white/5 shadow-sm"
-                title="Open website in new tab"
-              >
-                <ExternalLink className="w-3.5 h-3.5 text-brand-400" />
-                <span className="hidden sm:inline">Open in new tab</span>
-              </a>
+              <a
+                href={`${window.location.origin}/preview.html?domain=${encodeURIComponent(activeSite.domain)}&tenant_key=${encodeURIComponent(activeSite.public_key)}&api_url=${encodeURIComponent(`${window.location.origin}/api/chat`)}`}
+                target="_blank"
+                rel="noopener noreferrer"
+                className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl flex items-center gap-2 transition-all border border-white/5 shadow-sm"
+                title="Open site preview with chatbot"
+              >
+                <ExternalLink className="w-3.5 h-3.5 text-brand-400" />
+                <span className="hidden sm:inline">Open in new tab</span>
+              </a>
@@
-                  <a
-                    key={i} href={src} target="_blank" rel="noopener noreferrer" className="text-[9px] text-indigo-400 hover:text-indigo-300 truncate max-w-[200px] flex it[...]
-                                          🔗 {src.replace(`https://${activeSite.domain}`, '') || '/'}
-                                        </a>
+                                          <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="text-[9px] text-indigo-400 hover:text-indigo-300 truncate max-w-[200px] flex it[...]">
+                                            🔗 {src.replace(`https://${activeSite.domain}`, '') || '/'}
+                                          </a>
*** End Patch
