// ═══════════════════════════════════════════════════════════════
// BatBrowser — Tab Manager
// Central state machine for all tab lifecycle management.
// Handles creation, switching, closing, grouping, pinning.
// ═══════════════════════════════════════════════════════════════

'use strict';

const { BrowserView } = require('electron');
const Logger  = require('../core/Logger');
const { INTERNAL_PAGES, PRELOAD, TAB, IPC } = require('../core/Constants');
const { getContentBounds, getAutoResizeOptions } = require('../windows/Geometry');
const { shouldAllowNavigation, isInternalPage, getSecurityLevel, getDisplayUrl } = require('../navigation/UrlResolver');

const log = Logger.create('TabManager');

/**
 * @typedef {Object} TabState
 * @property {number}              id
 * @property {Electron.BrowserView} view
 * @property {string}              url
 * @property {string}              title
 * @property {string}              favicon
 * @property {boolean}             isLoading
 * @property {boolean}             isPinned
 * @property {boolean}             isMuted
 * @property {boolean}             isAudible
 * @property {boolean}             isSleeping
 * @property {string|null}         groupId
 * @property {number}              zoomFactor
 * @property {number}              lastActiveAt  - Unix ms (for sleep calculation)
 * @property {string}              createdAt     - ISO string
 */

/**
 * @typedef {Object} TabGroup
 * @property {string}   id
 * @property {string}   name
 * @property {string}   color  - Hex color for the group indicator
 */

/**
 * TabManager — manages the full tab lifecycle for a single BrowserWindow.
 * One instance per window.
 */
class TabManager {
  /**
   * @param {Electron.BrowserWindow} win         - The parent window
   * @param {Function}               broadcastFn - Called after state changes to push to renderer
   * @param {object}                 settings    - Settings store reference
   */
  constructor(win, broadcastFn, settings) {
    this._win           = win;
    this._broadcast     = broadcastFn;
    this._settings      = settings;

    /** @type {Map<number, TabState>} */
    this._tabs          = new Map();

    /** @type {Map<string, TabGroup>} */
    this._groups        = new Map();

    /** @type {number|null} */
    this._activeTabId   = null;

    this._idCounter     = 0;

    /** @type {Map<number, NodeJS.Timeout>} tabId → sleep timer */
    this._sleepTimers   = new Map();

    log.info('TabManager created for window');
  }

  // ─── Public API ─────────────────────────────────────────────────

  /**
   * Creates a new tab and navigates to url.
   * @param {string}  [url]       - URL to load
   * @param {object}  [opts]
   * @param {boolean} [opts.background] - Don't switch to this tab
   * @param {boolean} [opts.incognito]  - Use incognito session partition
   * @param {string}  [opts.partition]  - Session partition string
   * @returns {number} The new tab's ID
   */
  createTab(url = INTERNAL_PAGES.NEW_TAB, opts = {}) {
    const tabId = ++this._idCounter;
    const { background = false, partition = null } = opts;

    const webPrefs = {
      preload:          PRELOAD.BROWSER,
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          true,          // SECURITY: enabled
      webviewTag:       false,
      autoplayPolicy:   'user-gesture-required',
      spellcheck:       true,
    };

    if (partition) {
      webPrefs.partition = partition;
    }

    const view = new BrowserView({ webPreferences: webPrefs });

    /** @type {TabState} */
    const tab = {
      id:           tabId,
      view,
      url:          url,
      title:        TAB.DEFAULT_TITLE,
      favicon:      TAB.DEFAULT_FAVICON,
      isLoading:    false,
      isPinned:     false,
      isMuted:      false,
      isAudible:    false,
      isSleeping:   false,
      groupId:      null,
      zoomFactor:   TAB.DEFAULT_ZOOM,
      lastActiveAt: Date.now(),
      createdAt:    new Date().toISOString(),
    };

    this._tabs.set(tabId, tab);
    this._wireEvents(tab);

    log.info(`Tab created: ${tabId}`, { url });

    if (!background) {
      this.switchTo(tabId);
    }

    // Load the URL
    this._loadUrl(tab, url);

    this._broadcast();
    return tabId;
  }

  /**
   * Switches the active tab.
   * @param {number} tabId
   */
  switchTo(tabId) {
    if (!this._tabs.has(tabId)) {
      log.warn(`switchTo: tab ${tabId} not found`);
      return;
    }

    // Detach current view
    if (this._activeTabId !== null) {
      this._removeActiveView();
    }

    this._activeTabId = tabId;
    const tab = this._tabs.get(tabId);

    tab.lastActiveAt = Date.now();

    // Wake sleeping tab
    if (tab.isSleeping) {
      this._wakeTab(tab);
    }

    // Cancel sleep timer for newly active tab
    this._cancelSleepTimer(tabId);

    // Attach view
    try {
      const settings = this._settings.getAll();
      const bounds = getContentBounds(this._win, {
        sidebarOpen:     settings.sidebarOpen,
        sidebarWidth:    280,
        sidebarPosition: settings.sidebarPosition,
      });

      this._win.addBrowserView(tab.view);
      tab.view.setBounds(bounds);
      tab.view.setAutoResize(getAutoResizeOptions());
    } catch (err) {
      log.error(`Failed to attach view for tab ${tabId}`, err);
    }

    // Notify renderer
    this._send(IPC.TAB_ACTIVE_CHANGED, tabId);
    this._send(IPC.TAB_URL_UPDATED, tabId, tab.url);
    this._send(IPC.TAB_TITLE_UPDATED, tabId, tab.title);
    this._send(IPC.TAB_LOADING_CHANGED, tabId, tab.isLoading);
    this._sendNavState(tabId);
    this._broadcast();

    // Start sleep timers for all other background tabs
    this._startBackgroundSleepTimers();

    log.debug(`Switched to tab ${tabId}`);
  }

  /**
   * Closes a tab. If it's the active tab, switches to the nearest tab.
   * If no tabs remain, opens a new tab.
   * @param {number} tabId
   */
  closeTab(tabId) {
    if (!this._tabs.has(tabId)) return;

    const tab = this._tabs.get(tabId);

    // Remove from window
    this._removeView(tab.view);

    // Destroy webContents
    try {
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.close();
      }
    } catch (err) {
      log.warn(`Tab ${tabId} webContents already destroyed`);
    }

    this._cancelSleepTimer(tabId);
    this._tabs.delete(tabId);

    this._send(IPC.TAB_CLOSED, tabId);

    log.info(`Tab closed: ${tabId}`);

    // Switch to another tab if this was active
    if (this._activeTabId === tabId) {
      this._activeTabId = null;
      const ids = Array.from(this._tabs.keys());
      if (ids.length > 0) {
        // Switch to nearest tab (the one before, or the last one)
        const prevIndex = Math.max(0, ids.indexOf(tabId) - 1);
        this.switchTo(ids[Math.min(prevIndex, ids.length - 1)]);
      } else {
        this.createTab();
      }
    }

    this._broadcast();
  }

  /**
   * Duplicates a tab.
   * @param {number} tabId
   * @returns {number} New tab ID
   */
  duplicateTab(tabId) {
    const tab = this._tabs.get(tabId);
    if (!tab) return -1;
    return this.createTab(tab.url, { background: false });
  }

  /**
   * Pins or unpins a tab.
   * @param {number}  tabId
   * @param {boolean} pinned
   */
  setTabPinned(tabId, pinned) {
    const tab = this._tabs.get(tabId);
    if (!tab) return;
    tab.isPinned = pinned;
    this._broadcast();
  }

  /**
   * Mutes or unmutes a tab.
   * @param {number}  tabId
   * @param {boolean} muted
   */
  setTabMuted(tabId, muted) {
    const tab = this._tabs.get(tabId);
    if (!tab) return;
    tab.isMuted = muted;
    try {
      tab.view.webContents.setAudioMuted(muted);
    } catch {}
    this._broadcast();
  }

  /**
   * Navigates the active (or specified) tab.
   * @param {string} url        - Resolved URL (already validated)
   * @param {number} [tabId]    - Defaults to active tab
   */
  navigate(url, tabId = this._activeTabId) {
    const tab = this._tabs.get(tabId);
    if (!tab) return;

    const { allow, reason } = shouldAllowNavigation(url, tab.url);
    if (!allow) {
      log.warn(`Navigation blocked: ${reason}`, { url });
      return;
    }

    tab.url = url;
    this._loadUrl(tab, url);
  }

  /**
   * Navigates the active tab back.
   */
  goBack(tabId = this._activeTabId) {
    const wc = this._getWc(tabId);
    if (wc && wc.canGoBack()) wc.goBack();
  }

  /**
   * Navigates the active tab forward.
   */
  goForward(tabId = this._activeTabId) {
    const wc = this._getWc(tabId);
    if (wc && wc.canGoForward()) wc.goForward();
  }

  /**
   * Reloads the active (or specified) tab.
   * @param {boolean} [ignoreCache]
   */
  reload(tabId = this._activeTabId, ignoreCache = false) {
    const wc = this._getWc(tabId);
    if (wc) {
      if (ignoreCache) wc.reloadIgnoringCache();
      else wc.reload();
    }
  }

  /**
   * Stops loading the active (or specified) tab.
   */
  stopLoading(tabId = this._activeTabId) {
    const wc = this._getWc(tabId);
    if (wc) wc.stop();
  }

  // ─── Zoom ──────────────────────────────────────────────────────

  setZoom(tabId, factor) {
    const tab = this._tabs.get(tabId);
    if (!tab) return;
    const clamped = Math.min(Math.max(factor, TAB.MIN_ZOOM), TAB.MAX_ZOOM);
    tab.zoomFactor = clamped;
    try {
      tab.view.webContents.setZoomFactor(clamped);
    } catch {}
    this._send(IPC.ZOOM_CHANGED, Math.round(clamped * 100));
    return Math.round(clamped * 100);
  }

  zoomIn(tabId = this._activeTabId) {
    const tab = this._tabs.get(tabId);
    if (!tab) return 100;
    return this.setZoom(tabId, +(tab.zoomFactor + TAB.ZOOM_STEP).toFixed(2));
  }

  zoomOut(tabId = this._activeTabId) {
    const tab = this._tabs.get(tabId);
    if (!tab) return 100;
    return this.setZoom(tabId, +(tab.zoomFactor - TAB.ZOOM_STEP).toFixed(2));
  }

  zoomReset(tabId = this._activeTabId) {
    return this.setZoom(tabId, TAB.DEFAULT_ZOOM);
  }

  getZoom(tabId = this._activeTabId) {
    const tab = this._tabs.get(tabId);
    return tab ? Math.round(tab.zoomFactor * 100) : 100;
  }

  // ─── Groups ────────────────────────────────────────────────────

  /**
   * Creates a new tab group.
   * @param {string} name
   * @param {string} [color]
   * @returns {string} Group ID
   */
  createGroup(name, color = '#6366f1') {
    const id = `g_${Date.now()}`;
    this._groups.set(id, { id, name, color });
    this._broadcast();
    return id;
  }

  /**
   * Assigns a tab to a group.
   * @param {number}      tabId
   * @param {string|null} groupId
   */
  assignToGroup(tabId, groupId) {
    const tab = this._tabs.get(tabId);
    if (!tab) return;
    tab.groupId = groupId;
    this._broadcast();
  }

  // ─── DevTools ──────────────────────────────────────────────────

  toggleDevTools(tabId = this._activeTabId) {
    const wc = this._getWc(tabId);
    if (!wc) return;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: 'detach' });
  }

  findInPage(text, options, tabId = this._activeTabId) {
    const wc = this._getWc(tabId);
    if (!wc || !text) return;
    wc.findInPage(text, options || {});
  }

  stopFindInPage(tabId = this._activeTabId) {
    const wc = this._getWc(tabId);
    if (wc) wc.stopFindInPage('clearSelection');
  }

  print(tabId = this._activeTabId) {
    const wc = this._getWc(tabId);
    if (wc) wc.print({});
  }

  viewSource(tabId = this._activeTabId) {
    const tab = this._tabs.get(tabId);
    if (!tab || isInternalPage(tab.url)) return;
    this.createTab('view-source:' + tab.url, { background: false });
  }

  // ─── Bounds Update ─────────────────────────────────────────────

  /**
   * Recalculates and applies bounds for the currently active BrowserView.
   * Call after window resize or sidebar toggle.
   */
  updateActiveBounds() {
    if (!this._activeTabId) return;
    const tab = this._tabs.get(this._activeTabId);
    if (!tab) return;

    const settings = this._settings.getAll();
    const bounds = getContentBounds(this._win, {
      sidebarOpen:     settings.sidebarOpen,
      sidebarWidth:    280,
      sidebarPosition: settings.sidebarPosition,
    });

    try {
      tab.view.setBounds(bounds);
    } catch (err) {
      log.warn('Failed to update bounds', err);
    }
  }

  // ─── State Serialization ───────────────────────────────────────

  /**
   * Serializes the current tab state for broadcasting to the renderer.
   * @returns {{ tabs: object[], activeId: number|null, groups: object[] }}
   */
  getSerializedState() {
    const tabs = Array.from(this._tabs.values()).map(tab => {
      let canGoBack = false, canGoForward = false;
      try {
        if (!tab.view.webContents.isDestroyed()) {
          canGoBack    = tab.view.webContents.canGoBack();
          canGoForward = tab.view.webContents.canGoForward();
        }
      } catch {}

      return {
        id:           tab.id,
        title:        tab.title,
        url:          tab.url,
        displayUrl:   getDisplayUrl(tab.url),
        favicon:      tab.favicon,
        isLoading:    tab.isLoading,
        isPinned:     tab.isPinned,
        isMuted:      tab.isMuted,
        isAudible:    tab.isAudible,
        isSleeping:   tab.isSleeping,
        groupId:      tab.groupId,
        zoomFactor:   tab.zoomFactor,
        security:     getSecurityLevel(tab.url),
        canGoBack,
        canGoForward,
      };
    });

    return {
      tabs,
      activeId: this._activeTabId,
      groups:   Array.from(this._groups.values()),
    };
  }

  /**
   * Returns the serialized state for session persistence.
   * @returns {Array<{url: string, title: string}>}
   */
  getSessionData() {
    return Array.from(this._tabs.values())
      .filter(t => !isInternalPage(t.url))
      .map(t => ({ url: t.url, title: t.title }));
  }

  /**
   * Returns the currently active tab state (or null).
   * @returns {TabState|null}
   */
  getActiveTab() {
    return this._activeTabId ? this._tabs.get(this._activeTabId) || null : null;
  }

  /**
   * Returns the WebContents for a tab (or active tab).
   * @param {number} [tabId]
   * @returns {Electron.WebContents|null}
   */
  getWebContents(tabId = this._activeTabId) {
    return this._getWc(tabId);
  }

  /**
   * Returns the active tab ID.
   * @returns {number|null}
   */
  get activeTabId() {
    return this._activeTabId;
  }

  /**
   * Returns all tab IDs in order.
   * @returns {number[]}
   */
  get tabIds() {
    return Array.from(this._tabs.keys());
  }

  /**
   * Returns number of open tabs.
   * @returns {number}
   */
  get count() {
    return this._tabs.size;
  }

  /**
   * Destroys all tabs and clears state.
   * Call on window close.
   */
  destroyAll() {
    for (const [id, tab] of this._tabs) {
      this._cancelSleepTimer(id);
      try {
        this._win.removeBrowserView(tab.view);
      } catch {}
      try {
        if (!tab.view.webContents.isDestroyed()) {
          tab.view.webContents.close();
        }
      } catch {}
    }
    this._tabs.clear();
    this._activeTabId = null;
    log.info('All tabs destroyed');
  }

  // ─── Private: Event Wiring ─────────────────────────────────────

  /**
   * Attaches all WebContents event listeners for a tab.
   * @private
   * @param {TabState} tab
   */
  _wireEvents(tab) {
    const wc = tab.view.webContents;

    // Page title
    wc.on('page-title-updated', (event, title) => {
      tab.title = title;
      this._send(IPC.TAB_TITLE_UPDATED, tab.id, title);
      this._broadcast();
    });

    // Favicon
    wc.on('page-favicon-updated', (event, favicons) => {
      if (favicons && favicons.length > 0) {
        tab.favicon = favicons[0];
        this._send(IPC.TAB_FAVICON_UPDATED, tab.id, favicons[0]);
        this._broadcast();
      }
    });

    // Navigation committed
    wc.on('did-navigate', (event, url) => {
      tab.url     = url;
      tab.favicon = ''; // Reset favicon on navigation
      this._send(IPC.TAB_URL_UPDATED, tab.id, url);
      this._sendNavState(tab.id);
      this._broadcast();
    });

    wc.on('did-navigate-in-page', (event, url, isMainFrame) => {
      if (!isMainFrame) return;
      tab.url = url;
      this._send(IPC.TAB_URL_UPDATED, tab.id, url);
      this._sendNavState(tab.id);
      this._broadcast();
    });

    // Loading state
    wc.on('did-start-loading', () => {
      tab.isLoading = true;
      this._send(IPC.TAB_LOADING_CHANGED, tab.id, true);
      this._broadcast();
    });

    wc.on('did-stop-loading', () => {
      tab.isLoading = false;
      this._send(IPC.TAB_LOADING_CHANGED, tab.id, false);
      this._sendNavState(tab.id);
      this._broadcast();
    });

    // Failed navigation
    wc.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      if (errorCode === -3) return; // Aborted — user navigated away

      log.warn(`Navigation failed: ${errorCode} ${errorDescription}`, { url: validatedURL });

      const errorUrl = `${INTERNAL_PAGES.ERROR}?code=${errorCode}&desc=${encodeURIComponent(errorDescription)}&url=${encodeURIComponent(validatedURL)}`;
      try {
        wc.loadURL(errorUrl);
      } catch {}
    });

    // Crash recovery
    wc.on('render-process-gone', (event, details) => {
      log.error(`Tab ${tab.id} render process gone: ${details.reason}`);
      tab.isLoading = false;
      this._send(IPC.TAB_CRASHED, tab.id);
      this._broadcast();
    });

    // Unresponsive
    wc.on('unresponsive', () => {
      log.warn(`Tab ${tab.id} is unresponsive`);
    });

    // Audio state
    wc.on('audio-state-changed', ({ audible }) => {
      tab.isAudible = audible;
      this._send(IPC.TAB_AUDIO_CHANGED, tab.id, audible);
      this._broadcast();
    });

    // Certificate errors — show error page, never silently accept
    wc.on('certificate-error', (event, certUrl, error, certificate, callback) => {
      event.preventDefault();
      log.warn(`Certificate error for ${certUrl}: ${error}`);
      // Show the error page instead of silently accepting
      callback(false);
    });

    // Find-in-page results
    wc.on('found-in-page', (event, result) => {
      this._send(IPC.FIND_RESULTS, result);
    });

    // New windows: open as tabs instead of popup windows
    wc.setWindowOpenHandler(({ url: openUrl, disposition }) => {
      if (openUrl && openUrl !== 'about:blank') {
        const { allow } = shouldAllowNavigation(openUrl, tab.url);
        if (allow) {
          // Open in new tab in background (user can switch to it)
          setImmediate(() => {
            this.createTab(openUrl, { background: disposition !== 'foreground-tab' });
          });
        }
      }
      // Always deny native window creation — we handle it above
      return { action: 'deny' };
    });

    // Navigation guard: prevent navigating to dangerous URLs
    wc.on('will-navigate', (event, navUrl) => {
      const { allow, reason } = shouldAllowNavigation(navUrl, tab.url);
      if (!allow) {
        log.warn(`will-navigate blocked: ${reason}`, { url: navUrl });
        event.preventDefault();
      }
    });

    // Context menu
    wc.on('context-menu', (event, params) => {
      // Forward to IPC router which builds the menu
      this._send('context-menu:build', tab.id, params);
    });
  }

  // ─── Private: Helpers ─────────────────────────────────────────

  /**
   * @private
   */
  _loadUrl(tab, url) {
    try {
      tab.view.webContents.loadURL(url);
    } catch (err) {
      log.error(`Failed to load URL: ${url}`, err);
      try {
        tab.view.webContents.loadURL(INTERNAL_PAGES.NEW_TAB);
      } catch {}
    }
  }

  /**
   * Safely removes the active view from the window.
   * @private
   */
  _removeActiveView() {
    if (this._activeTabId === null) return;
    const tab = this._tabs.get(this._activeTabId);
    if (tab) this._removeView(tab.view);
  }

  /**
   * Safely removes a BrowserView from the window.
   * @private
   * @param {Electron.BrowserView} view
   */
  _removeView(view) {
    try {
      this._win.removeBrowserView(view);
    } catch {}
  }

  /**
   * Gets a tab's WebContents safely.
   * @private
   */
  _getWc(tabId) {
    if (tabId === null || tabId === undefined) return null;
    const tab = this._tabs.get(tabId);
    if (!tab) return null;
    try {
      if (tab.view.webContents.isDestroyed()) return null;
      return tab.view.webContents;
    } catch {
      return null;
    }
  }

  /**
   * Sends an IPC message to the main window.
   * @private
   */
  _send(channel, ...args) {
    if (this._win && !this._win.isDestroyed()) {
      try {
        this._win.webContents.send(channel, ...args);
      } catch {}
    }
  }

  /**
   * Sends navigation state (canGoBack, canGoForward) for a tab.
   * @private
   */
  _sendNavState(tabId) {
    const wc = this._getWc(tabId);
    if (!wc) return;
    this._send(IPC.TAB_NAV_STATE, tabId, {
      canGoBack:    wc.canGoBack(),
      canGoForward: wc.canGoForward(),
    });
  }

  // ─── Tab Sleep ────────────────────────────────────────────────

  /**
   * Starts sleep timers for all background tabs.
   * @private
   */
  _startBackgroundSleepTimers() {
    const sleepEnabled = this._settings.get('hardwareAcceleration') !== false;
    if (!sleepEnabled) return;

    for (const [tabId, tab] of this._tabs) {
      if (tabId === this._activeTabId) continue;
      if (tab.isPinned) continue; // Never sleep pinned tabs
      if (!this._sleepTimers.has(tabId)) {
        const timer = setTimeout(() => {
          this._sleepTab(tab);
        }, TAB.SLEEP_AFTER_MS);
        this._sleepTimers.set(tabId, timer);
      }
    }
  }

  /**
   * Puts a background tab to sleep by discarding its renderer.
   * @private
   */
  _sleepTab(tab) {
    if (tab.isSleeping || tab.id === this._activeTabId) return;
    try {
      // Discard the renderer process — saves memory
      tab.view.webContents.forcefullyCrashRenderer();
      tab.isSleeping = true;
      log.debug(`Tab ${tab.id} put to sleep`);
      this._broadcast();
    } catch {
      // forcefullyCrashRenderer may not exist in all Electron versions
    }
  }

  /**
   * Wakes a sleeping tab by reloading it.
   * @private
   */
  _wakeTab(tab) {
    if (!tab.isSleeping) return;
    tab.isSleeping = false;
    try {
      tab.view.webContents.reload();
      log.debug(`Tab ${tab.id} woke up`);
    } catch {}
  }

  /**
   * Cancels a pending sleep timer for a tab.
   * @private
   */
  _cancelSleepTimer(tabId) {
    const timer = this._sleepTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      this._sleepTimers.delete(tabId);
    }
  }
}

module.exports = { TabManager };
