import React, { useState, useEffect, useRef } from 'react';
import { SavedSession, InterceptedRequest } from '../types';
import { getSavedSessions, saveSession, importSessionData, deleteSession, predictSessionFilename } from '../lib/sessionAndAnalysis';
import { X, Upload, Download, Trash2, Calendar, Globe, Share2, FileCode, CheckCircle2 } from 'lucide-react';

interface SavedSessionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeLogs: InterceptedRequest[];
  activeSessionId: string | null;
  onSelectSession: (session: SavedSession | null) => void;
}

export default function SavedSessionsDrawer({ isOpen, onClose, activeLogs, activeSessionId, onSelectSession }: SavedSessionsDrawerProps) {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [exportName, setExportName] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSessions(getSavedSessions());
      // Propose filename
      const defaultName = predictSessionFilename(activeLogs);
      setExportName(defaultName);
      setSuccessMsg('');
      setErrorMsg('');
    }
  }, [isOpen, activeLogs]);

  if (!isOpen) return null;

  const handleExportCurrent = () => {
    if (activeLogs.length === 0) {
      setErrorMsg('No current live traffic logs to export.');
      return;
    }

    const rawName = exportName.trim();
    if (!rawName) {
      setErrorMsg('Please specify a filename before exporting.');
      return;
    }

    // Save locally
    const session = saveSession(rawName, activeLogs);
    setSessions(getSavedSessions());

    // Trigger browser file download
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(session, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `${rawName.replace(/\s+/g, '_')}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setSuccessMsg(`Session "${rawName}" successfully exported & recorded!`);
    } catch (e: any) {
      setErrorMsg(`Failed to save: ${e.message}`);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const imported = importSessionData(json);
        setSessions(getSavedSessions());
        // Auto-load newly imported session right away
        onSelectSession(imported);
        setSuccessMsg(`Session "${imported.name}" imported and loaded successfully!`);
      } catch (err: any) {
        setErrorMsg(`Import failed: ${err.message || 'Invalid format'}`);
      }
    };
    reader.readAsText(file);
    if (e.target) {
      e.target.value = ''; // resets input
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete session "${name}" from local memory? This cannot be undone.`)) {
      deleteSession(id);
      setSessions(getSavedSessions());
      if (activeSessionId === id) {
        onSelectSession(null); // Unload if visual on screen
      }
    }
  };

  return (
    <div id="saved-sessions-backdrop" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-end justify-center">
      <div 
        id="saved-sessions-sheet"
        className="bg-slate-900 border-t border-slate-700/80 rounded-t-2xl w-full max-w-5xl h-[90vh] md:h-[520px] shadow-2xl flex flex-col overflow-hidden animate-slide-up"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-805 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2">
            <Share2 className="w-4.5 h-4.5 text-blue-400" />
            <div>
              <h2 className="text-sm font-extrabold text-slate-100 font-mono">Session History Repository</h2>
              <p className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">Switch between imported snapshots, view historical logs, and configure exports</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-405 hover:text-slate-205 py-1 px-1.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Splitted */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden text-xs">
          
          {/* Left panel: Available sessions */}
          <div className="w-full md:w-[60%] border-r border-slate-800 flex flex-col h-[50%] md:h-full bg-[#0a0f1d]/45 overflow-hidden">
            <div className="p-3 bg-slate-950/20 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-slate-400 font-mono uppercase text-[10px]">Saved Sessions Index</span>
              <span className="text-[9.5px] text-slate-500 font-bold bg-[#1e293b] px-2 py-0.5 rounded border border-slate-800">{sessions.length} Recorded</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {sessions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 font-mono py-12">
                  <FileCode className="w-8 h-8 opacity-20 mb-2" />
                  <p>No historical traffic sessions exported or imported yet.</p>
                  <p className="text-[10px] text-slate-600 mt-1 max-w-[280px]">Export your current traffic stream or upload an imported session snapshot file to start.</p>
                </div>
              ) : (
                sessions.map(sess => {
                  const isActive = activeSessionId === sess.id;
                  return (
                    <div 
                      key={sess.id}
                      className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-4 cursor-pointer ${
                        isActive 
                        ? 'bg-blue-600/10 border-blue-500/50 hover:bg-blue-600/15' 
                        : 'bg-[#101726]/80 border-slate-805 hover:bg-[#101726]/100'
                      }`}
                      onClick={() => onSelectSession(sess)}
                    >
                      <div className="truncate flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>}
                          <span className={`font-bold truncate text-xs ${isActive ? 'text-blue-400' : 'text-slate-205'}`}>{sess.name}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-[9.5px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-600" />
                            {sess.timestamp.replace('T', ' ').substring(0, 16)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3 text-slate-600" />
                            {sess.domain}
                          </span>
                          <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-900 font-normal text-slate-450">{sess.logs?.length || 0} Packets</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSession(sess);
                          }}
                          className={`font-mono text-[10px] font-bold px-2.5 py-1.5 rounded-md border ${
                            isActive 
                            ? 'bg-blue-600 text-white border-blue-500' 
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          {isActive ? 'Loaded' : 'Switch'}
                        </button>

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(sess.id, sess.name);
                          }}
                          className="p-1.5 rounded bg-[#101726] border border-slate-800 text-slate-500 hover:text-rose-400 hover:border-slate-700 hover:bg-slate-900 cursor-pointer"
                          title="Purge session from database"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right panel: Active/Export manager controls */}
          <div className="w-full md:w-[40%] p-5 flex flex-col justify-start gap-4 background-slate-950 overflow-y-auto">
            <span className="font-bold text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800 pb-2">Session Administration Actions</span>

            {/* Success or error message toast banner */}
            {successMsg && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-[11px] rounded-lg flex items-start gap-2">
                <CheckCircle2 className="w-4.5 h-4.5 shrink-0 text-emerald-450 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}
            {errorMsg && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/20 text-rose-400 text-[11px] rounded-lg">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Export block */}
            <div className="bg-slate-950/50 p-4 border border-slate-805 rounded-xl space-y-3">
              <h3 className="font-bold text-slate-300 text-[11px] flex items-center gap-1.5">
                <Download className="w-4 h-4 text-blue-400" />
                Export Current Packet Traffic ({activeLogs.length})
              </h3>
              <p className="text-[10.5px] text-slate-450 leading-relaxed">
                Save active logs as a transferrable JSON snapshot file. This also stores it inside your local history list.
              </p>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Snapshot Filename Label</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={exportName}
                    onChange={e => setExportName(e.target.value)}
                    placeholder="e.g. login_session_diagnostics"
                    className="flex-1 bg-slate-900 border border-slate-750 text-slate-200 px-3 py-1.5 rounded-lg text-xs outline-none focus:border-blue-500 font-medium font-mono"
                  />
                  <span className="text-slate-500 flex items-center font-mono font-medium">.json</span>
                </div>
              </div>

              <button 
                onClick={handleExportCurrent}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg text-[11px] border border-blue-500/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 shadow-md shadow-blue-900/10"
              >
                <span>Save & Export Session File</span>
              </button>
            </div>

            {/* Import block */}
            <div className="bg-slate-950/50 p-4 border border-slate-805 rounded-xl space-y-3.5">
              <h3 className="font-bold text-slate-300 text-[11px] flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-emerald-450" />
                Upload / Import Saved Session
              </h3>
              <p className="text-[10.5px] text-slate-455 leading-relaxed">
                Import and switch to any previously exported `.json` snapshot from your system storage.
              </p>

              <input 
                type="file"
                ref={fileInputRef}
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />

              <button 
                onClick={handleImportClick}
                className="w-full bg-slate-805 hover:bg-slate-755 text-slate-300 font-bold py-2 rounded-lg text-[11px] border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <span>Import Session File</span>
              </button>
            </div>

            {/* Load default active toggle */}
            {activeSessionId && (
              <button 
                onClick={() => onSelectSession(null)}
                className="border border-rose-500/25 bg-rose-950/15 hover:bg-rose-950/30 text-rose-400 text-[11px] font-bold py-2 rounded-lg cursor-pointer flex items-center justify-center gap-1.5 active:scale-97 transition-all mt-auto"
              >
                ✕ Switch Back to Live Log Stream
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-2.5 border-t border-slate-800 bg-[#0c101b] flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span>Session Snapshot Engine</span>
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
        </div>
      </div>
    </div>
  );
}
