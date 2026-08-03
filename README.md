# BatBrowser X 🦇

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-v31.0.0-47848F?logo=electron)](https://www.electronjs.org/)
[![Design System](https://img.shields.io/badge/Design-NOCTURNE-00D4B4)](docs/Design-System.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> A world-class, hyper-fast, secure, and privacy-focused desktop web browser engineered with the **NOCTURNE** dark design system.

---

## 📸 Screenshots

| Top Chrome & Tab Rail | Settings Panel | History Manager |
|---|---|---|
| Deep NOCTURNE Abyss styling | Full categorical preferences | Date-grouped browsing log |

---

## ✨ Features

- 🎨 **NOCTURNE Visual Identity:** Crafted with a curated teal palette (`#00D4B4`), glassmorphism, spring physics, and deep contrast.
- 🛡️ **Network-Level Adblocker:** Native request interceptor with statistics counter.
- 🔒 **Privacy First:** WebRTC IP leakage prevention, GPC (Global Privacy Control), Do Not Track headers, and cookie isolation.
- ⚡ **High Performance:** Memory-efficient tab sleeping after inactivity and debounced IPC communication.
- 📑 **Tab Experience:** Context menus (Pin, Mute, Duplicate, Close Others), smooth width collapse animations, and sleeping tab state indicators.
- 🛠️ **System Pages:** Built-in custom `Settings`, `History`, `Bookmarks`, `Downloads`, and `Error` internal web apps.

---

## 🏗️ Repository Architecture

```
BatBrowser/
├── .github/          # GitHub CI/CD workflows, issue templates, PR template
├── .vscode/          # Recommended workspace settings & launch configurations
├── assets/           # SVG logos, app icon binaries, default wallpapers
├── build/            # Platform packaging configs & installer scripts
├── docs/             # Technical documentation & design token guides
├── preload/          # Isolated IPC bridge context (`window.batBrowser`)
├── resources/        # Default application data templates & licenses
├── scripts/          # Workspace verification, clean, release, version scripts
├── src/              # Main Process JavaScript backend modules
│   ├── adblock/      # Request filtering & adblocker engine
│   ├── bookmarks/    # Persistent bookmark store
│   ├── core/         # Constants & Logger foundation
│   ├── downloads/    # Native download manager
│   ├── history/      # Persistent history store
│   ├── ipc/          # Central IPC Router & safety validators
│   ├── navigation/   # URL parsing & search engine resolver
│   ├── security/     # Site permission policy handler
│   ├── settings/     # Electron store wrapper with schema migration
│   ├── tabs/         # Tab manager & WebContents lifecycle
│   ├── utils/        # Shared helper utilities
│   └── windows/      # Window bounds geometry math
├── tests/            # Unit, integration, and end-to-end test suites
└── ui/               # Renderer Process (App Shell & Internal Web Apps)
    ├── browser/      # Top Chrome interface (`index.html`, `renderer.js`, `styles.css`)
    ├── pages/        # Internal pages (settings, history, bookmarks, downloads, error, newtab)
    └── shared/       # Design tokens (`tokens.css`) & SVG icons
```

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- npm 9.0.0 or higher

### Installation & Local Run

```bash
# Clone the repository
git clone https://github.com/batbrowser/batbrowser.git
cd batbrowser

# Install dependencies
npm install

# Run application in development mode
npm start
```

### Run Code Verification
```bash
node scripts/verify.js
```

---

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| **New Tab** | `Ctrl + T` |
| **Close Tab** | `Ctrl + W` |
| **Reopen Closed Tab** | `Ctrl + Shift + T` |
| **Focus Address Bar** | `Ctrl + L` or `F6` |
| **Settings** | `Ctrl + ,` |
| **History** | `Ctrl + H` |
| **Downloads** | `Ctrl + J` |
| **Bookmarks** | `Ctrl + B` |

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
