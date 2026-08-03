// ═══════════════════════════════════════════════════════════════
// BatBrowser — Download Manager
// Real-time download tracking with pause/cancel/open support.
// ═══════════════════════════════════════════════════════════════

'use strict';

const { session, shell } = require('electron');
const path = require('path');
const Logger = require('../core/Logger');
const { IPC, DOWNLOADS } = require('../core/Constants');

const log = Logger.create('DownloadManager');

/**
 * @typedef {Object} DownloadItem
 * @property {string}  id            - Unique download ID
 * @property {string}  filename      - Base filename
 * @property {string}  savePath      - Full save path
 * @property {number}  totalBytes    - Total file size (-1 if unknown)
 * @property {number}  receivedBytes - Bytes received so far
 * @property {string}  state         - 'progressing'|'completed'|'cancelled'|'interrupted'
 * @property {string}  url           - Source URL
 * @property {number}  startedAt     - Unix ms
 * @property {number}  speed         - Current speed bytes/sec
 * @property {string}  mime          - MIME type
 */

/**
 * DownloadManager — wraps Electron's download API with:
 * - Real-time progress tracking
 * - Pause/resume/cancel
 * - Open file/folder actions
 * - Speed calculation
 * - IPC notifications to renderer
 */
class DownloadManager {
  constructor() {
    /** @type {Map<string, DownloadItem>} */
    this._downloads = new Map();

    /** @type {Map<string, Electron.DownloadItem>} id → native item (for control) */
    this._nativeItems = new Map();

    this._idCounter = 0;

    /** @type {Electron.BrowserWindow|null} */
    this._window = null;

    log.info('DownloadManager initialized');
  }

  /**
   * Attaches to a window for IPC notifications.
   * Must be called before any downloads can be tracked.
   * @param {Electron.BrowserWindow} win
   */
  attachWindow(win) {
    this._window = win;
  }

  /**
   * Sets up download event handling on the provided session.
   * Call once during app initialization.
   * @param {Electron.Session} ses
   */
  setup(ses) {
    ses.on('will-download', (event, item, webContents) => {
      this._handleWillDownload(item, webContents);
    });
    log.info('Download handler attached to session');
  }

  /**
   * @private
   */
  _handleWillDownload(item, webContents) {
    const id = `dl_${Date.now()}_${++this._idCounter}`;

    const dlInfo = {
      id,
      filename:      item.getFilename(),
      savePath:      item.getSavePath() || '',
      totalBytes:    item.getTotalBytes(),
      receivedBytes: 0,
      state:         'progressing',
      url:           item.getURL(),
      startedAt:     Date.now(),
      speed:         0,
      mime:          item.getMimeType() || 'application/octet-stream',
    };

    this._downloads.set(id, dlInfo);
    this._nativeItems.set(id, item);

    log.info(`Download started: ${dlInfo.filename}`, { id, url: dlInfo.url });
    this._notify(IPC.DOWNLOAD_STARTED, { ...dlInfo });

    let lastBytes = 0;
    let lastTime  = Date.now();

    item.on('updated', (event, state) => {
      const now = Date.now();
      const received = item.getReceivedBytes();
      const elapsed = (now - lastTime) / 1000;

      dlInfo.receivedBytes = received;
      dlInfo.state         = state;
      dlInfo.savePath      = item.getSavePath() || dlInfo.savePath;
      dlInfo.speed         = elapsed > 0 ? Math.round((received - lastBytes) / elapsed) : 0;

      lastBytes = received;
      lastTime  = now;

      this._notify(IPC.DOWNLOAD_PROGRESS, { ...dlInfo });
    });

    item.once('done', (event, state) => {
      dlInfo.state         = state;
      dlInfo.receivedBytes = item.getReceivedBytes();
      dlInfo.savePath      = item.getSavePath() || dlInfo.savePath;
      dlInfo.speed         = 0;

      this._nativeItems.delete(id);

      log.info(`Download ${state}: ${dlInfo.filename}`, { id, savePath: dlInfo.savePath });
      this._notify(IPC.DOWNLOAD_COMPLETED, { ...dlInfo });

      // Auto-clean completed after retention period
      setTimeout(() => {
        this._downloads.delete(id);
      }, DOWNLOADS.COMPLETED_RETENTION_MS);
    });
  }

  /**
   * Cancels a download.
   * @param {string} id
   */
  cancel(id) {
    const item = this._nativeItems.get(id);
    if (!item) {
      log.warn(`Cancel: download ${id} not found or already done`);
      return;
    }
    item.cancel();
    const dl = this._downloads.get(id);
    if (dl) {
      dl.state = 'cancelled';
      this._notify(IPC.DOWNLOAD_CANCELLED, { ...dl });
    }
    log.info(`Download cancelled: ${id}`);
  }

  /**
   * Opens a completed download file.
   * @param {string} id
   */
  async openFile(id) {
    const dl = this._downloads.get(id);
    if (!dl || !dl.savePath) return;
    try {
      await shell.openPath(dl.savePath);
    } catch (err) {
      log.error(`Failed to open file: ${dl.savePath}`, err);
    }
  }

  /**
   * Opens the downloads folder.
   */
  async openFolder() {
    const { app } = require('electron');
    const downloadPath = app.getPath('downloads');
    await shell.openPath(downloadPath);
  }

  /**
   * Clears completed/cancelled downloads from the list.
   */
  clearCompleted() {
    for (const [id, dl] of this._downloads) {
      if (dl.state === 'completed' || dl.state === 'cancelled' || dl.state === 'interrupted') {
        this._downloads.delete(id);
      }
    }
  }

  /**
   * Returns all tracked downloads (active and recent).
   * @returns {DownloadItem[]}
   */
  getAll() {
    return Array.from(this._downloads.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Returns active (in-progress) downloads.
   * @returns {DownloadItem[]}
   */
  getActive() {
    return this.getAll().filter(d => d.state === 'progressing');
  }

  /**
   * Sends an IPC notification to the renderer.
   * @private
   */
  _notify(channel, data) {
    if (this._window && !this._window.isDestroyed()) {
      this._window.webContents.send(channel, data);
    }
  }
}

// Singleton
let _instance = null;

function getInstance() {
  if (!_instance) _instance = new DownloadManager();
  return _instance;
}

module.exports = { DownloadManager, getInstance };
