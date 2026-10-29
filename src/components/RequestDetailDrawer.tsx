import React, { useState } from 'react';
import { InterceptedRequest } from '../types';
import { X, Copy, Terminal, Layers, Send, Check, Eye } from 'lucide-react';

interface RequestDetailDrawerProps {
  request: InterceptedRequest | null;
  onClose: () => void;
  onModifyAndReplay: (request: InterceptedRequest) => void;
}

export default function RequestDetailDrawer({ request, onClose, onModifyAndReplay }: RequestDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'headers' | 'body'>('headers');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!request) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const tryFormatJson = (text: string | null): string => {
    if (!text) return 'Empty';
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  };

  return (
    <div id="devtools-drawer-overlay" className="flex flex-col h-full bg-[#1e293b] border border-slate-700/90 rounded-xl overflow-hidden shadow-2xl">
      {/* Header Panel */}
      <div className="bg-[#0f172a] px-4 py-3 border-b border-slate-700/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          <span className="text-xs uppercase tracking-wider font-bold text-slate-200 font-mono">
            Inspector: {request.method}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            id="tamper-replay-trigger-btn"
            onClick={() => onModifyAndReplay(request)}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-550 text-white text-[10px] font-mono font-bold px-2.5 py-1 rounded shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer"
          >
            <Send className="w-3 h-3" />
            <span>Modify & Replay</span>
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 hover:bg-slate-800/80 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* URL indicator */}
      <div className="bg-slate-950/40 px-4 py-2 border-b border-slate-700/50 text-[11px] font-mono text-slate-400 break-all flex items-center justify-between gap-2.5">
        <span className="truncate max-w-[400px] text-blue-400">{request.url}</span>
        <button
          onClick={() => handleCopy(request.url, 'req-url')}
          className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 rounded cursor-pointer shrink-0"
          title="Copy full target URL"
        >
          {copiedKey === 'req-url' ? <Check className="w-3.5 h-3.5 text-emerald-450" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Tabs list */}
      <div className="flex bg-[#1e293b] border-b border-slate-705/60 text-[11px] font-mono">
        <button
          onClick={() => setActiveTab('headers')}
          className={`flex-1 py-1.5 text-center border-b-2 ${
            activeTab === 'headers' ? 'border-blue-500 text-blue-400 bg-slate-950/20' : 'border-transparent text-slate-400 hover:text-slate-200'
          } cursor-pointer font-semibold`}
        >
          Headers & Query Params
        </button>
        <button
          onClick={() => setActiveTab('body')}
          className={`flex-1 py-1.5 text-center border-b-2 ${
            activeTab === 'body' ? 'border-blue-500 text-blue-400 bg-slate-950/20' : 'border-transparent text-slate-400 hover:text-slate-200'
          } cursor-pointer font-semibold`}
        >
          Request & Response Body
        </button>
      </div>

      {/* Drawer content area */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {activeTab === 'headers' ? (
          <div className="space-y-4">
            {/* General Status Summary */}
            <div className="bg-slate-950/30 p-3 rounded-lg border border-slate-800 space-y-2 text-[11px] font-mono">
              <h4 className="text-slate-400 border-b border-slate-800 pb-1 uppercase font-semibold text-[10px]">General Info</h4>
              <div className="grid grid-cols-3 gap-1">
                <span className="text-slate-500">Request URL:</span>
                <span className="text-slate-300 col-span-2 break-all">{request.url}</span>
                <span className="text-slate-500">Request Source:</span>
                <span className="text-slate-300 font-bold col-span-2 text-blue-450">
                  {request.id.startsWith('ext_') ? 'Forwarded Tampermonkey Extension' : 'Sandbox Reverse Proxy Live Frame'}
                </span>
                <span className="text-slate-500">Method:</span>
                <span className="text-slate-300 font-bold col-span-2">{request.method}</span>
                <span className="text-slate-500">Status Code:</span>
                <span className={`col-span-2 ${request.status >= 200 && request.status < 300 ? 'text-emerald-400 font-bold' : 'text-amber-400'}`}>
                  {request.status} {request.status === 200 ? 'OK' : ''}
                </span>
                <span className="text-slate-500">Latency:</span>
                <span className="text-slate-300 col-span-2">{request.durationMs} ms</span>
              </div>
            </div>

            {/* Query parameters */}
            <div className="bg-slate-950/30 p-3 rounded-lg border border-slate-800 space-y-2 text-[11px] font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                <h4 className="text-slate-400 uppercase font-semibold text-[10px]">Query Parameters</h4>
                <button
                  onClick={() => handleCopy(JSON.stringify(request.queryParams, null, 2), 'query-params')}
                  className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
                  title="Copy parameters JSON"
                >
                  {copiedKey === 'query-params' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              {Object.keys(request.queryParams || {}).length === 0 ? (
                <div className="text-slate-600 text-[10px] italic">No URL query parameters found</div>
              ) : (
                <div className="space-y-1.5 divide-y divide-slate-800/40">
                  {Object.entries(request.queryParams).map(([key, val]) => (
                    <div key={key} className="pt-1.5 first:pt-0 flex flex-col sm:flex-row gap-1">
                      <span className="text-blue-400 font-semibold shrink-0 select-all">{key}:</span>
                      <span className="text-slate-300 break-all select-all">{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Request Headers */}
            <div className="bg-slate-950/30 p-3 rounded-lg border border-slate-800 space-y-2 text-[11px] font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                <h4 className="text-slate-400 uppercase font-semibold text-[10px]">Request Headers</h4>
                <button
                  onClick={() => handleCopy(JSON.stringify(request.requestHeaders, null, 2), 'req-headers')}
                  className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
                  title="Copy Request Headers JSON"
                >
                  {copiedKey === 'req-headers' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto divide-y divide-slate-800/40 pr-1 select-all">
                {Object.entries(request.requestHeaders).map(([key, val]) => (
                  <div key={key} className="pt-1.5 first:pt-0 grid grid-cols-3 gap-2">
                    <span className="text-slate-500 font-semibold truncate" title={key}>{key}</span>
                    <span className="text-slate-300 col-span-2 break-all">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Response Headers */}
            <div className="bg-slate-950/30 p-3 rounded-lg border border-slate-800 space-y-2 text-[11px] font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                <h4 className="text-slate-400 uppercase font-semibold text-[10px]">Response Headers</h4>
                <button
                  onClick={() => handleCopy(JSON.stringify(request.responseHeaders, null, 2), 'res-headers')}
                  className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
                  title="Copy Response Headers"
                >
                  {copiedKey === 'res-headers' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto divide-y divide-slate-800/40 pr-1 select-all">
                {Object.entries(request.responseHeaders).map(([key, val]) => (
                  <div key={key} className="pt-1.5 first:pt-0 grid grid-cols-3 gap-2">
                    <span className="text-slate-500 font-semibold truncate" title={key}>{key}</span>
                    <span className="text-slate-300 col-span-2 break-all">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Request Body section */}
            <div className="bg-slate-950/30 p-3 rounded-lg border border-slate-800 space-y-2 text-[11px] font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                <h4 className="text-slate-400 uppercase font-semibold text-[10px]">Request body</h4>
                {request.requestBody && (
                  <button
                    onClick={() => handleCopy(request.requestBody || '', 'req-body')}
                    className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
                    title="Copy request body"
                  >
                    {copiedKey === 'req-body' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              {!request.requestBody ? (
                <div className="text-slate-600 text-[10px] italic">No request payload / body detected</div>
              ) : (
                <pre id="drawer-raw-request-body" className="bg-slate-950 p-2.5 rounded border border-slate-850 max-h-[160px] overflow-y-auto text-slate-305 text-[10.5px] whitespace-pre-wrap break-all select-all">
                  {tryFormatJson(request.requestBody)}
                </pre>
              )}
            </div>

            {/* Response Body text Section */}
            <div className="bg-slate-950/30 p-3 rounded-lg border border-slate-800 space-y-2 text-[11px] font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                <h4 className="text-slate-400 uppercase font-semibold text-[10px]">Response Content ({request.contentType.split(';')[0]})</h4>
                {request.responseBody && (
                  <button
                    onClick={() => handleCopy(request.responseBody || '', 'res-body')}
                    className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
                    title="Copy response body"
                  >
                    {copiedKey === 'res-body' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              {!request.responseBody ? (
                <div className="text-slate-600 text-[10px] italic">No text/JSON response body available or payload type is binary media</div>
              ) : (
                <pre id="drawer-raw-response-body" className="bg-slate-950 p-3 rounded border border-slate-850 max-h-[300px] overflow-auto text-slate-300 text-[10.5px] whitespace-pre break-all select-all">
                  {tryFormatJson(request.responseBody)}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
