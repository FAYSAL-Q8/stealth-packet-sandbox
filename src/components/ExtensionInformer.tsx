import React, { useState, useEffect } from 'react';
import { ENGINE_VERSION } from '../engineVersion';
import { 
  Shield, Copy, Check, Cpu, Radio, Zap, Settings, 
  Eye, Download, ChevronDown, ChevronUp, Globe, Filter
} from 'lucide-react';
import { InterceptedRequest } from '../types';
import { userscriptCode } from '../userscript';

interface ExtensionInformerProps {
  logs: InterceptedRequest[];
  onClearLogs: () => void;
}

function formatDateCustom(timestamp: string | number | Date) {
  const d = new Date(timestamp);
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

export default function ExtensionInformer({ logs }: ExtensionInformerProps) {
  const [copied, setCopied] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'LOCAL' | 'FORWARD' | 'DUAL'>('DUAL');
  const [openedLogId, setOpenedLogId] = useState<string | null>(null);
  const [targetServerUrl, setTargetServerUrl] = useState(() => {
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  });
  const [stealthLevel, setStealthLevel] = useState<'STANDARD' | 'MAXIMUM'>('MAXIMUM');
  const [domainFilter, setDomainFilter] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [isScriptVisible, setIsScriptVisible] = useState(false);
  const [runLocallyState, setRunLocallyState] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('RUN_EXTENSION_LOCALLY') === 'true' : false;
  });

  const handleToggleLocalRun = () => {
    const nextVal = !runLocallyState;
    setRunLocallyState(nextVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('RUN_EXTENSION_LOCALLY', nextVal ? 'true' : 'false');
      window.location.reload();
    }
  };

  useEffect(() => {
    const modeValue = selectedMode;
    const endpointValue = targetServerUrl;
    const filterValue = domainFilter;
    const stealthValue = stealthLevel === 'MAXIMUM' ? 'MAX' : 'STD';

    let code = userscriptCode;
    code = code.replace(
      `let CURRENT_MODE = getStoredValue('script_mode', "LOCAL");`,
      `let CURRENT_MODE = getStoredValue('script_mode', "${modeValue}");`
    );
    code = code.replace(
      `let CURRENT_ENDPOINT = getStoredValue('proxy_endpoint', "http://localhost:3000");`,
      `let CURRENT_ENDPOINT = getStoredValue('proxy_endpoint', "${endpointValue}");`
    );
    code = code.replace(
      `let CURRENT_FILTER = getStoredValue('domain_filter', "");`,
      `let CURRENT_FILTER = getStoredValue('domain_filter', "${filterValue}");`
    );
    code = code.replace(
      `let CURRENT_STEALTH = getStoredValue('stealth_rating', "STD");`,
      `let CURRENT_STEALTH = getStoredValue('stealth_rating', "${stealthValue}");`
    );

    setCurrentCode(code);
  }, [selectedMode, targetServerUrl, domainFilter, stealthLevel]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Clipboard write failed:', e);
    }
  };

  const handleDownloadCode = () => {
    try {
      const blob = new Blob([currentCode], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'stealth-interceptor.user.js';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('File download failed:', e);
    }
  };

  return (
    <div id="userscript-developer-center" className="flex flex-col gap-6 p-1">
      {/* Header Area */}
      <div className="bg-[#1e293b] border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-purple-400" />
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
              Unified Stealth Interceptor [v{ENGINE_VERSION}]
            </h2>
            <p className="text-[11px] text-slate-400">
              Browser-side packet interception engine with Shadow DOM isolation and cross-origin forwarding.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleLocalRun}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer border ${
              runLocallyState
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
            title="Inject and simulate the userscript interceptor panel directly inside this browser page context"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${runLocallyState ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            <span>{runLocallyState ? 'SIMULATOR ACTIVE' : 'SIMULATE LOCALLY'}</span>
          </button>
        </div>
      </div>

      {/* Configuration Controls Bar */}
      <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
        <div>
          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
            Operational Mode
          </label>
          <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
            {(['LOCAL', 'FORWARD', 'DUAL'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSelectedMode(mode)}
                className={`flex-1 py-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
                  selectedMode === mode
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
            Proxy Endpoint URL
          </label>
          <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1">
            <Globe className="w-3.5 h-3.5 text-slate-500 mr-2 shrink-0" />
            <input
              type="text"
              value={targetServerUrl}
              onChange={(e) => setTargetServerUrl(e.target.value)}
              className="w-full bg-transparent text-slate-200 text-xs focus:outline-none"
              placeholder="http://localhost:3000"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
            Domain Filter (Optional)
          </label>
          <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1">
            <Filter className="w-3.5 h-3.5 text-slate-500 mr-2 shrink-0" />
            <input
              type="text"
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="w-full bg-transparent text-slate-200 text-xs focus:outline-none"
              placeholder="e.g. api.target.com"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
            Evasion Level
          </label>
          <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
            {(['STANDARD', 'MAXIMUM'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setStealthLevel(level)}
                className={`flex-1 py-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
                  stealthLevel === level
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Code Display Sandbox */}
      <div className="w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[520px]">
        <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 flex items-center justify-between font-sans">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-300 font-mono">stealth-interceptor.user.js</span>
          </div>
          <div className="flex items-center gap-2 font-mono">
            <button
              onClick={() => setIsScriptVisible(!isScriptVisible)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-200 text-xs font-bold rounded border border-slate-700/60 transition-all cursor-pointer mr-1"
              title="Toggle script source preview visibility"
            >
              <Eye className={`w-3.5 h-3.5 ${isScriptVisible ? 'text-blue-400' : 'text-slate-400'}`} />
              <span>{isScriptVisible ? 'Hide' : 'Preview'}</span>
            </button>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
            <button
              onClick={handleDownloadCode}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white text-xs font-bold rounded border border-slate-700/60 transition-all cursor-pointer"
              title="Download userscript file directly"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Download</span>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 font-mono text-[11px] text-slate-400 bg-[#070b13] select-all">
          {isScriptVisible ? (
            <pre className="whitespace-pre font-mono">{currentCode}</pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-6">
              <div className="w-14 h-14 bg-blue-950/40 rounded-full border border-blue-800/50 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <div className="max-w-md">
                <h3 className="text-sm font-bold text-slate-200 font-mono">Unified Stealth Interceptor Ready</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-1.5 leading-relaxed">
                  Dual-mode high-fidelity userscript (v{ENGINE_VERSION}) compiled with your current endpoint and mode settings.
                </p>
              </div>
              <button
                onClick={() => setIsScriptVisible(true)}
                className="mt-2 flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold font-mono rounded-lg transition-all cursor-pointer shadow-lg shadow-blue-900/40"
              >
                <Eye className="w-4 h-4" />
                <span>Show Script Source</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Received Logs Stream Panel */}
      {logs && logs.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300">
              Intercepted Traffic Stream ({logs.length} Packets)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 px-3 w-16">METHOD</th>
                  <th className="py-2 px-3">ABSOLUTE URL</th>
                  <th className="py-2 px-3 w-20">STATUS</th>
                  <th className="py-2 px-3 w-20">LATENCY</th>
                  <th className="py-2 px-3 w-36">TIMESTAMP</th>
                  <th className="py-2 px-3 w-16">VIEW</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 50).map((log) => {
                  const isExpanded = openedLogId === log.id;
                  const statusColor =
                    log.status >= 200 && log.status < 300
                      ? 'text-emerald-400'
                      : log.status >= 400
                      ? 'text-rose-400 font-bold'
                      : 'text-amber-400';

                  const methodColor =
                    log.method === 'GET'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : log.method === 'POST'
                      ? 'bg-blue-950 text-blue-300 border border-blue-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800';

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setOpenedLogId(isExpanded ? null : log.id)}
                        className="border-b border-slate-800/40 hover:bg-slate-850/60 transition-all cursor-pointer"
                      >
                        <td className="py-2.5 px-3">
                          <span className={"px-1.5 py-0.5 rounded text-[9px] font-bold " + methodColor}>
                            {log.method}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 max-w-sm truncate text-slate-300" title={log.url}>
                          {log.url}
                        </td>
                        <td className={"py-2.5 px-3 font-semibold " + statusColor}>
                          {log.status === 0 ? 'FAIL / BLOCKED' : log.status}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {log.durationMs || 12}ms
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[10.5px]">
                          <div className="font-semibold text-slate-400 leading-none mb-0.5">{formatDateCustom(log.timestamp).time}</div>
                          <div className="text-[8.5px] text-slate-500/85 leading-none">{formatDateCustom(log.timestamp).date}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-[#0b0f19] p-4 border-b border-slate-800">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-3">
                                <div>
                                  <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Request Headers</h4>
                                  <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[10px] text-slate-300 overflow-x-auto max-h-[160px] select-text">
                                    {JSON.stringify(log.requestHeaders, null, 2)}
                                  </pre>
                                </div>
                                {log.requestBody && (
                                  <div>
                                    <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Request Body Payload</h4>
                                    <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[10px] text-slate-300 overflow-x-auto max-h-[160px] select-text">
                                      {log.requestBody}
                                    </pre>
                                  </div>
                                )}
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Response Headers</h4>
                                  <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[10px] text-slate-300 overflow-x-auto max-h-[160px] select-text">
                                    {JSON.stringify(log.responseHeaders, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Response Body</h4>
                                  <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[10px] text-slate-300 overflow-x-auto max-h-[160px] select-text">
                                    {log.responseBody || '(No response payload captured)'}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* UI Footer */}
      <footer className="py-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
        <span className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-purple-400" /> Userscript Generator Engine
        </span>
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