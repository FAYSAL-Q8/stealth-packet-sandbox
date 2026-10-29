# Stealth Packet Sandbox & Network Traffic Interceptor

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel%20App-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://stealth-packet-sandbox.vercel.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Author: Faysal Alibrahim](https://img.shields.io/badge/Author-Faysal%20Alibrahim-10b981.svg?style=for-the-badge&logo=github)](https://github.com/FAYSAL-Q8)

> **Live Application URL**: [https://stealth-packet-sandbox.vercel.app/](https://stealth-packet-sandbox.vercel.app/)

A production-grade developer HTTP reverse proxy, packet interceptor, and traffic tampering sandbox. Built for engineers, security researchers, and QA testers to inspect, modify, and replay protected web requests while bypassing CORS restrictions, CSP frame locks, and anti-bot fingerprint mismatches.

---

## Live Web App Access

You can use the application directly in your browser without any local setup:

👉 **[https://stealth-packet-sandbox.vercel.app/](https://stealth-packet-sandbox.vercel.app/)**

---

## Why Do Repeated Requests Normally Fail?

When attempting to replay or copy an API request outside of its original browser tab (via cURL, Postman, or standard repeaters), servers frequently reject it with `403 Forbidden`, `401 Unauthorized`, or silent validation drops. This occurs because modern web servers validate subtle browser fingerprint signals:

1. **Client Hints (`sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`)**: Missing or mismatched browser brand tokens.
2. **Fetch Metadata (`sec-fetch-dest`, `sec-fetch-mode`, `sec-fetch-site`)**: Flags indicating whether the request originated from a direct document navigation, `fetch`, or an unauthorized cross-site iframe.
3. **Contextual Headers (`Origin`, `Referer`)**: Strict origin checking and CSRF token binding.
4. **CORS & CSP Framing**: Browsers blocking cross-origin responses or forbidding embedding inside testing iframes.

**Stealth Packet Sandbox** eliminates these bottlenecks by emulating legitimate browser signatures, proxying traffic through custom agents, and giving you surgical control over every header and payload parameter before re-transmitting.

---

## Public User Guide: How to Use the Tool

### 1. Embedded Sandbox Proxy Mode
1. Open [https://stealth-packet-sandbox.vercel.app/](https://stealth-packet-sandbox.vercel.app/).
2. In the top navigation address bar, enter the target website or API endpoint you wish to test (e.g., `https://api.example.com/v1/data` or `https://example.com/login`).
3. Press **Enter** or click **Proxy Load**.
4. The backend fetches the target, strips frame-busting `Content-Security-Policy` and `X-Frame-Options` restrictions, rewrites relative links, and injects lightweight runtime hooks for `window.fetch` and `XMLHttpRequest`.
5. Interact with the rendered webpage normally — every click, form submission, and background API request is automatically logged in real time.

---

### 2. Inspecting Captured Packets
In the **Traffic Inspector** panel:
* **Live Stream**: View all outbound and inbound HTTP transactions with exact HTTP methods (`GET`, `POST`, `PUT`, `DELETE`), URL paths, response status codes (`200 OK`, `403 Forbidden`, etc.), and round-trip latency in milliseconds.
* **Deep Inspection**: Click on any captured row to open the detailed packet inspector:
  * **Headers Tab**: View full request headers (including browser client hints) and response headers (cookies, caching directives, server signatures).
  * **Payload Tab**: Inspect raw JSON bodies, form data, or URL query parameters with automatic formatting and syntax highlighting.
  * **Response Preview**: View rendered HTML, JSON trees, or raw text returned by the server.

---

### 3. Tamper & Replay Sandbox (Repeater)
To modify and test request variations without writing code:
1. Select any captured packet from the list and click **"Tamper & Replay"** (or use the scratchpad tab).
2. **Modify Headers**: Add, toggle, or alter any HTTP header. Use the **"Inject Stealth Headers"** button to automatically populate realistic Chrome Client Hints (`sec-ch-ua`, `sec-fetch-site: same-origin`, etc.).
3. **Edit Query Parameters**: Dynamically add or change query strings in key-value format.
4. **Edit Request Body**: Modify JSON payloads, form values, or raw request strings.
5. Click **"Replay Request"**:
   * The request is dispatched through the proxy engine.
   * Review the execution results, new status codes, response headers, and exact millisecond duration side-by-side with the original capture.

---

### 4. Native Browser Interception (Tampermonkey Userscript)
If you prefer browsing natively in your regular desktop or mobile browser (Chrome, Firefox, Edge, Kiwi):
1. Navigate to the **"Extension / Userscript"** tab in the top navigation.
2. Click **"Copy Userscript Code"**.
3. Create a new script in your browser extension manager ([Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)) and paste the code.
4. Open your target website:
   * A discrete **HUD overlay** appears in the bottom corner showing real-time network calls.
   * You can view headers, copy cURL commands directly, or click **"Forward to Sandbox"** to pipe the live session data into [https://stealth-packet-sandbox.vercel.app/](https://stealth-packet-sandbox.vercel.app/) using privileged cross-origin hooks.

---

### 5. Session Management & Contract Analysis
* **Save / Export Sessions**: Click **"Save Session"** to store your captured traffic in local browser storage or export the session as a portable `.json` package for team sharing.
* **TAnalysis Spec Builder**: Switch to the **Analysis** view to automatically group discovered API endpoints by host and extract input/output schema models, query parameter matrices, and authentication requirements.
* **Printable Executive Report**: Click **"Print Report"** to generate a clean, printer-friendly technical summary of all audited endpoints, response codes, and security headers.

---

## Key Capabilities at a Glance

| Feature | Description |
| :--- | :--- |
| **CORS & CSP Bypass** | Intercept and inspect traffic without being blocked by browser origin policies or frame guards. |
| **Browser Emulation** | Automatically injects legitimate `sec-ch-ua` and `sec-fetch-*` Client Hints to prevent bot detection. |
| **Interactive Scratchpad** | Mutate parameters, headers, and request bodies on the fly with live server execution. |
| **Dual Interception** | Works both inside the web sandbox and natively via a zero-leakage Shadow DOM userscript. |
| **Format Flexibility** | Import and export packets via cURL syntax, fetch snippets, and raw JSON logs. |

---

## Author & Maintainer

**Faysal Alibrahim**  
GitHub: [@FAYSAL-Q8](https://github.com/FAYSAL-Q8)

---

## License

This project is open-source and released under the [MIT License](LICENSE).
