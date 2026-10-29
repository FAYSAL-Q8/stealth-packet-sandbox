export const userscriptCode = `// ==UserScript==
// @name         Unified Stealth Interceptor [Full Mode Engine]
// @namespace    http://tampermonkey.net/
// @version      4.7
// @description  High-fidelity dual-mode stealth network packet logger and local inspector.
// @author       Faysal Alibrahim (https://github.com/FAYSAL-Q8)
// @homepageURL  https://github.com/FAYSAL-Q8
// @match        *://*/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      localhost
// @connect      *
// ==/UserScript==

(function() {
  'use strict';

  // Only run inside tampermonkey script or if explicitly allowed to run locally for testing (visualizing)
  const isTampermonkey = typeof GM_info !== 'undefined';
  const runLocally = typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('RUN_EXTENSION_LOCALLY') === 'true';

  if (!isTampermonkey && !runLocally) {
    return;
  }

  // --- DYNAMIC PARAMETERS STORAGE CONFIGURATION ---
  const getStoredValue = (key, defaultVal) => {
    if (typeof GM_getValue !== 'undefined') {
      try {
        const val = GM_getValue(key);
        return val !== undefined && val !== null ? val : defaultVal;
      } catch(e) {}
    }
    try {
      const v = localStorage.getItem('proxy_interceptor_' + key);
      return v !== null ? v : defaultVal;
    } catch(e) {
      return defaultVal;
    }
  };

  const setStoredValue = (key, val) => {
    if (typeof GM_setValue !== 'undefined') {
      try {
        GM_setValue(key, val);
        return;
      } catch(e) {}
    }
    try {
      localStorage.setItem('proxy_interceptor_' + key, val);
    } catch(e) {}
  };

  // Assign configuration dynamically based on storage or parsed fallback defaults
  let CURRENT_MODE = getStoredValue('script_mode', "LOCAL"); // LOCAL, FORWARD, DUAL
  let CURRENT_ENDPOINT = getStoredValue('proxy_endpoint', "http://localhost:3000");
  let CURRENT_FILTER = getStoredValue('domain_filter', "");
  let CURRENT_STEALTH = getStoredValue('stealth_rating', "STD"); // STD or MAX
  let CURRENT_STREAM_MODE = getStoredValue('stream_mode', "RESPONSE"); // REQUEST (Details) or RESPONSE (Body)

  // Strict local cache for requests - scoped inside closure to prevent global variable sweeps
  let loggedRequests = [];
  try {
    const saved = sessionStorage.getItem('proxy_interceptor_logs');
    if (saved) loggedRequests = JSON.parse(saved);
  } catch(e) {}
  let onLogAddedCallback = null;

  // Check if we should log based on domain filter
  function shouldLog(url) {
    if (!url) return false;
    // Don't log calls going directly to the logging server to prevent infinite feedback loops!
    if (url.includes(CURRENT_ENDPOINT)) return false;
    if (!CURRENT_FILTER) return true;
    return url.includes(CURRENT_FILTER);
  }

  // --- PACKET CAPTURING & STREAM HOOKS ---
  function registerCapturedRequest(data) {
    if (!shouldLog(data.url)) return;
    
    // Ensure we have a default isUserGenerated flag
    if (data.isUserGenerated === undefined) {
      data.isUserGenerated = false;
    }

    // Default timestamp to prevent "Invalid Date"
    if (!data.timestamp) {
      data.timestamp = new Date().toISOString();
    }

    // Default ID if missing
    if (!data.id) {
      data.id = 'pkt_' + Math.random().toString(36).substring(2, 11);
    }

    loggedRequests.unshift(data);
    if (loggedRequests.length > 150) {
      loggedRequests.pop();
    }

    // Persist logs
    try {
      sessionStorage.setItem('proxy_interceptor_logs', JSON.stringify(loggedRequests));
    } catch(e) {}

    // Trigger local overlay update if hook exists
    if (onLogAddedCallback) {
      onLogAddedCallback(data, loggedRequests);
    }

    // Forward to proxy dashboard if enabled
    if (CURRENT_MODE === 'FORWARD' || CURRENT_MODE === 'DUAL') {
      forwardLogToDashboard(data);
    }
  }

  // Forward using GM_xmlhttpRequest which bypasses Webpage CORS/CSP policies and conceals the port connection!
  function forwardLogToDashboard(data) {
    const payload = JSON.stringify(data);
    
    if (typeof GM_xmlhttpRequest !== 'undefined') {
      GM_xmlhttpRequest({
        method: "POST",
        url: CURRENT_ENDPOINT + "/api/external-traffic",
        headers: {
          "Content-Type": "application/json"
        },
        data: payload,
        onload: function(response) {
          // Silent success
        },
        onerror: function(err) {
          console.warn("[Proxy Injector] Background log forward failed. Verify server is live at:", CURRENT_ENDPOINT);
        }
      });
    } else {
      // Fallback to native fetch if userscript runs in non-privileged context
      fetch(CURRENT_ENDPOINT + "/api/external-traffic", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        mode: 'cors'
      }).catch(e => {});
    }
  }

  // Helper to extract content-type safely
  function getContentTypeHeader(headers) {
    if (!headers) return 'application/octet-stream';
    for (const [key, val] of Object.entries(headers)) {
      if (key.toLowerCase() === 'content-type') {
        return val;
      }
    }
    return 'application/octet-stream';
  }

  // --- HOOKING NATIVE CONSTRUCTS ---
  
  // 1. Hook Fetch API
  const originalFetch = window.fetch;
  const customFetch = async function(input, init) {
    if (init && init.headers) {
      let isSkip = false;
      if (init.headers instanceof Headers) {
        if (init.headers.has('x-proxydev-skip-hook')) {
          isSkip = true;
          try { init.headers.delete('x-proxydev-skip-hook'); } catch(e) {}
        }
      } else if (Array.isArray(init.headers)) {
        const idx = init.headers.findIndex(([k, v]) => k.toLowerCase() === 'x-proxydev-skip-hook');
        if (idx !== -1) {
          isSkip = true;
          init.headers.splice(idx, 1);
        }
      } else {
        const key = Object.keys(init.headers).find(k => k.toLowerCase() === 'x-proxydev-skip-hook');
        if (key) {
          isSkip = true;
          try { delete init.headers[key]; } catch(e) {}
        }
      }

      if (isSkip) {
        return originalFetch(input, init);
      }
    }

    const startTime = Date.now();
    let url = '';
    let method = 'GET';
    let reqHeaders = {};
    let reqBody = null;

    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (input && typeof input === 'object' && input.url) {
      url = input.url;
      method = input.method || 'GET';
      
      // If passing a Request object, it might already have headers
      if (input.headers instanceof Headers) {
        input.headers.forEach((v, k) => { reqHeaders[k] = v; });
      }
    }

    if (init) {
      if (init.method) method = init.method;
      if (init.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => { reqHeaders[k] = v; });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([k, v]) => { reqHeaders[k] = v; });
        } else {
          reqHeaders = { ...init.headers };
        }
      }
      if (init.body) {
        if (typeof init.body === 'string') {
          reqBody = init.body;
        } else {
          reqBody = "[Binary Payload / Form]";
        }
      }
    }

    try {
      const response = await originalFetch(input, init);
      const clone = response.clone();
      const latency = Date.now() - startTime;
      
      let resBodyText = '';
      const contentType = clone.headers.get('content-type') || 'text/plain';
      
      if (CURRENT_STREAM_MODE === 'REQUEST') {
        resBodyText = '[Response payload disabled in REQUEST mode]';
      } else if (contentType.includes('json') || contentType.includes('text') || contentType.includes('xml') || contentType.includes('javascript')) {
        try {
          resBodyText = await clone.text();
        } catch (e) {
          resBodyText = '[Payload extraction failed: ' + e.message + ']';
        }
      } else {
        resBodyText = '[Binary Payload: ' + contentType + ']';
      }

      const responseHeaders = {};
      clone.headers.forEach((v, k) => { responseHeaders[k] = v; });

      registerCapturedRequest({
        method: method.toUpperCase(),
        url: new URL(url, window.location.origin).href,
        requestHeaders: reqHeaders,
        requestBody: reqBody,
        responseHeaders: responseHeaders,
        responseBody: resBodyText,
        status: response.status,
        contentType: contentType,
        durationMs: latency
      });

      return response;
    } catch (err) {
      // Log connection failures
      registerCapturedRequest({
        method: method.toUpperCase(),
        url: new URL(url, window.location.origin).href,
        requestHeaders: reqHeaders,
        requestBody: reqBody,
        responseHeaders: {},
        responseBody: "Interception failed or Network Error: " + err.message,
        status: 0,
        contentType: 'text/plain',
        durationMs: Date.now() - startTime
      });
      throw err;
    }

  };

  try {
    Object.defineProperty(window, 'fetch', {
      value: customFetch,
      configurable: true,
      writable: true
    });
  } catch (e) {
    try {
      window.fetch = customFetch;
    } catch (err2) {
      console.warn("Could not hook window.fetch:", err2);
    }
  }

  // 2. Hook XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._capturedData = {
      method: method.toUpperCase(),
      url: new URL(url, document.baseURI || window.location.origin).href,
      requestHeaders: {},
      requestBody: null,
      startTime: Date.now()
    };

    const handleLogging = () => {
      if (this.readyState === 4 && this._capturedData && !this._capturedData.finished) {
        this._capturedData.finished = true;
        const latency = Date.now() - this._capturedData.startTime;
        let resBodyText = '';
        const rawHeaders = this.getAllResponseHeaders() || '';
        
        const responseHeaders = {};
        rawHeaders.trim().split(/[\r\n]+/).forEach((line) => {
          const parts = line.split(': ');
          const key = parts.shift();
          const val = parts.join(': ');
          if (key) responseHeaders[key.toLowerCase()] = val;
        });

        const contentType = responseHeaders['content-type'] || 'text/plain';

        if (CURRENT_STREAM_MODE === 'REQUEST') {
          resBodyText = '[Response payload disabled in REQUEST mode]';
        } else {
          try {
            if (this.responseType === '' || this.responseType === 'text') {
              resBodyText = this.responseText;
            } else if (this.responseType === 'json') {
              resBodyText = JSON.stringify(this.response);
            } else if (this.responseType === 'blob') {
              resBodyText = '[Blob Object: ' + this.response.size + ' bytes]';
            } else {
              resBodyText = '[Binary Object: ' + this.responseType + ']';
            }
          } catch(e) {
            resBodyText = '[Extraction error: ' + e.message + ']';
          }
        }

        registerCapturedRequest({
          method: this._capturedData.method,
          url: this._capturedData.url,
          requestHeaders: this._capturedData.requestHeaders,
          requestBody: this._capturedData.requestBody,
          responseHeaders: responseHeaders,
          responseBody: resBodyText,
          status: this.status,
          contentType: contentType,
          durationMs: latency
        });
      }
    };

    // Use multiple event hooks to ensure we catch the completion regardless of how the developer uses XHR
    this.addEventListener('readystatechange', handleLogging);
    this.addEventListener('load', handleLogging);
    this.addEventListener('error', handleLogging);
    this.addEventListener('abort', handleLogging);

    return originalXHROpen.apply(this, [method, url, ...args]);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    if (this._capturedData) {
      this._capturedData.requestHeaders[header.toLowerCase()] = value;
    }
    return originalXHRSetHeader.apply(this, [header, value]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (this._capturedData) {
      if (body) {
        if (typeof body === 'string') {
          this._capturedData.requestBody = body;
        } else if (body instanceof FormData) {
          this._capturedData.requestBody = "[FormData Object]";
        } else if (body instanceof Blob) {
          this._capturedData.requestBody = "[Blob Payload: " + body.size + " bytes]";
        } else {
          this._capturedData.requestBody = "[Uploaded Binary / Payload]";
        }
      }
    }
    return originalXHRSend.apply(this, [body]);
  };


  // --- LOCAL OVERLAY INTERFACE (SHADOW DOM ISOLATED) ---
  // Only initialize if we are running in a userscript environment (already verified by early-return)
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeOverlay);
  } else {
    initializeOverlay();
  }

  function initializeOverlay() {
    // Generate isolated container element using direct tag creation (Anti-fingerprint)
    const randomTagName = "proxy-debugger-panel";
    if (customElements.get(randomTagName) === undefined) {
      customElements.define(randomTagName, class extends HTMLElement {});
    }

    const shadowContainer = document.createElement(randomTagName);
    shadowContainer.style.position = 'fixed';
    shadowContainer.style.bottom = '16px';
    shadowContainer.style.right = '16px';
    shadowContainer.style.zIndex = '999999999';
    document.body.appendChild(shadowContainer);

    const shadow = shadowContainer.attachShadow({ mode: 'closed' });

    // CSS Styling fully sandboxed in Shadow DOM so page styling won't bleed in or out
    const style = document.createElement('style');
    style.textContent = \`
      :host { font-family: sans-serif; color: #f1f5f9; user-select: none; }
      .debugger-handle { width: 48px; height: 48px; background: #2563eb; color: #ffffff; border-radius: 50px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(0,0,0,0.5); position: fixed; bottom: 20px; right: 20px; z-index: 99999999; }
      .debugger-main-panel { position: fixed; bottom: 85px; right: 20px; width: calc(100vw - 40px); max-width: 950px; height: 600px; background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; display: none; flex-direction: column; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6); z-index: 99999999; transition: all 0.3s ease; }
      .panel-header { background: #0f172a; padding: 12px 16px; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; }
      .panel-header h3 { margin: 0; font-size: 13px; font-weight: 600; color: #f1f5f9; display: flex; align-items: center; gap: 8px; }
      .panel-header .badge { font-size: 9px; font-family: monospace; background: #334155; color: #38bdf8; padding: 2px 6px; border-radius: 4px; border: 1px solid #475569; }
      .panel-header .close-btn { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.25); color: #f87171; cursor: pointer; padding: 4px 10px; font-size: 10px; font-family: monospace; font-weight: bold; border-radius: 4px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
      .panel-header .close-btn:hover { background: #ef4444; color: #ffffff; border-color: #ef4444; box-shadow: 0 0 8px rgba(239, 68, 68, 0.4); }
      .panel-body-split { display: flex; flex: 1; overflow: hidden; background: #0b0f19; }
      .left-sidebar-pane { width: 380px; border-right: 1px solid #1e293b; display: flex; flex-direction: column; background: #0c101d; }
      .right-inspector-pane { flex: 1; display: flex; flex-direction: column; background: #05070e; overflow: hidden; }
      .mobile-back-btn {
        display: none;
        align-items: center;
        gap: 6px;
        background: #1e293b;
        border: 1px solid #334155;
        color: #38bdf8;
        font-family: monospace;
        font-size: 11px;
        font-weight: bold;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        margin-bottom: 8px;
        width: fit-content;
        transition: all 0.2s ease;
      }
      .mobile-back-btn:hover {
        background: #334155;
        color: #f1f5f9;
        border-color: #475569;
      }

      /* Mobile and Responsive Adaptability Layout Rules (Up to Tablet/Extension size) */
      @media (max-width: 850px) {
        .mobile-back-btn {
          display: flex !important;
        }
        .debugger-main-panel.has-selection .right-inspector-pane {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
          z-index: 1000 !important;
          background: #05070e;
          display: flex !important;
          flex-direction: column;
          align-items: stretch;
          justify-content: flex-start;
          visibility: visible !important;
          pointer-events: auto !important;
        }
        .debugger-main-panel.has-selection .left-sidebar-pane {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
        .debugger-main-panel:not(.has-selection) .right-inspector-pane {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
        .debugger-main-panel:not(.has-selection) .left-sidebar-pane {
          width: 100%;
          height: 100%;
          display: flex !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }
        .panel-body-split {
          position: relative;
          width: 100%;
          height: 100%;
          flex-direction: column;
        }
        .debugger-main-panel {
          bottom: 10px;
          right: 10px;
          left: 10px;
          width: auto;
          height: calc(100% - 20px);
          max-height: 94vh !important;
        }
        .debugger-handle {
          bottom: 15px;
          right: 15px;
          width: 44px;
          height: 44px;
        }
        .panel-header {
          padding: 8px 12px;
        }
        .panel-header h3 {
          font-size: 11px;
        }
        .panel-header .badge {
          display: none; /* Hide non-essential Badge on smaller viewports */
        }
        .panel-toolbar {
          padding: 8px;
        }
        .category-tabs {
          padding: 4px 8px;
          overflow-x: auto;
          white-space: nowrap;
        }
        .cat-btn {
          font-size: 9px;
          padding: 4px 6px;
        }
        .log-row {
          padding: 6px 8px;
        }
        .inspector-header {
          padding: 8px 12px;
          gap: 6px;
        }
        .inspector-actions {
          flex-wrap: wrap;
          gap: 4px;
        }
        .inspector-btn {
          padding: 4px 8px;
          font-size: 9px;
        }
        .inspector-tabs {
          padding: 0 8px;
          overflow-x: auto;
          white-space: nowrap;
        }
        .insp-tab {
          padding: 8px 10px;
          font-size: 9px;
        }
        .inspector-tab-content {
          padding: 8px;
        }
        .kv-key {
          width: 90px;
          font-size: 10px;
        }
        .kv-val {
          font-size: 10px;
        }
        .payload-box {
          font-size: 10px;
          max-height: 160px;
        }
      }

      @media (max-width: 480px) {
        .panel-header h3 {
          font-size: 10px;
        }
        .category-tabs {
          gap: 2px;
        }
        .cat-btn {
          font-size: 8.5px;
          padding: 3px 5px;
        }
        .inspector-url-box {
          font-size: 9px;
          max-height: 25px;
        }
        .inspector-btn {
          font-size: 8px;
          padding: 3px 5px;
        }
        .insp-tab {
          font-size: 8px;
          padding: 6px 8px;
        }
      }

      .panel-toolbar { background: #0f172a; padding: 10px 12px; border-bottom: 1px solid #1e293b; display: flex; gap: 6px; align-items: center; }
      .panel-toolbar input { background: #1e293b; border: 1px solid #334155; color: #f1f5f9; font-size: 11px; padding: 6px 10px; border-radius: 4px; flex: 1; outline: none; font-family: monospace; }
      .panel-toolbar input:focus { border-color: #3b82f6; }
      .panel-toolbar select { background: #1e293b; border: 1px solid #334155; color: #f1f5f9; font-size: 11px; padding: 5px 6px; border-radius: 4px; outline: none; cursor: pointer; font-family: monospace; }
      .category-tabs { display: flex; gap: 4px; padding: 6px 12px; background: #090d16; border-bottom: 1px solid #1e293b; align-items: center; }
      .cat-btn {
        background: #1e293b;
        color: #94a3b8;
        font-size: 10px;
        border: none;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-family: monospace;
        transition: all 0.1s ease;
      }
      .cat-btn:hover {
        background: #334155;
        color: #f1f5f9;
      }
      .cat-btn.active {
        background: #2563eb;
        color: #ffffff;
        font-weight: bold;
      }
      .log-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .log-row {
        background: rgba(19, 26, 46, 0.45);
        border: 1px solid rgba(30, 41, 59, 0.60);
        border-radius: 6px;
        padding: 8px 10px;
        cursor: pointer;
        transition: background 0.15s;
        font-family: monospace;
        font-size: 11px;
      }
      .log-row:hover {
        background: #1e293b;
        border-color: #475569;
      }
      .log-row.selected {
        background: rgba(30, 58, 138, 0.40) !important;
        border-color: #2563eb !important;
      }
      .log-row.seen {
        opacity: 0.60;
      }
      .log-row.seen .log-url {
        color: #94a3b8;
      }
      .log-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
      }
      .log-method {
        padding: 2px 5px;
        border-radius: 3px;
        font-weight: bold;
        font-size: 9px;
        min-width: 44px;
        text-align: center;
        display: inline-block;
      }
      .method-GET { background: #064e3b; color: #34d399; }
      .method-POST { background: #1e3a8a; color: #60a5fa; }
      .method-PUT { background: #78350f; color: #fbbf24; }
      .method-DELETE { background: #7f1d1d; color: #f87171; }
      .log-url {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #cbd5e1;
      }
      .log-status {
        font-size: 10px;
        font-weight: bold;
      }
      .status-success { color: #34d399; }
      .status-client-error { color: #fbbf24; }
      .status-server-error { color: #f87171; }
      .log-timestamp-row {
        display: flex;
        justify-content: space-between;
        font-size: 9px;
        color: #64748b;
        margin-top: 4px;
        border-top: 1px solid #1e293b;
        padding-top: 4px;
      }
      .inspector-empty {
        display: flex;
        flex: 1;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #64748b;
        padding: 24px;
        text-align: center;
        font-family: monospace;
        font-size: 11px;
      }
      .inspector-empty svg {
        width: 36px;
        height: 36px;
        margin-bottom: 12px;
        stroke: currentColor;
        opacity: 0.3;
      }
      .inspector-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: hidden;
        background: #05070e;
        position: relative;
      }
      .mobile-back-header {
        display: none;
        background: #1e293b;
        padding: 10px 14px;
        border-bottom: 1px solid #334155;
        align-items: center;
        gap: 8px;
        color: #f1f5f9;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        user-select: none;
      }
      @media (max-width: 850px) {
        .mobile-back-header {
          display: flex;
        }
      }
      .inspector-header {
        background: #0d1220;
        padding: 12px 16px;
        border-bottom: 1px solid #1e293b;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .inspector-title-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .inspector-url-box {
        background: #020408;
        border: 1px solid #1e293b;
        padding: 6px 10px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 10px;
        color: #38bdf8;
        word-break: break-all;
        flex: 1;
        max-height: 40px;
        overflow-y: auto;
        user-select: text;
      }
      .inspector-actions {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .inspector-btn {
        background: #1e293b;
        color: #e2e8f0;
        border: 1px solid #334155;
        font-size: 10px;
        font-family: monospace;
        font-weight: bold;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        transition: all 0.1s ease;
      }
      .inspector-btn:hover {
        background: #334155;
        color: #ffffff;
      }
      .inspector-btn-replay {
        background: #1e3a8a;
        border-color: #3557cf;
        color: #60a5fa;
      }
      .inspector-btn-replay:hover {
        background: #2563eb;
        color: #ffffff;
      }
      .inspector-tabs {
        display: flex;
        background: #090d16;
        border-bottom: 1px solid #1e293b;
        padding: 0 16px;
      }
      .insp-tab {
        background: none;
        border: none;
        color: #64748b;
        font-family: monospace;
        font-size: 10px;
        font-weight: bold;
        text-transform: uppercase;
        padding: 10px 14px;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.15s ease;
      }
      .insp-tab:hover {
        color: #cbd5e1;
      }
      .insp-tab.active {
        color: #38bdf8;
        border-bottom-color: #38bdf8;
      }
      .inspector-tab-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #04060b;
      }
      .section-card {
        background: #090d16;
        border: 1px solid #1e293b;
        border-radius: 8px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .section-title {
        color: #38bdf8;
        font-size: 10px;
        font-weight: bold;
        text-transform: uppercase;
        font-family: monospace;
        border-bottom: 1px solid #1e293b;
        padding-bottom: 4px;
        margin-bottom: 4px;
      }
      .kv-row {
        display: flex;
        font-family: monospace;
        font-size: 11px;
        border-bottom: 1px solid rgba(30, 41, 59, 0.4);
        padding: 4px 0;
        gap: 8px;
      }
      .kv-key {
        color: #94a3b8;
        width: 140px;
        font-weight: bold;
        word-break: break-all;
      }
      .kv-val {
        color: #cbd5e1;
        flex: 1;
        word-break: break-all;
        user-select: text;
      }
      .payload-box {
        background: #020408;
        border: 1px solid #111827;
        padding: 10px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 11px;
        color: #a7f3d0;
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 280px;
        overflow-y: auto;
        user-select: text;
      }
      .payload-toolbar {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
      }
\`;
    shadow.appendChild(style);
    
    // Floating handle
    const handle = document.createElement('div');
    handle.className = 'debugger-handle';
    handle.setAttribute('title', 'Toggle Network Live Interceptor Panel');
    handle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>';
    shadow.appendChild(handle);

    // Main overlay layout
    const panel = document.createElement('div');
    panel.className = 'debugger-main-panel';
    panel.innerHTML = \`
      <div class="panel-header">
        <h3>
          <svg style="width:14px;height:14px;stroke:#38bdf8;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
          Stealth Browser Live Inspector
        </h3>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="badge">STEALTH OVERLAY</div>
          <button id="overlay-settings-btn" style="background:#1e293b; border:1px solid #334155; color:#38bdf8; font-family:monospace; font-size:10px; font-weight:bold; padding:4px 8px; border-radius:4px; cursor:pointer;" title="In-App Settings Mode">Settings</button>
          <button class="close-btn" title="Close Panel">Close</button>
        </div>
      </div>

      <div class="panel-body-split">
        <!-- LEFT LIST sidebar -->
        <div class="left-sidebar-pane">
          <div class="panel-toolbar">
            <input type="text" id="panel-search-field" placeholder="Search path, method, status..." />
            <select id="sort-select">
              <option value="time-desc">Newest First</option>
              <option value="time-asc">Oldest First</option>
              <option value="status-desc">Status Desc</option>
              <option value="status-asc">Status Asc</option>
              <option value="latency-desc">Slowest First</option>
              <option value="latency-asc">Fastest First</option>
            </select>
          </div>
          <div style="background:#090d16; padding:4px 12px; border-bottom:1px solid #1e293b; display:flex; align-items:center; gap:8px;">
             <label style="font-size:9px; font-weight:bold; color:#64748b; font-family:monospace; text-transform:uppercase;">Mode</label>
             <div style="display:flex; gap:2px;">
                <button class="config-stream-btn \${CURRENT_STREAM_MODE === 'REQUEST' ? 'active' : ''}" style="background:#1e293b; border:1px solid #334155; color:#94a3b8; padding:2px 6px; border-radius:3px; font-family:monospace; font-size:9px; cursor:pointer;" data-stream="REQUEST">Req</button>
                <button class="config-stream-btn \${CURRENT_STREAM_MODE === 'RESPONSE' ? 'active' : ''}" style="background:#1e293b; border:1px solid #334155; color:#94a3b8; padding:2px 6px; border-radius:3px; font-family:monospace; font-size:9px; cursor:pointer;" data-stream="RESPONSE">Res</button>
                <button class="config-stream-btn \${CURRENT_STREAM_MODE === 'NORMAL' ? 'active' : ''}" style="background:#1e293b; border:1px solid #334155; color:#94a3b8; padding:2px 6px; border-radius:3px; font-family:monospace; font-size:9px; cursor:pointer;" data-stream="NORMAL">Both</button>
             </div>
          </div>

          <div class="epoch-playback-deck" style="background:#090d16; padding:8px 12px; border-bottom:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center; font-family:monospace; font-size:10px;">
            <div id="epoch-status" style="color:#cbd5e1; font-weight:bold;">Stream: <span style="color:#10b981;">All Captured</span></div>
            <div style="display:flex; gap:4px;">
              <button id="epoch-btn-back" style="background:#1e293b; border:1px solid rgba(245,158,11,0.3); color:#f59e0b; padding:2px 6px; border-radius:3px; font-family:monospace; font-size:9px; cursor:pointer; opacity:0.4;" disabled title="Return to last batch">Back</button>
              <button id="epoch-btn-all" style="background:#1e293b; border:1px solid rgba(59,130,246,0.3); color:#60a5fa; padding:2px 6px; border-radius:3px; font-family:monospace; font-size:9px; cursor:pointer; opacity:0.4;" disabled title="Show all">All</button>
              <button id="epoch-btn-forward" style="background:#1e293b; border:1px solid rgba(52,211,153,0.3); color:#34d399; padding:2px 6px; border-radius:3px; font-family:monospace; font-size:9px; cursor:pointer;" title="Hide past, waiting for new">Forward</button>
            </div>
          </div>

          <div class="category-tabs" style="display:flex; justify-content:space-between; align-items:center; gap:4px; padding:6px 12px; border-bottom:1px solid #1e293b; background:#090d16;">
            <div style="display:flex; gap:4px; overflow-x:auto; scrollbar-width:none;">
              <button class="cat-btn active" id="cat-tab-all" data-cat="ALL">All</button>
              <button class="cat-btn" id="cat-tab-api" data-cat="API">API</button>
              <button class="cat-btn" id="cat-tab-failed" data-cat="FAILED">Failed</button>
              <button class="cat-btn" id="cat-tab-payload" data-cat="PAYLOAD">Payload</button>
            </div>
            <div style="display:flex; gap:4px; align-items:center; border-left:1px solid #1e293b; padding-left:6px; flex-shrink:0;">
              <button id="export-logs-btn" class="cat-btn" style="background:#047857; color:#ffffff; font-weight:bold;" title="Export Intercepted Packets stealthily">Export</button>
              <button id="clear-logs-btn" class="cat-btn">Clear</button>
            </div>
          </div>

          <div class="domains-bar" id="overlay-domains-bar" style="display:flex; gap:4px; padding:6px 12px; background:#070a11; border-bottom:1px solid #1e293b; overflow-x:auto; white-space:nowrap; align-items:center; font-family:monospace; font-size:10px; scrollbar-width: thin;">
             <!-- Dynamic domains -->
          </div>

          <div class="log-list" id="panel-log-container"></div>
        </div>

        <!-- RIGHT DETAIL pane -->
        <div class="right-inspector-pane" id="inspector-pane-container">
          <!-- Populated dynamically via renderInspector() -->
        </div>
      </div>
    \`;
    shadow.appendChild(panel);

    // Dynamic State Variables
    let isOpened = false;
    let searchFilterText = '';
    let activeCategory = 'ALL';
    let activeSort = 'time-desc';
    let selectedLogId = null;
    let activeInspectorTab = 'headers'; // headers, query, request, response
    let prettyPrintMode = true;
    let showingSettings = false;

    // Stream playback state variables
    let epochs = [];
    let selectedDomain = null;

    // Handle clicks to toggle panel
    handle.addEventListener('click', () => {
      isOpened = !isOpened;
      panel.style.display = isOpened ? 'flex' : 'none';
      if (isOpened) {
        renderLogs();
        renderInspector();
      }
    });

    // Add stream mode button listeners
    panel.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.config-stream-btn');
      if (btn) {
        e.stopPropagation();
        e.preventDefault();
        panel.querySelectorAll('.config-stream-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const newMode = btn.getAttribute('data-stream');
        CURRENT_STREAM_MODE = newMode;
        setStoredValue('stream_mode', newMode);
        renderLogs();
        renderInspector();
      }
    });

    panel.querySelector('.close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      
      isOpened = false;
      panel.style.display = 'none';
    });

    // In-App Settings toggle button listener
    const settingsBtn = panel.querySelector('#overlay-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        showingSettings = !showingSettings;
        if (showingSettings) {
          settingsBtn.style.background = '#7c3aed';
          settingsBtn.style.borderColor = '#8b5cf6';
          settingsBtn.style.color = '#ffffff';
          settingsBtn.innerText = '✕ Close Config';
        } else {
          settingsBtn.style.background = '#1e293b';
          settingsBtn.style.borderColor = '#334155';
          settingsBtn.style.color = '#38bdf8';
          settingsBtn.innerText = 'Settings';
        }
        renderInspector();
      });
    }

    // Export logs button callback listener
    const exportBtn = panel.querySelector('#export-logs-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showExportMenu();
      });
    }

    // Clear logs button callback listener
    const clearBtn = panel.querySelector('#clear-logs-btn');
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      loggedRequests.length = 0;
      selectedLogId = null;
      try { sessionStorage.removeItem('proxy_interceptor_logs'); } catch(e) {}
      renderLogs();
      renderInspector();
    });

    // Epoch Playback buttons listeners
    const btnForward = panel.querySelector('#epoch-btn-forward');
    const btnBack = panel.querySelector('#epoch-btn-back');
    const btnAll = panel.querySelector('#epoch-btn-all');

    btnForward.addEventListener('click', () => {
      epochs.push(new Date().toISOString());
      selectedDomain = null;
      updateEpochHeader();
      renderLogs();
    });

    btnBack.addEventListener('click', () => {
      epochs.pop();
      selectedDomain = null;
      updateEpochHeader();
      renderLogs();
    });

    btnAll.addEventListener('click', () => {
      epochs = [];
      selectedDomain = null;
      updateEpochHeader();
      renderLogs();
    });

    function updateEpochHeader() {
      const statusEl = panel.querySelector('#epoch-status');
      if (epochs.length === 0) {
        statusEl.innerHTML = 'Stream: <span style="color:#10b981;">All Captured</span>';
        btnBack.disabled = true;
        btnBack.style.opacity = '0.4';
        btnAll.disabled = true;
        btnAll.style.opacity = '0.4';
      } else {
        statusEl.innerHTML = \`Stream: <span style="color:#f59e0b;">Batch #\${epochs.length + 1}</span>\`;
        btnBack.disabled = false;
        btnBack.style.opacity = '1';
        btnAll.disabled = false;
        btnAll.style.opacity = '1';
      }
    }

    // Filtering category click listeners
    panel.querySelectorAll('.category-tabs .cat-btn[data-cat]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        panel.querySelectorAll('.category-tabs .cat-btn[data-cat]').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.getAttribute('data-cat');
        renderLogs();
      });
    });

    // Sorting selector listener
    const sortSelect = panel.querySelector('#sort-select');
    sortSelect.addEventListener('change', (e) => {
      activeSort = e.target.value;
      renderLogs();
    });

    // Real-time Text Searching listener
    const searchField = panel.querySelector('#panel-search-field');
    searchField.addEventListener('input', (e) => {
      searchFilterText = e.target.value.toLowerCase().trim();
      renderLogs();
    });

    // Handle incoming logged items in real-time
    onLogAddedCallback = function(newLog, allLogs) {
      if (isOpened) {
        renderLogs();
        // If the selected log has been updated or refreshed, render inspector
        if (selectedLogId && selectedLogId === newLog.id) {
          renderInspector();
        }
      }
    };

    // Helper text copy callback
    function copyTextToClipboard(text, originalBtn, successText) {
      let copiedOk = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        copiedOk = true;
      } else {
        const tempTA = document.createElement('textarea');
        tempTA.value = text;
        shadow.appendChild(tempTA);
        tempTA.select();
        try {
          document.execCommand('copy');
          copiedOk = true;
        } catch (err) {}
        shadow.removeChild(tempTA);
      }

      if (copiedOk && originalBtn) {
        const prevText = originalBtn.innerText;
        originalBtn.innerText = successText || 'Copied!';
        setTimeout(() => {
          originalBtn.innerText = prevText;
        }, 1200);
      }
    }

    // Advanced Replaying Tool Function
    function executeReplay(logId) {
      const log = loggedRequests.find(l => l.id === logId);
      if (!log) return;

      const headers = { ...log.requestHeaders };
      // Strip dynamic internal/browser restricted headers
      delete headers['content-length'];
      delete headers['host'];
      delete headers['connection'];

      const useGM = typeof GM_xmlhttpRequest !== 'undefined';
      const replayBtnElement = shadow.getElementById('replay-action-btn');

      if (replayBtnElement) {
        replayBtnElement.innerText = 'Replaying...';
        replayBtnElement.classList.add('disabled');
      }

      const reqStartTime = Date.now();

      if (useGM) {
        GM_xmlhttpRequest({
          method: log.method,
          url: log.url,
          headers: headers,
          data: log.requestBody || null,
          onload: function(response) {
            const duration = Date.now() - reqStartTime;
            let resHeaders = {};
            if (response.responseHeaders) {
              response.responseHeaders.trim().split(/[\\r\\n]+/).forEach((line) => {
                const parts = line.split(':');
                const key = parts[0]?.trim();
                const specVal = parts.slice(1).join(':')?.trim();
                if (key) resHeaders[key] = specVal;
              });
            }

            registerCapturedRequest({
              method: log.method.toUpperCase(),
              url: log.url,
              requestHeaders: headers,
              requestBody: log.requestBody,
              responseHeaders: resHeaders,
              responseBody: response.responseText || '',
              status: response.status || 200,
              contentType: response.headers?.['content-type'] || 'text/plain',
              durationMs: duration,
              isUserGenerated: true,
              requestType: 'REPLAY',
            });

            if (replayBtnElement) {
              replayBtnElement.innerText = 'Success';
              setTimeout(() => {
                const liveBtn = shadow.getElementById('replay-action-btn');
                if (liveBtn) {
                  liveBtn.innerText = 'Repeat Request';
                  liveBtn.classList.remove('disabled');
                }
              }, 1200);
            }
          },
          onerror: function(err) {
            const duration = Date.now() - reqStartTime;
            registerCapturedRequest({
              method: log.method.toUpperCase(),
              url: log.url,
              requestHeaders: headers,
              requestBody: log.requestBody,
              responseHeaders: {},
              responseBody: err.error || 'Replay connection refused',
              status: 0,
              contentType: 'text/plain',
              durationMs: duration,
              isUserGenerated: true,
              requestType: 'REPLAY',
            });

            if (replayBtnElement) {
              replayBtnElement.innerText = 'Failed';
              setTimeout(() => {
                const liveBtn = shadow.getElementById('replay-action-btn');
                if (liveBtn) {
                  liveBtn.innerText = 'Repeat Request';
                  liveBtn.classList.remove('disabled');
                }
              }, 1500);
            }
          }
        });
      } else {
        // Fallback to fetch
        const opts = {
          method: log.method,
          headers: {
            ...headers,
            'x-proxydev-skip-hook': 'true'
          },
        };
        if (log.method !== 'GET' && log.method !== 'HEAD' && log.requestBody) {
          opts.body = log.requestBody;
        }

        window.fetch(log.url, opts)
          .then(async (response) => {
            const duration = Date.now() - reqStartTime;
            const clone = response.clone();
            let resText = '';
            try {
              resText = await clone.text();
            } catch (e) {}

            const resHeaders = {};
            clone.headers.forEach((v, k) => { resHeaders[k] = v; });

            registerCapturedRequest({
              method: log.method.toUpperCase(),
              url: log.url,
              requestHeaders: headers,
              requestBody: log.requestBody,
              responseHeaders: resHeaders,
              responseBody: resText,
              status: response.status || 200,
              contentType: clone.headers.get('content-type') || 'text/plain',
              durationMs: duration,
              isUserGenerated: true,
              requestType: 'REPLAY',
            });

            if (replayBtnElement) {
              replayBtnElement.innerText = 'Success';
              setTimeout(() => {
                const liveBtn = shadow.getElementById('replay-action-btn');
                if (liveBtn) {
                  liveBtn.innerText = 'Repeat Request';
                  liveBtn.classList.remove('disabled');
                }
              }, 1200);
            }
          })
          .catch((err) => {
            const duration = Date.now() - reqStartTime;
            registerCapturedRequest({
              method: log.method.toUpperCase(),
              url: log.url,
              requestHeaders: headers,
              requestBody: log.requestBody,
              responseHeaders: {},
              responseBody: err.message || 'Fetch connection failed',
              status: 0,
              contentType: 'text/plain',
              durationMs: duration,
              isUserGenerated: true,
              requestType: 'REPLAY',
            });

            if (replayBtnElement) {
              replayBtnElement.innerText = 'Error';
              setTimeout(() => {
                const liveBtn = shadow.getElementById('replay-action-btn');
                if (liveBtn) {
                  liveBtn.innerText = 'Repeat Request';
                  liveBtn.classList.remove('disabled');
                }
              }, 1500);
            }
          });
      }
    }

    // Dynamic domains rendering helper
    function renderDomainPills(counts, totalInEpoch) {
      const dBar = panel.querySelector('#overlay-domains-bar');
      if (!dBar) return;
      dBar.innerHTML = '';

      // All domains pill
      const allBtn = document.createElement('button');
      allBtn.innerText = \`All (\${totalInEpoch})\`;
      allBtn.style.cssText = \`
        background: \${selectedDomain === null ? 'rgba(59,130,246,0.2)' : '#1e293b'};
        color: \${selectedDomain === null ? '#60a5fa' : '#94a3b8'};
        border: 1px solid \${selectedDomain === null ? '#3b82f6' : '#334155'};
        border-radius: 3px; font-size: 9px; padding: 2px 6px; cursor: pointer; font-family: monospace; flex-shrink: 0; outline: none;
      \`;
      allBtn.addEventListener('click', () => {
        selectedDomain = null;
        renderLogs();
      });
      dBar.appendChild(allBtn);

      // Individual domain pills
      for (const [dom, count] of Object.entries(counts)) {
        const pill = document.createElement('button');
        pill.innerHTML = \`<span>\${dom}</span> <span style="background:#020408; padding:0 3px; border-radius:2px; font-size:8px; color:#94a3b8; font-weight:bold;">\${count}</span>\`;
        pill.style.cssText = \`
          background: \${selectedDomain === dom ? 'rgba(59,130,246,0.2)' : '#1e293b'};
          color: \${selectedDomain === dom ? '#60a5fa' : '#94a3b8'};
          border: 1px solid \${selectedDomain === dom ? '#3b82f6' : '#334155'};
          border-radius: 3px; font-size: 9px; padding: 2px 6px; cursor: pointer; font-family: monospace; display: flex; gap: 4px; align-items: center; flex-shrink: 0; outline: none;
        \`;
        pill.addEventListener('click', () => {
          selectedDomain = dom;
          renderLogs();
        });
        dBar.appendChild(pill);
      }
    }

    // Main Log list renderer
    function formatBody(bodyStr, isExpanded) {
  if (!bodyStr || bodyStr.trim() === '') return 'No body';
  let formatted = bodyStr;
  try {
    const parsed = JSON.parse(bodyStr);
    formatted = JSON.stringify(parsed, null, 2);
  } catch (e) {
    // leave as is
  }
  
  if (isExpanded) {
    return formatted;
  }
  return formatted.length > 50 ? formatted.substring(0, 50) + '...' : formatted;
}

function renderLogs() {
      const container = panel.querySelector('#panel-log-container');
      container.innerHTML = '';

      // 1. Filter by active epochs (Forward cutoff tracking)
      let logsInEpoch = [...loggedRequests];
      if (epochs.length > 0) {
        const lastCutoff = epochs[epochs.length - 1];
        const cutoffTime = new Date(lastCutoff).getTime();
        logsInEpoch = logsInEpoch.filter(log => {
          const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
          return t > cutoffTime;
        });
      }

      // 2. Count distinct domains of matching items inside the visible epoch
      const domainCounts = {};
      logsInEpoch.forEach(log => {
        let d = 'unknown';
        try {
          if (log.url) {
            d = new URL(log.url).hostname;
          }
        } catch(e) {}
        domainCounts[d] = (domainCounts[d] || 0) + 1;
      });

      // Clear selection if selected domain is no longer in epoch domains
      if (selectedDomain && !domainCounts[selectedDomain]) {
        selectedDomain = null;
      }

      // Render dynamic domain pills
      renderDomainPills(domainCounts, logsInEpoch.length);

      // 3. Apply selectedDomain filter
      let filtered = [...logsInEpoch];
      if (selectedDomain) {
        filtered = filtered.filter(log => {
          let d = 'unknown';
          try {
            if (log.url) d = new URL(log.url).hostname;
          } catch(e) {}
          return d === selectedDomain;
        });
      }

      // Apply searching filters
      if (searchFilterText) {
        filtered = filtered.filter(log => {
          const inBasic = log.url.toLowerCase().includes(searchFilterText) || 
                         log.method.toLowerCase().includes(searchFilterText) ||
                         (log.status && String(log.status).includes(searchFilterText));
          
          if (inBasic) return true;

          // Search in bodies
          if (log.requestBody && log.requestBody.toLowerCase().includes(searchFilterText)) return true;
          if (log.responseBody && log.responseBody.toLowerCase().includes(searchFilterText)) return true;

          // Search in headers
          if (log.requestHeaders) {
            for (const [k, v] of Object.entries(log.requestHeaders)) {
              if (k.toLowerCase().includes(searchFilterText) || String(v).toLowerCase().includes(searchFilterText)) return true;
            }
          }
          if (log.responseHeaders) {
            for (const [k, v] of Object.entries(log.responseHeaders)) {
              if (k.toLowerCase().includes(searchFilterText) || String(v).toLowerCase().includes(searchFilterText)) return true;
            }
          }

          return false;
        });
      }

      // Apply category tab filters
      if (activeCategory === 'API') {
        filtered = filtered.filter(log => {
          const ct = log.contentType ? log.contentType.toLowerCase() : '';
          return ct.includes('json') || ct.includes('xml') || ct.includes('javascript') || ct.includes('xhr');
        });
      } else if (activeCategory === 'FAILED') {
        filtered = filtered.filter(log => log.status === 0 || log.status >= 400);
      } else if (activeCategory === 'PAYLOAD') {
        filtered = filtered.filter(log => {
          const hasBody = !!log.requestBody && log.requestBody.trim().length > 0;
          const hasParams = log.url.includes('?');
          return hasBody || hasParams;
        });
      }

      // Apply Stream Mode (Filtering list only)
      // Removed filtering logic to ensure all logs appear regardless of mode selection.

      // Sort logs dynamically based on state
      filtered.sort((a, b) => {
        let valA, valB;
        if (activeSort.startsWith('time')) {
          valA = new Date(a.timestamp).getTime();
          valB = new Date(b.timestamp).getTime();
          return activeSort === 'time-asc' ? valA - valB : valB - valA;
        } else if (activeSort.startsWith('status')) {
          valA = a.status || 0;
          valB = b.status || 0;
          return activeSort === 'status-asc' ? valA - valB : valB - valA;
        } else if (activeSort.startsWith('latency')) {
          valA = a.durationMs || 0;
          valB = b.durationMs || 0;
          return activeSort === 'latency-asc' ? valA - valB : valB - valA;
        }
        return 0;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div style="color:#64748b;font-size:11px;text-align:center;padding:24px;font-family:monospace;">No matching packets intercepted.</div>';
        return;
      }

      filtered.forEach((log) => {
        const row = document.createElement('div');
        row.className = \`log-row \${String(selectedLogId) === String(log.id) ? 'selected' : ''} \${log.seen ? 'seen' : ''}\`;
        row.setAttribute('data-id', log.id);

        const displayUrl = log.url.replace(window.location.origin, '');
        const statusClass = log.status >= 200 && log.status < 300 ? 'status-success' : (log.status >= 400 ? 'status-server-error' : 'status-client-error');
        
        let formattedTime = 'Invalid Date';
        try {
          if (log.timestamp) {
            const d = new Date(log.timestamp);
            if (!isNaN(d.getTime())) {
              const r = formatDateCustom(d);
              formattedTime = \`\${r.time} \${r.date}\`;
            }
          }
        } catch (e) {}

        let userMark = '';
        if (log.isUserGenerated || log.requestType) {
          if (log.requestType === 'REPLAY' || log.isReplay) {
            userMark = '<span style="background:rgba(59,130,246,0.3);color:#60a5fa;border:1px solid rgba(59,130,246,0.5);font-size:8px;padding:1px 3px;margin-right:5px;border-radius:3px;font-weight:bold;line-height:1;display:inline-block;vertical-align:middle;">REP</span>';
          } else {
            userMark = '<span style="background:rgba(245,158,11,0.3);color:#f59e0b;border:1px solid rgba(245,158,11,0.5);font-size:8px;padding:1px 3px;margin-right:5px;border-radius:3px;font-weight:bold;line-height:1;display:inline-block;vertical-align:middle;">MOD</span>';
          }
        }

        let rowContent = \`
          <div class="log-meta">
            \${userMark}
            <span class="log-method method-\${log.method}">\${log.method}</span>
            <span class="log-url" title="\${log.url}">\${displayUrl || log.url}</span>
            <span class="log-status \${statusClass}">\${log.status === 0 ? 'BLOCKED' : log.status}</span>
          </div>
          <div class="log-timestamp-row">
            <span>Time: \${formattedTime}</span>
            <span>Latency: \${log.durationMs || '12'}ms</span>
          </div>
        \`;

        // Customize display based on mode
        let displayBody;
        if (CURRENT_STREAM_MODE === 'REQUEST') {
          displayBody = formatBody(log.requestBody, !!log.expanded);
          
          rowContent = \`
            <div class="log-meta">
              \${userMark}
              <span class="log-method method-\${log.method}">\${log.method}</span>
              <span class="log-url" title="\${log.url}">\${displayUrl || log.url}</span>
            </div>
            <div class="log-body-container" style="margin-top:2px;">
              <pre class="log-body-preview" style="font-size:10px; color:#94a3b8; font-family:monospace; white-space:pre-wrap; margin:0;">
                \${displayBody}
              </pre>
              <button class="log-toggle-btn" style="font-size:9px; cursor:pointer; background:none; border:none; color:#fbbf24; padding:0;">
                \${log.expanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
          \`;
        } else if (CURRENT_STREAM_MODE === 'RESPONSE') {
          displayBody = formatBody(log.responseBody, !!log.expanded);

          rowContent = \`
            <div class="log-meta">
              \${userMark}
              <span class="log-method method-\${log.method}">\${log.method}</span>
              <span class="log-url" title="\${log.url}">\${displayUrl || log.url}</span>
            </div>
            <div class="log-body-container" style="margin-top:2px;">
              <pre class="log-body-preview" style="font-size:10px; color:#94a3b8; font-family:monospace; white-space:pre-wrap; margin:0;">
                \${displayBody}
              </pre>
              <button class="log-toggle-btn" style="font-size:9px; cursor:pointer; background:none; border:none; color:#fbbf24; padding:0;">
                \${log.expanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
          \`;
        }

        row.innerHTML = rowContent;

        const toggleBtn = row.querySelector('.log-toggle-btn');
        if (toggleBtn) {
          toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            log.expanded = !log.expanded;
            renderLogs();
          });
        }

        row.addEventListener('click', (e) => {
          selectedLogId = log.id;
          log.seen = true;
          row.classList.add('seen');
          
          try {
            sessionStorage.setItem('proxy_interceptor_logs', JSON.stringify(loggedRequests));
          } catch(err) {}

          panel.querySelectorAll('.log-row').forEach(el => el.classList.remove('selected'));
          row.classList.add('selected');
          renderInspector();
        });

        container.appendChild(row);
      });
    }

    // Helper to format/beautify JSON strings
    function tryPrettifyJSON(str) {
      if (!str) return '';
      try {
        const parsed = JSON.parse(str);
        return JSON.stringify(parsed, null, 2);
      } catch (e) {
        return str;
      }
    }

    // Parse URL Query parameters
    function parseUrlQueryParams(urlStr) {
      try {
        const url = new URL(urlStr);
        const params = {};
        for (const [k, v] of url.searchParams.entries()) {
          params[k] = v;
        }
        return params;
      } catch (e) {
        return {};
      }
    }

    // Dynamic right-side panel inspector content renderer
    function renderInspector() {
      const container = panel.querySelector('#inspector-pane-container');
      
      if (selectedLogId !== null || showingSettings) {
        panel.classList.add('has-selection');
      } else {
        panel.classList.remove('has-selection');
      }
      
      if (showingSettings) {
        container.innerHTML = \`
          <div class="inspector-container" style="padding:16px; overflow-y:auto; background:#04060b; height:calc(100% - 32px); display:flex; flex-direction:column; gap:12px;">
            <button class="mobile-back-btn" id="config-mobile-back-btn">
              <svg style="width:12px;height:12px;stroke:currentColor;vertical-align:middle;margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back to Logs
            </button>
            <div class="section-card" style="gap:14px; padding:20px; border-color: rgba(124, 58, 237, 0.45); background: #0c0f1a;">
              <div class="section-title" style="color:#c084fc; font-size:11px; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                <span>PARAMETERS CONFIGURATION PANEL</span>
                <span style="font-size:9px; background:#4c1d95; color:#e9d5ff; padding:1px 5px; border-radius:3px; text-transform:uppercase;">FULL MODE</span>
              </div>

              <!-- Script Mode Preference selection -->
              <div style="display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:10px; font-weight:bold; color:#cbd5e1; font-family:monospace; text-transform:uppercase; tracking:wider;">Script Mode Preference</label>
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
                  <button class="config-pref-btn \${CURRENT_MODE === 'LOCAL' ? 'active' : ''}" id="pref-btn-local" style="padding:8px; border-radius:6px; font-family:monospace; font-size:10px; font-weight:bold; cursor:pointer;" data-mode="LOCAL">
                    Local Overlay
                  </button>
                  <button class="config-pref-btn \${CURRENT_MODE === 'FORWARD' ? 'active' : ''}" id="pref-btn-forward" style="padding:8px; border-radius:6px; font-family:monospace; font-size:10px; font-weight:bold; cursor:pointer;" data-mode="FORWARD">
                    Sync Forwarding
                  </button>
                  <button class="config-pref-btn \${CURRENT_MODE === 'DUAL' ? 'active' : ''}" id="pref-btn-dual" style="padding:8px; border-radius:6px; font-family:monospace; font-size:10px; font-weight:bold; cursor:pointer;" data-mode="DUAL">
                    Dual Interceptor
                  </button>
                </div>
              </div>

              <!-- Proxy Endpoint Receiver Input -->
              <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
                <label style="font-size:10px; font-weight:bold; color:#cbd5e1; font-family:monospace; text-transform:uppercase; tracking:wider;">Proxy Endpoint Receiver</label>
                <input type="text" id="config-endpoint-input" value="\${CURRENT_ENDPOINT}" placeholder="http://localhost:3000" style="background:#1e293b; border:1px solid #475569; color:#f1f5f9; padding:8px 12px; border-radius:6px; font-family:monospace; font-size:11px; width:95%; outline:none;" />
              </div>

              <!-- Domain Intercept Filter Input -->
              <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
                <label style="font-size:10px; font-weight:bold; color:#cbd5e1; font-family:monospace; text-transform:uppercase; tracking:wider;">Domain Intercept Filter (Optional)</label>
                <input type="text" id="config-filter-input" value="\${CURRENT_FILTER}" placeholder="e.g. jasonplaceholder (leave blank for all)" style="background:#1e293b; border:1px solid #475569; color:#f1f5f9; padding:8px 12px; border-radius:6px; font-family:monospace; font-size:11px; width:95%; outline:none;" />
              </div>

              <!-- Stealth Rating Configuration Selection -->
              <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
                <label style="font-size:10px; font-weight:bold; color:#cbd5e1; font-family:monospace; text-transform:uppercase; tracking:wider;">Stealth Rating Configuration</label>
                <div style="display:flex; gap:8px; background:#0f172a; padding:4px; border-radius:6px; border:1px solid #1e293b;">
                  <button class="config-stealth-btn \${CURRENT_STEALTH === 'STD' ? 'active' : ''}" id="stealth-btn-std" style="flex:1; padding:6px; border-radius:4px; font-family:monospace; font-size:11px; cursor:pointer;" data-stealth="STD">Standard</button>
                  <button class="config-stealth-btn \${CURRENT_STEALTH === 'MAX' ? 'active' : ''}" id="stealth-btn-max" style="flex:1; padding:6px; border-radius:4px; font-family:monospace; font-size:11px; cursor:pointer;" data-stealth="MAX">Anti-Scan Active</button>
                </div>
              </div>

              <!-- Config Control Actions -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px solid #1e293b; padding-top:12px;">
                <div id="config-save-status" style="font-family:monospace; font-size:11px; color:#fbbf24; font-weight:bold; max-width:180px;"></div>
                <div style="display:flex; gap:8px;">
                  <button class="inspector-btn" id="config-reset-all-btn" style="background:#dc2626; border-color:#991b1b; color:white;">Reset All</button>
                  <button class="inspector-btn inspector-btn-replay" id="config-save-btn" style="background:#7c3aed; border-color:#8b5cf6; color:#ffffff;">Save & Refresh</button>
                </div>
              </div>
            </div>
            
            <div style="margin-top:4px; color:#64748b; font-family:monospace; font-size:10px; line-height:1.5; padding:4px;">
              <b>Tip:</b> Saving config stores preferences in secure GM_setValue / localStorage securely so you can use one unified script for all modes.
            </div>
          </div>
        \`;

        // CSS styles for config buttons
        const stylesToInject = document.createElement('style');
        stylesToInject.id = 'dynamic-config-styles';
        stylesToInject.textContent = \`
          .config-pref-btn {
            background: #0f172a !important;
            border: 1px solid #1e293b !important;
            color: #64748b !important;
            transition: all 0.2s ease !important;
          }
          .config-pref-btn:hover {
            border-color: #334155 !important;
            color: #94a3b8 !important;
          }
          .config-pref-btn.active {
            background: #1e3a8a !important;
            border-color: #2563eb !important;
            color: #93c5fd !important;
          }
          .config-stealth-btn {
            background: none !important;
            border: none !important;
            color: #64748b !important;
            transition: all 0.2s ease !important;
          }
          .config-stealth-btn:hover {
            color: #94a3b8 !important;
          }
          .config-stealth-btn.active {
            background: #334155 !important;
            color: #e2e8f0 !important;
            font-weight: bold !important;
          }
          #stealth-btn-max.active {
            background: #064e3b !important;
            color: #a7f3d0 !important;
          }
          .config-stream-btn {
            background: none !important;
            border: none !important;
            color: #64748b !important;
            transition: all 0.2s ease !important;
          }
          .config-stream-btn:hover {
            color: #94a3b8 !important;
          }
          .config-stream-btn.active {
            background: #334155 !important;
            color: #e2e8f0 !important;
            font-weight: bold !important;
          }
          #stream-btn-request.active {
            background: #1e3a8a !important;
            color: #93c5fd !important;
          }
          #stream-btn-response.active {
            background: #064e3b !important;
            color: #a7f3d0 !important;
          }
        \`;
        if (!shadow.getElementById('dynamic-config-styles')) {
          shadow.appendChild(stylesToInject);
        }

        // Add listeners inside the settings panel
        let tempMode = CURRENT_MODE;
        let tempStealth = CURRENT_STEALTH;
        let tempStreamMode = CURRENT_STREAM_MODE;

        container.querySelectorAll('.config-pref-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            container.querySelectorAll('.config-pref-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tempMode = btn.getAttribute('data-mode');
          });
        });

        container.querySelectorAll('.config-stealth-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            container.querySelectorAll('.config-stealth-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tempStealth = btn.getAttribute('data-stealth');
          });
        });

        const resetAllBtn = container.querySelector('#config-reset-all-btn');
        if (resetAllBtn) {
          resetAllBtn.addEventListener('click', () => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
          });
        }

        const saveBtn = container.querySelector('#config-save-btn');
        if (saveBtn) {
          saveBtn.addEventListener('click', () => {
            const ep = container.querySelector('#config-endpoint-input').value.trim();
            const fl = container.querySelector('#config-filter-input').value.trim();

            setStoredValue('script_mode', tempMode);
            setStoredValue('proxy_endpoint', ep);
            setStoredValue('domain_filter', fl);
            setStoredValue('stealth_rating', tempStealth);
            setStoredValue('stream_mode', tempStreamMode);
            sessionStorage.removeItem('proxy_interceptor_logs');

            // Notify
            const status = container.querySelector('#config-save-status');
            status.innerText = ' Saved! Refreshing page...';
            status.style.color = '#34d399';

            setTimeout(() => {
              window.location.reload();
            }, 800);
          });
        }

        const configMobileBackBtn = container.querySelector('#config-mobile-back-btn');
        if (configMobileBackBtn) {
          configMobileBackBtn.addEventListener('click', () => {
            showingSettings = false;
            const settingsBtn = panel.querySelector('#overlay-settings-btn');
            if (settingsBtn) {
              settingsBtn.style.background = '#1e293b';
              settingsBtn.style.borderColor = '#334155';
              settingsBtn.style.color = '#38bdf8';
              settingsBtn.innerText = 'Settings';
            }
            renderLogs();
            renderInspector();
          });
        }

        return;
      }

      const log = loggedRequests.find(l => String(l.id) === String(selectedLogId));

      if (panel) {
        if (selectedLogId) {
          panel.classList.add('has-selection');
        } else {
          panel.classList.remove('has-selection');
        }
      }

      if (!log) {
        container.innerHTML = \`
          <div class="inspector-container">
            <div class="mobile-back-header" id="empty-mobile-back-btn" style="background:#0f172a; border-bottom:1px solid #1e293b; padding:12px;">
              <svg style="width:16px;height:16px;stroke:#38bdf8;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              <span style="color:#38bdf8; font-weight:bold; font-size:12px;">Return to Network Traffic</span>
            </div>
            <div class="inspector-empty" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <div style="max-width:240px; margin:0 auto;">Select an active HTTP request in the left panel to inspect detailed headers, request payload, response bodies, and trigger live replaying.</div>
              \${selectedLogId ? \`<div style="margin-top:16px; padding:10px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); border-radius:6px; font-size:11px; color:#f87171;">
                <strong>Selection Error:</strong> Log entry ID "\${selectedLogId}" was not found in the current session buffer. It may have been cleared or rotated.
              </div>\` : ''}
            </div>
          </div>
        \`;

        const emptyMobileBackBtn = container.querySelector('#empty-mobile-back-btn');
        if (emptyMobileBackBtn) {
          emptyMobileBackBtn.addEventListener('click', () => {
            selectedLogId = null;
            renderLogs();
            renderInspector();
          });
        }
        return;
      }

      const queryParams = parseUrlQueryParams(log.url);
      const hasQueryParams = Object.keys(queryParams).length > 0;
      const hasReqBody = !!log.requestBody && log.requestBody.trim().length > 0;

      container.innerHTML = \`
        <div class="inspector-container">
          <div class="mobile-back-header" id="mobile-back-btn">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            <span>Back to Network Logs</span>
          </div>
          <!-- Inspector Header section -->
          <div class="inspector-header">
            <div class="inspector-title-row">
              <span class="log-method method-\${log.method}">\${log.method}</span>
              <div class="inspector-url-box" title="Full Absolute URL: \${log.url}">\${log.url}</div>
            </div>
            <div class="inspector-title-row" style="margin-top:2px;">
              <div style="font-family:monospace; font-size:11px; color:#94a3b8;">
                Status: <span class="\${log.status >= 200 && log.status < 300 ? 'status-success' : 'status-server-error'}" style="font-weight:bold;">\${log.status || 'BLOCKED'}</span> &bull; 
                Latency: <span style="color:#f59e0b; font-weight:bold;">\${log.durationMs || 12}ms</span>
              </div>
              <div class="inspector-actions">
                <button class="inspector-btn" id="copy-url-action-btn">Copy URL</button>
                <button class="inspector-btn inspector-btn-replay" id="replay-action-btn">Repeat Request</button>
              </div>
            </div>
          </div>

          <!-- Inspector Tabs -->
          <div class="inspector-tabs">
            <button class="insp-tab \${activeInspectorTab === 'headers' ? 'active' : ''}" data-tab="headers">Headers</button>
            <button class="insp-tab \${activeInspectorTab === 'query' ? 'active' : ''}" data-tab="query" style="\${hasQueryParams ? 'color:#38bdf8;' : ''}">Query Params (\${Object.keys(queryParams).length})</button>
            <button class="insp-tab \${activeInspectorTab === 'request' ? 'active' : ''}" data-tab="request" style="\${hasReqBody ? 'color:#38bdf8;' : ''}">Request Body</button>
            <button class="insp-tab \${activeInspectorTab === 'response' ? 'active' : ''}" data-tab="response">Response</button>
            <button class="insp-tab \${activeInspectorTab === 'modify' ? 'active' : ''}" data-tab="modify" style="color:#c084fc;">✏️ Edit & Send</button>
          </div>

          <!-- Inspector Content Window -->
          <div class="inspector-tab-content">
            \${renderActiveInspectorTabContent(log, queryParams)}
          </div>
        </div>
      \`;

      // Set up specific button interaction behaviors
      const mobileBackBtn = container.querySelector('#mobile-back-btn');
      if (mobileBackBtn) {
        mobileBackBtn.addEventListener('click', () => {
          selectedLogId = null;
          renderLogs();
          renderInspector();
        });
      }

      const copyUrlBtn = container.querySelector('#copy-url-action-btn');
      if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', () => {
          copyTextToClipboard(log.url, copyUrlBtn, 'Copied URL!');
        });
      }

      const replayActionBtn = container.querySelector('#replay-action-btn');
      if (replayActionBtn) {
        replayActionBtn.addEventListener('click', () => {
          executeReplay(log.id);
        });
      }

      const copyPayBtn = container.querySelector('#copy-payload-btn');
      if (copyPayBtn) {
        copyPayBtn.addEventListener('click', () => {
          const targetText = activeInspectorTab === 'request' ? log.requestBody : log.responseBody;
          copyTextToClipboard(targetText, copyPayBtn, 'Copied Payload!');
        });
      }

      const formatToggleBtn = container.querySelector('#pretty-toggle-btn');
      if (formatToggleBtn) {
        formatToggleBtn.addEventListener('click', () => {
          prettyPrintMode = !prettyPrintMode;
          renderInspector();
        });
      }

      const sendModifiedBtn = container.querySelector('#send-modified-btn');
      if (sendModifiedBtn) {
        sendModifiedBtn.addEventListener('click', () => {
          const method = container.querySelector('#edit-method-select').value;
          const url = container.querySelector('#edit-url-input').value;
          const headersRaw = container.querySelector('#edit-headers-textarea').value;
          const body = container.querySelector('#edit-body-textarea').value;
          const errorDiv = container.querySelector('#modify-error-status');

          let headers = {};
          try {
            headers = JSON.parse(headersRaw);
            errorDiv.style.display = 'none';
          } catch(e) {
            // Attempt Key:Value parsing
            const lines = headersRaw.split('\\n');
            for (const line of lines) {
              if (line.includes(':')) {
                const [key, ...valueParts] = line.split(':');
                headers[key.trim()] = valueParts.join(':').trim();
              }
            }
            if (Object.keys(headers).length === 0) {
              errorDiv.innerText = '❌ Invalid Headers: Use JSON or Key:Value format';
              errorDiv.style.display = 'block';
              return;
            }
            errorDiv.style.display = 'none';
          }

          // Strip dynamic internal/restricted headers
          delete headers['content-length'];
          delete headers['host'];
          delete headers['connection'];

          sendModifiedBtn.innerText = 'Sending...';
          sendModifiedBtn.disabled = true;

          const useGM = typeof GM_xmlhttpRequest !== 'undefined';
          const reqStartTime = Date.now();
          if (useGM) {
            GM_xmlhttpRequest({
              method: method,
              url: url,
              headers: headers,
              data: body || null,
              onload: function(response) {
                const duration = Date.now() - reqStartTime;
                let resHeaders = {};
                if (response.responseHeaders) {
                  response.responseHeaders.trim().split(/[\\r\\n]+/).forEach((line) => {
                    const parts = line.split(':');
                    const key = parts[0]?.trim();
                    const specVal = parts.slice(1).join(':')?.trim();
                    if (key) resHeaders[key] = specVal;
                  });
                }

                registerCapturedRequest({
                  method: method.toUpperCase(),
                  url: url,
                  requestHeaders: headers,
                  requestBody: body || null,
                  responseHeaders: resHeaders,
                  responseBody: response.responseText || '',
                  status: response.status || 200,
                  contentType: response.headers?.['content-type'] || 'text/plain',
                  durationMs: duration,
                  isUserGenerated: true,
                  requestType: 'MODIFIED',
                });

                sendModifiedBtn.innerText = 'Success';
                setTimeout(() => {
                  const targetBtn = shadow.getElementById('send-modified-btn');
                  if (targetBtn) {
                    targetBtn.innerText = 'Execute Modified Request';
                    targetBtn.disabled = false;
                  }
                }, 1200);
              },
              onerror: function(err) {
                const duration = Date.now() - reqStartTime;
                registerCapturedRequest({
                  method: method.toUpperCase(),
                  url: url,
                  requestHeaders: headers,
                  requestBody: body || null,
                  responseHeaders: {},
                  responseBody: err.error || 'Connection refused',
                  status: 0,
                  contentType: 'text/plain',
                  durationMs: duration,
                  isUserGenerated: true,
                  requestType: 'MODIFIED',
                });

                sendModifiedBtn.innerText = 'Failed';
                errorDiv.innerText = 'Network request failed to execute.';
                errorDiv.style.display = 'block';
                setTimeout(() => {
                  const targetBtn = shadow.getElementById('send-modified-btn');
                  if (targetBtn) {
                    targetBtn.innerText = 'Execute Modified Request';
                    targetBtn.disabled = false;
                  }
                }, 1500);
              }
            });
          } else {
            const opts = {
              method: method,
              headers: {
                ...headers,
                'x-proxydev-skip-hook': 'true'
              },
            };
            if (method !== 'GET' && method !== 'HEAD' && body) {
              opts.body = body;
            }
            window.fetch(url, opts)
              .then(async (response) => {
                const duration = Date.now() - reqStartTime;
                const clone = response.clone();
                let resText = '';
                try {
                  resText = await clone.text();
                } catch (e) {}

                const resHeaders = {};
                clone.headers.forEach((v, k) => { resHeaders[k] = v; });

                registerCapturedRequest({
                  method: method.toUpperCase(),
                  url: url,
                  requestHeaders: headers,
                  requestBody: body || null,
                  responseHeaders: resHeaders,
                  responseBody: resText,
                  status: response.status || 200,
                  contentType: clone.headers.get('content-type') || 'text/plain',
                  durationMs: duration,
                  isUserGenerated: true,
                  requestType: 'MODIFIED',
                });

                sendModifiedBtn.innerText = 'Success';
                setTimeout(() => {
                  const targetBtn = shadow.getElementById('send-modified-btn');
                  if (targetBtn) {
                    targetBtn.innerText = 'Execute Modified Request';
                    targetBtn.disabled = false;
                  }
                }, 1200);
              })
              .catch((err) => {
                const duration = Date.now() - reqStartTime;
                registerCapturedRequest({
                  method: method.toUpperCase(),
                  url: url,
                  requestHeaders: headers,
                  requestBody: body || null,
                  responseHeaders: {},
                  responseBody: err.message || 'Fetch connection failed',
                  status: 0,
                  contentType: 'text/plain',
                  durationMs: duration,
                  isUserGenerated: true,
                  requestType: 'MODIFIED',
                });

                sendModifiedBtn.innerText = 'Failed';
                errorDiv.innerText = err.message;
                errorDiv.style.display = 'block';
                setTimeout(() => {
                  const targetBtn = shadow.getElementById('send-modified-btn');
                  if (targetBtn) {
                    targetBtn.innerText = 'Execute Modified Request';
                    targetBtn.disabled = false;
                  }
                }, 1500);
              });
          }
        });
      }

      const resetModifyBtn = container.querySelector('#reset-modify-btn');
      if (resetModifyBtn) {
        resetModifyBtn.addEventListener('click', () => {
          renderInspector();
        });
      }

      // Add listeners to tab selectors inside the inspector view
      container.querySelectorAll('.insp-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          activeInspectorTab = tab.getAttribute('data-tab');
          renderInspector();
        });
      });
    }

    // Helper render tab subcontents
    function renderActiveInspectorTabContent(log, queryParams) {
      if (activeInspectorTab === 'headers') {
        const reqHeadersHTML = Object.entries(log.requestHeaders || {}).length > 0 
          ? Object.entries(log.requestHeaders).map(([k, v]) => \`
              <div class="kv-row">
                <div class="kv-key">\${k}</div>
                <div class="kv-val">\${v}</div>
              </div>
            \`).join('')
          : '<div style="color:#64748b; font-size:11.5px; padding:6px 0;">No customizable request headers logged.</div>';

        const resHeadersHTML = Object.entries(log.responseHeaders || {}).length > 0 
          ? Object.entries(log.responseHeaders).map(([k, v]) => \`
              <div class="kv-row">
                <div class="kv-key">\${k}</div>
                <div class="kv-val">\${v}</div>
              </div>
            \`).join('')
          : '<div style="color:#64748b; font-size:11.5px; padding:6px 0;">No active response headers captured.</div>';

        const trVal = formatDateCustom(log.timestamp);
        const triggeredTimeStr = \`\${trVal.date} \${trVal.time}\`;

        return \`
          <div class="section-card">
            <div class="section-title">General Summary</div>
            <div class="kv-row"><div class="kv-key">Absolute URL</div><div class="kv-val" style="user-select:text;">\${log.url}</div></div>
            <div class="kv-row"><div class="kv-key">Method</div><div class="kv-val" style="font-weight:bold;">\${log.method}</div></div>
            <div class="kv-row"><div class="kv-key">Captured Status</div><div class="kv-val">\${log.status || 'CONNECTION_BLOCKED'}</div></div>
            <div class="kv-row"><div class="kv-key">Triggered Time</div><div class="kv-val">\${triggeredTimeStr}</div></div>
          </div>
          \${CURRENT_STREAM_MODE !== 'RESPONSE' ? \`
          <div class="section-card">
            <div class="section-title">HTTP Request Headers</div>
            \${reqHeadersHTML}
          </div>\` : ''}
          <div class="section-card">
            <div class="section-title">HTTP Response Headers</div>
            \${resHeadersHTML}
          </div>
        \`;
      }

      if (activeInspectorTab === 'query') {
        const entries = Object.entries(queryParams);
        if (entries.length === 0) {
          return \`
            <div style="color:#64748b; font-family:monospace; font-size:11px; text-align:center; padding:24px;">
              No URL query string parameters discovered in this packet.
            </div>
          \`;
        }
        return \`
          <div class="section-card">
            <div class="section-title">Queried Key-Values</div>
            \${entries.map(([k, v]) => \`
              <div class="kv-row">
                <div class="kv-key">\${k}</div>
                <div class="kv-val">\${v}</div>
              </div>
            \`).join('')}
          </div>
        \`;
      }

      if (activeInspectorTab === 'request') {
        if (!log.requestBody) {
          return \`
            <div style="color:#64748b; font-family:monospace; font-size:11px; text-align:center; padding:24px;">
              No request payload body was logged for this \${log.method} stream.
            </div>
          \`;
        }

        const dispBody = prettyPrintMode ? tryPrettifyJSON(log.requestBody) : log.requestBody;
        return \`
          <div class="payload-toolbar">
            <button class="cat-btn" id="pretty-toggle-btn">\${prettyPrintMode ? 'View Raw Outline' : 'View Pretty Organized'}</button>
            <button class="cat-btn" id="copy-payload-btn" style="background:#2563eb; color:#ffffff;">Copy Body</button>
          </div>
          <pre class="payload-box">\${dispBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        \`;
      }

      if (activeInspectorTab === 'response') {
        if (!log.responseBody) {
          return \`
            <div style="color:#64748b; font-family:monospace; font-size:11px; text-align:center; padding:24px;">
              The captured response body payload is empty.
            </div>
          \`;
        }

        const dispBody = prettyPrintMode ? tryPrettifyJSON(log.responseBody) : log.responseBody;
        return \`
          <div class="payload-toolbar">
            <button class="cat-btn" id="pretty-toggle-btn">\${prettyPrintMode ? 'View Raw Outline' : 'View Pretty Organized'}</button>
            <button class="cat-btn" id="copy-payload-btn" style="background:#2563eb; color:#ffffff;">Copy Body</button>
          </div>
          <pre class="payload-box" style="color:#818cf8;">\${dispBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        \`;
      }

      if (activeInspectorTab === 'modify') {
        const methodOptions = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
          .map(m => \`<option value="\${m}" \${log.method === m ? 'selected' : ''}>\${m}</option>\`)
          .join('');

        const headersStr = JSON.stringify(log.requestHeaders || {}, null, 2);
        const bodyStr = log.requestBody || '';

        return \`
          <div class="section-card" style="gap:10px; padding:16px;">
            <div class="section-title" style="color:#c084fc;">Edit & Replay Packet parameters</div>
            
            <div style="display:flex; gap:10px; align-items:center;">
              <div style="display:flex; flex-direction:column; gap:4px;">
                <label style="font-size:10px; color:#94a3b8; font-weight:bold;">Method</label>
                <select id="edit-method-select" style="background:#1e293b; border:1px solid #475569; color:#f1f5f9; padding:6px 10px; border-radius:4px; font-family:monospace; font-size:11px; outline:none; cursor:pointer;">
                  \${methodOptions}
                </select>
              </div>
              <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
                <label style="font-size:10px; color:#94a3b8; font-weight:bold;">URL</label>
                <input type="text" id="edit-url-input" value="\${log.url}" style="background:#1e293b; border:1px solid #475569; color:#f1f5f9; padding:6px 10px; border-radius:4px; font-family:monospace; font-size:11px; width:95%; outline:none;" />
              </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
              <label style="font-size:10px; color:#94a3b8; font-weight:bold;">Headers (JSON or Key:Value lines)</label>
              <textarea id="edit-headers-textarea" style="background:#020408; border:1px solid #475569; color:#a7f3d0; padding:10px; border-radius:4px; font-family:monospace; font-size:11px; height:100px; resize:vertical; outline:none;">\${headersStr}</textarea>
            </div>

            <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
              <label style="font-size:10px; color:#94a3b8; font-weight:bold;">Request Body Payload</label>
              <textarea id="edit-body-textarea" style="background:#020408; border:1px solid #475569; color:#cbd5e1; padding:10px; border-radius:4px; font-family:monospace; font-size:11px; height:120px; resize:vertical; outline:none;">\${bodyStr}</textarea>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
              <button class="inspector-btn" id="reset-modify-btn" style="background:#334155; border-color:#475569;">Reset Parameters</button>
              <button class="inspector-btn inspector-btn-replay" id="send-modified-btn" style="background:#7c3aed; border-color:#8b5cf6; color:#ffffff;">Execute Modified Request</button>
            </div>
            
            <div id="modify-error-status" style="font-family:monospace; font-size:10px; color:#f87171; text-align:right; margin-top:4px; display:none;"></div>
          </div>
        \`;
      }

      return '';
    }

    function showExportMenu() {
      // Check if modal already exists
      let modal = panel.querySelector('#stealth-export-modal');
      if (modal) {
        modal.remove();
        return;
      }
      
      modal = document.createElement('div');
      modal.id = 'stealth-export-modal';
      modal.style.position = 'absolute';
      modal.style.top = '50%';
      modal.style.left = '50%';
      modal.style.transform = 'translate(-50%, -50%)';
      modal.style.width = '320px';
      modal.style.background = '#0b0f19';
      modal.style.border = '1px solid #7c3aed';
      modal.style.borderRadius = '10px';
      modal.style.padding = '16px';
      modal.style.zIndex = '9999999';
      modal.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(0, 0, 0, 0.7)';
      modal.style.fontFamily = 'monospace';
      modal.style.fontSize = '11px';
      
      modal.innerHTML = \`
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:8px; margin-bottom:12px;">
          <span style="color:#a7f3d0; font-weight:bold; font-size:12px;">📂 EXPORT PACKET STREAM</span>
          <button id="close-export-modal" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:14px; font-weight:bold;">&times;</button>
        </div>
        <div style="color:#94a3b8; margin-bottom:12px; line-height:1.4;">
          Extract captured flows safely inside this isolated, closed-mode Shadow DOM container to bypass host-page detection mechanisms.
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <button id="btn-export-json" class="inspector-btn" style="background:#1e3a8a; border-color:#3557cf; color:#ffffff; padding:10px; justify-content:center; gap:6px;">
            💾 Download JSON (Rich Payload)
          </button>
          <button id="btn-export-csv" class="inspector-btn" style="background:#064e3b; border-color:#047857; color:#ffffff; padding:10px; justify-content:center; gap:6px;">
            📊 Download CSV (Table Summary)
          </button>
        </div>
        <div style="margin-top:12px; font-size:9.5px; color:#64748b; text-align:center;">
          🔒 Encapsulated in Closed shadowDOM — 100% Invisible to Page Scrapers
        </div>
      \`;
      
      panel.appendChild(modal);
      
      // Wire up listeners
      modal.querySelector('#close-export-modal').addEventListener('click', () => modal.remove());
      
      modal.querySelector('#btn-export-json').addEventListener('click', () => {
        exportLogsAsJSON();
        modal.remove();
      });
      
      modal.querySelector('#btn-export-csv').addEventListener('click', () => {
        exportLogsAsCSV();
        modal.remove();
      });
    }

    function exportLogsAsJSON() {
      if (loggedRequests.length === 0) {
        alert("No intercepted packets in current session cache.");
        return;
      }
      const sessionData = {
        name: 'Extension Session ' + new Date().toISOString(),
        timestamp: new Date().toISOString(),
        logs: loggedRequests,
        domain: window.location.hostname
      };
      const dataStr = JSON.stringify(sessionData, null, 2);
      triggerHiddenDownload(dataStr, 'stealth_interceptions_' + Date.now() + '.json', 'application/json');
    }

    function exportLogsAsCSV() {
      if (loggedRequests.length === 0) {
        alert("No intercepted packets in current session cache.");
        return;
      }
      
      const headers = ["Timestamp", "Method", "URL", "Status", "LatencyMs", "ContentType", "PayloadSize"];
      const rows = loggedRequests.map(log => {
        const timestamp = new Date(log.timestamp).toISOString();
        const method = log.method || 'GET';
        const url = (log.url || '').replace(/"/g, '""');
        const status = log.status || 0;
        const latency = log.durationMs || 12;
        const contentType = log.contentType || 'unknown';
        const size = log.requestBody ? log.requestBody.length : 0;
        return \`"\${timestamp}","\${method}","\${url}",\${status},\${latency},"\${contentType}",\${size}\`;
      });
      
      const csvContent = [headers.join(','), ...rows].join('\\n');
      triggerHiddenDownload(csvContent, 'stealth_interceptions_' + Date.now() + '.csv', 'text/csv');
    }

    function triggerHiddenDownload(content, filename, contentType) {
      try {
        const blob = new Blob([content], { type: contentType + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        
        // Append inside our dark overlay Shadow DOM root to prevent host-page event listener intercepts
        shadow.appendChild(link);
        link.click();
        shadow.removeChild(link);
        URL.revokeObjectURL(url);
      } catch(e) {
        console.error("[Stealth Capture] Download trigger crashed. Fallback invoked.", e);
      }
    }

    // Initial load rendering routines
    renderLogs();
    renderInspector();
  }

})();`;
