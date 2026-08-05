# BatBrowser Folder Structure Guide

```
BatBrowser/
├── .github/          # CI/CD workflows, issue templates, PR template
├── .vscode/          # Workspace settings & launch configs
├── assets/           # Project graphics, logos, wallpapers
├── build/            # Installer scripts & platform icons
├── docs/             # Technical documentation
├── preload/          # Electron preload scripts (contextBridge)
├── resources/        # Default templates, licenses, translations
├── scripts/          # Build, clean, release, verify scripts
├── src/              # Main process backend modules
│   ├── bookmarks/    # Bookmarks storage service
│   ├── core/         # Constants & Logger foundation
│   ├── downloads/    # Native download manager
│   ├── history/      # Persistent history service
│   ├── ipc/          # IPC Router & validator logic
│   ├── main/         # Main process orchestrator
│   ├── navigation/   # URL parsing & search engine resolver
│   ├── security/     # Site permission policy handler
│   ├── settings/     # Electron store wrapper
│   ├── tabs/         # Tab manager & WebContents lifecycle
│   ├── utils/        # Shared helper functions
│   └── windows/      # Window geometry math
├── tests/            # Unit, integration, and E2E test suites
└── ui/               # Renderer Process (UI Shell & Internal Pages)
    ├── browser/      # Top Chrome UI shell (`index.html`, `renderer.js`, `styles.css`)
    ├── pages/        # Internal pages (settings, history, bookmarks, downloads, error, newtab)
    └── shared/       # NOCTURNE Design tokens (`tokens.css`) & SVG graphics
```
