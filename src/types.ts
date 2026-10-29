/**
 * Shared types for Developer Network Proxy & Request Manipulator
 */

export interface InterceptedRequest {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  domain: string;
  path: string;
  queryParams: Record<string, string>;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  status: number;
  contentType: string;
  durationMs: number;
  isModified?: boolean;
  isUserGenerated?: boolean;
  requestType?: 'REPLAY' | 'MODIFIED' | 'ORIGINAL';
}

export interface ReplayRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ReplayResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  contentType: string;
}

export interface SavedSession {
  id: string;
  name: string;
  timestamp: string;
  logs: InterceptedRequest[];
  domain: string;
}

export interface TrafficDefinition {
  signature: string; // "METHOD:pathname" (e.g. "POST:/api/login")
  name: string;
  description: string;
  inputParameters: string;
  outputParameters: string;
  group: string; // The group name it belongs to, defaults to "General"
}

export interface AnalysisGroup {
  id: string;
  name: string;
  description: string;
}

