// ═══════════════════════════════════════════════════════════════
// BatBrowser — Settings Store
// Schema-validated persistent settings with defaults and migrations.
// Zero-dependency native implementation (no electron-store).
// ═══════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
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
    // v1 → v2: remove adblock fields
    delete data.adBlockStats;
    delete data.adBlockEnabled;
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
 * Native zero-dependency replacement for electron-store.
 */
class SettingsStore {
  constructor() {
    this._filePath = path.join(app.getPath('userData'), 'batbrowser-settings.json');
    this._data = { ...DEFAULTS };
    this._load();
    this._migrate();
    log.info('SettingsStore initialized natively', { version: SCHEMA_VERSION, path: this._filePath });
  }

  /** Load data from file synchronously */
  _load() {
    try {
      if (fs.existsSync(this._filePath)) {
        const fileContent = fs.readFileSync(this._filePath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        this._data = { ...DEFAULTS, ...parsed }; // Merge with defaults
      } else {
        this._save(); // Create initial file
      }
    } catch (err) {
      log.error('Failed to load settings file, reverting to defaults', err);
      this._data = { ...DEFAULTS };
    }
  }

  /** Save data to file synchronously */
  _save() {
    try {
      fs.writeFileSync(this._filePath, JSON.stringify(this._data, null, 2), 'utf-8');
    } catch (err) {
      log.error('Failed to save settings file', err);
    }
  }

  /**
   * Runs schema migrations if the stored version is behind.
   * @private
   */
  _migrate() {
    const storedVersion = this._data._version || 1;
    if (storedVersion < SCHEMA_VERSION) {
      log.info(`Migrating settings from v${storedVersion} to v${SCHEMA_VERSION}`);
      let data = { ...this._data };
      for (let v = storedVersion; v < SCHEMA_VERSION; v++) {
        if (MIGRATIONS[v]) {
          data = MIGRATIONS[v](data);
          log.debug(`Applied migration v${v} → v${v + 1}`);
        }
      }
      data._version = SCHEMA_VERSION;
      this._data = data;
      this._save();
    }
  }

  /**
   * Returns all settings as a plain object.
   * @returns {object}
   */
  getAll() {
    const all = { ...this._data };
    delete all._version; // Don't expose internal version to renderer
    return all;
  }

  /**
   * Gets a single setting value.
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    if (this._data.hasOwnProperty(key)) {
      return this._data[key];
    }
    return DEFAULTS[key];
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
    const oldValue = this._data[key];
    this._data[key] = value;
    this._save();
    log.debug(`Setting changed: ${key}`, { from: oldValue, to: value });
  }

  /**
   * Resets all settings to their defaults.
   */
  reset() {
    this._data = { ...DEFAULTS };
    this._save();
    log.info('Settings reset to defaults');
  }

  /**
   * Resets a single setting to its default.
   * @param {string} key
   */
  resetKey(key) {
    if (key in DEFAULTS) {
      this._data[key] = DEFAULTS[key];
      this._save();
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
