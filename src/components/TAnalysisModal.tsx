import React, { useState, useEffect } from 'react';
import { InterceptedRequest, TrafficDefinition, AnalysisGroup } from '../types';
import { getTrafficSignature, getAnalysisGroups, saveTrafficDefinition, getTrafficDefinitions } from '../lib/sessionAndAnalysis';
import { X, Check, FolderPlus, Tag, Info, AlertTriangle } from 'lucide-react';

interface TAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: InterceptedRequest;
  onSaved?: () => void;
}

export default function TAnalysisModal({ isOpen, onClose, request, onSaved }: TAnalysisModalProps) {
  const signature = getTrafficSignature(request.method, request.path);
  
  // States
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [group, setGroup] = useState('General & Diagnostics');
  const [inputParams, setInputParams] = useState('');
  const [outputParams, setOutputParams] = useState('');
  
  const [groups, setGroups] = useState<AnalysisGroup[]>([]);
  const [newGroupInput, setNewGroupInput] = useState('');
  const [showAddNewGroup, setShowAddNewGroup] = useState(false);

  // Load existing definition if any, or auto-extract schemas from request
  // Helper to recursively extract variables from objects for the spec
  const extractVariables = (obj: any, prefix = ''): string => {
    let result = '';
    if (!obj || typeof obj !== 'object') return result;

    if (Array.isArray(obj)) {
      if (obj.length > 0 && typeof obj[0] === 'object') {
        result += extractVariables(obj[0], `${prefix}[0].`);
      } else {
        result += `  • ${prefix || 'Array'}: Array (Length: ${obj.length})\n`;
      }
      return result;
    }

    Object.entries(obj).forEach(([k, v]) => {
      const path = prefix ? `${prefix}${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const keys = Object.keys(v).slice(0, 10).join(', ');
        const more = Object.keys(v).length > 10 ? '...' : '';
        result += `  • ${path}: Object {${keys}${more}}\n`;
        result += extractVariables(v, `${path}.`);
      } else if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'object') {
          const keys = Object.keys(v[0]).slice(0, 10).join(', ');
          const more = Object.keys(v[0]).length > 10 ? '...' : '';
          result += `  • ${path}: Array of Objects {${keys}${more}}\n`;
          result += extractVariables(v[0], `${path}[0].`);
        } else {
          result += `  • ${path}: Array\n`;
        }
      } else {
        const valType = typeof v;
        result += `  • ${path}: ${valType} (Sample: ${JSON.stringify(v)})\n`;
      }
    });
    return result;
  };

  useEffect(() => {
    if (!isOpen) return;

    const availableGroups = getAnalysisGroups();
    setGroups(availableGroups);

    const definitions = getTrafficDefinitions();
    const existing = definitions.find(d => d.signature === signature);

    if (existing) {
      setName(existing.name);
      setDescription(existing.description);
      setGroup(existing.group);
      setInputParams(existing.inputParameters);
      setOutputParams(existing.outputParameters);
    } else {
      // Auto pre-fill with a reasonable name and extracted schemas
      setName(`${request.method} /${request.path.split('/').pop() || 'handler'}`);
      setDescription(`Automatic mapping for packet: ${request.path}`);
      setGroup(availableGroups[0]?.name || 'General & Diagnostics');

      // 1. Build rich representation of input parameters (Query and Body)
      let defaultInput = '';
      if (Object.keys(request.queryParams || {}).length > 0) {
        defaultInput += `[URL Query Parameters]:\n`;
        Object.entries(request.queryParams).forEach(([k, v]) => {
          defaultInput += `  • ${k}: ${v} (Type: ${typeof v})\n`;
        });
      }

      if (request.requestBody) {
        if (defaultInput) defaultInput += `\n`;
        defaultInput += `[Request Payload Body Parameters]:\n`;
        try {
          const parsed = JSON.parse(request.requestBody);
          defaultInput += extractVariables(parsed);
        } catch {
          defaultInput += `  • Raw Payload: ${request.requestBody}\n`;
        }
      }
      
      if (!defaultInput) {
        defaultInput = `(No query or body data parameters discovered in packet)`;
      }
      setInputParams(defaultInput);

      // 2. Build rich representation of output parameters (Response)
      let defaultOutput = '';
      if (request.responseBody) {
        defaultOutput += `[Captured Response fields]:\n`;
        try {
          const parsed = JSON.parse(request.responseBody);
          defaultOutput += extractVariables(parsed);
        } catch {
          defaultOutput += `  • Raw Body: ${request.responseBody.substring(0, 150)}\n`;
        }
      } else {
        defaultOutput = `Status ${request.status || 200} (Empty Body)`;
      }
      setOutputParams(defaultOutput);
    }
  }, [isOpen, request, signature]);

  if (!isOpen) return null;

  const handleAddNewGroup = () => {
    if (!newGroupInput.trim()) return;
    const cleanGroup = newGroupInput.trim();
    
    // Write new group to storage
    const newG: AnalysisGroup = {
      id: 'g_' + Math.random().toString(36).substring(2, 9),
      name: cleanGroup,
      description: 'Custom clustered analytic category'
    };
    
    const rawGroups = localStorage.getItem('proxydev_analysis_groups');
    let currentGList: AnalysisGroup[] = [];
    try {
      currentGList = rawGroups ? JSON.parse(rawGroups) : groups;
    } catch {
      currentGList = groups;
    }

    if (!currentGList.some(g => g.name.toLowerCase() === cleanGroup.toLowerCase())) {
      const updated = [...currentGList, newG];
      localStorage.setItem('proxydev_analysis_groups', JSON.stringify(updated));
      setGroups(updated);
      setGroup(cleanGroup);
    }
    setNewGroupInput('');
    setShowAddNewGroup(false);
  };

  const handleSave = () => {
    const finalDef: TrafficDefinition = {
      signature,
      name: name.trim() || `${request.method} ${request.path}`,
      description: description.trim(),
      inputParameters: inputParams,
      outputParameters: outputParams,
      group
    };

    saveTrafficDefinition(finalDef);
    if (onSaved) onSaved();
    onClose();
  };

  return (
    <div id="tanalysis-modal-portal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div 
        id="tanalysis-modal-card" 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-805 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 font-mono">
              <Tag className="w-4 h-4 text-blue-400" />
              Define & Group Endpoint Pattern
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-405 hover:text-slate-205 py-1 px-1 rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body Scrollable */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
          
          {/* Signature warning notice */}
          <div className="bg-blue-950/30 border border-blue-500/20 p-3 rounded-lg text-blue-350 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-450 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Signature Match Pattern</p>
              <div className="font-mono text-[10.5px] bg-slate-950/50 px-2 py-1 rounded border border-blue-500/10 mt-1 flex items-center gap-1">
                <span className="text-blue-400 font-extrabold">{request.method}</span>
                <span className="text-slate-400">{request.path.split('?')[0]}</span>
              </div>
              <p className="text-[10px] mt-1 text-slate-455">
                Every subsequent packet that has this exact method and endpoint route will use this specification.
              </p>
            </div>
          </div>

          {/* Core Name & Group row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">Custom Name / Label</label>
              <input 
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Authenticate API and load Session tokens"
                className="w-full bg-[#0a0f1d] border border-slate-705 text-slate-200 px-3 py-2 rounded-lg text-xs outline-none focus:border-blue-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">Functional Group / Domain Cluster</label>
              {showAddNewGroup ? (
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={newGroupInput}
                    onChange={e => setNewGroupInput(e.target.value)}
                    placeholder="E.g. Payment Pipelines"
                    className="flex-1 bg-[#0a0f1d] border border-emerald-500/30 text-slate-250 px-3 py-1.5 rounded-lg text-xs outline-none font-medium"
                  />
                  <button 
                    onClick={handleAddNewGroup}
                    className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-1.5 rounded-lg font-bold hover:bg-emerald-600/40 flex items-center justify-center cursor-pointer"
                  >
                    Add
                  </button>
                  <button 
                    onClick={() => setShowAddNewGroup(false)}
                    className="bg-slate-800 text-slate-400 px-2.5 py-1.5 rounded-lg font-bold hover:bg-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select 
                    value={group}
                    onChange={e => setGroup(e.target.value)}
                    className="flex-1 bg-[#0a0f1d] border border-slate-705 text-slate-200 px-3 py-2 rounded-lg text-xs outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {groups.map(g => (
                      <option key={g.id || g.name} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                  <button 
                    onClick={() => setShowAddNewGroup(true)}
                    className="p-2 border border-slate-705 rounded-lg text-slate-400 hover:text-blue-400 hover:border-slate-600 bg-[#0a0f1d] cursor-pointer flex items-center justify-center"
                    title="Create custom API cluster group"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Description Block */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">Functional Description</label>
            <textarea 
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Used to verify password validity. Sets a secure HTTP-Only cookie, triggers geolocation auditing and session telemetry database locks."
              className="w-full bg-[#0a0f1d] border border-slate-710 text-slate-200 px-3 py-1.5 rounded-lg text-xs h-[60px] outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Parameters Spec */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1 flex items-center gap-1 text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Input Parameters Mapping
              </label>
              <textarea 
                value={inputParams}
                onChange={e => setInputParams(e.target.value)}
                className="w-full bg-slate-950/75 border border-slate-800 text-emerald-400 p-2.5 rounded-lg text-[10px] font-mono h-[140px] outline-none focus:border-slate-700 font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1 flex items-center gap-1 text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> Output Parameters Mapping
              </label>
              <textarea 
                value={outputParams}
                onChange={e => setOutputParams(e.target.value)}
                className="w-full bg-slate-950/75 border border-slate-800 text-purple-400 p-2.5 rounded-lg text-[10px] font-mono h-[140px] outline-none focus:border-slate-700 font-medium"
              />
            </div>
          </div>

        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-slate-950/60 border-t border-slate-805 flex justify-end gap-3 shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition-all text-xs cursor-pointer active:scale-95"
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-all text-xs flex items-center gap-1 cursor-pointer active:scale-95 shadow-md shadow-blue-900/30"
          >
            <Check className="w-3.5 h-3.5" />
            Save Specification
          </button>
        </div>

      </div>
    </div>
  );
}
