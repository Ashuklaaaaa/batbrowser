// ═══════════════════════════════════════════════════════════════
// BatBrowser — Window Geometry
// Pure functions for calculating BrowserView bounds.
// Keeps all layout math in one testable, reusable place.
// ═══════════════════════════════════════════════════════════════

'use strict';

const { WINDOW } = require('../core/Constants');

/**
 * Calculates the content area bounds for a BrowserView.
 * This is the area below the browser chrome (titlebar + toolbar).
 *
 * @param {Electron.BrowserWindow} win
 * @param {{ sidebarOpen?: boolean, sidebarWidth?: number, sidebarPosition?: 'left'|'right' }} [opts]
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function getContentBounds(win, opts = {}) {
  if (!win || win.isDestroyed()) {
    return { x: WINDOW.SIDEBAR_RAIL_W, y: WINDOW.CHROME_HEIGHT, width: 800, height: 600 - WINDOW.CHROME_HEIGHT };
  }

  const [winWidth, winHeight] = win.getContentSize();
  const {
    sidebarOpen     = false,
    sidebarWidth    = 280,
    sidebarPosition = 'left',
  } = opts;

  const y      = WINDOW.CHROME_HEIGHT;
  const height = Math.max(0, winHeight - WINDOW.CHROME_HEIGHT);

  // The sidebar rail is always 52px wide on the left
  const railWidth = WINDOW.SIDEBAR_RAIL_W;
  let x     = railWidth;
  let width = Math.max(0, winWidth - railWidth);

  // When the full sidebar panel is open, add its width too
  if (sidebarOpen && sidebarPosition === 'left') {
    x     = railWidth + sidebarWidth;
    width = Math.max(0, winWidth - railWidth - sidebarWidth);
  } else if (sidebarOpen && sidebarPosition === 'right') {
    width = Math.max(0, winWidth - railWidth - sidebarWidth);
  }

  return { x, y, width, height };
}

/**
 * Returns auto-resize options for BrowserViews.
 * Ensures views fill available space on resize.
 *
 * @returns {Electron.AutoResizeOptions}
 */
function getAutoResizeOptions() {
  return { width: true, height: true, horizontal: false, vertical: false };
}

module.exports = { getContentBounds, getAutoResizeOptions };
