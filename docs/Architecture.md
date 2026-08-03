# BatBrowser Architecture Specification

## Overview

BatBrowser is built on Electron's process-isolation security model:

```
┌─────────────────────────────────────────────────────────────┐
│                      MAIN PROCESS                           │
│ (src/main/app.js, src/tabs/TabManager.js, src/ipc/IpcRouter)│
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               │ IPC Channels                 │ WebContentsView / BrowserView
               ▼                              ▼
┌─────────────────────────────┐  ┌────────────────────────────┐
│      PRELOAD BRIDGE         │  │     WEB CONTENTS VIEWS     │
│   (preload/browser.js)      │  │ (User browsed web pages)   │
└──────────────┬──────────────┘  └────────────────────────────┘
               │ contextBridge
               ▼
┌─────────────────────────────┐
│      RENDERER PROCESS       │
│    (ui/browser/renderer.js) │
└─────────────────────────────┘
```

## Security Posture
- **Sandbox Mode:** Enabled across all renderer processes.
- **Context Isolation:** Enabled (`contextIsolation: true`).
- **Node Integration:** Disabled in WebContents (`nodeIntegration: false`).
- **Sanitizers:** Input validation via `src/ipc/validators.js` on every IPC handler.
- **Protocol Protections:** Strict navigation rules restricting internal `file://` / `bat://` access.
