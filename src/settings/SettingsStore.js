// ═══════════════════════════════════════════════════════════════
// BatBrowser — Settings Store
// Schema-validated persistent settings with defaults and migrations.
// ═══════════════════════════════════════════════════════════════

'use strict';

const Store = require('electron-store');
const Logger = require('../core/Logger');

const log = Logger.create('SettingsStore');

/** Current settings schema version — increment on breaking changes */
const SCHEMA_VERSION = 2;

/** Complete default settings */
const DEFAULTS = {
  _version: SCHEMA_VERSION,

  // ── General ──────────────────────────────────────────────────
  searchEngine:        'google',
  language:            'en',
  downloadPath:        '',           // '' = use system default
  askWhereToSave:      false,
  restoreSessionOnStart: true,
  showTabPreviews:     true,
  hardwareAcceleration: true,

  // ── Appearance ───────────────────────────────────────────────
  theme:               'dark',       // 'dark' | 'light' | 'amoled' | 'system'
  accentColor:         '#00D4B4',    // NOCTURNE Teal — BatBrowser brand (from logo)
  compactMode:         false,
  sidebarOpen:         false,
  sidebarPosition:     'left',       // 'left' | 'right'
  showBookmarksBar:    false,
  tabsPosition:        'bottom',     // 'bottom' (below toolbar) | 'top' (conventional)
  newTabLayout:        'default',    // 'default' | 'minimal' | 'focus'
  fontScale:           1.0,          // 0.8 | 0.9 | 1.0 | 1.1 | 1.2

  // ── Privacy ───────────────────────────────────────────────────
  adBlockEnabled:      true,
  forceDarkMode:       false,
  doNotTrack:          true,
  globalPrivacyControl: true,
  blockThirdPartyCookies: false,

  // ── Permissions ───────────────────────────────────────────────
  enableNotifications: false,
  enableGeolocation:   false,
  enableCamera:        false,
  enableMicrophone:    false,

  // ── Scroll ───────────────────────────────────────────────────
  scrollSensitivity:   1.0,          // 1.0 = native, no override
};

// ─── Migration Map ────────────────────────────────────────────────
// Key: from version, Value: migration function
const MIGRATIONS = {
  1: (data) => {
    // v1 → v2: rename adBlockStats to be stored separately
    delete data.adBlockStats;
    data.restoreSessionOnStart = true;
    data.showTabPreviews = true;
    data.hardwareAcceleration = true;
    data.doNotTrack = true;
    data.globalPrivacyControl = true;
    data.blockThirdPartyCookies = false;
    data.enableNotifications = false;
    data.enableGeolocation = false;
    data.enableCamera = false;
    data.enableMicrophone = false;
    data.theme = 'dark';
    data.accentColor = '#f59e0b';
    data.compactMode = false;
    data.sidebarOpen = false;
    data.sidebarPosition = 'left';
    data.showBookmarksBar = false;
    data.askWhereToSave = false;
    data.downloadPath = '';
    data.language = 'en';
    return data;
  },
};

/**
 * SettingsStore — manages all user preferences.
 * Wraps electron-store with schema validation and migration support.
 */
class SettingsStore {
  constructor() {
    this._store = new Store({
      name: 'batbrowser-settings',
      defaults: DEFAULTS,
    });

    this._migrate();
    log.info('SettingsStore initialized', { version: SCHEMA_VERSION });
  }

  /**
   * Runs schema migrations if the stored version is behind.
   * @private
   */
  _migrate() {
    const storedVersion = this._store.get('_version', 1);
    if (storedVersion < SCHEMA_VERSION) {
      log.info(`Migrating settings from v${storedVersion} to v${SCHEMA_VERSION}`);
      let data = this._store.store;
      for (let v = storedVersion; v < SCHEMA_VERSION; v++) {
        if (MIGRATIONS[v]) {
          data = MIGRATIONS[v](data);
          log.debug(`Applied migration v${v} → v${v + 1}`);
        }
      }
      data._version = SCHEMA_VERSION;
      this._store.store = data;
    }
  }

  /**
   * Returns all settings as a plain object.
   * @returns {object}
   */
  getAll() {
    const all = { ...this._store.store };
    delete all._version; // Don't expose internal version to renderer
    return all;
  }

  /**
   * Gets a single setting value.
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this._store.get(key, DEFAULTS[key]);
  }

  /**
   * Sets a single setting value.
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    if (!(key in DEFAULTS)) {
      log.warn(`Attempted to set unknown setting: ${key}`);
      return;
    }
    const oldValue = this._store.get(key);
    this._store.set(key, value);
    log.debug(`Setting changed: ${key}`, { from: oldValue, to: value });
  }

  /**
   * Resets all settings to their defaults.
   */
  reset() {
    this._store.clear();
    this._store.set({ ...DEFAULTS });
    log.info('Settings reset to defaults');
  }

  /**
   * Resets a single setting to its default.
   * @param {string} key
   */
  resetKey(key) {
    if (key in DEFAULTS) {
      this._store.set(key, DEFAULTS[key]);
    }
  }
}

// Singleton
let _instance = null;

/**
 * Returns the singleton SettingsStore instance.
 * @returns {SettingsStore}
 */
function getInstance() {
  if (!_instance) _instance = new SettingsStore();
  return _instance;
}

module.exports = { SettingsStore, getInstance, DEFAULTS };
