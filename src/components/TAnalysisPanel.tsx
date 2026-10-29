import React, { useState, useEffect } from 'react';
import { TrafficDefinition, AnalysisGroup, InterceptedRequest } from '../types';
import { getTrafficDefinitions, getAnalysisGroups, saveTrafficDefinition, deleteTrafficDefinition, saveAnalysisGroup, deleteAnalysisGroup } from '../lib/sessionAndAnalysis';
import { Layers, Printer, Trash2, Edit3, Plus, Check, X, FileText, LayoutGrid, ListFilter, ClipboardCheck, Zap, Play } from 'lucide-react';

interface TAnalysisPanelProps {
  logs: InterceptedRequest[];
  onTriggerEditLog?: (log: InterceptedRequest) => void;
}

export default function TAnalysisPanel({ logs, onTriggerEditLog }: TAnalysisPanelProps) {
  // States
  const [definitions, setDefinitions] = useState<TrafficDefinition[]>([]);
  const [groups, setGroups] = useState<AnalysisGroup[]>([]);
  
  // Create / Edit Group Dialog States
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupDescInput, setGroupDescInput] = useState('');
  const [selectedGroupToEdit, setSelectedGroupToEdit] = useState<AnalysisGroup | null>(null);

  // Print Settings Options State
  const [reportStatement, setReportStatement] = useState(
    'This traffic assessment validates all transactional input/output parameters across localized network hops. Endpoint integrity has been analyzed to ensure robust serialization models.'
  );

  // Edit Definition inline state
  const [editingDef, setEditingDef] = useState<TrafficDefinition | null>(null);

  // Parallel Execution Multiplier
  const [parallelCount, setParallelCount] = useState<number>(1);
  const [isExecutingParallel, setIsExecutingParallel] = useState<boolean>(false);
  const [stealthMode, setStealthMode] = useState<boolean>(false);
  const [executionLogs, setExecutionLogs] = useState<{name: string, status: number, duration: number}[]>([]);

  // Toggle options
  const [hideParamValues, setHideParamValues] = useState<boolean>(false);
  const [hideNullValues, setHideNullValues] = useState<boolean>(false);
  const [expandJsonInReport, setExpandJsonInReport] = useState<boolean>(true);
  const [emptyOutputSamples, setEmptyOutputSamples] = useState<boolean>(false);
  const [showClusterManager, setShowClusterManager] = useState<boolean>(false);

  // Helper to strip parameter values and keep only variable structures
  const formatParamsText = (text: string, keepVariablesOnly: boolean): string => {
    if (!text) return '';
    if (!keepVariablesOnly) return text;
    // Strip out (Value: xxx), (Sample: xxx), (Result: xxx) patterns from parameter definitions
    return text.replace(/\s*\((Value|Sample|Result):\s*.*?\)/g, '');
  };

  // Load Data
  const loadData = () => {
    setDefinitions(getTrafficDefinitions());
    setGroups(getAnalysisGroups());
  };

  useEffect(() => {
    loadData();
    
    const handleUpdate = () => loadData();
    window.addEventListener('tanalysis-defs-updated', handleUpdate);
    return () => window.removeEventListener('tanalysis-defs-updated', handleUpdate);
  }, []);

  const handleDeleteDef = (signature: string) => {
    deleteTrafficDefinition(signature);
    loadData();
  };

  const handleSaveGroup = () => {
    if (!groupNameInput.trim()) return;
    const g: AnalysisGroup = {
      id: selectedGroupToEdit ? selectedGroupToEdit.id : 'g_' + Math.random().toString(36).substring(2, 9),
      name: groupNameInput.trim(),
      description: groupDescInput.trim() || 'Custom classified cluster group'
    };
    saveAnalysisGroup(g);
    loadData();
    setShowGroupModal(false);
    setGroupNameInput('');
    setGroupDescInput('');
    setSelectedGroupToEdit(null);
  };

  const handleTriggerEditGroup = (g: AnalysisGroup) => {
    setSelectedGroupToEdit(g);
    setGroupNameInput(g.name);
    setGroupDescInput(g.description);
    setShowGroupModal(true);
  };

  const handleDeleteGroup = (gId: string, name: string) => {
    const remainingGroups = groups.filter(g => g.id !== gId);
    let targetGroupName = 'General & Diagnostics';
    
    if (remainingGroups.length > 0) {
      targetGroupName = remainingGroups[0].name;
    } else {
      // Re-create a Default Group since none are left
      const defaultGeneral: AnalysisGroup = {
        id: 'g_general',
        name: 'General & Diagnostics',
        description: 'Telemetry, logging, status pins, unclassified endpoints'
      };
      saveAnalysisGroup(defaultGeneral);
    }

    if (confirm(`Are you sure you want to delete cluster group "${name}"? Existing traffic definitions in this group will be moved to "${targetGroupName}".`)) {
      const updatedDefs = getTrafficDefinitions().map(def => {
        if (def.group === name) {
          return { ...def, group: targetGroupName };
        }
        return def;
      });
      localStorage.setItem('proxydev_traffic_definitions', JSON.stringify(updatedDefs));
      deleteAnalysisGroup(gId);
      loadData();
    }
  };

  // Helper to parse the parameter strings into structured rows for the report
  const parseParamsToTable = (text: string, redactValues: boolean = false, expandJson: boolean = true, hideNulls: boolean = false) => {
    if (!text) return '<tr><td colspan="2" style="color:#94a3b8; font-style:italic;">No parameters mapped</td></tr>';
    
    const cleanValue = (val: string): string => {
      if (!val) return '';
      // Basic cleaning: remove HTML tags, literal escape sequences, and collapse whitespace
      return val
        .replace(/<[^>]*>?/gm, ' ')
        .replace(/\\r|\\n|\\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const isNullish = (val: any): boolean => {
      if (val === null || val === undefined) return true;
      const s = String(val).toLowerCase().trim();
      // Expanded nullish check to include more placeholders and empty collections
      return s === 'null' || s === 'undefined' || s === '' || s === '-' || s === '[]' || s === '{}' || s === '""' || s === "''";
    };

    // Check for the bracketed list format: ["Var1":"val1", "Var2":"val2"]
    if (text.trim().startsWith('[') && text.trim().endsWith(']')) {
      const content = text.trim().substring(1, text.trim().length - 1);
      // Split by comma outside of quotes if possible
      const entries = content.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      
      const rows = entries.map(entry => {
        const colonIdx = entry.indexOf(':');
        if (colonIdx === -1) return '';
        
        let key = entry.substring(0, colonIdx).trim().replace(/^["']|["']$/g, '');
        let val = entry.substring(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
        
        if (hideNulls && isNullish(val)) return '';

        const displayVal = redactValues ? '[REDACTED]' : cleanValue(val);

        return `
          <tr>
            <td style="padding: 4px 8px; border-bottom: 1px solid #f1f5f9; font-weight: 700; color: #0f172a;">${escapeHTML(key)}</td>
            <td style="padding: 4px 8px; border-bottom: 1px solid #f1f5f9; font-family: monospace; color: #2563eb;">${escapeHTML(displayVal)}</td>
          </tr>
        `;
      }).filter(Boolean).join('');
      
      if (rows) return rows;
    }

    const lines = text.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('['));
    if (lines.length === 0) return `<tr><td colspan="2" style="color:#64748b; font-family:monospace; font-size:10px;">${escapeHTML(text)}</td></tr>`;
    
    const generateRowsForValue = (varName: string, varType: string, varValue: string, hadValueHighlight: boolean): string => {
      if (hideNulls && isNullish(varValue)) return '';

      // If it's a JSON object string, try to expand it into multiple rows
      if (expandJson && hadValueHighlight && !redactValues) {
        try {
          const trimmedVal = varValue.trim();
          if ((trimmedVal.startsWith('{') && trimmedVal.endsWith('}')) || (trimmedVal.startsWith('[') && trimmedVal.endsWith(']'))) {
             const parsed = JSON.parse(trimmedVal);
             if (typeof parsed === 'object' && parsed !== null) {
                // Return multiple rows for each key
                return Object.entries(parsed).map(([k, v]) => {
                  if (hideNulls && isNullish(v)) return '';
                  const vStr = typeof v === 'string' ? cleanValue(v) : JSON.stringify(v);
                  return `
                    <tr>
                      <td style="padding: 4px 8px; border-bottom: 1px dotted #e2e8f0; font-weight: 700; color: #1e3a8a; white-space: nowrap; padding-left: 16px;">${escapeHTML(varName)}.${escapeHTML(k)}</td>
                      <td style="padding: 4px 8px; border-bottom: 1px dotted #e2e8f0; font-family: monospace; color: #0ea5e9;">${escapeHTML(vStr)}</td>
                    </tr>
                  `;
                }).join('');
             }
          }
        } catch (e) {
          // Not valid JSON or failed to parse, fall back to single row
        }
      }

      let finalDisplayValue = hadValueHighlight ? cleanValue(varValue) : varValue;
      if (redactValues && hadValueHighlight) {
        finalDisplayValue = '<span style="font-size:8px; color:#cbd5e1; font-style:italic;">[HIDDEN]</span>';
      } else if (redactValues && !hadValueHighlight && varValue === '-') {
        finalDisplayValue = '<span style="font-size:8px; color:#cbd5e1;">-</span>';
      }

      return `
        <tr>
          <td style="padding: 4px 8px; border-bottom: 1px solid #f1f5f9; font-weight: 700; color: #0f172a; white-space: nowrap;">${escapeHTML(varName)}</td>
          <td style="padding: 4px 8px; border-bottom: 1px solid #f1f5f9; font-family: monospace; color: #2563eb;">${escapeHTML(finalDisplayValue)}</td>
        </tr>
      `;
    };

    return lines.map(line => {
      // Expected format: "  • variable: type (Value: value)" or similar
      const cleanLine = line.trim().replace(/^•\s*/, '');
      
      // If it's a bracketed header, skip it as a variable
      if (cleanLine.startsWith('[') && cleanLine.endsWith(']')) return '';

      const parts = cleanLine.split(':');
      if (parts.length < 2 && !cleanLine.includes('•')) return `<tr><td colspan="2" style="color:#64748b; font-size:10px; padding:4px 8px; border-bottom: 1px solid #f1f5f9;">${escapeHTML(cleanLine)}</td></tr>`;
      
      const varName = parts[0]?.trim() || 'Variable';
      
      let varType = 'unknown';
      let varValue = 'N/A';
      let hadValueHighlight = false;
      
      const remaining = parts.slice(1).join(':').trim();
      if (remaining) {
        // Find if there is a (Value:...) or (Sample:...) or (Result:...) pattern at the end
        const valuePattern = /\((Value|Sample|Result):\s*(.*?)\)$/;
        const valueMatch = remaining.match(valuePattern);
        
        if (valueMatch) {
          // Everything before the bracketed value is the Type or Structure
          varType = remaining.replace(valuePattern, '').trim();
          varValue = valueMatch[2];
          hadValueHighlight = true;
        } else {
          // No bracketed value. Check if it's a known structural type (possibly with {keys})
          const structuralPattern = /^(Object|Array of Objects|Array|string|number|boolean|null)(\s*\{.*?\})?$/i;
          const structuralMatch = remaining.match(structuralPattern);
          
          if (structuralMatch) {
            varType = remaining;
            varValue = '-';
            hadValueHighlight = false;
          } else {
            // Assume it's a raw value
            varValue = remaining;
            varType = 'Captured';
            hadValueHighlight = true;
          }
        }
      }
      
      return generateRowsForValue(varName, varType, varValue, hadValueHighlight);
    }).filter(Boolean).join('');
  };

  // Helper: Print / Export formatted analytical report
  const handlePrintReport = () => {
    // Collect stats
    const uniqueDomains = Array.from(new Set(logs.map(l => l.domain))).filter(Boolean);
    const domainText = uniqueDomains.length > 0 ? uniqueDomains.join(', ') : 'localhost / Internal proxy scope';

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Generate neat categorized markdown-HTML
    let groupsHTML = '';
    groups.forEach(g => {
      const defsInGroup = definitions.filter(d => d.group === g.name);
      if (defsInGroup.length === 0) return;

      groupsHTML += `
        <div class="group-section">
          <div class="group-header">${g.name}</div>
          <div class="group-desc">${g.description}</div>
          ${defsInGroup.map(d => `
            <div class="definition-card">
              <div class="card-title-row">
                <span class="card-name">${escapeHTML(d.name)}</span>
                <span class="card-signature">${escapeHTML(d.signature)}</span>
              </div>
              <p class="card-desc">${escapeHTML(d.description || 'No description provided')}</p>
              
              <div class="param-grid">
                <div class="param-block">
                  <div class="block-title">Input Variable Mapping ${hideParamValues ? '(Variables Only)' : ''}</div>
                  <table style="width:100%; border-collapse: collapse; font-size: 10px; margin-top: 5px;">
                    <thead>
                      <tr style="background:#f8fafc; border-bottom: 1.5px solid #e2e8f0;">
                        <th style="text-align:left; padding: 4px 8px;">Variable Name</th>
                        <th style="text-align:left; padding: 4px 8px;">Mapped Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${parseParamsToTable(d.inputParameters, hideParamValues, expandJsonInReport, hideNullValues)}
                    </tbody>
                  </table>
                </div>
                <div class="param-block">
                  <div class="block-title">Corresponding Output Variables ${(hideParamValues || emptyOutputSamples) ? '(Variables Only)' : ''}</div>
                  <table style="width:100%; border-collapse: collapse; font-size: 10px; margin-top: 5px;">
                    <thead>
                      <tr style="background:#f8fafc; border-bottom: 1.5px solid #e2e8f0;">
                        <th style="text-align:left; padding: 4px 8px;">Variable Name</th>
                        <th style="text-align:left; padding: 4px 8px;">Output Sample</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${parseParamsToTable(d.outputParameters, hideParamValues || emptyOutputSamples, expandJsonInReport, hideNullValues)}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    });

    if (!groupsHTML) {
      groupsHTML = `
        <div style="text-align: center; color: #64748b; padding: 40px; border: 1px dashed #cbd5e1; border-radius: 8px;">
          <h3>No Traffic Mappings Registered Yet</h3>
          <p>Please click the '+' icon next to requests in the traffic logs stream to map endpoints first.</p>
        </div>
      `;
    }

    const reportContentHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>API Traffic & Parameter Mapping Assessment Report</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; padding: 40px; margin: 0; background: #ffffff; }
          .report-header { border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
          .report-title { font-size: 24px; font-weight: 850; color: #1e3a8a; margin: 0 0 5px 0; letter-spacing: -0.025em; }
          .report-subtitle { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #2563eb; margin: 0; letter-spacing: 0.1em; }
          
          .metadata-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px 20px; margin-bottom: 30px; font-size: 13px; }
          .meta-item .meta-label { font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 10px; tracking: 0.05em; display: block; margin-bottom: 3px; }
          .meta-item .meta-value { font-family: monospace; font-size: 12.5px; color: #0f172a; }
          
          .statement-card { background: #eff6ff; border-left: 4px solid #2563eb; padding: 15px 20px; border-radius: 0 8px 8px 0; margin-bottom: 45px; }
          .statement-title { font-weight: 700; color: #1e40af; font-size: 12px; text-transform: uppercase; margin: 0 0 5px 0; }
          .statement-body { font-size: 14.5px; color: #1e3a8a; font-style: italic; margin: 0; }

          .group-section { margin-bottom: 40px; page-break-inside: avoid; }
          .group-header { font-size: 18px; font-weight: 750; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 4px; }
          .group-desc { font-size: 11.5px; color: #64748b; margin-bottom: 15px; }
          
          .definition-card { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin-bottom: 20px; page-break-inside: avoid; }
          .card-title-row { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 10px; }
          .card-name { font-weight: 700; font-size: 14px; color: #0f172a; }
          .card-signature { font-family: monospace; font-size: 11px; background: #f1f5f9; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
          .card-desc { font-size: 12.5px; color: #334155; margin: 0 0 12px 0; }

          .param-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .param-block { background: #fafafa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; }
          .block-title { font-weight: 750; font-size: 10px; text-transform: uppercase; color: #64748b; margin-bottom: 6px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 4px; }
          .block-body { font-family: monospace; font-size: 10.5px; color: #0f172a; white-space: pre-wrap; margin: 0; }

          .print-badge { transform: translate(-50%, -50%); position: fixed; bottom: 20px; right: 20px; background: #2563eb; color: #ffffff; font-weight: 700; padding: 10px 20px; border-radius: 50px; font-size: 13px; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.4); border: none; }
          @media print {
            .print-badge { display: none; }
            body { padding: 10px; }
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <p class="report-subtitle">TAnalysis System Diagnostic Assessment</p>
          <h1 class="report-title">API Routing Traffic Analytical Report</h1>
        </div>
        
        <div class="metadata-grid">
          <div class="meta-item">
            <span class="meta-label">Assessment Domain Scope</span>
            <span class="meta-value">${escapeHTML(domainText)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Report Generation Timestamp</span>
            <span class="meta-value">${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC</span>
          </div>
        </div>

        <div class="statement-card">
          <div class="statement-title">Executive Final Statement Summary</div>
          <p class="statement-body">"${escapeHTML(reportStatement)}"</p>
        </div>

        ${groupsHTML}

        <div style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b; font-family: sans-serif;">
          <span>TAnalysis Specification Report</span>
          <span>Developed by <a href="https://github.com/FAYSAL-Q8" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-weight: 600;">FA</a></span>
        </div>

        <button class="print-badge" onclick="window.print()">🖨️ Print Document</button>
      </body>
      </html>
    `;

    printWindow.document.write(reportContentHTML);
    printWindow.document.close();
  };

  const escapeHTML = (text: string) => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Trigger Parallel Execution for a single Spec
  const handleParallelExecuteSpec = async (def: TrafficDefinition) => {
    if (parallelCount < 1) return;
    setIsExecutingParallel(true);
    setExecutionLogs([]);
    
    const parts = def.signature.split(':');
    const method = parts[0];
    const url = 'http://localhost' + parts[1]; // Proxy target or absolute URL if mapped

    const tasks = Array.from({ length: parallelCount }).map(async (_, idx) => {
      try {
        // Add random jitter in stealth mode (0-800ms)
        if (stealthMode) {
          await new Promise(r => setTimeout(r, Math.random() * 800));
        }

        const startTime = performance.now();
        const response = await fetch('/api/replay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method,
            url,
            headers: { 'Content-Type': 'application/json' },
            body: def.inputParameters.includes('{') ? def.inputParameters : ''
          })
        });
        const duration = Math.round(performance.now() - startTime);
        const data = await response.json();
        return { name: `${def.name} #${idx + 1}`, status: response.status, duration };
      } catch (err) {
        return { name: `${def.name} #${idx + 1}`, status: 0, duration: 0 };
      }
    });

    const results = await Promise.all(tasks);
    setExecutionLogs(results);
    setIsExecutingParallel(false);
  };

  // Trigger Parallel Execution for an entire Group
  const handleParallelExecuteGroup = async (groupName: string) => {
    if (parallelCount < 1) return;
    setIsExecutingParallel(true);
    setExecutionLogs([]);
    
    const defsInGroup = definitions.filter(d => d.group === groupName);
    const allTasks: Promise<{name: string, status: number, duration: number}>[] = [];

    defsInGroup.forEach(def => {
      const parts = def.signature.split(':');
      const method = parts[0];
      const url = 'http://localhost' + parts[1];

      for (let i = 0; i < parallelCount; i++) {
        allTasks.push((async () => {
          try {
            // Add random jitter in stealth mode (0-1500ms for groups)
            if (stealthMode) {
              await new Promise(r => setTimeout(r, Math.random() * 1500));
            }
            
            const startTime = performance.now();
            const response = await fetch('/api/replay', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method,
                url,
                headers: { 'Content-Type': 'application/json' },
                body: def.inputParameters.includes('{') ? def.inputParameters : ''
              })
            });
            const duration = Math.round(performance.now() - startTime);
            return { name: `${def.name} i${i+1}`, status: response.status, duration };
          } catch (err) {
            return { name: `${def.name} i${i+1}`, status: 0, duration: 0 };
          }
        })());
      }
    });

    const results = await Promise.all(allTasks);
    setExecutionLogs(results);
    setIsExecutingParallel(false);
  };

  return (
    <div id="tanalysis-workspace-panel-root" className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full text-xs font-sans">
      
      {/* Left panel specifications listings */}
      <div className="lg:col-span-8 flex flex-col h-full bg-[#1e293b] border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl p-5 gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-700 pb-3 gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-100 font-mono">TAnalysis: API Endpoint Mappings</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Categorized parameter serialization maps</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <button 
              onClick={() => setHideParamValues(!hideParamValues)}
              className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                hideParamValues 
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-bold'
                  : 'bg-slate-805 border-slate-700/60 text-slate-450 hover:text-slate-200'
              }`}
              title="Show only key variables schema, stripping out specific payload values"
            >
              <span>{hideParamValues ? 'Variables Only Mode' : 'Show Sample Values'}</span>
            </button>

            <button 
              onClick={() => setEmptyOutputSamples(!emptyOutputSamples)}
              className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                emptyOutputSamples 
                  ? 'bg-purple-600/20 text-purple-400 border-purple-500/40 font-bold'
                  : 'bg-slate-805 border-slate-700/60 text-slate-450 hover:text-slate-200'
              }`}
              title="Keep output values empty for privacy while showing input samples"
            >
              <span>{emptyOutputSamples ? 'Empty Output Values' : 'Show Output Samples'}</span>
            </button>

            <button 
              onClick={() => setExpandJsonInReport(!expandJsonInReport)}
              className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                expandJsonInReport 
                  ? 'bg-green-600/20 text-green-400 border-green-500/40 font-bold'
                  : 'bg-slate-805 border-slate-700/60 text-slate-450 hover:text-slate-200'
              }`}
              title="Toggle whether JSON objects are expanded into multiple rows in the final report"
            >
              <span>{expandJsonInReport ? 'JSON Expanded' : 'JSON Compact'}</span>
            </button>

            <button 
              onClick={() => setHideNullValues(!hideNullValues)}
              className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                hideNullValues 
                  ? 'bg-amber-600/20 text-amber-400 border-amber-500/40 font-bold'
                  : 'bg-slate-805 border-slate-700/60 text-slate-450 hover:text-slate-200'
              }`}
              title="Hide parameter rows that contain null, empty, or placeholder values"
            >
              <span>{hideNullValues ? 'Nulls Hidden' : 'Show All'}</span>
            </button>

            <button 
              onClick={handlePrintReport}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg border border-blue-500/30 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all font-mono"
            >
              <Printer className="w-4 h-4" />
              <span>Print Assessment Report</span>
            </button>
          </div>
        </div>

        {/* Categories Group list and mapped specs */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {definitions.length === 0 ? (
            <div className="text-[11px] text-slate-400 italic py-12 text-center bg-slate-900/10 border border-slate-800 rounded-xl flex flex-col items-center justify-center gap-2">
              No mapped traffic definitions are currently assigned.
              <p className="text-[10px] text-slate-500">Go to Proxy Logs stream and click "+ Action Specs" to dynamically register traffic mappings.</p>
            </div>
          ) : (
            groups
              .filter(g => definitions.some(d => d.group === g.name))
              .map(g => {
                const defsInGroup = definitions.filter(d => d.group === g.name);
                return (
                  <div key={g.id} className="bg-slate-900/40 p-4 border border-slate-800 rounded-xl space-y-3.5">
                    <div className="flex justify-between items-start border-b border-slate-800/85 pb-2">
                      <div>
                        <h3 className="font-bold text-slate-200 text-xs flex items-center gap-2 font-mono">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          {g.name}
                          <span className="text-[10px] text-slate-500 font-normal">({defsInGroup.length} specification{defsInGroup.length === 1 ? '' : 's'})</span>
                        </h3>
                        <p className="text-[10.5px] text-slate-400 mt-0.5 italic">{g.description}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2 mr-2">
                           <Zap className={`w-3.5 h-3.5 ${isExecutingParallel ? 'text-amber-400 animate-pulse' : 'text-slate-500'} mr-1.5`} />
                           <span className="text-[10px] text-slate-500 font-mono mr-2">x</span>
                           <input 
                             type="number" 
                             min="1" 
                             max="100" 
                             value={parallelCount} 
                             onChange={e => setParallelCount(parseInt(e.target.value) || 1)}
                             className="w-10 bg-transparent text-slate-200 text-xs font-bold outline-none font-mono"
                           />
                        </div>
                        <button 
                          onClick={() => setStealthMode(!stealthMode)}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer active:scale-95 transition-all flex items-center gap-1.5 border ${
                            stealthMode 
                              ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' 
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                          }`}
                          title="Avoid Bot Detection: Adds randomized delays and realistic headers"
                        >
                          <Layers className="w-3 h-3" />
                          Stealth
                        </button>
                        <button 
                          onClick={() => handleParallelExecuteGroup(g.name)}
                          disabled={isExecutingParallel}
                          className="bg-amber-600/10 hover:bg-amber-600/25 text-amber-500 border border-amber-500/20 px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Play className="w-3 h-3" />
                          Fire Combined Parallel
                        </button>
                        <button 
                          onClick={() => handleTriggerEditGroup(g)}
                          className="text-slate-450 hover:text-slate-300 p-1 rounded hover:bg-slate-800 cursor-pointer"
                          title="Edit group title/descriptor"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteGroup(g.id, g.name)}
                          className="text-slate-450 hover:text-rose-450 p-1 rounded hover:bg-slate-800 cursor-pointer"
                          title="Delete functional API group and move definitions to remaining active groups"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {defsInGroup.map(d => (
                        <div key={d.signature} className="bg-slate-950/65 border border-slate-805 rounded-lg p-3 space-y-2">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <div className="font-extrabold text-slate-200 text-xs flex items-center gap-1.5 mb-1">
                                <span className="text-emerald-400 font-mono text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/15">{d.signature.split(':')[0]}</span>
                                <span>{d.name}</span>
                              </div>
                              <span className="text-[10px] font-mono text-blue-450 tracking-tight leading-none block select-all">{d.signature.split(':')[1]}</span>
                            </div>

                            <div className="flex gap-1">
                              <button 
                                onClick={() => handleParallelExecuteSpec(d)}
                                disabled={isExecutingParallel}
                                className="text-amber-500 hover:text-amber-400 bg-amber-500/10 border border-amber-500/20 p-1.5 rounded cursor-pointer active:scale-90 transition-all disabled:opacity-50"
                                title="Execute simultaneously in parallel"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => {
                                  // Match back to actual log if available, or fake one
                                  const matchingLog = logs.find(l => {
                                    const parts = d.signature.split(':');
                                    const m = parts[0];
                                    const p = parts[1];
                                    return l.method.toUpperCase() === m.toUpperCase() && l.path.split('?')[0] === p;
                                  }) || {
                                    id: 'mock',
                                    timestamp: new Date().toISOString(),
                                    method: d.signature.split(':')[0],
                                    url: 'http://localhost' + d.signature.split(':')[1],
                                    domain: 'localhost',
                                    path: d.signature.split(':')[1],
                                    queryParams: {},
                                    requestHeaders: {},
                                    requestBody: d.inputParameters,
                                    responseHeaders: {},
                                    responseBody: d.outputParameters,
                                    status: 200,
                                    contentType: 'application/json',
                                    durationMs: 12
                                  };
                                  if (onTriggerEditLog) {
                                    onTriggerEditLog(matchingLog);
                                  }
                                }}
                                className="text-slate-455 hover:text-slate-300 bg-slate-900 border border-slate-800 p-1.5 rounded cursor-pointer"
                                title="Tweak mappings values"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteDef(d.signature)}
                                className="text-slate-455 hover:text-rose-450 bg-slate-900 border border-slate-800 p-1.5 rounded cursor-pointer"
                                title="Delete specification"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <p className="text-[11px] text-slate-400 leading-normal">{d.description || 'No description classification mapped'}</p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-slate-900/60 font-mono text-[10px]">
                            <div className="bg-slate-950/40 p-2 rounded border border-slate-900/60">
                              <div className="text-[8.5px] uppercase text-slate-505 font-bold tracking-wider mb-1">Inputs Parameters</div>
                              <pre className="text-emerald-500 font-medium whitespace-pre-wrap" title={d.inputParameters}>{formatParamsText(d.inputParameters, hideParamValues)}</pre>
                            </div>
                            <div className="bg-slate-950/40 p-2 rounded border border-slate-900/60">
                              <div className="text-[8.5px] uppercase text-slate-505 font-bold tracking-wider mb-1">Outputs Parameters</div>
                              <pre className="text-purple-400 font-medium whitespace-pre-wrap" title={d.outputParameters}>{formatParamsText(d.outputParameters, hideParamValues || emptyOutputSamples)}</pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* Right panel helper for printing options & Groups creation */}
      <div className="lg:col-span-4 flex flex-col h-full gap-5">
        
        {/* final statement block */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
            <FileText className="w-4.5 h-4.5 text-purple-400" />
            <h3 className="font-bold text-slate-200 text-xs">Report Final Statement Summary</h3>
          </div>
          <p className="text-[10px] text-slate-450 leading-relaxed">
            Write an overarching diagnostic diagnostic statement. This summary is injected as the Executive Verdict statement on top of the print report window.
          </p>
          <textarea 
            value={reportStatement}
            onChange={e => setReportStatement(e.target.value)}
            className="w-full bg-slate-950 text-slate-300 p-3 rounded-lg text-xs h-[100px] border border-slate-800 outline-none focus:border-purple-650 resize-none font-medium leading-normal"
            placeholder="Introduce executive summaries or final statements on analyzed traffic..."
          />
          <div className="flex justify-between items-center bg-slate-950/65 px-3 py-1.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Specs Registered</span>
            <span className="font-bold font-mono text-xs text-blue-400">{definitions.length}</span>
          </div>
        </div>

        {/* group administration panel */}
        <div className="space-y-3">
          {/* Parallel Execution Realtime Monitor */}
          {executionLogs.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="font-bold text-slate-200 text-[10px] uppercase tracking-wider">Parallel Fire Log</h3>
                  {stealthMode && <span className="bg-emerald-500/20 text-emerald-400 text-[8px] px-1 rounded border border-emerald-500/30 font-bold ml-1">STEALTH ON</span>}
                </div>
                <button onClick={() => setExecutionLogs([])} className="text-[10px] text-slate-500 hover:text-slate-300">Clear</button>
              </div>
              <div className="max-h-[150px] overflow-y-auto space-y-1 pr-1 font-mono text-[9px]">
                {executionLogs.map((log, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-950/40 px-2 py-1 rounded border border-slate-900/60">
                    <span className="text-slate-400 truncate max-w-[140px]">{log.name}</span>
                    <div className="flex gap-2">
                       <span className={log.status >= 200 && log.status < 300 ? 'text-emerald-400' : 'text-rose-400'}>
                         {log.status || 'ERR'}
                       </span>
                       <span className="text-slate-500">{log.duration}ms</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-1.5 text-[9px] text-slate-500 italic">
                Execution synchronized within browser event-loop nanoseconds.
              </div>
            </div>
          )}

          <button
            onClick={() => setShowClusterManager(!showClusterManager)}
            className="w-full bg-[#101726]/90 hover:bg-slate-800/50 border border-slate-805 rounded-xl p-3.5 flex items-center justify-between font-bold text-slate-200 text-[11px] transition-all cursor-pointer shadow-md"
          >
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-blue-450" />
              <span>Manage API Clusters</span>
              <span className="text-[10px] bg-slate-800/70 px-2 py-0.5 rounded text-slate-400 font-mono font-normal">
                {groups.length} active
              </span>
            </div>
            <span className="text-slate-405 text-xs font-mono">
              {showClusterManager ? '▲ Hide' : '▼ Expand'}
            </span>
          </button>

          {showClusterManager && (
            <div className="bg-[#101726] border border-slate-800/90 rounded-xl p-5 flex flex-col gap-3 shadow-xl transition-all">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <LayoutGrid className="w-4.5 h-4.5 text-blue-450" />
                  <h3 className="font-bold text-slate-200 text-xs">Manage API Clusters</h3>
                </div>
                <button 
                  onClick={() => {
                    setSelectedGroupToEdit(null);
                    setGroupNameInput('');
                    setGroupDescInput('');
                    setShowGroupModal(true);
                  }}
                  className="text-[10.5px] bg-[#2563eb]/10 hover:bg-[#2563eb]/20 text-[#60a5fa] font-bold px-2 py-1 flex items-center gap-1 border border-blue-500/20 rounded-md cursor-pointer active:scale-95 transition-all font-mono"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Cluster
                </button>
              </div>

              <p className="text-[10px] text-slate-450 leading-relaxed mb-1">
                Group your definitions by API domain clusters. Deleting a group automatically transfers its traffic definitions to another remaining cluster.
              </p>

              <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1">
                {groups.map(g => (
                  <div key={g.id} className="bg-slate-950/50 p-2.5 border border-slate-800/80 rounded-lg flex items-center justify-between gap-3">
                    <div className="truncate">
                      <div className="font-bold text-slate-350 text-xs truncate leading-snug">{g.name}</div>
                      <div className="text-[9.5px] text-slate-500 italic truncate mt-0.5">{g.description}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button 
                        onClick={() => handleTriggerEditGroup(g)}
                        className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer animate-none"
                        title="Edit cluster settings"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteGroup(g.id, g.name)}
                        className="text-slate-550 hover:text-rose-400 p-1 cursor-pointer animate-none"
                        title="Remove cluster"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Add / Edit Group Modal Dialog Overlay */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-100 font-mono border-b border-slate-800 pb-2">
              {selectedGroupToEdit ? 'Edit Cluster Group Parameters' : 'Add New API Group Cluster'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">Group Title / Folder Name</label>
                <input 
                  type="text"
                  value={groupNameInput}
                  onChange={e => setGroupNameInput(e.target.value)}
                  placeholder="e.g. Analytics & Telemetry"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-xs outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">Group Description</label>
                <input 
                  type="text"
                  value={groupDescInput}
                  onChange={e => setGroupDescInput(e.target.value)}
                  placeholder="e.g. User actions tracking logs and metrics endpoints"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-xs outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button 
                onClick={() => {
                  setShowGroupModal(false);
                  setSelectedGroupToEdit(null);
                }}
                className="px-3.5 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 rounded-lg text-[11px] font-bold"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveGroup}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-extrabold shadow-md active:scale-95 transition-all"
              >
                {selectedGroupToEdit ? 'Save Changes' : 'Create Cluster Folder'}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-8 py-3 px-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
        <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-blue-400" /> TAnalysis Specification Panel</span>
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
