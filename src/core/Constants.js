// ═══════════════════════════════════════════════════════════════
// BatBrowser — Application Constants
// Single source of truth for all magic strings, numbers, URLs.
// ═══════════════════════════════════════════════════════════════

'use strict';

const path = require('path');

/** Root of the application source */
const APP_ROOT = path.resolve(__dirname, '..', '..');

/** UI directory root */
const UI_ROOT = path.join(APP_ROOT, 'ui');

// ─── Internal Page URLs ──────────────────────────────────────────

/**
 * Converts a Windows path to a proper file:/// URL.
 * @param {...string} parts - path.join arguments
 * @returns {string}
 */
function fileUrl(...parts) {
  const p = path.join(...parts).replace(/\\/g, '/');
  return p.startsWith('/') ? `file://${p}` : `file:///${p}`;
}

const INTERNAL_PAGES = {
  NEW_TAB:   fileUrl(UI_ROOT, 'pages', 'newtab', 'index.html'),
  SETTINGS:  fileUrl(UI_ROOT, 'pages', 'settings', 'index.html'),
  HISTORY:   fileUrl(UI_ROOT, 'pages', 'history', 'index.html'),
  DOWNLOADS: fileUrl(UI_ROOT, 'pages', 'downloads', 'index.html'),
  BOOKMARKS: fileUrl(UI_ROOT, 'pages', 'bookmarks', 'index.html'),
  ERROR:     fileUrl(UI_ROOT, 'pages', 'error', 'index.html'),
};

// ─── Preload Scripts ──────────────────────────────────────────────

const PRELOAD = {
  BROWSER: path.join(APP_ROOT, 'preload', 'browser.js'),
};

// ─── Window Defaults ─────────────────────────────────────────────

const WINDOW = {
  DEFAULT_WIDTH:  1280,
  DEFAULT_HEIGHT: 820,
  MIN_WIDTH:      720,
  MIN_HEIGHT:     480,
  BACKGROUND:     '#080A0F',   // NOCTURNE Abyss

  /** Height of titlebar (drag region + window controls) */
  TITLEBAR_HEIGHT: 40,
  /** Height of toolbar (omnibar row) */
  TOOLBAR_HEIGHT:  48,
  /** Height of the dedicated tab bar row */
  TABBAR_HEIGHT:   36,
  /** Width of the always-visible sidebar icon rail */
  SIDEBAR_RAIL_W:  52,
  /** Total chrome height = titlebar + toolbar + tab bar */
  get CHROME_HEIGHT() {
    return this.TITLEBAR_HEIGHT + this.TOOLBAR_HEIGHT + this.TABBAR_HEIGHT;
  },
};

// ─── Tab Defaults ─────────────────────────────────────────────────

const TAB = {
  DEFAULT_TITLE:     'New Tab',
  DEFAULT_FAVICON:   '',
  MIN_ZOOM:          0.25,
  MAX_ZOOM:          5.0,
  ZOOM_STEP:         0.1,
  DEFAULT_ZOOM:      1.0,
  /** Background tabs sleeping after this ms of inactivity */
  SLEEP_AFTER_MS:    10 * 60 * 1000, // 10 minutes
};

// ─── Search Engines ───────────────────────────────────────────────

const SEARCH_ENGINES = {
  google:     { name: 'Google',      url: 'https://www.google.com/search?q=',         suggest: 'https://suggestqueries.google.com/complete/search?client=chrome&q=' },
  bing:       { name: 'Bing',        url: 'https://www.bing.com/search?q=',           suggest: 'https://api.bing.com/qsonhs.aspx?q=' },
  duckduckgo: { name: 'DuckDuckGo',  url: 'https://duckduckgo.com/?q=',              suggest: 'https://duckduckgo.com/ac/?q=' },
  brave:      { name: 'Brave Search',url: 'https://search.brave.com/search?q=',      suggest: 'https://search.brave.com/api/suggest?q=' },
  ecosia:     { name: 'Ecosia',      url: 'https://www.ecosia.org/search?q=',        suggest: 'https://ac.ecosia.org/?q=' },
};

// ─── Security ─────────────────────────────────────────────────────

const SECURITY = {
  /** Protocols allowed for user navigation */
  ALLOWED_NAVIGATION_PROTOCOLS: new Set(['https:', 'http:', 'file:']),

  /** Protocols allowed for shell.openExternal */
  ALLOWED_EXTERNAL_PROTOCOLS: new Set(['https:', 'http:', 'mailto:', 'tel:']),

  /** Chrome internal schemes that must never be navigated to */
  BLOCKED_SCHEMES: new Set(['javascript', 'data', 'vbscript', 'chrome', 'about']),

  /** Maximum URL length to accept */
  MAX_URL_LENGTH: 2048,

  /** Maximum string IPC argument length */
  MAX_STRING_LENGTH: 4096,
};

// ─── History ──────────────────────────────────────────────────────

const HISTORY = {
  MAX_ENTRIES: 50_000,
  /** Internal pages never recorded */
  SKIP_PROTOCOLS: new Set(['file:', 'chrome:', 'devtools:']),
};

// ─── Downloads ────────────────────────────────────────────────────

const DOWNLOADS = {
  /** How long to keep completed downloads in memory (ms) */
  COMPLETED_RETENTION_MS: 24 * 60 * 60 * 1000, // 24h
};

// ─── Adblock ──────────────────────────────────────────────────────

const ADBLOCK = {
  /** Throttle delay for stats notifications to renderer */
  STATS_NOTIFY_THROTTLE_MS: 500,
};

// ─── IPC Channel Names ────────────────────────────────────────────

const IPC = {
  // Tabs
  TAB_CREATE:            'tab:create',
  TAB_CLOSE:             'tab:close',
  TAB_SWITCH:            'tab:switch',
  TAB_PIN:               'tab:pin',
  TAB_DUPLICATE:         'tab:duplicate',
  TAB_MUTE:              'tab:mute',
  TAB_GROUP_CREATE:      'tab:group:create',
  TAB_GROUP_MOVE:        'tab:group:move',
  TABS_UPDATED:          'tabs:updated',
  TAB_CREATED:           'tab:created',
  TAB_TITLE_UPDATED:     'tab:title-updated',
  TAB_FAVICON_UPDATED:   'tab:favicon-updated',
  TAB_URL_UPDATED:       'tab:url-updated',
  TAB_LOADING_CHANGED:   'tab:loading-changed',
  TAB_NAV_STATE:         'tab:navigation-state',
  TAB_CLOSED:            'tab:closed',
  TAB_CRASHED:           'tab:crashed',
  TAB_ACTIVE_CHANGED:    'tab:active-changed',
  TAB_AUDIO_CHANGED:     'tab:audio-changed',

  // Navigation
  NAV_GO:                'nav:go',
  NAV_BACK:              'nav:back',
  NAV_FORWARD:           'nav:forward',
  NAV_RELOAD:            'nav:reload',
  NAV_STOP:              'nav:stop',
  NAV_HOME:              'nav:home',

  // Adblock
  ADBLOCK_GET_STATS:     'adblock:get-stats',
  ADBLOCK_TOGGLE:        'adblock:toggle',
  ADBLOCK_STATS_UPDATED: 'adblock:stats-updated',

  // History
  HISTORY_GET:           'history:get',
  HISTORY_SEARCH:        'history:search',
  HISTORY_CLEAR:         'history:clear',
  HISTORY_DELETE_ITEM:   'history:delete-item',
  HISTORY_UPDATED:       'history:updated',

  // Bookmarks
  BOOKMARKS_GET:         'bookmarks:get',
  BOOKMARKS_ADD:         'bookmarks:add',
  BOOKMARKS_REMOVE:      'bookmarks:remove',
  BOOKMARKS_UPDATE:      'bookmarks:update',
  BOOKMARKS_MOVE:        'bookmarks:move',
  BOOKMARKS_UPDATED:     'bookmarks:updated',
  BOOKMARKS_IS_BOOKMARKED: 'bookmarks:is-bookmarked',

  // Settings
  SETTINGS_GET:          'settings:get',
  SETTINGS_SET:          'settings:set',
  SETTINGS_RESET:        'settings:reset',

  // Privacy
  PRIVACY_CLEAR_COOKIES: 'privacy:clear-cookies',
  PRIVACY_CLEAR_CACHE:   'privacy:clear-cache',
  PRIVACY_CLEAR_ALL:     'privacy:clear-all',

  // Downloads
  DOWNLOADS_GET:         'downloads:get',
  DOWNLOADS_OPEN_FOLDER: 'downloads:open-folder',
  DOWNLOADS_OPEN_FILE:   'downloads:open-file',
  DOWNLOADS_CANCEL:      'downloads:cancel',
  DOWNLOADS_CLEAR:       'downloads:clear',
  DOWNLOAD_STARTED:      'download:started',
  DOWNLOAD_PROGRESS:     'download:progress',
  DOWNLOAD_COMPLETED:    'download:completed',
  DOWNLOAD_CANCELLED:    'download:cancelled',

  // DevTools
  TOOLS_DEVTOOLS:        'tools:devtools',
  TOOLS_VIEW_SOURCE:     'tools:view-source',
  TOOLS_FIND:            'tools:find',
  TOOLS_STOP_FIND:       'tools:stop-find',
  TOOLS_PRINT:           'tools:print',
  TOOLS_SCREENSHOT:      'tools:screenshot',
  TOOLS_OPEN_FIND:       'tools:open-find',
  FIND_RESULTS:          'find:results',

  // Zoom
  ZOOM_IN:               'zoom:in',
  ZOOM_OUT:              'zoom:out',
  ZOOM_RESET:            'zoom:reset',
  ZOOM_GET:              'zoom:get',
  ZOOM_SET:              'zoom:set',
  ZOOM_CHANGED:          'zoom:changed',

  // Suggestions
  SUGGESTIONS_GET:       'suggestions:get',

  // UI
  UI_HIDE_TAB:           'ui:hide-tab',
  UI_SHOW_TAB:           'ui:show-tab',
  UI_TOGGLE_SIDEBAR:     'ui:toggle-sidebar',
  UI_COMMAND_PALETTE:    'ui:command-palette',
  SETTINGS_SHOW:         'settings:show',
  SETTINGS_OPEN:         'settings:open',

  // Window
  WINDOW_MINIMIZE:       'window:minimize',
  WINDOW_MAXIMIZE:       'window:maximize',
  WINDOW_CLOSE:          'window:close',
  WINDOW_FULLSCREEN:     'window:fullscreen',
  WINDOW_INCOGNITO:      'window:incognito',
  WINDOW_STATE_CHANGED:  'window:state-changed',

  // Context & Native Menu
  CONTEXT_MENU_SHOW:     'context-menu:show',
  MENU_POPUP:            'menu:popup',

  // Page info
  PAGE_INFO_GET:         'page:info-get',

  // Permissions
  PERMISSION_RESPONSE:   'permission:response',
};

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  APP_ROOT,
  UI_ROOT,
  INTERNAL_PAGES,
  PRELOAD,
  WINDOW,
  TAB,
  SEARCH_ENGINES,
  SECURITY,
  HISTORY,
  DOWNLOADS,
  ADBLOCK,
  IPC,
};
