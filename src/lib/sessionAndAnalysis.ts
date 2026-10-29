import { SavedSession, TrafficDefinition, AnalysisGroup, InterceptedRequest } from '../types';

// Storage namespaces
const STORAGE_SESSIONS = 'proxydev_sessions';
const STORAGE_DEFINITIONS = 'proxydev_traffic_definitions';
const STORAGE_GROUPS = 'proxydev_analysis_groups';

// Basic normalizer to create a unique traffic pattern signature
export function getTrafficSignature(method: string, path: string): string {
  let cleanPath = (path || '/').split('?')[0] || '/';
  if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
    cleanPath = cleanPath.slice(0, -1);
  }
  return `${method.toUpperCase()}:${cleanPath}`;
}

// ----------------------------------------------------------------------
// 1. Saved Sessions Management
// ----------------------------------------------------------------------

export function getSavedSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_SESSIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse saved sessions:', e);
    return [];
  }
}

export function saveSession(name: string, logs: InterceptedRequest[]): SavedSession {
  const sessions = getSavedSessions();
  
  // Find frequent domain
  const domainCounts: Record<string, number> = {};
  logs.forEach(log => {
    const d = log.domain || 'unknown';
    domainCounts[d] = (domainCounts[d] || 0) + 1;
  });
  
  let topDomain = 'localhost';
  let maxCount = 0;
  for (const [dom, count] of Object.entries(domainCounts)) {
    if (count > maxCount) {
      maxCount = count;
      topDomain = dom;
    }
  }

  const newSession: SavedSession = {
    id: 'sess_' + Math.random().toString(36).substring(2, 11),
    name: name.trim() || `Traffic Session - ${topDomain}`,
    timestamp: new Date().toISOString(),
    logs,
    domain: topDomain
  };

  sessions.unshift(newSession);
  localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(sessions));
  return newSession;
}

export function importSessionData(jsonData: string): SavedSession {
  const parsed = JSON.parse(jsonData);
  
  let id = 'sess_' + Math.random().toString(36).substring(2, 11);
  let name = 'Imported Traffic Session';
  let timestamp = new Date().toISOString();
  let rawLogs: any[] = [];
  let domain = 'imported';

  if (Array.isArray(parsed)) {
    // Direct raw logs dump from the extension userscript panel
    rawLogs = parsed;
    name = `Extension Captured Session (${rawLogs.length} Packets)`;
    const firstWithDomain = rawLogs.find(l => l.domain);
    if (firstWithDomain) {
      domain = firstWithDomain.domain;
    } else if (rawLogs[0]?.url) {
      try {
        domain = new URL(rawLogs[0].url).hostname;
      } catch (e) {}
    }
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.logs)) {
      id = parsed.id || id;
      name = parsed.name || name;
      timestamp = parsed.timestamp || timestamp;
      rawLogs = parsed.logs;
      domain = parsed.domain || domain;
    } else {
      throw new Error('Invalid exported traffic format. Missing "logs" array.');
    }
  } else {
    throw new Error('Invalid exported traffic format. Must be a session or raw logs pool.');
  }

  // Normalize each request in logs to match complete InterceptedRequest interface
  const logs: InterceptedRequest[] = rawLogs.map(log => {
    const rawUrl = log.url || '';
    let parsedUrl: URL | null = null;
    try {
      if (rawUrl) parsedUrl = new URL(rawUrl);
    } catch (e) {}

    const reqId = log.id || 'req_' + Math.random().toString(36).substring(2, 11);
    const reqTimestamp = log.timestamp || new Date().toISOString();
    const resolvedDomain = log.domain || (parsedUrl ? parsedUrl.hostname : 'unknown');
    const resolvedPath = log.path || (parsedUrl ? parsedUrl.pathname : '/');
    const qParams = log.queryParams || (parsedUrl ? Object.fromEntries(parsedUrl.searchParams.entries()) : {});

    return {
      id: reqId,
      timestamp: typeof reqTimestamp === 'number' ? new Date(reqTimestamp).toISOString() : reqTimestamp,
      method: (log.method || 'GET').toUpperCase(),
      url: rawUrl,
      domain: resolvedDomain,
      path: resolvedPath,
      queryParams: qParams,
      requestHeaders: log.requestHeaders || {},
      requestBody: log.requestBody || null,
      responseHeaders: log.responseHeaders || {},
      responseBody: log.responseBody || null,
      status: typeof log.status === 'number' ? log.status : 200,
      contentType: log.contentType || 'application/json',
      durationMs: typeof log.durationMs === 'number' ? log.durationMs : 25,
      isModified: log.isModified || false,
      isUserGenerated: log.isUserGenerated || false,
      requestType: log.requestType || 'ORIGINAL'
    };
  });

  const sessions = getSavedSessions();

  const newSession: SavedSession = {
    id,
    name: name.trim(),
    timestamp,
    logs,
    domain
  };

  // Avoid importing duplicates with same id
  const filtered = sessions.filter(s => s.id !== newSession.id);
  filtered.unshift(newSession);
  localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(filtered));
  return newSession;
}

export function deleteSession(id: string): void {
  const sessions = getSavedSessions();
  const updated = sessions.filter(s => s.id !== id);
  localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(updated));
}

export function getExportableData(session: SavedSession): string {
  return JSON.stringify(session, null, 2);
}

// Helper to determine the most frequent domain in a current log set
export function predictSessionFilename(logs: InterceptedRequest[]): string {
  if (!logs || logs.length === 0) return 'proxydev_session';
  const domainCounts: Record<string, number> = {};
  logs.forEach(log => {
    const d = log.domain || 'unknown';
    domainCounts[d] = (domainCounts[d] || 0) + 1;
  });
  
  let topDomain = '';
  let maxCount = 0;
  for (const [dom, count] of Object.entries(domainCounts)) {
    if (count > maxCount && dom !== 'unknown' && dom !== '') {
      maxCount = count;
      topDomain = dom;
    }
  }
  return topDomain ? topDomain.replace(/[^a-zA-Z0-9]/g, '_') : 'proxy_dev_session';
}

// ----------------------------------------------------------------------
// 2. TAnalysis Definitions & Groups Management
// ----------------------------------------------------------------------

export function getTrafficDefinitions(): TrafficDefinition[] {
  try {
    const raw = localStorage.getItem(STORAGE_DEFINITIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse traffic definitions:', e);
    return [];
  }
}

export function getTrafficDefinitionByLog(log: InterceptedRequest): TrafficDefinition | undefined {
  const sig = getTrafficSignature(log.method, log.path);
  const defs = getTrafficDefinitions();
  return defs.find(d => d.signature === sig);
}

export function saveTrafficDefinition(def: TrafficDefinition): void {
  const defs = getTrafficDefinitions();
  const index = defs.findIndex(d => d.signature === def.signature);
  if (index >= 0) {
    defs[index] = def;
  } else {
    defs.push(def);
  }
  localStorage.setItem(STORAGE_DEFINITIONS, JSON.stringify(defs));
}

export function deleteTrafficDefinition(signature: string): void {
  const defs = getTrafficDefinitions();
  const filtered = defs.filter(d => d.signature !== signature);
  localStorage.setItem(STORAGE_DEFINITIONS, JSON.stringify(filtered));
}

export function getAnalysisGroups(): AnalysisGroup[] {
  try {
    const raw = localStorage.getItem(STORAGE_GROUPS);
    if (raw) return JSON.parse(raw);
    
    // Default Groups if never configured
    const defaultGroups: AnalysisGroup[] = [
      { id: 'g_auth', name: 'Auth & Session API', description: 'Authentication, registration, token exchange, logout' },
      { id: 'g_billing', name: 'Billing & Subscriptions', description: 'Payment processing, checkouts, invoice lists' },
      { id: 'g_resources', name: 'Resource & Assets Hub', description: 'User resources, files, dynamic database fetching' },
      { id: 'g_general', name: 'General & Diagnostics', description: 'Telemetry, logging, status pins, unclassified endpoints' }
    ];
    localStorage.setItem(STORAGE_GROUPS, JSON.stringify(defaultGroups));
    return defaultGroups;
  } catch (e) {
    return [];
  }
}

export function saveAnalysisGroup(group: AnalysisGroup): void {
  const groups = getAnalysisGroups();
  const index = groups.findIndex(g => g.id === group.id);
  if (index >= 0) {
    groups[index] = group;
  } else {
    groups.push(group);
  }
  localStorage.setItem(STORAGE_GROUPS, JSON.stringify(groups));
}

export function deleteAnalysisGroup(id: string): void {
  const groups = getAnalysisGroups();
  const filtered = groups.filter(g => g.id !== id);
  localStorage.setItem(STORAGE_GROUPS, JSON.stringify(filtered));
}
