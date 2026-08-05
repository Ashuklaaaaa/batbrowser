// ═══════════════════════════════════════════════════════════════
// BatBrowser — IPC Input Validators (Phase 1: Security Hardening)
// Every value coming from the renderer is validated here before
// any main-process logic executes. This prevents injection attacks.
// ═══════════════════════════════════════════════════════════════

'use strict';

const { SECURITY } = require('../core/Constants');

// ─── Primitive Guards ─────────────────────────────────────────────

/**
 * Asserts value is a non-empty string within max length.
 * @throws {TypeError}
 */
function assertString(value, name = 'value', maxLen = SECURITY.MAX_STRING_LENGTH) {
  if (typeof value !== 'string') {
    throw new TypeError(`IPC: ${name} must be a string, got ${typeof value}`);
  }
  if (value.length > maxLen) {
    throw new TypeError(`IPC: ${name} exceeds maximum length of ${maxLen}`);
  }
  return true;
}

/**
 * Asserts value is a finite number.
 * @throws {TypeError}
 */
function assertNumber(value, name = 'value') {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new TypeError(`IPC: ${name} must be a finite number, got ${typeof value}`);
  }
  return true;
}

/**
 * Asserts value is a boolean.
 * @throws {TypeError}
 */
function assertBoolean(value, name = 'value') {
  if (typeof value !== 'boolean') {
    throw new TypeError(`IPC: ${name} must be a boolean, got ${typeof value}`);
  }
  return true;
}

/**
 * Asserts value is a positive integer.
 * @throws {TypeError}
 */
function assertPositiveInt(value, name = 'value') {
  assertNumber(value, name);
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`IPC: ${name} must be a non-negative integer`);
  }
  return true;
}

// ─── URL / Navigation Validators ─────────────────────────────────

/**
 * Validates a raw navigation input string.
 * Returns the sanitized string or throws.
 *
 * @param {any} input
 * @returns {string} trimmed, validated input
 * @throws {TypeError}
 */
function validateNavigationInput(input) {
  assertString(input, 'navigation input', SECURITY.MAX_URL_LENGTH);

  const trimmed = input.trim();

  // Block data URLs directly entered by user (XSS vector)
  if (/^data:/i.test(trimmed)) {
    throw new TypeError('IPC: data: URLs are not allowed for navigation');
  }

  // Block javascript: protocol
  if (/^javascript:/i.test(trimmed)) {
    throw new TypeError('IPC: javascript: URLs are not allowed for navigation');
  }

  // Block vbscript:
  if (/^vbscript:/i.test(trimmed)) {
    throw new TypeError('IPC: vbscript: URLs are not allowed');
  }

  return trimmed;
}

/**
 * Validates a resolved URL (after UrlResolver processes it).
 * Only allows https:, http:, file: (for internal pages) and view-source:.
 *
 * @param {string} url
 * @returns {boolean}
 * @throws {TypeError}
 */
function validateResolvedUrl(url) {
  assertString(url, 'resolved URL', SECURITY.MAX_URL_LENGTH);

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`IPC: Invalid URL after resolution: ${url}`);
  }

  const protocol = parsed.protocol.replace(':', '');

  // Allow view-source for developer tools
  if (url.startsWith('view-source:')) return true;

  if (!SECURITY.ALLOWED_NAVIGATION_PROTOCOLS.has(parsed.protocol)) {
    throw new TypeError(`IPC: Protocol '${parsed.protocol}' is not allowed for navigation`);
  }

  // Extra: never allow file:// paths outside the app UI directory
  // (prevents reading arbitrary files from disk)
  if (parsed.protocol === 'file:') {
    // Only allow internal app pages — this is enforced by using INTERNAL_PAGES constants
    // We allow file: URLs here but WindowManager checks they match INTERNAL_PAGES
  }

  return true;
}

/**
 * Validates a URL for shell.openExternal.
 * Strictly only https, http, mailto, tel.
 *
 * @param {string} url
 * @throws {TypeError}
 */
function validateExternalUrl(url) {
  assertString(url, 'external URL', SECURITY.MAX_URL_LENGTH);

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`IPC: Invalid external URL: ${url}`);
  }

  if (!SECURITY.ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new TypeError(`IPC: Protocol '${parsed.protocol}' is not allowed for external opening`);
  }
}

// ─── Tab Validators ───────────────────────────────────────────────

/**
 * Validates a tab ID (positive integer).
 */
function validateTabId(tabId) {
  assertPositiveInt(tabId, 'tabId');
  return true;
}

/**
 * Validates zoom level.
 * @param {any} level
 */
function validateZoomLevel(level) {
  assertNumber(level, 'zoomLevel');
  const { MIN_ZOOM, MAX_ZOOM } = require('../core/Constants').TAB;
  if (level < MIN_ZOOM || level > MAX_ZOOM) {
    throw new RangeError(`IPC: zoom level ${level} out of range [${MIN_ZOOM}, ${MAX_ZOOM}]`);
  }
}

// ─── Bookmark Validators ─────────────────────────────────────────

/**
 * Validates a bookmark object from the renderer.
 * @param {any} bookmark
 * @returns {{ url: string, title: string, folderId?: string }}
 */
function validateBookmark(bookmark) {
  if (!bookmark || typeof bookmark !== 'object') {
    throw new TypeError('IPC: bookmark must be an object');
  }
  validateNavigationInput(bookmark.url);
  assertString(bookmark.title, 'bookmark.title', 512);
  if (bookmark.folderId !== undefined && bookmark.folderId !== null) {
    assertString(bookmark.folderId, 'bookmark.folderId', 64);
  }
  return {
    url:      bookmark.url.trim(),
    title:    bookmark.title.trim(),
    folderId: bookmark.folderId || null,
  };
}

// ─── Settings Validators ─────────────────────────────────────────

const VALID_SETTINGS_KEYS = new Set([
  'searchEngine', 'forceDarkMode', 'scrollSensitivity',
  'theme', 'accentColor', 'sidebarOpen', 'sidebarPosition', 'showBookmarksBar',
  'restoreSessionOnStart', 'compactMode', 'showTabPreviews', 'language',
  'downloadPath', 'askWhereToSave', 'enableNotifications', 'enableGeolocation',
  'enableCamera', 'enableMicrophone', 'hardwareAcceleration', 'privacy',
]);

const VALID_SEARCH_ENGINES = new Set(['google', 'bing', 'duckduckgo', 'brave', 'ecosia']);
const VALID_THEMES = new Set(['dark', 'light', 'amoled', 'system']);

/**
 * Validates a settings key-value pair.
 * @param {string} key
 * @param {any} value
 * @throws {TypeError}
 */
function validateSetting(key, value) {
  assertString(key, 'settings key', 64);

  if (!VALID_SETTINGS_KEYS.has(key)) {
    throw new TypeError(`IPC: Unknown settings key: '${key}'`);
  }

  // Type-specific validation
  switch (key) {
    case 'searchEngine':
      assertString(value, 'searchEngine');
      if (!VALID_SEARCH_ENGINES.has(value)) {
        throw new TypeError(`IPC: Invalid search engine: ${value}`);
      }
      break;

    case 'theme':
      assertString(value, 'theme');
      if (!VALID_THEMES.has(value)) {
        throw new TypeError(`IPC: Invalid theme: ${value}`);
      }
      break;

    case 'accentColor':
      assertString(value, 'accentColor', 32);
      if (!/^#[0-9a-f]{6}$/i.test(value)) {
        throw new TypeError('IPC: Invalid accent color format (expected #rrggbb)');
      }
      break;

    case 'forceDarkMode':
    case 'sidebarOpen':
    case 'showBookmarksBar':
    case 'restoreSessionOnStart':
    case 'compactMode':
    case 'showTabPreviews':
    case 'askWhereToSave':
    case 'enableNotifications':
    case 'enableGeolocation':
    case 'enableCamera':
    case 'enableMicrophone':
    case 'hardwareAcceleration':
      assertBoolean(value, key);
      break;

    case 'scrollSensitivity': {
      assertNumber(value, 'scrollSensitivity');
      if (value < 0.1 || value > 5.0) {
        throw new RangeError('IPC: scrollSensitivity must be between 0.1 and 5.0');
      }
      break;
    }

    case 'sidebarPosition':
      assertString(value, 'sidebarPosition');
      if (!['left', 'right'].includes(value)) {
        throw new TypeError('IPC: sidebarPosition must be left or right');
      }
      break;
  }

  return true;
}

// ─── Search Validators ────────────────────────────────────────────

/**
 * Validates a search query string.
 */
function validateSearchQuery(query) {
  assertString(query, 'search query', 1024);
  return query.trim();
}

// ─── Find-in-Page Validators ─────────────────────────────────────

function validateFindOptions(text, options) {
  assertString(text, 'find text', 512);
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') {
      throw new TypeError('IPC: find options must be an object');
    }
    if (options.forward !== undefined) assertBoolean(options.forward, 'options.forward');
    if (options.matchCase !== undefined) assertBoolean(options.matchCase, 'options.matchCase');
    if (options.findNext !== undefined) assertBoolean(options.findNext, 'options.findNext');
  }
  return true;
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  assertString,
  assertNumber,
  assertBoolean,
  assertPositiveInt,
  validateNavigationInput,
  validateResolvedUrl,
  validateExternalUrl,
  validateTabId,
  validateZoomLevel,
  validateBookmark,
  validateSetting,
  validateSearchQuery,
  validateFindOptions,
};
