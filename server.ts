/**
 * Author: Faysal Alibrahim
 * GitHub: https://github.com/FAYSAL-Q8
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { InterceptedRequest, ReplayRequest, ReplayResponse } from './src/types';
import { userscriptCode } from './src/userscript';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught exception inside proxy service:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled promise rejection inside proxy service at:', promise, 'reason:', reason);
});

const app = express();
const PORT = 3000;

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket Server
const wss = new WebSocketServer({ server });

// Keep list of connected WebSocket clients
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[WebSocket] Client connected, total clients:', clients.size);

  // Send initial history
  ws.send(JSON.stringify({ type: 'INIT_HISTORY', data: requestHistory }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log('[WebSocket] Client disconnected, total clients:', clients.size);
  });
});

// Broadcast helper
function broadcast(message: { type: string; data: any }) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Helper to generate realistic browser-like headers
const REALISTIC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

function getRealisticHeaders(
  originalHeaders: Record<string, any> = {},
  manualIsNavigation?: boolean,
  proxyHost?: string
): Record<string, string> {
  const headers: Record<string, string> = {};
  
  const isNav = manualIsNavigation !== undefined 
    ? manualIsNavigation 
    : (originalHeaders['sec-fetch-mode'] === 'navigate' || (originalHeaders['accept'] && originalHeaders['accept']?.includes('text/html')));

  headers['user-agent'] = originalHeaders['user-agent'] || REALISTIC_USER_AGENT;
  headers['accept'] = originalHeaders['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
  headers['accept-language'] = originalHeaders['accept-language'] || 'en-US,en;q=0.9';
  
  headers['sec-ch-ua'] = originalHeaders['sec-ch-ua'] || '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"';
  headers['sec-ch-ua-mobile'] = originalHeaders['sec-ch-ua-mobile'] || '?0';
  headers['sec-ch-ua-platform'] = originalHeaders['sec-ch-ua-platform'] || '"Windows"';
  
  if (isNav) {
    headers['sec-fetch-dest'] = originalHeaders['sec-fetch-dest'] || 'document';
    headers['sec-fetch-mode'] = originalHeaders['sec-fetch-mode'] || 'navigate';
    headers['sec-fetch-site'] = originalHeaders['sec-fetch-site'] || 'none';
    headers['sec-fetch-user'] = originalHeaders['sec-fetch-user'] || '?1';
    headers['upgrade-insecure-requests'] = '1';
  } else {
    headers['sec-fetch-dest'] = originalHeaders['sec-fetch-dest'] || 'empty';
    headers['sec-fetch-mode'] = originalHeaders['sec-fetch-mode'] || 'cors';
    headers['sec-fetch-site'] = originalHeaders['sec-fetch-site'] || 'same-origin';
  }

  const blockedHeaders = [
    'host', 'connection', 'content-length', 'transfer-encoding', 
    'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 
    'via', 'proxy-connection', 'cf-ray', 'cf-connecting-ip',
    'x-real-ip', 'x-appengine-remote-addr', 'x-cloud-trace-context',
    'x-request-id', 'x-forwarded-port', 'forwarded'
  ];

  for (const [key, value] of Object.entries(originalHeaders)) {
    const k = key.toLowerCase();
    
    // Strip proxy footprints, self-referencing hosts and origins
    if (k === 'referer' || k === 'origin' || k === 'host') {
      const valStr = String(value).toLowerCase();
      if (
        (proxyHost && valStr.includes(proxyHost.toLowerCase())) ||
        valStr.includes('localhost') ||
        valStr.includes('127.0.0.1')
      ) {
        continue;
      }
    }

    if (!blockedHeaders.includes(k) && !headers[k]) {
      headers[k] = String(value);
    }
  }

  return headers;
}

// Memory database for request log
let requestHistory: InterceptedRequest[] = [];

// API ENDPOINT: EXTERNAL TRAFFIC FORWARD RECEIVED FROM TAMPERMONKEY USERSCRIPT
app.options('/api/external-traffic', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.sendStatus(204);
});

app.post('/api/external-traffic', express.json(), (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  const data = req.body;
  
  if (!data || !data.url) {
    return res.status(400).json({ error: 'Invalid payload log format.' });
  }

  try {
    const targetUrl = new URL(data.url);
    const intercepted: InterceptedRequest = {
      id: data.id || ('ext_' + Math.random().toString(36).substring(2, 11)),
      timestamp: data.timestamp || new Date().toISOString(),
      method: data.method || 'GET',
      url: targetUrl.href,
      domain: targetUrl.hostname,
      path: targetUrl.pathname,
      queryParams: Object.fromEntries(targetUrl.searchParams.entries()),
      requestHeaders: data.requestHeaders || {},
      requestBody: data.requestBody || null,
      responseHeaders: data.responseHeaders || {},
      responseBody: data.responseBody || null,
      status: typeof data.status === 'number' ? data.status : 200,
      contentType: data.contentType || 'text/plain',
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : 100,
      isUserGenerated: data.isUserGenerated,
      requestType: data.requestType,
    };

    requestHistory.unshift(intercepted);
    if (requestHistory.length > 250) {
      requestHistory.pop();
    }

    broadcast({ type: 'NEW_REQUEST', data: intercepted });
    res.json({ success: true, message: 'External traffic synchronized.' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to register external traffic log: ${err.message}` });
  }
});

// API ENDPOINT: CLEAR HISTORY
app.post('/api/clear', (req, res) => {
  requestHistory = [];
  broadcast({ type: 'CLEAR_HISTORY', data: [] });
  res.json({ success: true, message: 'Request log cleared.' });
});

// API ENDPOINT: HISTORY LIST
app.get('/api/history', (req, res) => {
  res.json(requestHistory);
});

// API ENDPOINT: REPLAY EXECUTION
app.post('/api/replay', express.json(), async (req, res) => {
  const { method, url, headers, body } = req.body as ReplayRequest;
  if (!url) {
    return res.status(400).json({ error: 'Missing target URL' });
  }

  try {
    const startTime = Date.now();
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: getRealisticHeaders(headers || {}, true),
    };

    if (!['GET', 'HEAD'].includes(method.toUpperCase())) {
      fetchOptions.body = body;
    }

    const upstreamResponse = await fetch(url, fetchOptions);
    const durationMs = Date.now() - startTime;

    const resHeaders: Record<string, string> = {};
    upstreamResponse.headers.forEach((value, key) => {
      resHeaders[key] = value;
    });

    const contentType = resHeaders['content-type'] || 'text/plain';
    const responseBodyText = await upstreamResponse.text();

    const result: ReplayResponse = {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: resHeaders,
      body: responseBodyText,
      durationMs,
      contentType,
    };

    // Optionally also register replayed request as an intercepted request!
    const targetUrl = new URL(url);
    const intercepted: InterceptedRequest = {
      id: 'rep_' + Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString(),
      method: method.toUpperCase(),
      url: targetUrl.href,
      domain: targetUrl.hostname,
      path: targetUrl.pathname,
      queryParams: Object.fromEntries(targetUrl.searchParams.entries()),
      requestHeaders: headers || {},
      requestBody: body || null,
      responseHeaders: resHeaders,
      responseBody: responseBodyText,
      status: upstreamResponse.status,
      contentType,
      durationMs,
      isModified: true,
    };

    requestHistory.unshift(intercepted);
    if (requestHistory.length > 200) requestHistory.pop();
    broadcast({ type: 'NEW_REQUEST', data: intercepted });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: `Replay execution failed: ${err.message}` });
  }
});

// CORE TRAFFIC PROXY ENDPOINT
// Mounted PRIOR to any express standard body decoders so we can stream/intercept the raw request body.
app.all('/api/proxy', async (req, res) => {
  let targetUrlStr = req.query.url as string;

  // Fallback if URL parameter is missing, checking the Referer header to reconstruct
  if (!targetUrlStr && req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer);
      const refererTarget = refererUrl.searchParams.get('url');
      if (refererTarget) {
        const originalUrlObj = new URL(refererTarget);
        const searchPart = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
        const originalOrigin = originalUrlObj.origin;
        const originalPath = originalUrlObj.pathname;
        targetUrlStr = originalOrigin + originalPath + searchPart;
        console.log(`[Proxy] Reconstructed missing url from referer target: ${targetUrlStr}`);
      }
    } catch (e) {
      console.error('[Proxy] Failed to reconstruct url parameter from referer:', e);
    }
  }

  if (!targetUrlStr) {
    return res.status(400).send('Missing parameter: url. Enter a direct target origin first.');
  }

  const isLocalInterceptorEnabled = req.query.local_interceptor === 'true';

  try {
    const targetUrl = new URL(targetUrlStr);

    // Forward other incoming query helper params to the target upstream URL
    for (const [key, val] of Object.entries(req.query)) {
      if (key !== 'url' && key !== 'local_interceptor') {
        if (typeof val === 'string') {
          targetUrl.searchParams.set(key, val);
        } else if (Array.isArray(val)) {
          val.forEach((v) => {
            if (typeof v === 'string') {
              targetUrl.searchParams.append(key, v);
            }
          });
        }
      }
    }

    const proxyOrigin = `${req.protocol}://${req.get('host')}`;
    const proxyPrefix = `${proxyOrigin}/api/proxy?url=`;

    // Read full raw request body from client stream
    const rawBodyBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', (err) => reject(err));
    });

    const forwardHeaders = getRealisticHeaders(req.headers, undefined, req.get('host'));
    const options: RequestInit = {
      method: req.method,
      headers: forwardHeaders,
    };

    if (rawBodyBuffer.length > 0) {
      options.body = rawBodyBuffer;
    }

    const startTime = Date.now();
    const upstreamResponse = await fetch(targetUrl.href, options);
    const durationMs = Date.now() - startTime;

    const responseStatus = upstreamResponse.status;
    const responseHeaders: Record<string, string> = {};
    upstreamResponse.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    const contentType = responseHeaders['content-type'] || 'text/plain';

    // Enable wide CORS for dynamic iframe manipulation support
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');

    // Fetch response body as ArrayBuffer
    const arrayBuffer = await upstreamResponse.arrayBuffer();
    let responseData = Buffer.from(arrayBuffer);
    let parsedTextBody: string | null = null;

    const isText = contentType.includes('text/') || 
                   contentType.includes('json') || 
                   contentType.includes('xml') || 
                   contentType.includes('javascript');

    if (isText) {
      parsedTextBody = responseData.toString('utf-8');
    }

    const actualBaseUrl = upstreamResponse.url || targetUrl.href;

    // HTML Rewriter and script injector logic
    if (contentType.includes('text/html') && parsedTextBody !== null) {
      let html = parsedTextBody;

      // Strip META CSP tags to prevent local interception blocks
      html = html.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '<!-- CSP Striped by Proxy -->');

      // Regex replace src, href, and action attributes
      // Match attributes using standard format so we route assets/requests through proxy
      html = html.replace(/(src|href|action)=["']([^"']*)["']/gi, (match, attr, pathVal) => {
        if (pathVal.startsWith('data:') || pathVal.startsWith('javascript:')) {
          return match;
        }
        
        try {
          const resolved = new URL(pathVal, actualBaseUrl).href;
          return `${attr}="${proxyPrefix}${encodeURIComponent(resolved)}"`;
        } catch {
          return match;
        }
      });

      // Inject interceptor script at the start of head
      let scriptToInject = `
<!-- PROXY INTERCEPTOR SCRIPT -->
<script id="proxy-interceptor">
(function() {
  console.log('[Safe Proxy] Browser-like environment initialized');

  // --- STEALTH EVASION ---
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => ({ length: 3, item: () => null, namedItem: () => null }) });
    
    // Mock window.chrome
    if (!window.chrome) {
      window.chrome = {
        app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, getDetails: () => null, getIsInstalled: () => false },
        runtime: { OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' }, OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' } }
      };
    }

    // Fix permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  } catch(e) {}
  // -------------------------

  const actualBaseUrl = "PLACEHOLDER_BASE_URL";
  const proxyUrl = (u) => {
    try {
      if (!u || typeof u !== 'string' || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('javascript:')) return u;
      if (u.includes(window.location.host)) return u;
      return window.location.origin + '/api/proxy?url=' + encodeURIComponent(new URL(u, actualBaseUrl).href);
    } catch(e) { return u; }
  };

  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const pUrl = proxyUrl((typeof input === 'string') ? input : (input instanceof URL ? input.href : (input && input.url ? input.url : '')));
    if (pUrl && pUrl !== input && pUrl !== (input && input.url)) {
      if (typeof input === 'string') return originalFetch(pUrl, init);
      if (input instanceof URL) return originalFetch(new URL(pUrl), init);
      return originalFetch(new Request(pUrl, input), init);
    }
    return originalFetch(input, init);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    return originalOpen.call(this, method, proxyUrl(url), async, user, password);
  };

  // Pre-empt a element clicks inside proxy frame
  window.addEventListener('click', function(e) {
    const target = e.target.closest('a');
    if (target && target.href) {
      const originalHref = target.getAttribute('href');
      const isProxyAlready = originalHref && (originalHref.startsWith('/api/proxy') || originalHref.startsWith(window.location.origin + '/api/proxy'));
      if (originalHref && !isProxyAlready && !originalHref.startsWith('javascript:') && !originalHref.startsWith('#')) {
        try {
          const resolvedUrl = new URL(originalHref, actualBaseUrl).href;
          target.href = window.location.origin + '/api/proxy?url=' + encodeURIComponent(resolvedUrl);
        } catch(e) {}
      }
    }
  }, true);

  // Pre-empt form submissions inside proxy frame
  window.addEventListener('submit', function(e) {
    const form = e.target;
    let action = form.getAttribute('action');
    if (!action) {
      action = window.location.href;
    }
    
    try {
      const resolvedUrl = new URL(action, actualBaseUrl).href;
      const isProxyAlready = resolvedUrl && (resolvedUrl.startsWith('/api/proxy') || resolvedUrl.startsWith(window.location.origin + '/api/proxy'));
      
      if (!isProxyAlready && !resolvedUrl.startsWith('javascript:')) {
        form.setAttribute('action', window.location.origin + '/api/proxy?url=' + encodeURIComponent(resolvedUrl));
      }
    } catch(e) {}
  }, true);
})();
</script>
`;
      // Replace Placeholder globally
      scriptToInject = scriptToInject.replace(/PLACEHOLDER_BASE_URL/g, actualBaseUrl);

      if (isLocalInterceptorEnabled) {
        scriptToInject += `
<!-- SIMULATED TAMPERMONKEY EXTENSION SIMULATOR -->
<script id="tampermonkey-simulator">
(function() {
  window.GM_info = { script: { name: "stealthy-developer-interceptor-simulated" } };
  window.GM_getValue = function(key, defaultVal) {
    try {
      const v = localStorage.getItem('proxy_interceptor_' + key);
      return v !== null ? v : defaultVal;
    } catch(e) { return defaultVal; }
  };
  window.GM_setValue = function(key, val) {
    try {
      localStorage.setItem('proxy_interceptor_' + key, val);
    } catch(e) {}
  };
})();
</script>
<script id="tampermonkey-userscript-source">
${userscriptCode}
</script>
        `;
      }

      if (html.includes('<head>')) {
        html = html.replace('<head>', '<head>' + scriptToInject);
      } else {
        html = scriptToInject + html;
      }

      responseData = Buffer.from(html, 'utf-8');
      parsedTextBody = html;
    }

    // Build representation of intercepted request log
    let requestBodyText: string | null = null;
    if (rawBodyBuffer.length > 0) {
      requestBodyText = rawBodyBuffer.toString('utf-8');
    }

    const intercepted: InterceptedRequest = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString(),
      method: req.method,
      url: targetUrl.href,
      domain: targetUrl.hostname,
      path: targetUrl.pathname,
      queryParams: Object.fromEntries(targetUrl.searchParams.entries()),
      requestHeaders: forwardHeaders,
      requestBody: requestBodyText,
      responseHeaders,
      responseBody: parsedTextBody,
      status: responseStatus,
      contentType,
      durationMs,
    };

    // Save in server queue
    requestHistory.unshift(intercepted);
    if (requestHistory.length > 200) {
      requestHistory.pop();
    }

    // Notify clients instantly over WebSockets
    broadcast({ type: 'NEW_REQUEST', data: intercepted });

    // Send original or manipulated data back to frame client
    res.status(responseStatus);
    const stripHeaders = [
      'content-encoding',
      'content-length',
      'transfer-encoding',
      'x-frame-options',
      'content-security-policy',
      'content-security-policy-report-only',
      'cross-origin-embedder-policy',
      'cross-origin-opener-policy',
      'cross-origin-resource-policy'
    ];
    for (const [key, val] of Object.entries(responseHeaders)) {
      if (!stripHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, val);
      }
    }
    res.setHeader('content-type', contentType);
    res.send(responseData);

  } catch (err: any) {
    console.error('Proxy routing error for:', targetUrlStr, err);
    res.status(502).send(`Proxy Error: Failed to fetch "${targetUrlStr}": ${err.message}`);
  }
});

// Configure Vite middleware or Static files routing
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Proxy Server] Live and listening on http://0.0.0.0:${PORT}`);
  });
}

start();
