import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, BookOpen, Shield, Cpu, Terminal, 
  Settings, Zap, Check, HelpCircle, ArrowRight,
  Sparkles, Layers, Info, RefreshCw
} from 'lucide-react';

interface HelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'OVERVIEW' | 'USERSCRIPT' | 'PROXY_SANDBOX' | 'REPLAY_ENGINE' | 'DEVTOOLS';

export default function HelpDialog({ isOpen, onClose }: HelpDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>('OVERVIEW');

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with elegant blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />

          {/* Dialog Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="relative bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl h-[600px] shadow-2xl overflow-hidden flex flex-col text-slate-300"
          >
            {/* Header */}
            <header className="px-6 py-4 border-b border-slate-800 bg-[#1e293b]/70 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">ProxyDev System Manual</h2>
                  <p className="text-[10px] text-slate-400">Explanations, architectural blueprints, and setup guides.</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* Inner Content Area with Split Layout */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Sidebar Menu */}
              <aside className="w-60 border-r border-slate-800 bg-[#0f172a]/55 p-3 flex flex-col gap-1 shrink-0">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2 font-mono">Documentation</span>
                
                <button
                  onClick={() => setActiveTab('OVERVIEW')}
                  className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer ${
                    activeTab === 'OVERVIEW' 
                      ? 'bg-blue-600 text-white shadow shadow-blue-650 font-semibold' 
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Overview</span>
                </button>

                <button
                  onClick={() => setActiveTab('USERSCRIPT')}
                  className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer ${
                    activeTab === 'USERSCRIPT' 
                      ? 'bg-blue-600 text-white shadow shadow-blue-650 font-semibold' 
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>Userscript Interceptor</span>
                </button>

                <button
                  onClick={() => setActiveTab('PROXY_SANDBOX')}
                  className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer ${
                    activeTab === 'PROXY_SANDBOX' 
                      ? 'bg-blue-600 text-white shadow shadow-blue-650 font-semibold' 
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-4 h-4 shrink-0" />
                  <span>Proxy Viewport Sandbox</span>
                </button>

                <button
                  onClick={() => setActiveTab('REPLAY_ENGINE')}
                  className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer ${
                    activeTab === 'REPLAY_ENGINE' 
                      ? 'bg-blue-600 text-white shadow shadow-blue-650 font-semibold' 
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <Cpu className="w-4 h-4 shrink-0" />
                  <span>Manual Replay Engine</span>
                </button>

                <button
                  onClick={() => setActiveTab('DEVTOOLS')}
                  className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer ${
                    activeTab === 'DEVTOOLS' 
                      ? 'bg-blue-600 text-white shadow shadow-blue-650 font-semibold' 
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <Terminal className="w-4 h-4 shrink-0" />
                  <span>Inspector DevTools</span>
                </button>
              </aside>

              {/* Right Tab Content Screen */}
              <div className="flex-1 overflow-y-auto p-6 bg-[#0c101b] space-y-5">
                {activeTab === 'OVERVIEW' && (
                  <div className="space-y-4 font-sans">
                    <div className="flex items-center gap-2 text-blue-400 border-b border-slate-800 pb-2">
                      <Sparkles className="w-4 h-4" />
                      <h3 className="text-sm font-bold uppercase font-mono tracking-wider">ProxyDev Sandbox Environment</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      ProxyDev builds a full-fidelity client-server proxy system, allowing developers to safely intercept, filter, tweak, and replay HTTP request packets directly inside their environments.
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      By isolating the traffic capture pathways, ProxyDev lets you inspect queries and response bodies out-of-band—mitigating preflight delays, CORS constraints, and standard telemetry leaks.
                    </p>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                        <span className="text-xs font-bold text-slate-200 font-mono block mb-1">Anti-CORS Bypass</span>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          Incoming requests route via Node.js agent mechanisms to mock origin context, dodging header blocks.
                        </p>
                      </div>
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                        <span className="text-xs font-bold text-slate-200 font-mono block mb-1">Dynamic Stream</span>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          A synchronous WebSocket pipe pushes logs from both local iframes and external browser scripts live.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'USERSCRIPT' && (
                  <div className="space-y-4 font-sans">
                    <div className="flex items-center gap-2 text-blue-400 border-b border-slate-800 pb-2">
                      <Shield className="w-4 h-4" />
                      <h3 className="text-sm font-bold uppercase font-mono tracking-wider">Tampermonkey Userscript Generator</h3>
                    </div>

                    <div className="bg-slate-900/60 border border-slate-800/70 p-4 rounded-xl space-y-2">
                      <span className="text-[10px] text-blue-400 uppercase font-bold tracking-wider font-mono">Stealth browser integration center</span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Hook client-side request pipelines directly from any browser window using a sandboxed, fully isolated userscript framework.
                        Renders full-fidelity local traffic visualizers inside a secure Shadow DOM, or forwards packet streams to your ProxyDev app cleanly without exposing local ports.
                      </p>
                      <div className="flex gap-4 pt-1 text-[10px] font-mono text-emerald-400 font-semibold">
                        <span>✓ CSP / CORS Bypass</span>
                        <span>✓ Privileged GM Network API Support</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-widest font-mono text-[10px]">How to deploy in Kiwi / Firefox night / any browser:</span>
                      <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-[11px] bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                        <li>Install <strong className="text-slate-300">Tampermonkey</strong> or <strong className="text-slate-300">Violentmonkey</strong> extension in your developer browser.</li>
                        <li>Click "Create a new script" in the extension menu dashboard.</li>
                        <li>Replace all placeholder editor content by pasting this copied generated script.</li>
                        <li>Press <kbd className="px-1 bg-slate-950 border border-slate-700 rounded text-slate-300">Ctrl + S</kbd> to save.</li>
                        <li>Open any website (matches all origins by default). Start browsing to capture and replay HTTP actions locally, or monitor them live in this app's main page!</li>
                      </ol>
                    </div>

                    <div className="space-y-2.5">
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-widest font-mono text-[10px]">Stability & Stealth Analysis:</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                          <span className="text-emerald-400 font-bold font-mono text-[10px] block uppercase">&bull; Why Shadow DOM is Stealthy</span>
                          <p className="text-[10px] text-slate-400 leading-relaxed">
                            Our injector renders the miniature viewer inside a <strong>closed-mode shadow root</strong> attachable to dynamically-named custom HTML tags. Host page JavaScript queries (like <code>document.getElementById</code> or <code>querySelectorAll</code>) are blind to shadow boundaries, preventing detection.
                          </p>
                        </div>
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                          <span className="text-emerald-400 font-bold font-mono text-[10px] block uppercase">&bull; CORS Bypass via GM API</span>
                          <p className="text-[10px] text-slate-400 leading-relaxed">
                            Forwarding data via site <code>fetch</code> triggers preflights (OPTIONS) and leaves local port endpoints in the network log. Our script uses Tampermonkey's privileged <code>GM_xmlhttpRequest</code> which communicates out-of-band at the browser level—no preflights, no detection.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1 font-mono text-[11px] bg-[#1e293b]/30 p-3 rounded-lg border border-slate-800/85">
                      <span className="text-slate-200 font-bold block mb-1">Userscript Integration Modes:</span>
                      <div className="space-y-1 text-slate-400">
                        <div>&bull; <strong className="text-slate-300">Local-Only Overlay:</strong> Renders shadow network tab on the page. Sends no data outside.</div>
                        <div>&bull; <strong className="text-slate-300">Synchronous Forwarding:</strong> Stealthily logs data in the background and sends to this web app.</div>
                        <div>&bull; <strong className="text-slate-300">Dual Interceptor Engine:</strong> Enables both the miniature overlay drawer and forwards stream here.</div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'PROXY_SANDBOX' && (
                  <div className="space-y-4 font-sans">
                    <div className="flex items-center gap-2 text-blue-400 border-b border-slate-800 pb-2">
                      <Layers className="w-4 h-4" />
                      <h3 className="text-sm font-bold uppercase font-mono tracking-wider">Proxy Viewport Sandbox</h3>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-800/70 p-4 rounded-xl space-y-2">
                      <span className="text-[10px] text-blue-400 uppercase font-bold tracking-wider font-mono">Proxy Viewport Sandbox</span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Enter any URL in the address bar inside the sandbox browser viewport tab. The backend will fetch the resource dynamically, bypass CORS constraints, rewrite relative assets, and list all network calls.
                      </p>
                    </div>

                    <div className="p-4 bg-[#0a1524] rounded-xl border border-blue-900/40 space-y-2 font-mono">
                      <div className="flex items-center gap-2 text-blue-400">
                        <Zap className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Dynamic Injection System:</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        The proxy server automatically overrides <code>window.fetch</code> and <code>XMLHttpRequest</code> natively within the iframe's content frame context. This captures asynchronous sub-request logs in real-time as the rendered page works.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'REPLAY_ENGINE' && (
                  <div className="space-y-4 font-sans">
                    <div className="flex items-center gap-2 text-blue-400 border-b border-slate-800 pb-2">
                      <Cpu className="w-4 h-4" />
                      <h3 className="text-sm font-bold uppercase font-mono tracking-wider">Manual Custom Replay Engine</h3>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-800/70 p-4 rounded-xl space-y-2">
                      <span className="text-[10px] text-blue-400 uppercase font-bold tracking-wider font-mono">Tamper Replay Tool</span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Manual Custom Replay Engine is preencoded to execute bypassing calls through the secure server agent to prevent browser constraints from blocking modified packets.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-2 text-[11px] font-mono text-slate-400">
                      <span className="font-bold text-slate-200">How to use manipulation tools:</span>
                      <p className="leading-relaxed">
                        Tweak requested request headers, payload body contents, path strings, methods, or destination endpoint parameters, and hit <strong className="text-emerald-400">Execute</strong> to inspect the raw returned text/JSON.
                      </p>
                      <p className="leading-relaxed">
                        If no executed replayed data is available yet, simply trigger a replay action on any log in your DevTools pane, or type in a raw custom destination target.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'DEVTOOLS' && (
                  <div className="space-y-4 font-sans">
                    <div className="flex items-center gap-2 text-blue-400 border-b border-slate-800 pb-2">
                      <Terminal className="w-4 h-4" />
                      <h3 className="text-sm font-bold uppercase font-mono tracking-wider">Inspector DevTools Suite</h3>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-800/70 p-4 rounded-xl space-y-2">
                      <span className="text-[10px] text-blue-400 uppercase font-bold tracking-wider font-mono">Stream Logging Console</span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Our logging system organizes HTTP packets sequentially as they occur inside the sandbox or through userscript forwarding hooks.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-2 text-[11px] font-mono text-slate-400">
                      <div className="text-slate-200 font-bold">&bull; Real-time status:</div>
                      <p>Synchronize and inspect logs using the live filter toggles in the table toolbar (errors, methods, query payloads).</p>
                      
                      <div className="text-slate-200 font-bold pt-2.5">&bull; Detailed Drawer & Tabs:</div>
                      <p>The inspection drawer provides a robust tabbed panel with raw & formatted views of HTTP Headers, URL query parameter key-values, Request payloads, and final raw captured Response bodies.</p>
                      
                      <div className="text-slate-200 font-bold pt-2.5">&bull; Request Sources:</div>
                      <p>Check the "Source" column to easily distinguish between packets captured within the <strong>Sandbox reverse-proxy local frame</strong> and those forwarded live via the <strong>Tampermonkey Userscript</strong> extension.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <footer className="px-6 py-3.5 border-t border-slate-800 bg-[#0c101b] flex items-center justify-between shrink-0 text-[10px] font-mono text-slate-500">
              <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-blue-500" /> ProxyDev Security Sandbox</span>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-sans">
                <span>Developed by</span>
                <a
                  href="https://github.com/FAYSAL-Q8"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 font-semibold underline decoration-blue-500/40 hover:decoration-blue-400 transition-colors"
                >
                  FA
                </a>
              </div>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
