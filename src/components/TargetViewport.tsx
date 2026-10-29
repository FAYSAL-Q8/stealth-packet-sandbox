import React, { useState } from 'react';
import { Globe, ArrowRight, RotateCw, Play, ShieldAlert, MonitorCheck } from 'lucide-react';

interface TargetViewportProps {
  currentUrl: string;
  onNavigate: (url: string) => void;
}

export default function TargetViewport({ currentUrl, onNavigate }: TargetViewportProps) {
  const [inputUrl, setInputUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl) return;
    
    // Add protocol if missing
    let formatted = inputUrl.trim();
    if (!/^https?:\/\//i.test(formatted)) {
      formatted = 'https://' + formatted;
    }
    setInputUrl(formatted);
    onNavigate(formatted);
  };

  const loadPreset = (url: string) => {
    setInputUrl(url);
    onNavigate(url);
  };

  const runLocally = typeof window !== 'undefined' ? localStorage.getItem('RUN_EXTENSION_LOCALLY') === 'true' : false;
  const iframeSrc = currentUrl 
    ? `/api/proxy?url=${encodeURIComponent(currentUrl)}${runLocally ? '&local_interceptor=true' : ''}` 
    : '';

  return (
    <div id="target-viewport-container" className="flex flex-col h-full border border-slate-700/90 bg-[#1e293b] rounded-xl overflow-hidden shadow-2xl">
      {/* Browser Tab Header */}
      <div className="bg-[#0f172a] border-b border-slate-700/60 px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {/* Chrome style dots */}
          <div className="flex items-center gap-1.5 mr-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/85"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/85"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/85"></span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-medium bg-[#1e293b] px-3 py-1 rounded-t border-t border-x border-slate-700/80">
            <Globe className="w-3 h-3 text-blue-400" />
            <span className="truncate max-w-[150px] font-mono text-slate-200">{currentUrl ? new URL(currentUrl).hostname : 'Sandbox Inspector'}</span>
          </div>
        </div>
        
        <div className="text-[10px] text-slate-500 font-mono hidden sm:block">
          {currentUrl ? 'DYNAMIC PROXY TUNNEL ACTIVE' : 'Input target URL to request'}
        </div>
      </div>

      {/* Browser Address Bar */}
      <div className="bg-[#1e293b] px-4 py-3 border-b border-slate-700/60">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Globe className="h-4 w-4 text-slate-400" />
            </div>
            <input
              id="browser-address-input"
              type="text"
              className="block w-full pl-9 pr-24 py-1.5 bg-[#0f172a] border border-slate-650 rounded text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-500 font-mono"
              placeholder="e.g. https://jsonplaceholder.typicode.com/posts"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
            />
            {currentUrl && (
              <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-[9px] text-emerald-450 font-bold font-mono tracking-wider pointer-events-none">
                CORS BYPASSED
              </span>
            )}
          </div>
          <button
            id="browser-navigate-button"
            type="submit"
            className="px-3.5 py-1.5 bg-blue-650 hover:bg-blue-600 text-white rounded text-xs font-semibold flex items-center gap-1 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <span>Proxy Load</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

      </div>

      {/* Live Viewport Content */}
      <div id="browser-iframe-wrapper" className="flex-1 bg-slate-950 relative min-h-[400px]">
        {currentUrl ? (
          <iframe
            id="browser-target-iframe"
            src={iframeSrc}
            className="w-full h-full border-none bg-white text-slate-900"
            title="Target Browser Viewport"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-3 text-2xl">
              <MonitorCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xs font-semibold text-slate-200 mb-1">Proxy Viewport Sandbox</h3>
            <p className="text-[11px] max-w-sm text-slate-400 leading-relaxed mb-4">
              Enter any URL in the address bar above to browse and intercept HTTP network calls.
            </p>
            <div className="text-[10px] font-mono text-slate-400 bg-slate-900 px-3 py-1.5 rounded border border-slate-800 max-w-sm">
              <span className="text-blue-400">Auto-instrumentation active</span> for fetch & XHR.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
