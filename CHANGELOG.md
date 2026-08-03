# Changelog

All notable changes to BatBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-08-04

### Added
- **NOCTURNE Design System**: Complete teal-accented visual architecture (`#00D4B4`).
- **Tab Context Menu**: Right-click context menus for pinning, muting, duplicating, and closing tabs.
- **Tab Animations**: Smooth width collapse (180ms cubic-bezier) on tab closing.
- **Internal System Pages**: Fully redesigned `Settings`, `History`, `Bookmarks`, `Downloads`, and `Error` pages.
- **IPC Safety Layer**: Centralized input validation schema in IPC router.
- **Broadcast Debouncing**: Event loop batching for IPC tab updates.

### Fixed
- Fixed WCAG AA text contrast ratio (`--text-muted: #6E7889`).
- Fixed default accent color setting in `SettingsStore.js`.
- Fixed tab close button propagation and add tab button positioning.
- Fixed fullscreen mode chrome hiding behavior.

## [1.0.0] - 2026-07-01
- Initial release of BatBrowser core shell.
