/**
 * Author: Faysal Alibrahim
 * GitHub: https://github.com/FAYSAL-Q8
 */

import React, { useState, useEffect, useRef } from 'react';
import { InterceptedRequest, ReplayRequest, SavedSession } from './types';
import TargetViewport from './components/TargetViewport';
import NetworkLogTable from './components/NetworkLogTable';
import RequestDetailDrawer from './components/RequestDetailDrawer';
import ManipulationWorkspace from './components/ManipulationWorkspace';
import ExtensionInformer from './components/ExtensionInformer';
import HelpDialog from './components/HelpDialog';
import TAnalysisModal from './components/TAnalysisModal';
import TAnalysisPanel from './components/TAnalysisPanel';
import SavedSessionsDrawer from './components/SavedSessionsDrawer';
import { Network, Terminal, Settings, Play, Radio, Wifi, ShieldCheck, Cpu, Code, HelpCircle, Layers, FolderOpen } from 'lucide-react';

export default function App() {
  const [activeMode, setActiveMode] = useState<'PROXY' | 'REPLAY' | 'EXTENSION' | 'T_ANALYSIS'>('PROXY');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  
  // Historical Session Override states
  const [activeSession, setActiveSession] = useState<SavedSession | null>(null);
  const [isSessionDrawerOpen, setIsSessionDrawerOpen] = useState(false);

  // TAnalysis parameter definitions modal states
  const [isTAnalysisModalOpen, setIsTAnalysisModalOpen] = useState(false);
  const [analysisTargetLog, setAnalysisTargetLog] = useState<InterceptedRequest | null>(null);

  // Traffic states
  const [logs, setLogs] = useState<InterceptedRequest[]>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seenIds, setSeenIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('proxydev_seen_ids');
      return stored ? JSON.parse(stored) : [];
    } catch(e) {
      return [];
    }
  });

  const handleSelectLog = (id: string) => {
    setSelectedId(id);
    if (!seenIds.includes(id)) {
      const updated = [...seenIds, id];
      setSeenIds(updated);
      try {
        localStorage.setItem('proxydev_seen_ids', JSON.stringify(updated));
      } catch(e) {}
    }
  };
  
  // Browsing state
  const [currentUrl, setCurrentUrl] = useState<string>('');

  // Replay Prefill state
  const [prefillRequest, setPrefillRequest] = useState<ReplayRequest | null>(null);

  // WebSocket / Sync States
  const [wsStatus, setWsStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED');
  const wsRef = useRef<WebSocket | null>(null);

  // Initialize and load Logs backlog via standard fetch, then open real-time WebSocket
  const fetchBacklog = async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to sync history log backlog:', err);
    }
  };

  useEffect(() => {
    // 1. Fetch historical backlog
    fetchBacklog();

    // 2. Open WebSocket
    const connectWs = () => {
      setWsStatus('CONNECTING');
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socketUrl = `${protocol}//${window.location.host}`;
      const ws = new WebSocket(socketUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('CONNECTED');
        console.log('[App.tsx] WebSocket proxy connection initialized.');
      };

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          const { type, data } = raw;

          if (type === 'INIT_HISTORY') {
            setLogs(data);
          } else if (type === 'NEW_REQUEST') {
            setLogs((prev) => {
              // Deduplicate or insert
              const exists = prev?.some((item) => item.id === data.id);
              if (exists) return prev;
              return [data, ...(prev || [])];
            });
          } else if (type === 'CLEAR_HISTORY') {
            setLogs([]);
            setSelectedId(null);
          }
        } catch (e) {
          console.error('Failed to parse socket payload:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('[App.tsx] WebSocket error occurred:', err);
        setWsStatus('DISCONNECTED');
      };

      ws.onclose = () => {
        setWsStatus('DISCONNECTED');
        console.log('[App.tsx] WebSocket session closed. Reconnecting in 3 seconds...');
        setTimeout(connectWs, 3000); // Auto reconnect loop
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleNavigate = (url: string) => {
    setCurrentUrl(url);
    // Clear selected logs on browsing new pages so pane states matches
    setSelectedId(null);
  };

  const handleClearHistory = async () => {
    try {
      await fetch('/api/clear', { method: 'POST' });
    } catch (err) {
      console.error('Failed clear requests:', err);
    }
  };

  // Click on Modify and Replay in Drawer
  const handleModifyAndReplay = (request: InterceptedRequest) => {
    // Build prefill representation
    setPrefillRequest({
      method: request.method,
      url: request.url,
      headers: request.requestHeaders,
      body: request.requestBody || '',
    });
    // Toggle tab mode to Replay editor workspace
    setActiveMode('REPLAY');
  };

  const displayedLogs = activeSession ? activeSession.logs : (logs || []);
  const selectedLog = displayedLogs.find((log) => log.id === selectedId) || null;

  return (
    <div id="developer-proxy-app" className="min-h-screen bg-[#0f172a] text-slate-300 flex flex-col antialiased">
      {/* Historical snapped frozen warnings bar */}
      {activeSession && (
        <div className="bg-amber-950/40 border-b border-amber-800/40 text-amber-350 py-2.5 px-6 flex justify-between items-center text-xs font-mono select-none">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Viewing snapshotted historic dataset: <strong className="text-amber-200">"{activeSession.name}"</strong> ({activeSession.logs.length} logged endpoints)
          </span>
          <button 
            onClick={() => setActiveSession(null)}
            className="bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-500/30 px-2.5 py-1 rounded transition-all text-[10px] font-extrabold cursor-pointer active:scale-95"
          >
            Switch to live Stream WebSocket Sync &larr;
          </button>
        </div>
      )}

      {/* Dynamic Navigation Top-Bar with Professional Polish styling */}
      <header className="h-16 border-b border-slate-700/75 bg-[#1e293b] flex items-center px-6 justify-between shrink-0 sticky top-0 z-40">
        
        {/* Title area */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-lg shadow-blue-900/40">P</div>
          <div>
            <span className="font-semibold text-slate-100 tracking-tight text-sm">ProxyDev <span className="text-blue-400 font-mono">v2.6</span></span>
            <p className="text-[10px] text-slate-400 hidden md:block">Real-time HTTP Proxy & Manipulator</p>
          </div>
        </div>

        {/* Dynamic target link inside address system matching layout */}
        <div className="flex-1 max-w-xl mx-6 hidden lg:block">
          <div className="flex items-center bg-[#0f172a] rounded-md border border-slate-700/90 px-3 py-1.5 gap-2.5">
            <span className="text-slate-500 text-[10px] font-mono uppercase font-bold tracking-wider shrink-0">Target Origin</span>
            <div className="text-xs text-blue-400 font-mono truncate select-all flex-1" title={currentUrl}>
              {currentUrl}
            </div>
            <div className="flex gap-1.5 items-center shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"></span>
              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Intercepting</span>
            </div>
          </div>
        </div>

        {/* Sync status identifier & View Modes toggler */}
        <div className="flex items-center gap-3.5">
          {/* WS state badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/40 rounded border border-slate-700/60">
            <Radio className={`w-3 h-3 ${wsStatus === 'CONNECTED' ? 'text-emerald-450' : 'text-rose-400'}`} />
            <span className="text-[9px] font-mono font-bold text-slate-400">
              WS: <span className={wsStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-slate-500'}>{wsStatus}</span>
            </span>
          </div>

          {/* Mode Switchers */}
          <div className="bg-[#0f172a] p-1 rounded border border-slate-700/80 flex gap-0.5 text-xs font-mono">
            <button
              id="mode-select-proxy"
              onClick={() => setActiveMode('PROXY')}
              className={`px-3 py-1 rounded font-medium transition-all cursor-pointer ${
                activeMode === 'PROXY'
                  ? 'bg-blue-600 text-white shadow shadow-blue-650'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Proxy Live Frame
            </button>
            <button
              id="mode-select-replay"
              onClick={() => setActiveMode('REPLAY')}
              className={`px-3 py-1 rounded font-medium transition-all cursor-pointer ${
                activeMode === 'REPLAY'
                  ? 'bg-blue-600 text-white shadow shadow-blue-650'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tamper Tool
            </button>
            <button
              id="mode-select-extension"
              onClick={() => setActiveMode('EXTENSION')}
              className={`px-3 py-1 rounded font-medium transition-all cursor-pointer ${
                activeMode === 'EXTENSION'
                  ? 'bg-blue-600 text-white shadow shadow-blue-650'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tampermonkey Script
            </button>
            <button
              id="mode-select-tanalysis"
              onClick={() => setActiveMode('T_ANALYSIS')}
              className={`px-3 py-1 rounded font-medium transition-all cursor-pointer flex items-center gap-1 ${
                activeMode === 'T_ANALYSIS'
                  ? 'bg-blue-600 text-white shadow shadow-blue-650'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>TAnalysis Spec</span>
            </button>
          </div>
        </div>
      </header>

      {/* Primary Workspace Panels */}
      <main className="flex-1 p-5 overflow-hidden w-full mx-auto flex flex-col justify-stretch">
        {/* PROXY MODE: Left Viewport, Right logger with bottom details inspector */}
        <div 
          id="proxy-workspace-panel" 
          className={`grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-[700px] ${
            activeMode === 'PROXY' ? '' : 'hidden'
          }`}
        >
          {/* Viewport display browser */}
          <div className="lg:col-span-6 flex flex-col h-full">
            <TargetViewport currentUrl={currentUrl} onNavigate={handleNavigate} />
          </div>

          {/* DevTools Pane */}
          <div className="lg:col-span-6 flex flex-col h-full gap-5">
            
            {/* DevTools table list container */}
            <div className="flex-1">
              <NetworkLogTable
                logs={displayedLogs}
                selectedId={selectedId}
                onSelect={handleSelectLog}
                onClear={handleClearHistory}
                onRefresh={fetchBacklog}
                seenIds={seenIds}
                onAddDefinition={(log) => {
                  setAnalysisTargetLog(log);
                  setIsTAnalysisModalOpen(true);
                }}
              />
            </div>

            {/* DevTools bottom details sheet */}
            <div className="h-[360px] shrink-0">
              {selectedLog ? (
                <RequestDetailDrawer
                  request={selectedLog}
                  onClose={() => setSelectedId(null)}
                  onModifyAndReplay={handleModifyAndReplay}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 bg-slate-900 border border-slate-800 rounded-xl h-full text-slate-500 text-center font-mono text-xs">
                  <Terminal className="w-6 h-6 opacity-30 mb-2" />
                  <p>Select any intercepted request from the table above</p>
                  <p className="text-[10px] text-slate-600 mt-1 max-w-[280px]">
                    Inspect request details, query parameters, payloads, and replay actions.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* REPLAY SCRATCHPAD MODE (Full Width layout) */}
        <div 
          id="replay-workspace-panel" 
          className={`bg-slate-950 h-full min-h-[600px] ${
            activeMode === 'REPLAY' ? '' : 'hidden'
          }`}
        >
          <div className="mb-4 bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between gap-4 font-mono">
            <div className="flex items-center gap-2">
              <Cpu className="text-emerald-450 w-4 h-4" />
              <span className="text-xs font-bold text-slate-300">
                Replay Scratchpad
              </span>
            </div>
            <button
              onClick={() => setActiveMode('PROXY')}
              className="text-[11px] text-blue-400 hover:underline cursor-pointer"
            >
              &larr; Back to Traffic Stream Sandbox
            </button>
          </div>
          <ManipulationWorkspace
            prefillRequest={prefillRequest}
            onSuccessReplay={() => console.log('Replayed successful!')}
          />
        </div>

        {/* EXTENSION USERSCRIPT INTEGRATION MODE */}
        <div
          id="extension-workspace-panel"
          className={`h-full overflow-y-auto ${activeMode === 'EXTENSION' ? '' : 'hidden'}`}
        >
          <ExtensionInformer logs={displayedLogs} onClearLogs={handleClearHistory} />
        </div>

        {/* T_ANALYSIS VIEW MODE */}
        <div
          id="tanalysis-workspace-panel"
          className={`h-full overflow-hidden ${activeMode === 'T_ANALYSIS' ? '' : 'hidden'}`}
        >
          <TAnalysisPanel 
            logs={displayedLogs} 
            onTriggerEditLog={(log) => {
              setAnalysisTargetLog(log);
              setIsTAnalysisModalOpen(true);
            }} 
          />
        </div>
      </main>

      {/* Small subtle footer credit with developer diagnostics, avoiding tech-larping logs */}
      <footer className="bg-slate-950 border-t border-slate-900/60 py-3 px-6 flex justify-between items-center text-[11px] font-mono text-slate-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-450" />
          <span>Active Tunnel Secure</span>
        </div>
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
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSessionDrawerOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600/15 hover:bg-blue-600/35 text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-500/20 active:scale-95 transition-all text-xs cursor-pointer font-bold font-sans"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Saved Sessions Manager</span>
          </button>
          <button
            onClick={() => setIsHelpOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600/15 hover:bg-blue-600/35 text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-500/20 active:scale-95 transition-all text-xs cursor-pointer font-bold font-sans"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Help Manual & Blueprints</span>
          </button>
        </div>
      </footer>

      {/* Manual Explanations Drawer/Dialog */}
      <HelpDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Saved Snapshot Repository Drawer slide overlay */}
      <SavedSessionsDrawer
        isOpen={isSessionDrawerOpen}
        onClose={() => setIsSessionDrawerOpen(false)}
        activeLogs={logs || []}
        activeSessionId={activeSession?.id || null}
        onSelectSession={(sess) => {
          setActiveSession(sess);
          setIsSessionDrawerOpen(false);
          if (sess) {
            setActiveMode('PROXY'); // Jump to viewer representation
          }
        }}
      />

      {/* Parameter Mapping specs Modal */}
      {isTAnalysisModalOpen && analysisTargetLog && (
        <TAnalysisModal
          isOpen={isTAnalysisModalOpen}
          onClose={() => {
            setIsTAnalysisModalOpen(false);
            setAnalysisTargetLog(null);
          }}
          request={analysisTargetLog}
          onSaved={() => {
            // Trigger load reloads
            if (activeMode === 'T_ANALYSIS') {
              window.dispatchEvent(new Event('tanalysis-defs-updated'));
            }
          }}
        />
      )}
    </div>
  );
}
