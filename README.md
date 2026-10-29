# Developer Network Proxy & Traffic Manipulator

> Production-grade full-stack HTTP reverse proxy and traffic inspection suite designed for deep packet debugging, client simulation, and precision replay.
> It isolates target traffic flows, bypasses restrictive browser security constraints (CORS, CSP, frame locks), and provides dual-mode interception via embedded sandbox viewports and out-of-band Tampermonkey userscripts.

---

## Overview

When developing against external APIs or auditing microservice communication, engineers encounter rigid cross-origin resource sharing (CORS) blocks, content security policy (CSP) framing locks, and transient session timeouts that impede payload inspection. **Developer Network Proxy** solves this by routing requests through a stealth Node.js proxy agent that strips browser fingerprints, reconstructs relative routing targets dynamically, and mirrors packets to a low-latency WebSocket stream for real-time tampering, session snapshots, and automated parameter contract mapping.

---

## Core Features

- **Dynamic Reverse Proxy Sandbox**: Enter any external target URL into the embedded sandbox browser. The backend seamlessly fetches HTML resources, strips frame-busting CSP meta headers, rewrites asset targets dynamically, and hooks into `fetch` / `XMLHttpRequest` pipelines natively.
- **Stealth Header Emulation**: Emulates modern Chrome browser identities (Client Hints: `sec-ch-ua`, `sec-fetch-*`, `user-agent`) while aggressively stripping cloud trace IDs, reverse-proxy headers, and origin leaks to evade aggressive anti-bot triggers.
- **Dual-Mode Tampermonkey Userscript Engine**: Inject the compiled userscript into external browsers (e.g., Kiwi, Chrome, Firefox) to intercept and inspect network traffic natively inside a zero-leakage Shadow DOM overlay or forward packets directly to the central dashboard via privileged `GM_xmlhttpRequest`.
- **Packet Tampering & Replay Scratchpad**: Clone any captured request directly into an isolated execution scratchpad. Mutate query parameters, headers, HTTP methods, and payload bodies with real-time server-side re-execution and round-trip duration tracking.
- **Session Snapshot Repository**: Export and import complete session logs to and from JSON packages. Switch seamlessly between frozen historical captures and live WebSocket data streams.
- **TAnalysis Specification Builder**: Automatically extract input/output schema parameters from recorded requests and cluster endpoints into categorized domain groups with one-click printable executive audit reports.
- **High-Throughput WebSocket Pipeline**: Broadcasts captured request and response payloads instantaneously across all connected developer clients without polling overhead.

---

## Tech Stack & Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer                           │
│  React 19 • Vite • Tailwind CSS • Lucide Icons • Motion     │
└──────────────────────────────┬──────────────────────────────┘
                               │ WebSocket (ws) + REST APIs
┌──────────────────────────────▼──────────────────────────────┐
│                    Proxy Service Engine                     │
│  Express 4 • Node.js Agent • HTTP/HTTPS Rewrite Pipeline     │
└──────────────────────────────┬──────────────────────────────┘
                               │ Clean Outbound Network Hops
┌──────────────────────────────▼──────────────────────────────┐
│                    Upstream Target APIs                     │
│  External Web Applications, JSON Services, Microservices    │
└─────────────────────────────────────────────────────────────┘
```

- **Frontend**: React 19, Vite 6, Tailwind CSS v4, Lucide React, Motion
- **Backend / Proxy Core**: Node.js, Express, WebSocket (`ws`), native `fetch` client agent
- **Scripting & Instrumentation**: JavaScript ES6+, Tampermonkey / Violentmonkey API bindings (`GM_xmlhttpRequest`, `GM_setValue`, `GM_getValue`)
- **Type Safety**: TypeScript 5.8 with strict interface enforcement across all captured packet structures

---

## Prerequisites & Setup

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **Package Manager**: `npm` (v9+) or `bun` / `pnpm`

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/FAYSAL-Q8/developer-network-proxy.git
   cd developer-network-proxy
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```

---

## Usage / Execution Guide

### Development Mode

Run the integrated development server with concurrent Vite client bundling and Node.js backend proxy middleware:

```bash
npm run dev
```

Once running, navigate to:
```
http://localhost:3000
```

### Production Build & Deployment

To generate an optimized client bundle and compile the server entry point:

```bash
# Compile client assets and bundle server
npm run build

# Launch the production instance
npm run start
```

### Type Checking & Linting

```bash
npm run lint
```

---

## Author

**Faysal Alibrahim**  
GitHub: [@FAYSAL-Q8](https://github.com/FAYSAL-Q8)

---

## License

This project is licensed under the terms of the [MIT License](LICENSE).
