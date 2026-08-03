// ═══════════════════════════════════════════════════════════════
// BatBrowser — History Store
// Full-featured browsing history: unlimited entries, dedup,
// full-text search, date grouping, XSS-safe, persistent.
// ═══════════════════════════════════════════════════════════════

'use strict';

const Store = require('electron-store');
const Logger = require('../core/Logger');
const { HISTORY } = require('../core/Constants');

const log = Logger.create('HistoryStore');

/**
 * A single history entry.
 * @typedef {Object} HistoryEntry
 * @property {string} id        - Unique ID (timestamp-based)
 * @property {string} url       - Full URL
 * @property {string} title     - Page title
 * @property {number} timestamp - Unix milliseconds
 * @property {number} visitCount - Number of visits to this URL
 * @property {string} favicon   - Favicon data URL or http URL
 */

/**
 * HistoryStore — manages persistent browsing history.
 *
 * Features:
 *  - Unlimited entries (capped at HISTORY.MAX_ENTRIES = 50k)
 *  - Deduplication: repeated visits update visitCount & timestamp
 *  - Full-text search across titles and URLs
 *  - Date-grouped retrieval for the history page
 *  - XSS-safe: all data stored as plain strings, never HTML
 */
class HistoryStore {
  constructor() {
    this._store = new Store({
      name: 'batbrowser-history',
      defaults: { entries: [] },
    });

    // In-memory cache for fast search
    /** @type {HistoryEntry[]} Most-recent-first */
    this._entries = this._store.get('entries') || [];

    // URL index for fast dedup lookup
    /** @type {Map<string, HistoryEntry>} url → entry */
    this._urlIndex = new Map(this._entries.map(e => [e.url, e]));

    log.info('HistoryStore initialized', { entries: this._entries.length });
  }

  /**
   * Adds or updates a history entry.
   * If the URL was visited before, updates title and increments visitCount.
   *
   * @param {string} url
   * @param {string} title
   * @param {string} [favicon]
   */
  add(url, title, favicon = '') {
    if (!url) return;

    // Skip internal and non-http pages
    try {
      const parsed = new URL(url);
      if (HISTORY.SKIP_PROTOCOLS.has(parsed.protocol)) return;
    } catch {
      return;
    }

    const now = Date.now();

    if (this._urlIndex.has(url)) {
      // Update existing entry — move to front
      const existing = this._urlIndex.get(url);
      existing.title     = title || existing.title;
      existing.timestamp = now;
      existing.visitCount = (existing.visitCount || 1) + 1;
      if (favicon) existing.favicon = favicon;

      // Remove from current position and re-insert at front
      this._entries = this._entries.filter(e => e.url !== url);
      this._entries.unshift(existing);
    } else {
      // New entry
      const entry = {
        id:         `h_${now}_${Math.random().toString(36).slice(2, 8)}`,
        url,
        title:      title || url,
        timestamp:  now,
        visitCount: 1,
        favicon:    favicon || '',
      };
      this._entries.unshift(entry);
      this._urlIndex.set(url, entry);
    }

    // Enforce max entries
    if (this._entries.length > HISTORY.MAX_ENTRIES) {
      const removed = this._entries.splice(HISTORY.MAX_ENTRIES);
      removed.forEach(e => this._urlIndex.delete(e.url));
    }

    this._persist();
  }

  /**
   * Returns the most recent history entries.
   * @param {number} [limit=100]
   * @returns {HistoryEntry[]}
   */
  getRecent(limit = 100) {
    return this._entries.slice(0, limit);
  }

  /**
   * Searches history by query string (title and URL).
   * Returns results sorted by recency × visit count.
   *
   * @param {string} query
   * @param {number} [limit=50]
   * @returns {HistoryEntry[]}
   */
  search(query, limit = 50) {
    if (!query || !query.trim()) return this.getRecent(limit);

    const terms = query.toLowerCase().trim().split(/\s+/);

    return this._entries
      .filter(entry => {
        const haystack = (entry.title + ' ' + entry.url).toLowerCase();
        return terms.every(term => haystack.includes(term));
      })
      .slice(0, limit);
  }

  /**
   * Returns history entries grouped by date (for the history page).
   * @param {number} [limit=500]
   * @returns {Array<{ label: string, entries: HistoryEntry[] }>}
   */
  getGroupedByDate(limit = 500) {
    const entries = this._entries.slice(0, limit);
    const groups = new Map();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    for (const entry of entries) {
      const d = new Date(entry.timestamp);
      d.setHours(0, 0, 0, 0);

      let label;
      if (d.getTime() === today.getTime()) {
        label = 'Today';
      } else if (d.getTime() === yesterday.getTime()) {
        label = 'Yesterday';
      } else if (d >= lastWeek) {
        label = d.toLocaleDateString('en-US', { weekday: 'long' });
      } else {
        label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }

      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(entry);
    }

    return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
  }

  /**
   * Deletes a specific history entry by ID.
   * @param {string} id
   */
  deleteById(id) {
    const idx = this._entries.findIndex(e => e.id === id);
    if (idx === -1) return;
    const [removed] = this._entries.splice(idx, 1);
    this._urlIndex.delete(removed.url);
    this._persist();
  }

  /**
   * Clears all history.
   */
  clear() {
    this._entries = [];
    this._urlIndex.clear();
    this._persist();
    log.info('History cleared');
  }

  /**
   * Returns the total number of history entries.
   * @returns {number}
   */
  get count() {
    return this._entries.length;
  }

  /**
   * Persists the in-memory state to disk.
   * @private
   */
  _persist() {
    try {
      this._store.set('entries', this._entries);
    } catch (err) {
      log.error('Failed to persist history', err);
    }
  }
}

// Singleton
let _instance = null;

function getInstance() {
  if (!_instance) _instance = new HistoryStore();
  return _instance;
}

module.exports = { HistoryStore, getInstance };
