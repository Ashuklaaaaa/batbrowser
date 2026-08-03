// ═══════════════════════════════════════════════════════════════
// BatBrowser — URL Resolver & Navigation Guard
// Smart resolution of user input to proper URLs.
// Security guard for navigation and external protocol handling.
// ═══════════════════════════════════════════════════════════════

'use strict';

const { shell } = require('electron');
const { SEARCH_ENGINES, SECURITY, INTERNAL_PAGES } = require('../core/Constants');
const Logger = require('../core/Logger');
const { validateExternalUrl } = require('../ipc/validators');

const log = Logger.create('Navigation');

// ─── URL Resolver ─────────────────────────────────────────────────

/**
 * Regular expression for validating what looks like a domain.
 * Must have at least one dot, no spaces, no special search chars.
 */
const DOMAIN_REGEX = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?$/;

/**
 * Resolves user-typed input into a fully-qualified URL.
 *
 * Resolution order:
 *   1. Empty → new tab page
 *   2. Already has http:// or https:// → return as-is
 *   3. Looks like a domain (has dots, no spaces) → prepend https://
 *   4. Looks like localhost:PORT → prepend http://
 *   5. Otherwise → search query using configured engine
 *
 * @param {string} input          - Raw user input from omnibar
 * @param {string} [engineId]     - Search engine key, e.g. 'google'
 * @param {string} [newTabUrl]    - URL to return for empty input
 * @returns {string}              - Fully qualified URL
 */
function resolveUrl(input, engineId = 'google', newTabUrl = INTERNAL_PAGES.NEW_TAB) {
  const raw = (input || '').trim();

  if (!raw) return newTabUrl;

  // Already a fully-qualified URL
  if (/^https?:\/\//i.test(raw)) return raw;

  // File URL
  if (/^file:\/\//i.test(raw)) return raw;

  // View source
  if (/^view-source:/i.test(raw)) return raw;

  // localhost or 127.0.0.1 (with optional port/path)
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(raw)) {
    return 'http://' + raw;
  }

  // IP address
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(raw)) {
    return 'http://' + raw;
  }

  // Looks like a domain
  if (DOMAIN_REGEX.test(raw) && !raw.includes(' ')) {
    return 'https://' + raw;
  }

  // Everything else → search query
  return buildSearchUrl(raw, engineId);
}

/**
 * Builds a search engine query URL.
 *
 * @param {string} query      - Search terms
 * @param {string} engineId   - Engine key from SEARCH_ENGINES
 * @returns {string}
 */
function buildSearchUrl(query, engineId = 'google') {
  const engine = SEARCH_ENGINES[engineId] || SEARCH_ENGINES.google;
  return engine.url + encodeURIComponent(query);
}

/**
 * Returns the suggestions URL for a search engine.
 *
 * @param {string} engineId
 * @returns {string|null}
 */
function getSuggestUrl(engineId = 'google') {
  const engine = SEARCH_ENGINES[engineId];
  return engine ? engine.suggest : null;
}

// ─── Navigation Guard ─────────────────────────────────────────────

/**
 * Determines whether a navigation request should be allowed.
 * Used in will-navigate and new-window event handlers.
 *
 * @param {string} url          - The URL being navigated to
 * @param {string} frameUrl     - The URL of the requesting frame
 * @returns {{ allow: boolean, reason?: string }}
 */
function shouldAllowNavigation(url, frameUrl) {
  if (!url) return { allow: false, reason: 'Empty URL' };

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { allow: false, reason: 'Invalid URL' };
  }

  const protocol = parsed.protocol.replace(':', '');

  // Block dangerous schemes
  if (SECURITY.BLOCKED_SCHEMES.has(protocol)) {
    log.warn(`Blocked navigation to scheme: ${protocol}`, { url });
    return { allow: false, reason: `Blocked scheme: ${protocol}` };
  }

  // Allow known safe protocols
  if (['https', 'http', 'file', 'ftp'].includes(protocol)) {
    return { allow: true };
  }

  // Allow view-source for devtools
  if (url.startsWith('view-source:https://') || url.startsWith('view-source:http://')) {
    return { allow: true };
  }

  // Allow devtools
  if (url.startsWith('devtools://')) {
    return { allow: true };
  }

  log.warn(`Blocked navigation to unknown protocol: ${protocol}`, { url });
  return { allow: false, reason: `Unknown protocol: ${protocol}` };
}

/**
 * Safely opens a URL in the system default browser.
 * Validates the URL before calling shell.openExternal.
 *
 * @param {string} url
 * @returns {Promise<void>}
 */
async function safeOpenExternal(url) {
  try {
    validateExternalUrl(url);
    await shell.openExternal(url);
    log.info(`Opened external URL: ${url}`);
  } catch (err) {
    log.error(`Refused to open external URL: ${url}`, err.message);
  }
}

/**
 * Determines if a URL is an internal BatBrowser page.
 * @param {string} url
 * @returns {boolean}
 */
function isInternalPage(url) {
  if (!url) return false;
  return url.startsWith('file://') || Object.values(INTERNAL_PAGES).some(p => url.startsWith(p));
}

/**
 * Strips query params and hashes for display in omnibar.
 * Shows clean URL to the user.
 *
 * @param {string} url
 * @returns {string}
 */
function getDisplayUrl(url) {
  if (!url) return '';
  if (isInternalPage(url)) return '';
  try {
    const u = new URL(url);
    // Strip trailing slash from root
    const path = u.pathname === '/' ? '' : u.pathname;
    return u.hostname + path + u.search;
  } catch {
    return url;
  }
}

/**
 * Returns the security level of a URL.
 * @param {string} url
 * @returns {'secure'|'insecure'|'internal'|'unknown'}
 */
function getSecurityLevel(url) {
  if (!url) return 'unknown';
  if (isInternalPage(url)) return 'internal';
  if (url.startsWith('https://')) return 'secure';
  if (url.startsWith('http://')) return 'insecure';
  return 'unknown';
}

module.exports = {
  resolveUrl,
  buildSearchUrl,
  getSuggestUrl,
  shouldAllowNavigation,
  safeOpenExternal,
  isInternalPage,
  getDisplayUrl,
  getSecurityLevel,
};
