// ═══════════════════════════════════════════════════════════════
// BatBrowser — Bookmark Store
// Full bookmark management: add, remove, folders, reorder, search.
// ═══════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const Logger = require('../core/Logger');

const log = Logger.create('BookmarkStore');

/**
 * @typedef {Object} Bookmark
 * @property {string}  id        - Unique ID
 * @property {string}  url       - Full URL
 * @property {string}  title     - Display title
 * @property {string}  favicon   - Favicon URL or data: URI
 * @property {string|null} folderId - Parent folder ID (null = root)
 * @property {number}  addedAt   - Unix milliseconds
 * @property {number}  order     - Sort order within folder
 */

/**
 * @typedef {Object} BookmarkFolder
 * @property {string}  id        - Unique ID
 * @property {string}  name      - Display name
 * @property {string|null} parentId - Parent folder (null = root)
 * @property {number}  addedAt   - Unix milliseconds
 * @property {number}  order     - Sort order
 */

const ROOT_FOLDER_ID = null;

/**
 * BookmarkStore — full bookmark management system.
 * Native zero-dependency replacement for electron-store.
 */
class BookmarkStore {
  constructor() {
    this._filePath = path.join(app.getPath('userData'), 'batbrowser-bookmarks.json');
    this._bookmarks = [];
    this._folders = [];
    this._load();

    // Fast lookup index
    /** @type {Map<string, Bookmark>} */
    this._bookmarkById = new Map(this._bookmarks.map(b => [b.id, b]));

    /** @type {Map<string, Bookmark>} url → bookmark (for isBookmarked checks) */
    this._bookmarkByUrl = new Map(this._bookmarks.map(b => [b.url, b]));

    /** @type {Map<string, BookmarkFolder>} */
    this._folderById = new Map(this._folders.map(f => [f.id, f]));

    log.info('BookmarkStore initialized natively', {
      bookmarks: this._bookmarks.length,
      folders:   this._folders.length,
      path:      this._filePath,
    });
  }

  /** Load data from file synchronously */
  _load() {
    try {
      if (fs.existsSync(this._filePath)) {
        const fileContent = fs.readFileSync(this._filePath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        this._bookmarks = Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [];
        this._folders = Array.isArray(parsed.folders) ? parsed.folders : [];
      } else {
        this._persist();
      }
    } catch (err) {
      log.error('Failed to load bookmarks file, initializing empty', err);
      this._bookmarks = [];
      this._folders = [];
    }
  }

  // ─── Folders ───────────────────────────────────────────────────

  /**
   * Creates a new bookmark folder.
   * @param {string} name
   * @param {string|null} parentId
   * @returns {BookmarkFolder}
   */
  createFolder(name, parentId = ROOT_FOLDER_ID) {
    const folder = {
      id:       `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name:     name.trim().slice(0, 128),
      parentId: parentId,
      addedAt:  Date.now(),
      order:    this._folders.filter(f => f.parentId === parentId).length,
    };

    this._folders.push(folder);
    this._folderById.set(folder.id, folder);
    this._persist();

    log.debug(`Created folder: ${folder.name}`, { id: folder.id });
    return folder;
  }

  /**
   * Renames a folder.
   * @param {string} id
   * @param {string} name
   */
  renameFolder(id, name) {
    const folder = this._folderById.get(id);
    if (!folder) return;
    folder.name = name.trim().slice(0, 128);
    this._persist();
  }

  /**
   * Deletes a folder and all its bookmarks.
   * @param {string} id
   */
  deleteFolder(id) {
    // Delete all bookmarks in this folder
    const toDelete = this._bookmarks.filter(b => b.folderId === id);
    toDelete.forEach(b => {
      this._bookmarkById.delete(b.id);
      this._bookmarkByUrl.delete(b.url);
    });
    this._bookmarks = this._bookmarks.filter(b => b.folderId !== id);

    // Delete child folders recursively
    const childFolders = this._folders.filter(f => f.parentId === id);
    childFolders.forEach(f => this.deleteFolder(f.id));

    // Delete the folder itself
    this._folders = this._folders.filter(f => f.id !== id);
    this._folderById.delete(id);
    this._persist();
  }

  /**
   * Returns all folders.
   * @returns {BookmarkFolder[]}
   */
  getFolders() {
    return [...this._folders];
  }

  // ─── Bookmarks ─────────────────────────────────────────────────

  /**
   * Adds a new bookmark.
   * If the URL is already bookmarked, returns the existing one.
   *
   * @param {string} url
   * @param {string} title
   * @param {string|null} folderId
   * @param {string} favicon
   * @returns {Bookmark}
   */
  add(url, title, folderId = ROOT_FOLDER_ID, favicon = '') {
    // Return existing if already bookmarked
    if (this._bookmarkByUrl.has(url)) {
      return this._bookmarkByUrl.get(url);
    }

    const siblingsInFolder = this._bookmarks.filter(b => b.folderId === folderId);

    const bookmark = {
      id:       `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      url:      url.trim(),
      title:    (title || url).trim().slice(0, 512),
      favicon:  favicon || '',
      folderId: folderId,
      addedAt:  Date.now(),
      order:    siblingsInFolder.length,
    };

    this._bookmarks.push(bookmark);
    this._bookmarkById.set(bookmark.id, bookmark);
    this._bookmarkByUrl.set(bookmark.url, bookmark);
    this._persist();

    log.debug(`Bookmark added: ${bookmark.title}`, { id: bookmark.id, url: bookmark.url });
    return bookmark;
  }

  /**
   * Removes a bookmark by ID.
   * @param {string} id
   */
  remove(id) {
    const bookmark = this._bookmarkById.get(id);
    if (!bookmark) return;

    this._bookmarks = this._bookmarks.filter(b => b.id !== id);
    this._bookmarkById.delete(id);
    this._bookmarkByUrl.delete(bookmark.url);
    this._persist();

    log.debug(`Bookmark removed: ${id}`);
  }

  /**
   * Removes a bookmark by URL.
   * @param {string} url
   */
  removeByUrl(url) {
    const bookmark = this._bookmarkByUrl.get(url);
    if (bookmark) this.remove(bookmark.id);
  }

  /**
   * Updates a bookmark's title or folder.
   * @param {string} id
   * @param {Partial<Pick<Bookmark, 'title'|'folderId'>>} updates
   */
  update(id, updates) {
    const bookmark = this._bookmarkById.get(id);
    if (!bookmark) return;

    if (updates.title !== undefined) {
      bookmark.title = updates.title.trim().slice(0, 512);
    }
    if (updates.folderId !== undefined) {
      bookmark.folderId = updates.folderId;
    }

    this._persist();
  }

  /**
   * Checks if a URL is already bookmarked.
   * O(1) — uses URL index.
   *
   * @param {string} url
   * @returns {boolean}
   */
  isBookmarked(url) {
    return this._bookmarkByUrl.has(url);
  }

  /**
   * Returns the bookmark for a URL, or null.
   * @param {string} url
   * @returns {Bookmark|null}
   */
  getByUrl(url) {
    return this._bookmarkByUrl.get(url) || null;
  }

  /**
   * Returns all bookmarks in a folder.
   * @param {string|null} folderId  null = root
   * @returns {Bookmark[]}
   */
  getInFolder(folderId = ROOT_FOLDER_ID) {
    return this._bookmarks
      .filter(b => b.folderId === folderId)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Returns all bookmarks, sorted by addedAt descending.
   * @returns {Bookmark[]}
   */
  getAll() {
    return [...this._bookmarks].sort((a, b) => b.addedAt - a.addedAt);
  }

  /**
   * Full-text search across title and URL.
   * @param {string} query
   * @param {number} [limit=20]
   * @returns {Bookmark[]}
   */
  search(query, limit = 20) {
    const terms = query.toLowerCase().trim().split(/\s+/);
    return this._bookmarks
      .filter(b => {
        const hay = (b.title + ' ' + b.url).toLowerCase();
        return terms.every(t => hay.includes(t));
      })
      .slice(0, limit);
  }

  /**
   * Returns the complete tree structure (folders + bookmarks).
   * @returns {{ folders: BookmarkFolder[], bookmarks: Bookmark[] }}
   */
  getTree() {
    return {
      folders:   this.getFolders(),
      bookmarks: this.getAll(),
    };
  }

  /**
   * Returns recent bookmarks for the sidebar / new tab page.
   * @param {number} [limit=10]
   * @returns {Bookmark[]}
   */
  getRecent(limit = 10) {
    return [...this._bookmarks]
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, limit);
  }

  /**
   * Persists in-memory state to disk.
   * @private
   */
  _persist() {
    try {
      fs.writeFileSync(this._filePath, JSON.stringify({
        bookmarks: this._bookmarks,
        folders:   this._folders,
      }, null, 2), 'utf-8');
    } catch (err) {
      log.error('Failed to persist bookmarks', err);
    }
  }
}

// Singleton
let _instance = null;

function getInstance() {
  if (!_instance) _instance = new BookmarkStore();
  return _instance;
}

module.exports = { BookmarkStore, getInstance };
