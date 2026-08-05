// ═══════════════════════════════════════════════════════════════
// BatBrowser — Browser Preload Script
// Exposes a typed, validated API to the renderer via contextBridge.
// No Node.js APIs are exposed directly. All communication goes
// through well-defined, sanitized IPC channels.
// ═══════════════════════════════════════════════════════════════

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ─── Type-safe IPC helpers ────────────────────────────────────────

/**
 * Calls an IPC handler and returns its result.
 * @param {string} channel
 * @param {...any} args
 * @returns {Promise<any>}
 */
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

/**
 * Sends a fire-and-forget IPC message.
 * @param {string} channel
 * @param {...any} args
 */
const send = (channel, ...args) => ipcRenderer.send(channel, ...args);

/**
 * Subscribes to an IPC event. Returns an unsubscribe function.
 * @param {string}   channel
 * @param {Function} callback
 * @returns {Function} Cleanup function
 */
function on(channel, callback) {
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

/**
 * Subscribes to an IPC event once.
 * @param {string}   channel
 * @param {Function} callback
 */
function once(channel, callback) {
  ipcRenderer.once(channel, (_event, ...args) => callback(...args));
}

// ─── Exposed API ──────────────────────────────────────────────────

/**
 * The window.batBrowser API exposed to all renderer processes.
 * This is the ONLY way the renderer can communicate with the main process.
 */
contextBridge.exposeInMainWorld('batBrowser', {

  // ─── Tab Management ─────────────────────────────────────────
  tab: {
    create:         (url)          => invoke('tab:create', url),
    close:          (tabId)        => invoke('tab:close', tabId),
    switch:         (tabId)        => invoke('tab:switch', tabId),
    pin:            (tabId, pin)   => invoke('tab:pin', tabId, pin),
    mute:           (tabId, mute)  => invoke('tab:mute', tabId, mute),
    duplicate:      (tabId)        => invoke('tab:duplicate', tabId),
    createGroup:    (name, color)  => invoke('tab:group:create', name, color),
    moveToGroup:    (tabId, gId)   => invoke('tab:group:move', tabId, gId),
  },

  // ─── Navigation ─────────────────────────────────────────────
  nav: {
    go:             (input)        => invoke('nav:go', input),
    back:           ()             => invoke('nav:back'),
    forward:        ()             => invoke('nav:forward'),
    reload:         ()             => invoke('nav:reload'),
    stop:           ()             => invoke('nav:stop'),
    home:           ()             => invoke('nav:home'),
  },

  // ─── Search Suggestions ──────────────────────────────────────
  suggestions: {
    get:            (query)        => invoke('suggestions:get', query),
  },

  // ─── History ─────────────────────────────────────────────────
  history: {
    get:            (limit)        => invoke('history:get', limit),
    search:         (query)        => invoke('history:search', query),
    clear:          ()             => invoke('history:clear'),
    deleteItem:     (id)           => invoke('history:delete-item', id),
  },

  // ─── Bookmarks ───────────────────────────────────────────────
  bookmarks: {
    get:            ()             => invoke('bookmarks:get'),
    add:            (url, title, folderId, favicon) => invoke('bookmarks:add', url, title, folderId, favicon),
    remove:         (id)           => invoke('bookmarks:remove', id),
    update:         (id, updates)  => invoke('bookmarks:update', id, updates),
    isBookmarked:   (url)          => invoke('bookmarks:is-bookmarked', url),
  },

  // ─── Settings ────────────────────────────────────────────────
  settings: {
    get:            ()             => invoke('settings:get'),
    set:            (key, value)   => invoke('settings:set', key, value),
    reset:          ()             => invoke('settings:reset'),
    open:           ()             => send('settings:open'),
  },

  // ─── Privacy ─────────────────────────────────────────────────
  privacy: {
    clearCookies:   ()             => invoke('privacy:clear-cookies'),
    clearCache:     ()             => invoke('privacy:clear-cache'),
    clearAll:       ()             => invoke('privacy:clear-all'),
  },

  // ─── Downloads ───────────────────────────────────────────────
  downloads: {
    get:            ()             => invoke('downloads:get'),
    openFolder:     ()             => invoke('downloads:open-folder'),
    openFile:       (id)           => invoke('downloads:open-file', id),
    cancel:         (id)           => invoke('downloads:cancel', id),
    clear:          ()             => invoke('downloads:clear'),
  },


  // ─── Developer Tools ─────────────────────────────────────────
  tools: {
    devTools:       ()             => invoke('tools:devtools'),
    viewSource:     ()             => invoke('tools:view-source'),
    find:           (text, opts)   => invoke('tools:find', text, opts),
    stopFind:       ()             => invoke('tools:stop-find'),
    print:          ()             => invoke('tools:print'),
    screenshot:     ()             => invoke('tools:screenshot'),
  },

  // ─── Zoom ────────────────────────────────────────────────────
  zoom: {
    in:             ()             => invoke('zoom:in'),
    out:            ()             => invoke('zoom:out'),
    reset:          ()             => invoke('zoom:reset'),
    get:            ()             => invoke('zoom:get'),
    set:            (level)        => invoke('zoom:set', level),
  },

  // ─── UI ──────────────────────────────────────────────────────
  ui: {
    hideTab:        ()             => invoke('ui:hide-tab'),
    showTab:        ()             => invoke('ui:show-tab'),
    toggleSidebar:  (open)         => invoke('ui:toggle-sidebar', open),
  },

  // ─── Page Info ───────────────────────────────────────────────
  page: {
    getInfo:        ()             => invoke('page:info-get'),
  },

  // ─── Window Controls ─────────────────────────────────────────
  window: {
    minimize:       ()             => send('window:minimize'),
    maximize:       ()             => send('window:maximize'),
    close:          ()             => send('window:close'),
    fullscreen:     ()             => send('window:fullscreen'),
    openIncognito:  ()             => send('window:incognito'),
  },

  // ─── Native Menu ─────────────────────────────────────────────
  menu: {
    open:           ()             => send('menu:popup'),
    showContext:    (params)       => send('context-menu:show', params),
  },

  // ─── Events (main → renderer) ────────────────────────────────

  /** @param {Function} cb - Called with { tabs[], activeId, groups[] } */
  onTabsUpdated:          (cb) => on('tabs:updated', cb),

  /** @param {Function} cb - Called with tabId, title */
  onTabTitleUpdated:      (cb) => on('tab:title-updated', cb),

  /** @param {Function} cb - Called with tabId, faviconUrl */
  onTabFaviconUpdated:    (cb) => on('tab:favicon-updated', cb),

  /** @param {Function} cb - Called with tabId, url */
  onTabUrlUpdated:        (cb) => on('tab:url-updated', cb),

  /** @param {Function} cb - Called with tabId, isLoading */
  onTabLoadingChanged:    (cb) => on('tab:loading-changed', cb),

  /** @param {Function} cb - Called with tabId, { canGoBack, canGoForward } */
  onTabNavState:          (cb) => on('tab:navigation-state', cb),

  /** @param {Function} cb - Called with tabId */
  onTabClosed:            (cb) => on('tab:closed', cb),

  /** @param {Function} cb - Called with tabId */
  onTabCrashed:           (cb) => on('tab:crashed', cb),

  /** @param {Function} cb - Called with tabId */
  onActiveTabChanged:     (cb) => on('tab:active-changed', cb),

  /** @param {Function} cb - Called with tabId, isAudible */
  onTabAudioChanged:      (cb) => on('tab:audio-changed', cb),


  /** @param {Function} cb - Called with downloadInfo */
  onDownloadStarted:      (cb) => on('download:started', cb),

  /** @param {Function} cb - Called with downloadInfo */
  onDownloadProgress:     (cb) => on('download:progress', cb),

  /** @param {Function} cb - Called with downloadInfo */
  onDownloadCompleted:    (cb) => on('download:completed', cb),

  /** @param {Function} cb - Called with downloadInfo */
  onDownloadCancelled:    (cb) => on('download:cancelled', cb),

  /** @param {Function} cb - Called with findResult */
  onFindResults:          (cb) => on('find:results', cb),

  /** @param {Function} cb - Called with zoomPercent */
  onZoomChanged:          (cb) => on('zoom:changed', cb),

  /** @param {Function} cb */
  onOpenFind:             (cb) => on('tools:open-find', cb),

  /** @param {Function} cb */
  onOpenCommandPalette:   (cb) => on('ui:command-palette', cb),

  /** @param {Function} cb - Called with { maximized, fullscreen } */
  onWindowStateChanged:   (cb) => on('window:state-changed', cb),

  /** @param {Function} cb */
  onOmnibarFocus:         (cb) => on('omnibar:focus', cb),

  /** @param {Function} cb */
  onBookmarkToggleCurrent:(cb) => on('bookmark:toggle-current', cb),

  /** @param {Function} cb - Called with isOpen */
  onSidebarToggled:       (cb) => on('sidebar:toggled', cb),

  /** @param {Function} cb */
  onShowSettings:         (cb) => on('settings:show', cb),
});
