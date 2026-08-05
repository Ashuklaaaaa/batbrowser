// ═══════════════════════════════════════════════════════════════
// BatBrowser — IPC Router
// Central hub for all IPC handlers with input validation.
// Every handler validates its inputs before processing.
// ═══════════════════════════════════════════════════════════════

'use strict';

const { ipcMain, Menu, MenuItem, dialog, clipboard, nativeImage } = require('electron');
const path   = require('path');
const Logger  = require('../core/Logger');
const { IPC, INTERNAL_PAGES, SEARCH_ENGINES } = require('../core/Constants');
const V = require('./validators');
const { resolveUrl, getSuggestUrl, safeOpenExternal, isInternalPage } = require('../navigation/UrlResolver');

const log = Logger.create('IpcRouter');

/**
 * Wraps an IPC handler with error catching and logging.
 * Prevents any handler error from crashing the main process.
 *
 * @param {string}   channel
 * @param {Function} fn
 */
function safeHandle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (err) {
      log.error(`Handler error on channel '${channel}'`, err);
      return { error: err.message };
    }
  });
}

function safeOn(channel, fn) {
  ipcMain.on(channel, (event, ...args) => {
    try {
      fn(event, ...args);
    } catch (err) {
      log.error(`Listener error on channel '${channel}'`, err);
    }
  });
}

/**
 * Sets up all IPC handlers.
 *
 * @param {object}   services
 * @param {import('../tabs/TabManager').TabManager}       services.tabs
 * @param {import('../history/HistoryStore').HistoryStore} services.history
 * @param {import('../bookmarks/BookmarkStore').BookmarkStore} services.bookmarks
 * @param {import('../settings/SettingsStore').SettingsStore}  services.settings
 * @param {import('../downloads/DownloadManager').DownloadManager} services.downloads

 * @param {Electron.BrowserWindow}                          services.win
 */
function setup(services) {
  const { tabs, history, bookmarks, settings, downloads, win } = services;

  log.info('Setting up IPC handlers');

  // ─── Tab Management ──────────────────────────────────────────

  safeHandle(IPC.TAB_CREATE, (event, url) => {
    const resolvedUrl = url
      ? resolveUrl(V.validateNavigationInput(url), settings.get('searchEngine'))
      : INTERNAL_PAGES.NEW_TAB;
    return tabs.createTab(resolvedUrl);
  });

  safeHandle(IPC.TAB_CLOSE, (event, tabId) => {
    V.validateTabId(tabId);
    tabs.closeTab(tabId);
  });

  safeHandle(IPC.TAB_SWITCH, (event, tabId) => {
    V.validateTabId(tabId);
    tabs.switchTo(tabId);
  });

  safeHandle(IPC.TAB_PIN, (event, tabId, pinned) => {
    V.validateTabId(tabId);
    V.assertBoolean(pinned, 'pinned');
    tabs.setTabPinned(tabId, pinned);
  });

  safeHandle(IPC.TAB_DUPLICATE, (event, tabId) => {
    V.validateTabId(tabId);
    return tabs.duplicateTab(tabId);
  });

  safeHandle(IPC.TAB_MUTE, (event, tabId, muted) => {
    V.validateTabId(tabId);
    V.assertBoolean(muted, 'muted');
    tabs.setTabMuted(tabId, muted);
  });

  safeHandle(IPC.TAB_GROUP_CREATE, (event, name, color) => {
    V.assertString(name, 'group name', 64);
    if (color !== undefined) V.assertString(color, 'group color', 16);
    return tabs.createGroup(name, color);
  });

  safeHandle(IPC.TAB_GROUP_MOVE, (event, tabId, groupId) => {
    V.validateTabId(tabId);
    tabs.assignToGroup(tabId, groupId);
  });

  // ─── Navigation ──────────────────────────────────────────────

  safeHandle(IPC.NAV_GO, (event, input) => {
    const validated = V.validateNavigationInput(input);
    const engineId  = settings.get('searchEngine') || 'google';
    const url       = resolveUrl(validated, engineId);

    // Add to history is handled by did-navigate event in TabManager
    tabs.navigate(url);

    // Return the resolved URL for omnibar display
    return url;
  });

  safeHandle(IPC.NAV_BACK,    () => tabs.goBack());
  safeHandle(IPC.NAV_FORWARD, () => tabs.goForward());
  safeHandle(IPC.NAV_RELOAD,  () => tabs.reload());
  safeHandle(IPC.NAV_STOP,    () => tabs.stopLoading());

  safeHandle(IPC.NAV_HOME, () => {
    tabs.navigate(INTERNAL_PAGES.NEW_TAB);
  });

  // ─── Search Suggestions ──────────────────────────────────────

  safeHandle(IPC.SUGGESTIONS_GET, async (event, query) => {
    const validated = V.validateSearchQuery(query);
    if (!validated) return [];

    const engineId  = settings.get('searchEngine') || 'google';
    const suggestUrl = getSuggestUrl(engineId);
    if (!suggestUrl) return [];

    try {
      const { net } = require('electron');
      const response = await net.fetch(suggestUrl + encodeURIComponent(validated));
      const data = await response.json();

      // Different engines have different response formats
      let suggestions = [];
      if (Array.isArray(data) && Array.isArray(data[1])) {
        suggestions = data[1].slice(0, 8); // Google / Bing format
      } else if (Array.isArray(data)) {
        suggestions = data.slice(0, 8).map(s => s.phrase || s.q || s); // DDG format
      }

      return suggestions.filter(s => typeof s === 'string').slice(0, 8);
    } catch (err) {
      log.warn('Failed to fetch suggestions', err.message);
      return [];
    }
  });

  // ─── History ─────────────────────────────────────────────────

  safeHandle(IPC.HISTORY_GET, (event, limit) => {
    const l = typeof limit === 'number' ? Math.min(limit, 500) : 100;
    return history.getGroupedByDate(l);
  });

  safeHandle(IPC.HISTORY_SEARCH, (event, query) => {
    const validated = V.validateSearchQuery(query);
    return history.search(validated, 50);
  });

  safeHandle(IPC.HISTORY_CLEAR, () => {
    history.clear();
    return true;
  });

  safeHandle(IPC.HISTORY_DELETE_ITEM, (event, id) => {
    V.assertString(id, 'history item id', 64);
    history.deleteById(id);
    return true;
  });

  // ─── Bookmarks ───────────────────────────────────────────────

  safeHandle(IPC.BOOKMARKS_GET, () => {
    return bookmarks.getTree();
  });

  safeHandle(IPC.BOOKMARKS_ADD, (event, url, title, folderId, favicon) => {
    V.validateNavigationInput(url);
    V.assertString(title, 'bookmark title', 512);
    if (folderId !== null && folderId !== undefined) {
      V.assertString(folderId, 'folderId', 64);
    }
    return bookmarks.add(url, title, folderId || null, favicon || '');
  });

  safeHandle(IPC.BOOKMARKS_REMOVE, (event, id) => {
    V.assertString(id, 'bookmark id', 64);
    bookmarks.remove(id);
    return true;
  });

  safeHandle(IPC.BOOKMARKS_UPDATE, (event, id, updates) => {
    V.assertString(id, 'bookmark id', 64);
    if (!updates || typeof updates !== 'object') throw new TypeError('updates must be an object');
    if (updates.title !== undefined) V.assertString(updates.title, 'title', 512);
    bookmarks.update(id, updates);
    return true;
  });

  safeHandle(IPC.BOOKMARKS_IS_BOOKMARKED, (event, url) => {
    if (!url) return false;
    return bookmarks.isBookmarked(url);
  });

  // ─── Settings ────────────────────────────────────────────────

  safeHandle(IPC.SETTINGS_GET, () => {
    return settings.getAll();
  });

  safeHandle(IPC.SETTINGS_SET, (event, key, value) => {
    V.validateSetting(key, value);
    settings.set(key, value);

    // Side effects
    _handleSettingsSideEffects(key, value, services);

    return settings.getAll();
  });

  safeHandle(IPC.SETTINGS_RESET, () => {
    settings.reset();
    return settings.getAll();
  });

  safeOn(IPC.SETTINGS_OPEN, () => {
    tabs.createTab(INTERNAL_PAGES.SETTINGS);
  });

  // ─── Privacy ─────────────────────────────────────────────────

  safeHandle(IPC.PRIVACY_CLEAR_COOKIES, async () => {
    const { session } = require('electron');
    await session.defaultSession.clearStorageData({ storages: ['cookies'] });
    return true;
  });

  safeHandle(IPC.PRIVACY_CLEAR_CACHE, async () => {
    const { session } = require('electron');
    await session.defaultSession.clearCache();
    return true;
  });

  safeHandle(IPC.PRIVACY_CLEAR_ALL, async () => {
    const { session } = require('electron');
    await session.defaultSession.clearStorageData();
    return true;
  });

  // ─── Downloads ───────────────────────────────────────────────

  safeHandle(IPC.DOWNLOADS_GET, () => {
    return downloads.getAll();
  });

  safeHandle(IPC.DOWNLOADS_OPEN_FOLDER, () => {
    return downloads.openFolder();
  });

  safeHandle(IPC.DOWNLOADS_OPEN_FILE, (event, id) => {
    V.assertString(id, 'download id', 64);
    return downloads.openFile(id);
  });

  safeHandle(IPC.DOWNLOADS_CANCEL, (event, id) => {
    V.assertString(id, 'download id', 64);
    downloads.cancel(id);
    return true;
  });

  safeHandle(IPC.DOWNLOADS_CLEAR, () => {
    downloads.clearCompleted();
    return true;
  });

  // ─── DevTools / Page Tools ───────────────────────────────────

  safeHandle(IPC.TOOLS_DEVTOOLS,   () => tabs.toggleDevTools());
  safeHandle(IPC.TOOLS_VIEW_SOURCE, () => tabs.viewSource());
  safeHandle(IPC.TOOLS_PRINT,      () => tabs.print());

  safeHandle(IPC.TOOLS_FIND, (event, text, options) => {
    V.validateFindOptions(text, options);
    tabs.findInPage(text, options);
  });

  safeHandle(IPC.TOOLS_STOP_FIND, () => {
    tabs.stopFindInPage();
  });

  safeHandle(IPC.TOOLS_SCREENSHOT, async () => {
    const wc = tabs.getWebContents();
    if (!wc) return null;

    try {
      const img = await wc.capturePage();
      const { filePath } = await dialog.showSaveDialog(win, {
        title:       'Save Screenshot',
        defaultPath: `screenshot_${Date.now()}.png`,
        filters:     [{ name: 'PNG Image', extensions: ['png'] }],
      });

      if (filePath) {
        const { writeFile } = require('fs/promises');
        await writeFile(filePath, img.toPNG());
        return filePath;
      }
    } catch (err) {
      log.error('Screenshot failed', err);
    }
    return null;
  });

  // ─── Zoom ─────────────────────────────────────────────────────

  safeHandle(IPC.ZOOM_IN,    () => tabs.zoomIn());
  safeHandle(IPC.ZOOM_OUT,   () => tabs.zoomOut());
  safeHandle(IPC.ZOOM_RESET, () => tabs.zoomReset());
  safeHandle(IPC.ZOOM_GET,   () => tabs.getZoom());

  safeHandle(IPC.ZOOM_SET, (event, level) => {
    V.validateZoomLevel(level / 100);
    return tabs.setZoom(tabs.activeTabId, level / 100);
  });

  // ─── UI ───────────────────────────────────────────────────────

  safeHandle(IPC.UI_HIDE_TAB, () => {
    // The omnibar suggestions need to overlay the BrowserView
    // We hide the view temporarily while suggestions are showing
    const activeId = tabs.activeTabId;
    if (activeId) {
      const tab = tabs.getActiveTab();
      if (tab) {
        try { win.removeBrowserView(tab.view); } catch {}
      }
    }
  });

  safeHandle(IPC.UI_SHOW_TAB, () => {
    tabs.updateActiveBounds();
    const tab = tabs.getActiveTab();
    if (tab) {
      try {
        win.addBrowserView(tab.view);
        tabs.updateActiveBounds();
      } catch {}
    }
  });

  safeHandle(IPC.UI_TOGGLE_SIDEBAR, (event, open) => {
    if (open !== undefined) V.assertBoolean(open, 'open');
    const current = settings.get('sidebarOpen');
    const next    = open !== undefined ? open : !current;
    settings.set('sidebarOpen', next);
    tabs.updateActiveBounds();
    return next;
  });

  // ─── Window Controls ─────────────────────────────────────────

  safeOn(IPC.WINDOW_MINIMIZE,  () => { if (!win.isDestroyed()) win.minimize(); });
  safeOn(IPC.WINDOW_MAXIMIZE,  () => {
    if (!win.isDestroyed()) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });
  safeOn(IPC.WINDOW_CLOSE,     () => { if (!win.isDestroyed()) win.close(); });
  safeOn(IPC.WINDOW_FULLSCREEN, () => {
    if (!win.isDestroyed()) win.setFullScreen(!win.isFullScreen());
  });

  safeOn(IPC.WINDOW_INCOGNITO, () => {
    _createIncognitoWindow(services);
  });

  // ─── Page Info ────────────────────────────────────────────────

  safeHandle(IPC.PAGE_INFO_GET, () => {
    const tab = tabs.getActiveTab();
    if (!tab) return null;
    return {
      url:      tab.url,
      title:    tab.title,
      favicon:  tab.favicon,
      security: require('../navigation/UrlResolver').getSecurityLevel(tab.url),
      zoomFactor: tab.zoomFactor,
    };
  });

  // ─── Context Menu ─────────────────────────────────────────────

  ipcMain.on(IPC.CONTEXT_MENU_SHOW, (event, params) => {
    _buildContextMenu(tabs, params, win);
  });

  // Handle context menu built by TabManager's event wire
  ipcMain.on('context-menu:build', (event, tabId, params) => {
    _buildContextMenu(tabs, params, win, tabId);
  });

  // ─── Native Menu ─────────────────────────────────────────────

  safeOn(IPC.MENU_POPUP, () => {
    _showAppMenu(tabs, win, settings);
  });

  log.info('All IPC handlers registered');
}

// ─── Private Helpers ──────────────────────────────────────────────

/**
 * Handles side effects when a setting is changed.
 * @private
 */
function _handleSettingsSideEffects(key, value, services) {
  const { tabs } = services;

  switch (key) {

    case 'sidebarOpen':
    case 'sidebarPosition':
      tabs.updateActiveBounds();
      break;
  }
}

/**
 * Builds and shows the right-click context menu.
 * @private
 */
function _buildContextMenu(tabs, params, win, tabId) {
  const menu = new Menu();

  // Link items
  if (params.linkURL) {
    menu.append(new MenuItem({
      label: 'Open Link in New Tab',
      click: () => tabs.createTab(params.linkURL),
    }));
    menu.append(new MenuItem({
      label: 'Open Link in Background Tab',
      click: () => tabs.createTab(params.linkURL, { background: true }),
    }));
    menu.append(new MenuItem({
      label: 'Copy Link Address',
      click: () => clipboard.writeText(params.linkURL),
    }));
    menu.append(new MenuItem({ type: 'separator' }));
  }

  // Image items
  if (params.mediaType === 'image' && params.srcURL) {
    menu.append(new MenuItem({
      label: 'Open Image in New Tab',
      click: () => tabs.createTab(params.srcURL),
    }));
    menu.append(new MenuItem({
      label: 'Save Image As...',
      click: () => {
        const wc = tabs.getWebContents();
        if (wc) wc.downloadURL(params.srcURL);
      },
    }));
    menu.append(new MenuItem({
      label: 'Copy Image Address',
      click: () => clipboard.writeText(params.srcURL),
    }));
    menu.append(new MenuItem({ type: 'separator' }));
  }

  // Text selection
  if (params.selectionText && params.selectionText.trim()) {
    menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
    menu.append(new MenuItem({
      label: `Search for "${params.selectionText.slice(0, 30)}${params.selectionText.length > 30 ? '...' : ''}"`,
      click: () => {
        const query = encodeURIComponent(params.selectionText);
        tabs.createTab(`https://www.google.com/search?q=${query}`, { background: false });
      },
    }));
    menu.append(new MenuItem({ type: 'separator' }));
  }

  // Editable fields
  if (params.isEditable) {
    if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Cut',  role: 'cut' }));
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
    }
    menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
    menu.append(new MenuItem({ type: 'separator' }));
  }

  // Navigation
  menu.append(new MenuItem({
    label:   'Back',
    enabled: params.canGoBack !== false,
    click:   () => tabs.goBack(),
  }));
  menu.append(new MenuItem({
    label:   'Forward',
    enabled: params.canGoForward !== false,
    click:   () => tabs.goForward(),
  }));
  menu.append(new MenuItem({
    label: 'Reload',
    click: () => tabs.reload(),
  }));
  menu.append(new MenuItem({ type: 'separator' }));

  // Dev tools
  menu.append(new MenuItem({
    label: 'Inspect Element',
    click: () => {
      const wc = tabs.getWebContents();
      if (wc) wc.inspectElement(params.x, params.y);
    },
  }));

  menu.append(new MenuItem({
    label: 'View Page Source',
    click: () => tabs.viewSource(),
  }));

  menu.popup({ window: win });
}

/**
 * Shows the main application menu.
 * @private
 */
function _showAppMenu(tabs, win, settings) {
  const template = [
    {
      label:       'New Tab',
      accelerator: 'CmdOrCtrl+T',
      click:       () => tabs.createTab(),
    },
    {
      label: 'New Incognito Window',
      accelerator: 'CmdOrCtrl+Shift+N',
      click: () => ipcMain.emit(IPC.WINDOW_INCOGNITO),
    },
    { type: 'separator' },
    {
      label: 'History',
      accelerator: 'CmdOrCtrl+H',
      click: () => tabs.createTab(INTERNAL_PAGES.HISTORY),
    },
    {
      label: 'Downloads',
      accelerator: 'CmdOrCtrl+J',
      click: () => tabs.createTab(INTERNAL_PAGES.DOWNLOADS),
    },
    {
      label: 'Bookmarks',
      accelerator: 'CmdOrCtrl+B',
      click: () => tabs.createTab(INTERNAL_PAGES.BOOKMARKS),
    },
    { type: 'separator' },
    {
      label: 'Find in Page',
      accelerator: 'CmdOrCtrl+F',
      click: () => win.webContents.send(IPC.TOOLS_OPEN_FIND),
    },
    {
      label: 'Zoom In',
      accelerator: 'CmdOrCtrl+Plus',
      click: () => tabs.zoomIn(),
    },
    {
      label: 'Zoom Out',
      accelerator: 'CmdOrCtrl+-',
      click: () => tabs.zoomOut(),
    },
    {
      label: 'Reset Zoom',
      accelerator: 'CmdOrCtrl+0',
      click: () => tabs.zoomReset(),
    },
    { type: 'separator' },
    {
      label: 'Settings',
      accelerator: 'CmdOrCtrl+,',
      click: () => tabs.createTab(INTERNAL_PAGES.SETTINGS),
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: win });
}

/**
 * Creates a new incognito window.
 * @private
 */
function _createIncognitoWindow(services) {
  const { BrowserWindow } = require('electron');
  const { WINDOW, PRELOAD } = require('../core/Constants');
  const { TabManager }     = require('../tabs/TabManager');

  const partition       = `persist:incognito-${Date.now()}`;
  const { session }     = require('electron');
  const incognitoSession = session.fromPartition(`incognito-${Date.now()}`, { cache: false });

  const incogWin = new BrowserWindow({
    width:           WINDOW.DEFAULT_WIDTH,
    height:          WINDOW.DEFAULT_HEIGHT,
    minWidth:        WINDOW.MIN_WIDTH,
    minHeight:       WINDOW.MIN_HEIGHT,
    frame:           false,
    titleBarStyle:   'hidden',
    backgroundColor: '#0a0010',   // Purple-tinted for incognito
    show:            false,
    webPreferences: {
      preload:          PRELOAD.BROWSER,
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          true,
      webviewTag:       false,
      session:          incognitoSession,
    },
  });

  const incogTabs = new TabManager(
    incogWin,
    () => {
      if (!incogWin.isDestroyed()) {
        const state = incogTabs.getSerializedState();
        incogWin.webContents.send(IPC.TABS_UPDATED, state);
      }
    },
    services.settings
  );

  incogWin.once('ready-to-show', () => {
    incogWin.show();
    incogTabs.createTab(INTERNAL_PAGES.NEW_TAB);
  });

  incogWin.on('resize', () => incogTabs.updateActiveBounds());
  incogWin.on('closed', () => incogTabs.destroyAll());

  incogWin.loadFile(path.join(require('../core/Constants').UI_ROOT, 'browser', 'index.html'));

  log.info('Incognito window created');
}

module.exports = { setup };
