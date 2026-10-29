import React, { useState, useMemo, useEffect } from 'react';
import { InterceptedRequest } from '../types';
import { Search, Loader2, Trash2, ShieldAlert, ArrowUpDown, Filter, HelpCircle, RefreshCw, SkipBack, SkipForward, Globe, Eye } from 'lucide-react';

interface NetworkLogTableProps {
  logs: InterceptedRequest[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
  onRefresh?: () => void;
  seenIds?: string[];
  onAddDefinition?: (log: InterceptedRequest) => void;
}

type TabType = 'ALL' | 'API' | 'PURE' | 'PAYLOAD';

export function getFormattedTime(timestampStr: string) {
  const d = new Date(timestampStr);
  if (isNaN(d.getTime())) return { date: 'N/A', time: 'Invalid' };
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return {
    date: `${dd}-${mm}-${yyyy}`,
    time: `${hh}:${min}:${ss}`
  };
}

function renderBodyContent(bodyString: string | null) {
  if (!bodyString) {
    return <span className="text-slate-500 italic block py-1 font-mono text-[9px]">Empty Body</span>;
  }
  
  try {
    const parsed = JSON.parse(bodyString);
    return (
      <pre className="text-emerald-400 text-[10px] font-mono whitespace-pre-wrap overflow-y-auto bg-[#0a0d14] rounded border border-slate-800 p-2 max-h-[140px] scrollbar-thin select-all leading-relaxed">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch (e) {
    return (
      <pre className="text-slate-305 text-[10px] font-mono whitespace-pre-wrap overflow-y-auto bg-[#0a0d14] rounded border border-slate-800 p-2 max-h-[140px] scrollbar-thin select-all leading-relaxed">
        {bodyString}
      </pre>
    );
  }
}

export default function NetworkLogTable({ logs, selectedId, onSelect, onClear, onRefresh, seenIds = [], onAddDefinition }: NetworkLogTableProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'timestamp' | 'durationMs' | 'status' | 'domain'>('timestamp');
  const [sortAsc, setSortAsc] = useState(false);

  // Detailed log visibility stream approaches Mode
  const [detailedMode, setDetailedMode] = useState<boolean>(false);
  const [globalApproach, setGlobalApproach] = useState<'REQUEST' | 'RESPONSE'>('REQUEST');
  const [packetApproaches, setPacketApproaches] = useState<Record<string, 'REQUEST' | 'RESPONSE'>>({});

  // Epoch/Stream playbacks filter state
  const [epochs, setEpochs] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [showResponsePreview, setShowResponsePreview] = useState<boolean>(false);

  // 1. Get logs in the active stream epoch (Forward cutoff filtering)
  const logsInEpoch = useMemo(() => {
    if (epochs.length === 0) return logs;
    const lastCutoff = epochs[epochs.length - 1];
    const cutoffTime = new Date(lastCutoff).getTime();
    return logs.filter(log => new Date(log.timestamp).getTime() > cutoffTime);
  }, [logs, epochs]);

  // 2. Count distinct domains of matching items inside the visible epoch
  const domainCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    logsInEpoch.forEach(log => {
      const d = log.domain || 'unknown';
      counts[d] = (counts[d] || 0) + 1;
    });
    return counts;
  }, [logsInEpoch]);

  // Reset selectedDomain if no longer in visible counts (e.g. after clear or switching epochs)
  useEffect(() => {
    if (selectedDomain && !Object.keys(domainCounts).includes(selectedDomain)) {
      setSelectedDomain(null);
    }
  }, [domainCounts, selectedDomain]);

  // Handle epoch changes
  const handleForward = () => {
    // Forward hides all current traffic and waits for new traffic
    const now = new Date().toISOString();
    setEpochs(prev => [...prev, now]);
    setSelectedDomain(null);
  };

  const handleBack = () => {
    // Back returns to the last batch list
    setEpochs(prev => prev.slice(0, -1));
    setSelectedDomain(null);
  };

  const handleShowAll = () => {
    // Show All clears cutoff array
    setEpochs([]);
    setSelectedDomain(null);
  };

  // 3. Complete filter pipeline (Tabs + Search + Selected Domain + Sorting)
  const filteredLogs = useMemo(() => {
    let result = [...logsInEpoch];

    // Filter by Domain
    if (selectedDomain) {
      result = result.filter(log => log.domain === selectedDomain);
    }

    // Apply Search
    if (searchTerm.trim() !== '') {
      const query = searchTerm.toLowerCase();
      result = result.filter(log => {
        // Basic match in top-level fields
        const basicMatch = 
          log.url.toLowerCase().includes(query) || 
          log.method.toLowerCase().includes(query) ||
          (log.domain && log.domain.toLowerCase().includes(query)) ||
          (log.contentType && log.contentType.toLowerCase().includes(query));
        
        if (basicMatch) return true;

        // Check request body
        if (log.requestBody && log.requestBody.toLowerCase().includes(query)) return true;

        // Check response body
        if (log.responseBody && log.responseBody.toLowerCase().includes(query)) return true;

        // Check request headers (keys and values)
        const reqHeaderMatch = Object.entries(log.requestHeaders).some(([key, val]) => 
          key.toLowerCase().includes(query) || 
          (val && String(val).toLowerCase().includes(query))
        );
        if (reqHeaderMatch) return true;

        // Check response headers (keys and values)
        const resHeaderMatch = Object.entries(log.responseHeaders || {}).some(([key, val]) => 
          key.toLowerCase().includes(query) || 
          (val && String(val).toLowerCase().includes(query))
        );
        if (resHeaderMatch) return true;

        // Check query params specifically (keys and values)
        const queryMatch = Object.entries(log.queryParams || {}).some(([key, val]) => 
          key.toLowerCase().includes(query) || 
          (val && String(val).toLowerCase().includes(query))
        );
        
        return queryMatch;
      });
    }

    // Apply Tab category filter
    if (activeTab === 'API') {
      result = result.filter(log => {
        const ct = log.contentType ? log.contentType.toLowerCase() : '';
        const isJsonOrXml = ct.includes('json') || ct.includes('xml') || ct.includes('javascript');
        const hasSecFetch = Object.keys(log.requestHeaders).some(h => h.toLowerCase().includes('sec-fetch') || h.toLowerCase() === 'x-requested-with');
        return isJsonOrXml || hasSecFetch;
      });
    } else if (activeTab === 'PURE') {
      // Pure: no parameters and no request body
      result = result.filter(log => {
        const hasParams = Object.keys(log.queryParams || {}).length > 0;
        const hasBody = !!log.requestBody && log.requestBody.trim().length > 0;
        return !hasParams && !hasBody;
      });
    } else if (activeTab === 'PAYLOAD') {
      // Payload: has query parameter OR has request body
      result = result.filter(log => {
        const hasParams = Object.keys(log.queryParams || {}).length > 0;
        const hasBody = !!log.requestBody && log.requestBody.trim().length > 0;
        return hasParams || hasBody;
      });
    }

    // Sort logs
    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'timestamp') {
        valA = new Date(a.timestamp).getTime();
        valB = new Date(b.timestamp).getTime();
      }

      if (sortField === 'domain') {
        valA = (a.domain || '').toLowerCase();
        valB = (b.domain || '').toLowerCase();
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [logsInEpoch, activeTab, searchTerm, sortField, sortAsc, selectedDomain]);

  const toggleSort = (field: 'timestamp' | 'durationMs' | 'status' | 'domain') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default desc for date/time, asc for status etc.
    }
  };

  const getStatusBadgeClass = (status: number) => {
    if (status >= 200 && status < 300) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (status >= 300 && status < 400) return 'text-sky-450 bg-sky-500/10 border-sky-500/20';
    if (status >= 400 && status < 500) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  };

  const getMethodBadgeClass = (method: string) => {
    switch (method.toUpperCase()) {
      case 'GET': return 'text-emerald-400 bg-emerald-950/40 border border-emerald-800/60';
      case 'POST': return 'text-blue-400 bg-blue-950/40 border border-blue-800/60';
      case 'PUT': return 'text-amber-450 bg-amber-950/40 border border-amber-800/60';
      case 'DELETE': return 'text-rose-400 bg-rose-950/40 border border-rose-800/60';
      default: return 'text-slate-400 bg-slate-950/40 border border-slate-800/60';
    }
  };

  return (
    <div id="network-panel-container" className="flex flex-col h-full bg-[#1e293b] border border-slate-700/90 rounded-xl overflow-hidden shadow-2xl">
      {/* DevTools Toolbar Headers */}
      <div className="bg-[#0f172a] border-b border-slate-700/60 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"></div>
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-300 font-mono">
            Traffic Stream Logger
          </span>
          <span className="text-[9px] text-slate-400 bg-slate-950/40 px-2 py-0.5 rounded border border-slate-705/10 font-mono">
            {logs.length} logged
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              id="refresh-logs-btn"
              onClick={onRefresh}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded border border-slate-700/60 hover:border-blue-900/40 transition-all font-mono active:scale-95 cursor-pointer"
              title="Force fetch logs from backend manually"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Force Refresh</span>
            </button>
          )}
          <button
            id="clear-logs-btn"
            onClick={onClear}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded border border-slate-700/60 hover:border-rose-900/40 transition-all font-mono active:scale-95 cursor-pointer"
            title="Clear all proxy log cache"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      {/* EPOCH STREAM PLAYBACK CONTROLS DECK */}
      <div className="bg-[#0b0f19] border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
          <span className="text-xs text-slate-300 font-bold">
            {epochs.length === 0 ? (
              <span className="text-slate-400">Stream Epoch: <span className="text-emerald-400">All Captured</span></span>
            ) : (
              <span className="text-blue-400">Stream Epoch: <span className="text-amber-450 font-extrabold">Batch #{epochs.length + 1}</span></span>
            )}
          </span>
          {epochs.length > 0 && (
            <span className="text-[10px] text-slate-500 bg-slate-900/80 border border-slate-800 px-1.5 py-0.2 rounded">
              {logs.length - logsInEpoch.length} packets filtered in history
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Back button */}
          <button
            onClick={handleBack}
            disabled={epochs.length === 0}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded border transition-all active:scale-95 cursor-pointer ${
              epochs.length === 0
                ? 'opacity-40 bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                : 'bg-slate-900 text-amber-500 border-amber-500/30 hover:border-amber-400 hover:bg-amber-500/10'
            }`}
            title="Return to the last hidden batch of traffic"
          >
            <SkipBack className="w-3 h-3" />
            <span>Back (Last Batch)</span>
          </button>

          {/* Show All / Reset button */}
          <button
            onClick={handleShowAll}
            disabled={epochs.length === 0}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded border transition-all active:scale-95 cursor-pointer ${
              epochs.length === 0
                ? 'bg-slate-950/70 text-slate-500 border-slate-800/40'
                : 'bg-slate-900 text-blue-400 border-blue-500/30 hover:border-blue-400 hover:bg-blue-500/10'
            }`}
            title="Show all traffic from the start of the session"
          >
            <Eye className="w-3 h-3" />
            <span>Show All Time</span>
          </button>

          <button
            onClick={() => setShowResponsePreview(!showResponsePreview)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded border transition-all active:scale-95 cursor-pointer ${
              showResponsePreview 
                ? 'bg-purple-600/20 text-purple-400 border-purple-500/40 font-bold shadow-[0_0_8px_rgba(168,85,247,0.2)]' 
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Display live response body snippets directly in the traffic flow rows"
          >
            <Eye className="w-3 h-3" />
            <span>{showResponsePreview ? 'Hide Resp body' : 'Show Resp body'}</span>
          </button>

          {/* Forward button */}
          <button
            onClick={handleForward}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-400 bg-slate-900 border border-emerald-500/30 hover:border-emerald-450 hover:bg-emerald-500/10 rounded transition-all active:scale-95 cursor-pointer"
            title="Hide all current traffic on screen and wait for incoming future packets"
          >
            <span>Forward</span>
            <SkipForward className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* SEARCH AND TABS ABOVE LOGGER */}
      <div className="bg-[#1e293b] p-3 border-b border-slate-700/60 flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <input
            id="network-search-input"
            type="text"
            className="block w-full pl-9 pr-4 py-1.5 bg-[#0f172a] border border-slate-650 rounded text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            placeholder="Search in URL, headers, body, or domain..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Tab triggers */}
        <div className="flex select-none border-b border-slate-700/60 pb-0.5 overflow-x-auto text-[11px] font-mono scrollbar-none">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1.5 border-b-2 font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'ALL'
                ? 'border-blue-500 text-blue-400 bg-slate-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>All Traffic</span>
            <span className="text-[9px] bg-slate-950/60 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">{logs.length}</span>
          </button>
          <button
            onClick={() => setActiveTab('API')}
            className={`px-3 py-1.5 border-b-2 font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'API'
                ? 'border-blue-500 text-blue-400 bg-slate-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>API / XHR</span>
            <span className="text-[9px] bg-slate-950/60 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 font-mono">
              {logs.filter(l => (l.contentType || '').includes('json') || (l.contentType || '').includes('xml')).length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('PURE')}
            className={`px-3 py-1.5 border-b-2 font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'PURE'
                ? 'border-blue-500 text-blue-400 bg-slate-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
            title="Pure GET calls without parameters & bodies"
          >
            <span>No Params/Body</span>
            <span className="text-[9px] bg-slate-950/60 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">
              {logs.filter(l => Object.keys(l.queryParams || {}).length === 0 && (!l.requestBody || l.requestBody.trim().length === 0)).length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('PAYLOAD')}
            className={`px-3 py-1.5 border-b-2 font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'PAYLOAD'
                ? 'border-blue-500 text-blue-400 bg-slate-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Has Payload</span>
            <span className="text-[9px] bg-slate-950/60 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">
              {logs.filter(l => Object.keys(l.queryParams || {}).length > 0 || (l.requestBody && l.requestBody.trim().length > 0)).length}
            </span>
          </button>
        </div>

        {/* Dynamic Domain Filters List */}
        <div className="flex items-center gap-2 text-xs font-mono select-none overflow-x-auto pb-1 shrink-0 scrollbar-thin">
          <span className="text-[10px] text-slate-400 uppercase font-bold shrink-0 flex items-center gap-1">
            <Globe className="w-3 h-3 text-blue-400" />
            Domains:
          </span>
          <button
            onClick={() => setSelectedDomain(null)}
            className={`px-2 py-1 rounded text-[10px] whitespace-nowrap transition-all border cursor-pointer ${
              selectedDomain === null
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-bold shadow-[0_0_8px_rgba(59,130,246,0.15)]'
                : 'bg-[#0f172a] hover:bg-slate-950 border-slate-700/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            All Domains ({logsInEpoch.length})
          </button>
          {Object.entries(domainCounts).map(([dom, count]) => (
            <button
              key={dom}
              onClick={() => setSelectedDomain(dom)}
              className={`px-2 py-1 rounded text-[10px] whitespace-nowrap transition-all border cursor-pointer flex items-center gap-1.5 ${
                selectedDomain === dom
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-bold shadow-[0_0_8px_rgba(59,130,246,0.15)] bg-slate-950'
                  : 'bg-[#0f172a] hover:bg-slate-950 border-slate-700/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{dom}</span>
              <span className="text-[8px] px-1 bg-slate-950/80 border border-slate-800 rounded text-slate-400 font-extrabold">{count}</span>
            </button>
          ))}
        </div>

        {/* Detailed Mode Panel */}
        <div id="detailed-mode-controls" className="flex flex-wrap items-center justify-between gap-2.5 p-2 bg-[#0b0f19]/70 border border-slate-800 rounded-lg mt-0.5">
          <div className="flex items-center gap-1.5 pl-1">
            <span className={`h-1.5 w-1.5 rounded-full ${detailedMode ? 'bg-blue-400' : 'bg-slate-600'}`}></span>
            <span className="text-[10px] uppercase font-extrabold text-slate-300 font-mono tracking-wider">
              Detailed Stream Mode
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              id="det-mode-req-btn"
              onClick={() => {
                if (detailedMode && globalApproach === 'REQUEST') {
                  setDetailedMode(false);
                } else {
                  setDetailedMode(true);
                  setGlobalApproach('REQUEST');
                }
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-extrabold border transition-all cursor-pointer active:scale-95 flex items-center gap-1 ${
                detailedMode && globalApproach === 'REQUEST'
                  ? 'bg-blue-600/25 text-blue-400 border-blue-500/50'
                  : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
              }`}
              title="Show: Request URL + Body of request"
            >
              Request Details
            </button>
            <button
              id="det-mode-res-btn"
              onClick={() => {
                if (detailedMode && globalApproach === 'RESPONSE') {
                  setDetailedMode(false);
                } else {
                  setDetailedMode(true);
                  setGlobalApproach('RESPONSE');
                }
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-extrabold border transition-all cursor-pointer active:scale-95 flex items-center gap-1 ${
                detailedMode && globalApproach === 'RESPONSE'
                  ? 'bg-emerald-600/25 text-emerald-400 border-emerald-500/50'
                  : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
              }`}
              title="Show: Response Body only"
            >
              Response Body
            </button>
          </div>
        </div>
      </div>

      {/* TABLE CONTENTS */}
      <div className="flex-1 overflow-auto bg-[#0f172a]">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500 font-mono">
            <Filter className="w-8 h-8 opacity-40 mb-2" />
            <p className="text-xs">No matching network logs found.</p>
            {logs.length === 0 && (
              <p className="text-[10px] text-slate-600 mt-1 max-w-[240px] text-center">
                Ready to intercept request traffic streams.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead className="sticky top-0 bg-[#1e293b] border-b border-slate-700/60 py-2 text-slate-300 select-none z-10 text-[10px]">
              <tr>
                <th 
                  onClick={() => toggleSort('timestamp')}
                  className="pl-4 pr-2 py-2 cursor-pointer hover:bg-slate-850 transition-colors uppercase font-bold"
                >
                  <div className="flex items-center gap-1">
                    Time <ArrowUpDown className="w-2.5 h-2.5 text-slate-500" />
                  </div>
                </th>
                <th className="px-2 py-2 uppercase font-bold">Source</th>
                <th className="px-2 py-2 uppercase font-bold">Method</th>
                <th 
                  onClick={() => toggleSort('domain')}
                  className="px-2 py-2 cursor-pointer hover:bg-slate-850 transition-colors uppercase min-w-[120px] font-bold"
                >
                  <div className="flex items-center gap-1">
                    Domain / Path <ArrowUpDown className="w-2.5 h-2.5 text-slate-500" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort('status')}
                  className="px-2 py-2 cursor-pointer hover:bg-slate-850 transition-colors uppercase font-bold"
                >
                  <div className="flex items-center gap-1">
                    Status <ArrowUpDown className="w-2.5 h-2.5 text-slate-500" />
                  </div>
                </th>
                <th className="px-2 py-2 uppercase font-bold">Type</th>
                <th 
                  onClick={() => toggleSort('durationMs')}
                  className="px-2 py-2 cursor-pointer hover:bg-slate-850 transition-colors uppercase text-right font-bold"
                >
                  <div className="flex items-center justify-end gap-1">
                    Latency <ArrowUpDown className="w-2.5 h-2.5 text-slate-500" />
                  </div>
                </th>
                <th className="px-3 py-2 pr-4 uppercase text-right font-bold text-slate-500 font-sans">Mapping</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
               {filteredLogs.map((log) => {
                const isSelected = selectedId === log.id;
                const isSeen = seenIds.includes(log.id);
                const pathParts = log.path.split('/');
                const displayPath = pathParts[pathParts.length - 1] || log.path;
                const { date, time } = getFormattedTime(log.timestamp);
                const isExtension = log.id.startsWith('ext_');
                
                const rowSpecificClass = isSelected
                  ? 'bg-blue-950/50 text-blue-200 border-l border-l-blue-500'
                  : isSeen
                  ? 'opacity-60 text-slate-450'
                  : 'text-slate-200';

                const packetApproach = packetApproaches[log.id] || globalApproach;

                return (
                  <React.Fragment key={log.id}>
                    <tr
                      onClick={() => onSelect(log.id)}
                      className={`hover:bg-[#1e293b]/45 cursor-pointer transition-colors border-b border-slate-800/20 ${rowSpecificClass}`}
                    >
                      {/* Timestamp */}
                      <td className="pl-4 pr-2 py-1.5 text-[10px] max-w-[95px] select-all font-mono" title={`${date} ${time}`}>
                        <div className="font-semibold text-slate-400 leading-none mb-0.5">{time}</div>
                        <div className="text-[8.5px] text-slate-500/80 tracking-tight leading-none">{date}</div>
                      </td>

                      {/* Source badge */}
                      <td className="px-2 py-1.5 flex items-center gap-1.5">
                        {isExtension ? (
                          <span className="px-1 py-0.5 text-[8px] uppercase tracking-wider font-extrabold bg-blue-500/15 text-blue-400 border border-blue-500/35 rounded-md shadow-[0_0_6px_rgba(59,130,246,0.15)]">
                            Ext
                          </span>
                        ) : (
                          <span className="px-1 py-0.5 text-[8px] uppercase tracking-wider font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 rounded-md shadow-[0_0_6px_rgba(16,185,129,0.15)]">
                            Proxy
                          </span>
                        )}
                        {log.requestType === 'REPLAY' && (
                          <span className="px-1 py-0.5 text-[8px] uppercase font-extrabold bg-blue-500/15 text-blue-400 border border-blue-500/35 rounded-md" title="Replayed Request">
                            REP
                          </span>
                        )}
                        {(log.requestType === 'MODIFIED' || log.isModified) && (
                          <span className="px-1 py-0.5 text-[8px] uppercase font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/35 rounded-md" title="User Modified">
                            MOD
                          </span>
                        )}
                      </td>
                      
                      {/* Method */}
                      <td className="px-2 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getMethodBadgeClass(log.method)}`}>
                          {log.method}
                        </span>
                      </td>

                      {/* Domain & Absolute Shortened URL */}
                      <td className="px-2 py-1.5 truncate max-w-[180px]" title={log.url}>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500 text-[10px]">{log.domain}</span>
                            <span className="text-slate-200 font-medium">
                              {displayPath || '/'}
                            </span>
                          </div>
                          {showResponsePreview && log.responseBody && (
                            <div className="text-[9px] text-purple-400 mt-1 truncate max-w-[250px] font-mono italic opacity-90 border-l border-purple-500/30 pl-2">
                              {log.responseBody.substring(0, 100)}{log.responseBody.length > 100 ? '...' : ''}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status Code */}
                      <td className="px-2 py-1.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getStatusBadgeClass(log.status)}`}>
                          {log.status === 0 ? 'FAIL' : log.status}
                        </span>
                      </td>

                      {/* Content-Type Short */}
                      <td className="px-2 py-1.5 text-[10px] text-slate-400 truncate max-w-[100px]">
                        {(log.contentType || 'text/plain').split(';')[0]}
                      </td>

                      {/* Duration / Latency */}
                      <td className="px-2 py-1.5 text-right text-[10px] text-slate-400 font-medium">
                        {log.durationMs}ms
                      </td>

                      {/* Mappings Specs mapper */}
                      <td className="px-3 py-1.5 pr-4 text-right">
                        {onAddDefinition && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddDefinition(log);
                            }}
                            className="px-2 py-0.5 rounded bg-blue-600/10 hover:bg-blue-600/25 border border-blue-500/20 text-[10px] font-extrabold text-blue-400 hover:text-blue-300 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                            title="Name & describe parameters for this traffic (TAnalysis)"
                          >
                            + Action Specs
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Detailed expanded panel approach view */}
                    {detailedMode && (
                      <tr key={`${log.id}-detail`} className="bg-[#0b0f19]/35 hover:bg-[#0c101c]/45 transition-colors">
                        <td colSpan={8} className="px-4 py-2.5 bg-slate-950/25 border-b border-slate-850/50">
                          <div className="bg-[#101726]/80 rounded-lg p-3.5 border border-slate-800/60 shadow-inner flex flex-col gap-3 font-mono">
                            <div className="flex items-center justify-between text-[10px] pb-1.5 border-b border-slate-800/30 gap-4">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-slate-400 uppercase font-bold text-[8.5px] tracking-wider shrink-0 bg-slate-950/40 px-1.5 py-0.5 rounded border border-slate-805/40">Stream Detail:</span>
                                <span className="text-slate-350 font-bold bg-[#0f172a] px-2 py-0.5 rounded border border-slate-800 truncate" title={log.url}>
                                  {log.method} {log.url}
                                </span>
                              </div>
                              
                              {/* Toggle approaches directly for this exact traffic immediately */}
                              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800 shrink-0 select-none">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPacketApproaches(prev => ({ ...prev, [log.id]: 'REQUEST' }));
                                  }}
                                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                                    packetApproach === 'REQUEST'
                                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                                      : 'text-slate-500 bg-transparent border border-transparent hover:text-slate-300'
                                  }`}
                                  title="Format: Request URL & requestBody"
                                >
                                  Approach A: Request
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPacketApproaches(prev => ({ ...prev, [log.id]: 'RESPONSE' }));
                                  }}
                                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                                    packetApproach === 'RESPONSE'
                                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 font-semibold'
                                      : 'text-slate-500 bg-transparent border border-transparent hover:text-slate-300'
                                  }`}
                                  title="Format: responseBody Only"
                                >
                                  Approach B: Response
                                </button>
                              </div>
                            </div>

                            {packetApproach === 'REQUEST' ? (
                              <div className="space-y-2">
                                <div>
                                  <span className="text-slate-400 text-[9px] uppercase font-bold block mb-1">Request URL</span>
                                  <div className="text-blue-400 text-[10.5px] font-mono bg-[#070b12] rounded p-2 border border-slate-800 max-h-[70px] overflow-x-auto whitespace-nowrap scrollbar-thin select-all leading-relaxed">
                                    {log.url}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-slate-400 text-[9px] uppercase font-bold block mb-1">Body of Request (Payload)</span>
                                  {renderBodyContent(log.requestBody)}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span className="text-slate-400 text-[9px] uppercase font-bold block mb-1">Response Body only</span>
                                {renderBodyContent(log.responseBody)}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
