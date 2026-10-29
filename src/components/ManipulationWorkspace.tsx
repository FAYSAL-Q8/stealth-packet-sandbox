import React, { useState, useEffect } from 'react';
import { ReplayRequest, ReplayResponse } from '../types';
import { Send, Plus, Trash2, Code, Zap, RefreshCw, Layers, Check, Copy } from 'lucide-react';

interface ManipulationWorkspaceProps {
  prefillRequest: ReplayRequest | null;
  onSuccessReplay?: (res: ReplayResponse) => void;
}

interface KeyValueHeader {
  id: string;
  key: string;
  value: string;
}

export default function ManipulationWorkspace({ prefillRequest, onSuccessReplay }: ManipulationWorkspaceProps) {
  const [method, setMethod] = useState<string>('GET');
  const [url, setUrl] = useState<string>('https://jsonplaceholder.typicode.com/posts');
  const [headerMode, setHeaderMode] = useState<'key-value' | 'json'>('key-value');
  const [headers, setHeaders] = useState<KeyValueHeader[]>([
    { id: '1', key: 'Content-Type', value: 'application/json' },
    { id: '2', key: 'Accept', value: 'application/json' },
  ]);
  const [rawHeadersJson, setRawHeadersJson] = useState<string>('{\n  "Content-Type": "application/json",\n  "Accept": "application/json"\n}');
  const [body, setBody] = useState<string>('{\n  "title": "foo",\n  "body": "bar",\n  "userId": 1\n}');
  
  // Replay outcome states
  const [replaying, setReplaying] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayResponse, setReplayResponse] = useState<ReplayResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Parallel Execution State
  const [parallelMultiplier, setParallelMultiplier] = useState<number>(1);
  const [parallelResults, setParallelResults] = useState<{status: number, duration: number}[]>([]);

  // If a prefill request is passed, populate variables
  useEffect(() => {
    if (prefillRequest) {
      setMethod(prefillRequest.method);
      setUrl(prefillRequest.url);
      
      const parsedHeaders = Object.entries(prefillRequest.headers || {}).map(([key, value], idx) => ({
        id: String(idx) + '-' + Math.random().toString(36).substring(2, 5),
        key,
        value,
      }));
      setHeaders(parsedHeaders.length > 0 ? parsedHeaders : [{ id: '1', key: 'Content-Type', value: 'application/json' }]);
      setBody(prefillRequest.body || '');
      setReplayResponse(null);
      setReplayError(null);
    }
  }, [prefillRequest]);

  // Actions
  const handleAddHeader = () => {
    setHeaders([...headers, { id: Math.random().toString(), key: '', value: '' }]);
  };

  const handleRemoveHeader = (id: string) => {
    setHeaders(headers.filter((h) => h.id !== id));
  };

  const handleUpdateHeader = (id: string, field: 'key' | 'value', value: string) => {
    setHeaders(headers.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  };

  const loadBlankSlate = () => {
    setMethod('GET');
    setUrl('https://jsonplaceholder.typicode.com/posts');
    setHeaders([
      { id: '1', key: 'Content-Type', value: 'application/json' },
      { id: '2', key: 'Accept', value: 'application/json' }
    ]);
    setBody('{\n  "title": "new_resource",\n  "completed": false\n}');
    setReplayResponse(null);
    setReplayError(null);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const executeReplay = async () => {
    setReplaying(true);
    setReplayError(null);
    setReplayResponse(null);

    // Build headers object for backend payload
    let headersObj: Record<string, string> = {};
    if (headerMode === 'key-value') {
       headers.forEach((h) => {
         if (h.key.trim()) {
           headersObj[h.key.trim()] = h.value.trim();
         }
       });
    } else {
      try {
        headersObj = JSON.parse(rawHeadersJson);
      } catch (e) {
        setReplayError('Invalid JSON format for headers');
        setReplaying(false);
        return;
      }
    }

    try {
      const response = await fetch('/api/replay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method,
          url,
          headers: headersObj,
          body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? '' : body,
        }),
      });

      if (!response.ok) {
        let errMsg = response.statusText || 'Unknown Server Error';
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch {
          try {
            const text = await response.text();
            if (text) errMsg = text;
          } catch {}
        }
        throw new Error(`Execution error: ${errMsg}`);
      }

      const data: ReplayResponse = await response.json();
      setReplayResponse(data);
      if (onSuccessReplay) {
        onSuccessReplay(data);
      }
    } catch (err: any) {
      console.error('Replay error:', err);
      setReplayError(err.message || 'Unknown network execution error');
    } finally {
      setReplaying(false);
    }
  };

  const parsedResponseBody = () => {
    if (!replayResponse || !replayResponse.body) return '';
    try {
      const parsed = JSON.parse(replayResponse.body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return replayResponse.body;
    }
  };

  const handleParallelExecute = async () => {
    setReplaying(true);
    setReplayError(null);
    setReplayResponse(null);
    setParallelResults([]);

    let headersObj: Record<string, string> = {};
    if (headerMode === 'key-value') {
       headers.forEach((h) => { if (h.key.trim()) headersObj[h.key.trim()] = h.value.trim(); });
    } else {
      try { headersObj = JSON.parse(rawHeadersJson); } catch (e) {
        setReplayError('Invalid JSON format for headers');
        setReplaying(false);
        return;
      }
    }

    const tasks = Array.from({ length: parallelMultiplier }).map(async () => {
      try {
        // Add human-like jitter if multiplier is used (0-1200ms)
        if (parallelMultiplier > 1) {
          await new Promise(r => setTimeout(r, Math.random() * 1200));
        }

        const startTime = performance.now();
        const response = await fetch('/api/replay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method,
            url,
            headers: headersObj,
            body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? '' : body,
          }),
        });
        const duration = Math.round(performance.now() - startTime);
        const data = await response.json();
        return { status: response.status, duration, data };
      } catch (err) {
        return { status: 0, duration: 0, data: null };
      }
    });

    const results = await Promise.all(tasks);
    const validResults = results.filter(r => r.status === 200 && r.data && !r.data.error);
    
    if (validResults.length > 0) {
      setReplayResponse(validResults[0].data);
      setParallelResults(results.map(r => ({ status: r.status, duration: r.duration })));
      if (onSuccessReplay) onSuccessReplay(validResults[0].data);
    } else {
      const failedResult = results.find(r => r.data && r.data.error);
      const firstError = failedResult ? failedResult.data.error : 'All parallel requests failed';
      setReplayError(`Execution error: ${firstError}`);
    }
    
    setReplaying(false);
  };

  return (
    <div id="tamper-workspace-grid" className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full">
      {/* LEFT COLUMN: EDITOR INCOMING SCRATCHPAD */}
      <div className="bg-[#1e293b] border border-slate-700/90 rounded-xl overflow-hidden flex flex-col h-full shadow-2xl">
        {/* Workspace Toolbar Header */}
        <div className="bg-[#0f172a] px-4 py-3 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-200 font-mono">
              Scratchpad Manipulator Request Editor
            </span>
          </div>
          <button
            onClick={loadBlankSlate}
            className="text-[9px] text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded border border-slate-700/60 bg-slate-950/40 font-bold font-mono transition-all active:scale-95 cursor-pointer"
          >
            Reset Draft
          </button>
        </div>

        {/* Form controls */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto font-mono text-xs">
          {/* Method and URL inline */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="md:w-1/4">
              <label className="block text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-1">HTTP Method</label>
              <select
                id="workspace-method-select"
                className="w-full bg-[#0f172a] border border-slate-650 rounded px-2.5 py-1.5 text-slate-200 font-bold focus:outline-none focus:border-blue-500 cursor-pointer"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
                <option value="OPTIONS">OPTIONS</option>
                <option value="HEAD">HEAD</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-1">Target Endpoint URL</label>
              <input
                id="workspace-url-input"
                type="text"
                className="w-full bg-[#0f172a] border border-slate-650 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="e.g. https://jsonplaceholder.typicode.com/posts"
              />
            </div>
          </div>

          {/* Dynamic headers list */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Modify Headers</label>
              <div className="flex gap-2 text-[10px]">
                <button 
                  onClick={() => setHeaderMode('key-value')}
                  className={`cursor-pointer ${headerMode === 'key-value' ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>Key-Value</button>
                <button
                  onClick={() => setHeaderMode('json')}
                  className={`cursor-pointer ${headerMode === 'json' ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>Raw JSON</button>
              </div>
            </div>
            
            {headerMode === 'key-value' ? (
                <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
                  <div className="flex justify-end p-0">
                    <button
                      id="workspace-add-header-btn"
                      onClick={handleAddHeader}
                      className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors font-bold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Header</span>
                    </button>
                  </div>
                  {headers.map((h) => (
                    <div key={h.id} className="flex gap-2 items-center">
                      <input
                        type="text"
                        className="flex-1 bg-[#0f172a] border border-slate-700/80 rounded px-2 py-1.5 text-[11px] text-slate-300 placeholder-slate-600 font-mono"
                        placeholder="Header-Key"
                        value={h.key}
                        onChange={(e) => handleUpdateHeader(h.id, 'key', e.target.value)}
                      />
                      <input
                        type="text"
                        className="flex-1 bg-[#0f172a] border border-slate-700/80 rounded px-2 py-1.5 text-[11px] text-slate-300 placeholder-slate-600 font-mono"
                        placeholder="Header-Value"
                        value={h.value}
                        onChange={(e) => handleUpdateHeader(h.id, 'value', e.target.value)}
                      />
                      <button
                        onClick={() => handleRemoveHeader(h.id)}
                        className="text-slate-500 hover:text-rose-450 p-1 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
            ) : (
                <textarea
                  rows={5}
                  className="w-full bg-[#0f172a] border border-slate-650 rounded p-2.5 text-[11px] text-emerald-400 font-mono focus:outline-none focus:border-blue-500 leading-normal"
                  value={rawHeadersJson}
                  onChange={(e) => setRawHeadersJson(e.target.value)}
                  placeholder='{ "Content-Type": "application/json" }'
                />
            )}
          </div>

          {/* Request payload body content */}
          {!['GET', 'HEAD'].includes(method.toUpperCase()) && (
            <div>
              <label className="block text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-1">Body Payload</label>
              <textarea
                id="workspace-body-textarea"
                rows={5}
                className="w-full bg-[#0f172a] border border-slate-650 rounded p-2.5 text-[11px] text-emerald-400 font-mono focus:outline-none focus:border-blue-500 leading-normal"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{\n  "userId": 1,\n  "body": "Hello World"\n}'
              />
            </div>
          )}

          {/* Execute replayer submission button */}
          <div className="flex gap-2">
            <div className="flex items-center bg-[#0f172a] border border-slate-650 rounded px-3 py-1.5 focus-within:border-blue-500 transition-all">
               <Zap className="w-3.5 h-3.5 text-slate-500 mr-2" />
               <input 
                 type="number" 
                 min="1" 
                 max="100" 
                 value={parallelMultiplier} 
                 onChange={e => setParallelMultiplier(parseInt(e.target.value) || 1)}
                 className="w-12 bg-transparent text-slate-200 text-xs font-bold font-mono outline-none"
                 title="Parallel Multiplier"
               />
               <span className="text-[10px] text-slate-500 font-mono ml-1">Execs</span>
            </div>
            <button
              id="workspace-execute-replay-btn"
              onClick={parallelMultiplier > 1 ? handleParallelExecute : executeReplay}
              disabled={replaying}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-550 hover:shadow-lg disabled:bg-slate-800 text-white font-bold rounded flex items-center justify-center gap-2 font-mono transition-all uppercase tracking-wider text-xs active:scale-[0.98] cursor-pointer shadow"
            >
              {replaying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Executing {parallelMultiplier > 1 ? 'Parallel' : ''}...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>{parallelMultiplier > 1 ? `Fire ${parallelMultiplier}x Parallel` : 'Execute Request'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: REPLAYED RESPONSE DISPLAY WORKSPACE */}
      <div className="bg-[#1e293b] border border-slate-700/90 rounded-xl overflow-hidden flex flex-col h-full shadow-2xl font-mono text-xs">
        <div className="bg-[#0f172a] px-4 py-3 border-b border-slate-700/60">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-200">
            Replayed Response View
          </span>
        </div>

        {replaying && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-950 p-6 min-h-[300px]">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
            <p className="text-xs font-semibold">Running HTTP fetch request from proxy server...</p>
            <p className="text-[10px] text-slate-501 mt-1 max-w-sm text-center">
              Our node backend is bypass-calling the target origin directly and harvesting status, headers, and plain payload.
            </p>
          </div>
        )}

        {replayError && (
          <div className="flex-1 flex flex-col items-center justify-center text-rose-400 bg-slate-950 p-6 min-h-[300px]">
            <Trash2 className="w-8 h-8 text-rose-500 mb-2" />
            <p className="font-bold text-xs">Upstream Request Failed</p>
            <p className="text-[10px] text-slate-500 text-center max-w-md mt-1 break-all bg-slate-900 border border-slate-800 p-3 rounded leading-loose">
              {replayError}
            </p>
          </div>
        )}

        {!replaying && !replayError && !replayResponse && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-slate-950 p-8 text-center min-h-[300px]">
            <Send className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-xs">No executed replayed data available</p>
            <p className="text-[10px] text-slate-600 mt-1 max-w-[280px]">
              Tweak parameters and click <strong className="text-slate-400">Execute</strong> to replay request.
            </p>
          </div>
        )}

        {!replaying && !replayError && replayResponse && (
          <div className="flex-1 flex flex-col h-full bg-[#0f172a] overflow-hidden divide-y divide-slate-800/60">
            {/* Parallel Summary if applicable */}
            {parallelResults.length > 0 && (
              <div className="p-3 bg-amber-600/5 border-b border-amber-900/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest font-mono">Parallel Execution Cluster</span>
                  <span className="text-[10px] text-slate-500">{parallelResults.length} endpoints replayed simultaneously</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto">
                    {parallelResults.map((res, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-slate-950 px-2 py-0.5 rounded border border-slate-800/60 text-[9px] font-mono">
                         <span className={res.status >= 200 && res.status < 300 ? 'text-emerald-400' : 'text-rose-400'}>{res.status}</span>
                         <span className="text-slate-500">{res.duration}ms</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            
            {/* Status overview and time */}
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 bg-[#1e293b]/45 text-[11px]">
              <div>
                <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-bold">Status</span>
                <span className={`font-bold ${replayResponse.status >= 200 && replayResponse.status < 300 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {replayResponse.status} {replayResponse.statusText || 'OK'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-bold">Latency</span>
                <span className="text-slate-200 font-bold">{replayResponse.durationMs}ms</span>
              </div>
              <div className="col-span-2 md:col-span-1">
                <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-bold">Content Type</span>
                <span className="text-slate-300 truncate max-w-[200px]" title={replayResponse.contentType}>
                  {replayResponse.contentType.split(';')[0]}
                </span>
              </div>
            </div>

            {/* Response Headers */}
            <div className="p-4 flex flex-col max-h-[160px] overflow-y-auto">
              <span className="text-slate-450 block text-[9px] uppercase font-bold tracking-wider border-b border-slate-800 pb-1 mb-2">Response Headers</span>
              <div className="space-y-1 text-[11px] select-all">
                {Object.entries(replayResponse.headers || {}).map(([key, val]) => (
                  <div key={key} className="grid grid-cols-3 gap-2 py-0.5 border-b border-slate-900/30">
                    <span className="text-slate-500 font-semibold truncate" title={key}>{key}</span>
                    <span className="text-slate-300 col-span-2 break-all">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Response Body Raw / formatted */}
            <div className="p-4 flex-1 flex flex-col overflow-hidden">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-450 text-[9px] uppercase font-bold tracking-wider">Response Body Payload</span>
                {replayResponse.body && (
                  <button
                    onClick={() => handleCopy(replayResponse.body, 'replay-res-body')}
                    className="text-slate-400 hover:text-slate-200 p-0.5 rounded cursor-pointer"
                    title="Copy response payload"
                  >
                    {copiedKey === 'replay-res-body' ? <Check className="w-3.5 h-3.5 text-emerald-450" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-auto bg-[#0a0f1d] border border-slate-800 rounded p-2.5 max-h-[320px]">
                {!replayResponse.body ? (
                  <span className="text-slate-600 italic text-[10px]">No payload body returned</span>
                ) : (
                  <pre id="workspace-replayed-response-body" className="text-slate-300 text-[11px] whitespace-pre-wrap break-all select-all leading-normal">
                    {parsedResponseBody()}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="mt-6 py-3 px-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
        <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-emerald-400" /> Traffic Tamper Engine</span>
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
    </div>
  );
}
