// ═══════════════════════════════════════════════════════════════
// BatBrowser — Main Process Entry Point
// Slim orchestrator. All logic lives in src/ modules.
// ═══════════════════════════════════════════════════════════════

'use strict';

const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');

// ─── Core Modules ────────────────────────────────────────────────

const Logger  = require('./src/core/Logger');
const { INTERNAL_PAGES, PRELOAD, WINDOW, IPC, UI_ROOT } = require('./src/core/Constants');

const { TabManager }     = require('./src/tabs/TabManager');
const IpcRouter          = require('./src/ipc/IpcRouter');
const { getInstance: getSettings }  = require('./src/settings/SettingsStore');
const { getInstance: getHistory }   = require('./src/history/HistoryStore');
const { getInstance: getBookmarks } = require('./src/bookmarks/BookmarkStore');
const { getInstance: getDownloads } = require('./src/downloads/DownloadManager');
const { getInstance: getAdBlock }   = require('./src/adblock/AdBlocker');
const PermissionHandler = require('./src/security/PermissionHandler');
const { getContentBounds } = require('./src/windows/Geometry');

const log = Logger.create('Main');

// ─── App-Level Security Flags ─────────────────────────────────────

// Disable features that can leak private IP addresses via WebRTC
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
app.commandLine.appendSwitch('enforce-webrtc-ip-permission-check');

// Disable legacy XSS auditor (deprecated, use CSP instead)
app.commandLine.appendSwitch('disable-features', 'XSSAuditor');

// Enable smooth scrolling at the Chromium level
app.commandLine.appendSwitch('enable-smooth-scrolling');

// Improve GPU compositing performance
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// ─── Singleton Services ───────────────────────────────────────────

const settingsStore  = getSettings();
const historyStore   = getHistory();
const bookmarkStore  = getBookmarks();
const downloadManager = getDownloads();
const adBlocker      = getAdBlock();

// ─── Main Window & Tabs ───────────────────────────────────────────

/** @type {Electron.BrowserWindow|null} */
let mainWindow = null;

/** @type {TabManager|null} */
let tabManager = null;

// ─── Session Setup ────────────────────────────────────────────────

/**
 * Configures privacy, ad blocking, and permissions on a session.
 * @param {Electron.Session} ses
 */
function setupSession(ses) {
  // Privacy headers on all outgoing requests
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const s = settingsStore.getAll();
    if (s.doNotTrack)          details.requestHeaders['DNT']     = '1';
    if (s.globalPrivacyControl) details.requestHeaders['Sec-GPC'] = '1';
    callback({ requestHeaders: details.requestHeaders });
  });

  // Ad blocking
  adBlocker.setup(ses);

  // Permissions
  PermissionHandler.setup(ses, () => settingsStore.getAll());

  log.info('Session configured');
}

// ─── Window Creation ──────────────────────────────────────────────

/**
 * Creates the main browser window and wires all services.
 */
function createMainWindow() {
  const settings = settingsStore.getAll();

  mainWindow = new BrowserWindow({
    width:           WINDOW.DEFAULT_WIDTH,
    height:          WINDOW.DEFAULT_HEIGHT,
    minWidth:        WINDOW.MIN_WIDTH,
    minHeight:       WINDOW.MIN_HEIGHT,
    frame:           false,
    titleBarStyle:   'hidden',
    backgroundColor: WINDOW.BACKGROUND,
    show:            false,
    webPreferences: {
      preload:          PRELOAD.BROWSER,
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          true,          // SECURITY: enabled
      webviewTag:       false,
      spellcheck:       true,
    },
  });

  // ── Broadcast function (sends tabs state to renderer) ───────────
  // Debounced to coalesce rapid state changes into one send per frame.
  let _broadcastTimer = null;
  function broadcast() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!tabManager) return;
    if (_broadcastTimer) return; // already scheduled
    _broadcastTimer = setImmediate(() => {
      _broadcastTimer = null;
      try {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send(IPC.TABS_UPDATED, tabManager.getSerializedState());
      } catch {}
    });
  }

  // ── TabManager ──────────────────────────────────────────────────
  tabManager = new TabManager(mainWindow, broadcast, settingsStore);

  // ── Wire all services to downloads and adblock ──────────────────
  adBlocker.attachWindow(mainWindow);
  downloadManager.attachWindow(mainWindow);
  downloadManager.setup(session.defaultSession);

  // ── IPC Router ─────────────────────────────────────────────────
  IpcRouter.setup({
    tabs:      tabManager,
    history:   historyStore,
    bookmarks: bookmarkStore,
    settings:  settingsStore,
    downloads: downloadManager,
    adblock:   adBlocker,
    win:       mainWindow,
  });

  // ── Register keyboard shortcuts in the main window ───────────────
  mainWindow.webContents.on('before-input-event', (event, input) => {
    handleKeyboardShortcuts(event, input);
  });

  // ── Window resize → update BrowserView bounds ────────────────────
  mainWindow.on('resize', () => {
    if (tabManager) tabManager.updateActiveBounds();
  });

  // ── Window maximize/restore state ────────────────────────────────
  mainWindow.on('maximize',   () => mainWindow.webContents.send(IPC.WINDOW_STATE_CHANGED, { maximized: true }));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send(IPC.WINDOW_STATE_CHANGED, { maximized: false }));
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send(IPC.WINDOW_STATE_CHANGED, { fullscreen: true }));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send(IPC.WINDOW_STATE_CHANGED, { fullscreen: false }));

  // ── History: record navigations from TabManager ──────────────────
  // TabManager fires tab:url-updated; we listen here to record history
  mainWindow.webContents.on('ipc-message', () => {}); // placeholder
  // Instead, intercept via did-navigate in TabManager which calls back here:
  // Provided by attaching a listener to the tabs broadcast
  _patchTabManagerForHistory();

  // ── Window closed: destroy all tabs ─────────────────────────────
  mainWindow.on('closed', () => {
    if (tabManager) {
      // Save session before destroying
      _saveSession();
      tabManager.destroyAll();
    }
    mainWindow = null;
    tabManager = null;
  });

  // ── Load the browser UI shell ────────────────────────────────────
  mainWindow.loadFile(path.join(UI_ROOT, 'browser', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();

    // Restore previous session or open new tab
    _restoreSession();
  });

  log.info('Main window created');
}

/**
 * Patches the TabManager to record history on navigation.
 * We do this after IpcRouter is set up because IpcRouter handles
 * nav:go which updates the tab URL — we hook into the resulting
 * did-navigate events via the TabManager broadcast cycle.
 * @private
 */
function _patchTabManagerForHistory() {
  // We extend TabManager's _wireEvents indirectly:
  // Each time tabs:updated is sent, we snapshot the current active URL.
  // A cleaner approach: TabManager emits an event we listen to here.
  // For now, we intercept via IPC channel hooked into the tab's webContents events.
  // The TabManager's _wireEvents → did-navigate already fires. We subscribe
  // to tabs:updated and record history there.

  const originalBroadcast = tabManager._broadcast;
  tabManager._broadcast = function () {
    originalBroadcast.call(this);
    // Record history for the active tab after navigation events
    // This is triggered on every broadcast (tab title updates, etc.)
    // We only record on URL changes via the did-navigate path
  };

  // Better: subscribe to the 'did-navigate' event on each view webContents
  // by extending createTab. We do this by hooking into the IPC router's
  // nav:go handler which eventually triggers did-navigate in the view.
  // The cleanest integration: TabManager fires an 'navigated' event.
  // We'll set a navigation callback on TabManager:
  tabManager.onNavigated = (tabId, url, title) => {
    historyStore.add(url, title);
  };
}

/**
 * Saves the current session (open URLs) to disk.
 * @private
 */
function _saveSession() {
  if (!tabManager) return;
  try {
    const sessionData = tabManager.getSessionData();
    settingsStore._store.set('lastSession', sessionData);
    log.info(`Session saved: ${sessionData.length} tabs`);
  } catch (err) {
    log.error('Failed to save session', err);
  }
}

/**
 * Restores the previous session or opens a new tab.
 * @private
 */
function _restoreSession() {
  if (!tabManager) return;

  const restoreEnabled = settingsStore.get('restoreSessionOnStart');

  if (restoreEnabled) {
    try {
      const lastSession = settingsStore._store.get('lastSession', []);
      if (lastSession && lastSession.length > 0) {
        log.info(`Restoring session: ${lastSession.length} tabs`);
        lastSession.forEach((t, i) => {
          tabManager.createTab(t.url, { background: i > 0 });
        });
        return;
      }
    } catch (err) {
      log.warn('Failed to restore session', err);
    }
  }

  // Default: open new tab
  tabManager.createTab(INTERNAL_PAGES.NEW_TAB);
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────

/**
 * Global keyboard shortcut handler for the main window's webContents.
 * Also injected into BrowserView webContents via TabManager._wireEvents.
 *
 * @param {Electron.InputEvent} event
 * @param {Electron.Input}      input
 */
function handleKeyboardShortcuts(event, input) {
  if (input.type !== 'keyDown') return;

  const ctrl  = input.control || input.meta;
  const shift  = input.shift;
  const alt    = input.alt;
  const key    = input.key.toLowerCase();

  if (!tabManager) return;

  // New Tab
  if (ctrl && !shift && key === 't') {
    event.preventDefault();
    tabManager.createTab();
    return;
  }

  // Close Tab
  if (ctrl && !shift && key === 'w') {
    event.preventDefault();
    if (tabManager.activeTabId !== null) {
      tabManager.closeTab(tabManager.activeTabId);
    }
    return;
  }

  // Reopen last closed tab (placeholder - add closed tab stack)
  if (ctrl && shift && key === 't') {
    event.preventDefault();
    // TODO: implement closed tab stack
    return;
  }

  // Reload
  if ((ctrl && key === 'r') || key === 'f5') {
    event.preventDefault();
    tabManager.reload(tabManager.activeTabId, shift);
    return;
  }

  // Focus omnibar (Ctrl+L or F6)
  if ((ctrl && key === 'l') || key === 'f6') {
    event.preventDefault();
    mainWindow.webContents.send('omnibar:focus');
    return;
  }

  // Find in page
  if (ctrl && !shift && key === 'f') {
    event.preventDefault();
    mainWindow.webContents.send(IPC.TOOLS_OPEN_FIND);
    return;
  }

  // DevTools
  if (key === 'f12' || (ctrl && shift && key === 'i')) {
    event.preventDefault();
    tabManager.toggleDevTools();
    return;
  }

  // Print
  if (ctrl && key === 'p') {
    event.preventDefault();
    tabManager.print();
    return;
  }

  // Zoom in
  if (ctrl && (key === '=' || key === '+')) {
    event.preventDefault();
    tabManager.zoomIn();
    return;
  }

  // Zoom out
  if (ctrl && key === '-') {
    event.preventDefault();
    tabManager.zoomOut();
    return;
  }

  // Zoom reset
  if (ctrl && key === '0') {
    event.preventDefault();
    tabManager.zoomReset();
    return;
  }

  // Next tab (Ctrl+Tab)
  if (ctrl && !shift && key === 'tab') {
    event.preventDefault();
    const ids = tabManager.tabIds;
    if (ids.length < 2) return;
    const cur  = ids.indexOf(tabManager.activeTabId);
    const next = (cur + 1) % ids.length;
    tabManager.switchTo(ids[next]);
    return;
  }

  // Previous tab (Ctrl+Shift+Tab)
  if (ctrl && shift && key === 'tab') {
    event.preventDefault();
    const ids = tabManager.tabIds;
    if (ids.length < 2) return;
    const cur  = ids.indexOf(tabManager.activeTabId);
    const prev = (cur - 1 + ids.length) % ids.length;
    tabManager.switchTo(ids[prev]);
    return;
  }

  // Switch to tab by number (Ctrl+1 through Ctrl+8, Ctrl+9 = last)
  if (ctrl && /^[1-9]$/.test(input.key)) {
    event.preventDefault();
    const ids = tabManager.tabIds;
    const num = parseInt(input.key, 10);
    const idx = num === 9 ? ids.length - 1 : Math.min(num - 1, ids.length - 1);
    if (idx >= 0) tabManager.switchTo(ids[idx]);
    return;
  }

  // Back (Alt+Left)
  if (alt && key === 'arrowleft') {
    event.preventDefault();
    tabManager.goBack();
    return;
  }

  // Forward (Alt+Right)
  if (alt && key === 'arrowright') {
    event.preventDefault();
    tabManager.goForward();
    return;
  }

  // Settings
  if (ctrl && key === ',') {
    event.preventDefault();
    tabManager.createTab(INTERNAL_PAGES.SETTINGS);
    return;
  }

  // History
  if (ctrl && key === 'h') {
    event.preventDefault();
    tabManager.createTab(INTERNAL_PAGES.HISTORY);
    return;
  }

  // Downloads
  if (ctrl && key === 'j') {
    event.preventDefault();
    tabManager.createTab(INTERNAL_PAGES.DOWNLOADS);
    return;
  }

  // Bookmarks
  if (ctrl && key === 'd') {
    event.preventDefault();
    // Bookmark current page
    mainWindow.webContents.send('bookmark:toggle-current');
    return;
  }

  // Command palette
  if (ctrl && key === 'k') {
    event.preventDefault();
    mainWindow.webContents.send(IPC.UI_COMMAND_PALETTE);
    return;
  }

  // Sidebar toggle
  if (ctrl && key === 'b') {
    event.preventDefault();
    const current = settingsStore.get('sidebarOpen');
    settingsStore.set('sidebarOpen', !current);
    tabManager.updateActiveBounds();
    mainWindow.webContents.send('sidebar:toggled', !current);
    return;
  }
}

// ─── App Lifecycle ────────────────────────────────────────────────

app.whenReady().then(() => {
  log.info(`BatBrowser starting — Electron ${process.versions.electron}, Chrome ${process.versions.chrome}`);

  // Configure the default session before creating any windows
  setupSession(session.defaultSession);

  // Create the main window
  createMainWindow();

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Save ad block stats before quitting
app.on('before-quit', () => {
  log.info('Shutting down BatBrowser');
  _saveSession();

  // Persist cumulative adblock stats
  try {
    const currentStats = adBlocker.getStats();
    const stored = settingsStore._store.get('cumulativeAdBlockStats', { ads: 0, trackers: 0 });
    settingsStore._store.set('cumulativeAdBlockStats', {
      ads:      stored.ads      + currentStats.ads,
      trackers: stored.trackers + currentStats.trackers,
    });
  } catch (err) {
    log.error('Failed to save adblock stats', err);
  }
});

// Handle certificate errors globally — show error page, never silently bypass
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  log.warn(`Certificate error: ${error}`, { url });
  event.preventDefault();
  callback(false); // Reject the cert — let the error page handle display
});
