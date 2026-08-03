// ═══════════════════════════════════════════════════════════════
// BatBrowser — Renderer Process
// Manages all UI interactions in the browser chrome.
// Uses window.batBrowser (contextBridge API) exclusively.
// ═══════════════════════════════════════════════════════════════

'use strict';

/* eslint-disable no-undef */

const bb = window.batBrowser;

// ─── DOM Element Cache ────────────────────────────────────────────

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const els = {
  // Tab bar (now in #tabbar, not titlebar)
  tabsScroll:    $('#tabs-scroll'),
  newTabBtn:     $('#new-tab-btn'),

  // Window controls
  minBtn:        $('#min-btn'),
  maxBtn:        $('#max-btn'),
  closeBtn:      $('#close-btn'),

  // Toolbar navigation
  backBtn:       $('#back-btn'),
  forwardBtn:    $('#forward-btn'),
  reloadBtn:     $('#reload-btn'),
  reloadIcon:    $('#reload-btn .icon-reload'),
  stopIcon:      $('#reload-btn .icon-stop'),

  // Omnibar
  omnibarWrap:   $('#omnibar-wrap'),
  securityBtn:   $('#security-btn'),
  omnibar:       $('#omnibar'),
  suggestions:   $('#omni-suggestions'),
  bookmarkBtn:   $('#bookmark-btn'),

  // Toolbar actions
  zoomIndicator: $('#zoom-indicator'),
  cmdBtn:        $('#cmd-btn'),
  menuBtn:       $('#menu-btn'),

  // Progress
  pageProgress:  $('#page-progress'),
  progressBar:   $('#page-progress-bar'),

  // Sidebar rail buttons
  railBookmarks: $('#rail-bookmarks'),
  railHistory:   $('#rail-history'),
  railDownloads: $('#rail-downloads'),
  railShield:    $('#rail-shield'),
  railSettings:  $('#rail-settings'),
  adblockRailBadge: $('#adblock-rail-badge'),

  // Sidebar panel
  sidebarPanel:  $('#sidebar-panel'),
  sidebarPanelTitle: $('#sidebar-panel-title'),
  sidebarPanelClose: $('#sidebar-panel-close'),
  sidebarPanes: {
    bookmarks: $('#sidebar-pane-bookmarks'),
    history:   $('#sidebar-pane-history'),
    downloads: $('#sidebar-pane-downloads'),
  },

  // Find bar
  findBar:       $('#find-bar'),
  findInput:     $('#find-input'),
  findInfo:      $('#find-info'),
  findPrev:      $('#find-prev'),
  findNext:      $('#find-next'),
  findClose:     $('#find-close'),

  // Command palette
  paletteOverlay: $('#command-palette-overlay'),
  paletteInput:   $('#palette-input'),
  paletteResults: $('#palette-results'),

  // Download bar
  downloadBar:   $('#download-bar'),

  // Toast
  toastContainer: $('#toast-container'),
};

// Backward-compat aliases so older code paths keep working
els.sidebar = els.sidebarPanel;        // sidebar.classList.toggle('open')
els.adblockBtn = els.railShield;       // adblockBtn.querySelector('button') → handle below
els.adblockBadge = els.adblockRailBadge;
els.downloadsBtn = els.railDownloads;

// ─── App State ────────────────────────────────────────────────────

const state = {
  activeTabId:    null,
  tabs:           new Map(),   // id → tab data
  groups:         new Map(),   // id → group data
  adBlockEnabled: true,
  adBlockStats:   { ads: 0, trackers: 0 },
  zoomLevel:      100,
  sidebarOpen:    false,
  currentBookmarks: [],
  downloads:      new Map(),   // id → download info
  isMaximized:    false,
  isFullscreen:   false,
};

// ─── Cleanup Registry ─────────────────────────────────────────────

const cleanups = [];
function onCleanup(fn) { cleanups.push(fn); }

// ─── Window Controls ──────────────────────────────────────────────

els.minBtn.addEventListener('click',   () => bb.window.minimize());
els.maxBtn.addEventListener('click',   () => bb.window.maximize());
els.closeBtn.addEventListener('click', () => bb.window.close());

onCleanup(bb.onWindowStateChanged(({ maximized, fullscreen }) => {
  if (maximized !== undefined) {
    state.isMaximized = maximized;
    const restoreIcon  = $('#max-icon-restore');
    const maximizeIcon = $('#max-icon-maximize');
    if (restoreIcon && maximizeIcon) {
      restoreIcon.style.display  = maximized ? '' : 'none';
      maximizeIcon.style.display = maximized ? 'none' : '';
    }
    els.maxBtn.title = maximized ? 'Restore' : 'Maximize';
  }
  if (fullscreen !== undefined) {
    state.isFullscreen = fullscreen;
    document.getElementById('app').classList.toggle('fullscreen', fullscreen);
  }
}));

// ─── Navigation Buttons ───────────────────────────────────────────

els.backBtn.addEventListener('click',    () => bb.nav.back());
els.forwardBtn.addEventListener('click', () => bb.nav.forward());

els.reloadBtn.addEventListener('click', () => {
  const tab = state.tabs.get(state.activeTabId);
  if (tab && tab.isLoading) {
    bb.nav.stop();
  } else {
    bb.nav.reload();
  }
});

els.downloadsBtn.addEventListener('click', () => {
  bb.tab.create('bat://downloads');
});

els.menuBtn.addEventListener('click', () => bb.menu.open());

// ─── Tab Management ───────────────────────────────────────────────

els.newTabBtn.addEventListener('click', () => bb.tab.create());

/**
 * Renders the tab strip from state.
 * Called on every tabs:updated event.
 */
function renderTabs() {
  const { tabs, activeId } = { tabs: [...state.tabs.values()], activeId: state.activeTabId };

  // #new-tab-btn lives inside #tabs-scroll — keep reference so tabs insert before it
  const newTabBtn = els.newTabBtn;

  // Build map of existing tab elements
  const existing = new Map($$('.tab', els.tabsScroll).map(el => [+el.dataset.tabId, el]));
  const rendered = new Set();

  tabs.forEach((tab) => {
    rendered.add(tab.id);
    let el = existing.get(tab.id);

    if (!el) {
      el = createTabElement(tab);
      // Insert before #new-tab-btn so "+" always stays at the end
      els.tabsScroll.insertBefore(el, newTabBtn);
    } else {
      updateTabElement(el, tab, tab.id === activeId);
    }
  });

  // Remove tabs no longer in state
  existing.forEach((el, id) => {
    if (!rendered.has(id)) el.remove();
  });

  // Re-order DOM to match state order (insertBefore newTabBtn)
  const orderedIds = [...state.tabs.keys()];
  orderedIds.forEach(id => {
    const el = els.tabsScroll.querySelector(`[data-tab-id="${id}"]`);
    if (el) els.tabsScroll.insertBefore(el, newTabBtn);
  });
}

/**
 * Creates a tab DOM element.
 * @param {object} tab
 * @returns {HTMLElement}
 */
function createTabElement(tab) {
  const el = document.createElement('div');
  el.className = 'tab';
  el.dataset.tabId = tab.id;
  el.setAttribute('role', 'tab');
  el.setAttribute('aria-selected', tab.id === state.activeTabId);
  el.title = tab.title;

  // Build inner HTML safely
  const iconDiv = document.createElement('div');
  iconDiv.className = 'tab-icon';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'tab-title';
  titleDiv.textContent = tab.title || 'New Tab'; // textContent = XSS safe

  // Close button — use <button> for proper click semantics
  const closeDiv = document.createElement('button');
  closeDiv.className = 'tab-close';
  closeDiv.setAttribute('tabindex', '-1');
  closeDiv.setAttribute('aria-label', `Close ${tab.title || 'tab'}`);
  closeDiv.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  el.appendChild(iconDiv);
  el.appendChild(titleDiv);
  el.appendChild(closeDiv);

  // Group indicator
  if (tab.groupId && state.groups.has(tab.groupId)) {
    const group = state.groups.get(tab.groupId);
    const dot = document.createElement('div');
    dot.className = 'tab-group-dot';
    dot.style.background = group.color || '#6366f1';
    el.insertBefore(dot, iconDiv);
  }

  updateTabElement(el, tab, tab.id === state.activeTabId);

  // Click → switch (only when not clicking the close button)
  el.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      // Don't switch if the close button was clicked
      if (e.target.closest('.tab-close')) return;
      bb.tab.switch(tab.id);
    } else if (e.button === 1) {
      e.preventDefault();
      bb.tab.close(tab.id);
    }
  });

  // Close button — use mousedown to fire before tab's mousedown
  closeDiv.addEventListener('mousedown', (e) => {
    e.stopPropagation(); // stop parent mousedown (which would switch tab)
    e.preventDefault();
  });

  closeDiv.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    bb.tab.close(tab.id);
  });

  // Right-click → tab context menu
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showTabContextMenu(tab.id, e.clientX, e.clientY);
  });

  return el;
}

/**
 * Shows a context menu for a tab.
 * @param {number} tabId
 * @param {number} x
 * @param {number} y
 */
function showTabContextMenu(tabId, x, y) {
  const tab = state.tabs.get(tabId);
  if (!tab) return;

  // Remove any existing context menu
  closeTabContextMenu();

  const menu = document.createElement('div');
  menu.id = 'tab-context-menu';
  menu.className = 'tab-ctx-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Tab options');

  const items = [
    {
      icon: tab.isPinned
        ? '<path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>'
        : '<path d="M14 4v5l2 4H8l2-4V4h4m3-2H7v2h1v4.5L6 11v1h5v6h2v-6h5v-1l-2-2.5V4h1V2z"/>',
      label: tab.isPinned ? 'Unpin Tab' : 'Pin Tab',
      action: () => bb.tab.pin(tabId, !tab.isPinned),
      separator: false,
    },
    {
      icon: tab.isMuted
        ? '<path d="M4.34 2.93L2.93 4.34 7.29 8.7 7 9H3v6h4l5 5v-6.59l4.18 4.18c-.65.49-1.38.88-2.18 1.11v2.06c1.34-.3 2.57-.92 3.61-1.75l2.05 2.05 1.41-1.41L4.34 2.93zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zm-7-8l-1.88 1.88L12 7.76zm4.5 8c0-1.77-1.02-3.29-2.5-4.03v1.79l2.48 2.48c.01-.08.02-.16.02-.24z"/>'
        : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>',
      label: tab.isMuted ? 'Unmute Tab' : 'Mute Tab',
      action: () => bb.tab.mute(tabId, !tab.isMuted),
      separator: false,
    },
    {
      icon: '<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>',
      label: 'Duplicate Tab',
      action: () => bb.tab.duplicate(tabId),
      separator: true,
    },
    {
      icon: '<path d="M19 11H7.83l4.88-4.88c.39-.39.39-1.03 0-1.42-.39-.39-1.02-.39-1.41 0l-6.59 6.59c-.39.39-.39 1.02 0 1.41l6.59 6.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L7.83 13H19c.55 0 1-.45 1-1s-.45-1-1-1z"/>',
      label: 'Close Tab',
      action: () => closeTabAnimated(tabId),
      separator: false,
      danger: false,
    },
    {
      icon: '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
      label: 'Close Other Tabs',
      action: () => {
        const otherIds = [...state.tabs.keys()].filter(id => id !== tabId);
        otherIds.forEach(id => bb.tab.close(id));
      },
      separator: false,
      danger: true,
    },
  ];

  items.forEach(({ icon, label, action, separator, danger }) => {
    if (separator) {
      const div = document.createElement('div');
      div.className = 'tab-ctx-sep';
      menu.appendChild(div);
    }
    const item = document.createElement('button');
    item.className = `tab-ctx-item${danger ? ' tab-ctx-item--danger' : ''}`;
    item.setAttribute('role', 'menuitem');
    item.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>
      <span>${escapeHtml(label)}</span>
    `;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTabContextMenu();
      action();
    });
    menu.appendChild(item);
  });

  // Position the menu
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const maxX = window.innerWidth  - rect.width  - 8;
  const maxY = window.innerHeight - rect.height - 8;
  menu.style.left = Math.min(x, maxX) + 'px';
  menu.style.top  = Math.min(y, maxY) + 'px';
  menu.classList.add('tab-ctx-menu--open');

  // Close on outside click / escape
  const dismiss = (e) => {
    if (!menu.contains(e.target)) closeTabContextMenu();
  };
  const dismissKey = (e) => {
    if (e.key === 'Escape') closeTabContextMenu();
  };
  setTimeout(() => {
    document.addEventListener('mousedown', dismiss, { once: true });
    document.addEventListener('keydown', dismissKey, { once: true });
  }, 0);
}

function closeTabContextMenu() {
  const existing = document.getElementById('tab-context-menu');
  if (existing) {
    existing.classList.remove('tab-ctx-menu--open');
    setTimeout(() => existing.remove(), 120);
  }
}

/**
 * Closes a tab with a width-collapse animation before calling bb.tab.close().
 * Makes remaining tabs smoothly fill the space.
 * @param {number} tabId
 */
function closeTabAnimated(tabId) {
  const el = els.tabsScroll.querySelector(`[data-tab-id="${tabId}"]`);
  if (!el) {
    bb.tab.close(tabId);
    return;
  }

  // Animate collapse: shrink width to 0 and fade out
  const w = el.getBoundingClientRect().width;
  el.style.maxWidth   = w + 'px';
  el.style.minWidth   = w + 'px';
  el.style.overflow   = 'hidden';
  el.style.transition = 'max-width 180ms cubic-bezier(0.4,0,1,1), min-width 180ms cubic-bezier(0.4,0,1,1), opacity 120ms ease, padding 180ms ease';

  requestAnimationFrame(() => {
    el.style.maxWidth = '0';
    el.style.minWidth = '0';
    el.style.opacity  = '0';
    el.style.paddingLeft  = '0';
    el.style.paddingRight = '0';
  });

  setTimeout(() => {
    bb.tab.close(tabId);
  }, 180);
}

/**
 * Updates a tab element in-place with new data.
 * @param {HTMLElement} el
 * @param {object}      tab
 * @param {boolean}     isActive
 */
function updateTabElement(el, tab, isActive) {
  el.className = [
    'tab',
    isActive   ? 'active'   : '',
    tab.isPinned   ? 'pinned'   : '',
    tab.isSleeping ? 'sleeping' : '',
    tab.isAudible  ? 'audible'  : '',
  ].filter(Boolean).join(' ');

  el.setAttribute('aria-selected', isActive);
  el.title = tab.title || 'New Tab';

  // Icon
  const iconDiv = el.querySelector('.tab-icon');
  if (iconDiv) {
    if (tab.isLoading) {
      iconDiv.innerHTML = '<div class="tab-spinner"></div>';
    } else if (tab.favicon) {
      iconDiv.innerHTML = `<img src="${escapeAttr(tab.favicon)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
    } else {
      iconDiv.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
    }
  }

  // Title
  const titleDiv = el.querySelector('.tab-title');
  if (titleDiv) titleDiv.textContent = tab.title || 'New Tab';

  // Reload/Stop button state
  if (tab.id === state.activeTabId) {
    updateLoadingState(tab.isLoading, tab.canGoBack, tab.canGoForward);
  }
}

// ─── IPC: Tab Events ──────────────────────────────────────────────

onCleanup(bb.onTabsUpdated((data) => {
  state.activeTabId = data.activeId;
  state.tabs.clear();
  data.tabs.forEach(t => state.tabs.set(t.id, t));
  state.groups.clear();
  if (data.groups) data.groups.forEach(g => state.groups.set(g.id, g));
  renderTabs();
  updateOmnibarForActiveTab();
}));

onCleanup(bb.onActiveTabChanged((tabId) => {
  state.activeTabId = tabId;
}));

// ─── Toolbar State ────────────────────────────────────────────────

/**
 * Updates back/forward buttons and reload/stop state.
 */
function updateLoadingState(isLoading, canGoBack, canGoForward) {
  els.backBtn.disabled    = !canGoBack;
  els.forwardBtn.disabled = !canGoForward;

  if (isLoading) {
    els.reloadBtn.classList.add('loading');
    els.reloadIcon.style.display = 'none';
    els.stopIcon.style.display   = '';
    els.pageProgress.classList.add('indeterminate');
    els.pageProgress.style.display = '';
  } else {
    els.reloadBtn.classList.remove('loading');
    els.reloadIcon.style.display = '';
    els.stopIcon.style.display   = 'none';
    els.pageProgress.classList.remove('indeterminate');
    setTimeout(() => { els.pageProgress.style.display = 'none'; }, 300);
  }
}

/**
 * Updates the omnibar to reflect the active tab's URL/security.
 */
function updateOmnibarForActiveTab() {
  const tab = state.tabs.get(state.activeTabId);
  if (!tab) return;

  updateLoadingState(tab.isLoading, tab.canGoBack, tab.canGoForward);

  // Omnibar value: show clean display URL unless user is editing
  if (document.activeElement !== els.omnibar) {
    els.omnibar.value = tab.displayUrl || '';
  }

  // Security class on omnibar-wrap
  els.omnibarWrap.className = '';
  if (tab.security) els.omnibarWrap.classList.add('omni-' + tab.security);

  // Security icon visibility (button now uses .icon-secure/.icon-insecure/.icon-internal/.icon-default)
  const secBtn = els.securityBtn || $('#security-btn');
  if (secBtn) {
    $$('svg', secBtn).forEach(svg => svg.style.display = 'none');
    const secClass = {
      secure:   '.icon-secure',
      insecure: '.icon-insecure',
      internal: '.icon-internal',
    }[tab.security] || '.icon-default';
    const targetIcon = $(secClass, secBtn);
    if (targetIcon) targetIcon.style.display = '';
  }

  // Bookmark state
  updateBookmarkButton(tab.url);
}

onCleanup(bb.onTabUrlUpdated((tabId, url) => {
  const tab = state.tabs.get(tabId);
  if (tab) tab.url = url;
  if (tabId === state.activeTabId) updateOmnibarForActiveTab();
}));

onCleanup(bb.onTabLoadingChanged((tabId, isLoading) => {
  const tab = state.tabs.get(tabId);
  if (tab) tab.isLoading = isLoading;
  if (tabId === state.activeTabId) updateOmnibarForActiveTab();
}));

onCleanup(bb.onTabNavState((tabId, navState) => {
  const tab = state.tabs.get(tabId);
  if (tab) Object.assign(tab, navState);
  if (tabId === state.activeTabId) {
    els.backBtn.disabled    = !navState.canGoBack;
    els.forwardBtn.disabled = !navState.canGoForward;
  }
}));

onCleanup(bb.onTabCrashed((tabId) => {
  const tab = state.tabs.get(tabId);
  if (!tab) return;
  showCrashOverlay(tabId, tab.title);
}));

/**
 * Shows a crash recovery overlay when a tab renderer crashes.
 */
function showCrashOverlay(tabId, title) {
  const existing = document.getElementById(`crash-overlay-${tabId}`);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = `crash-overlay-${tabId}`;
  overlay.className = 'tab-crashed-overlay';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'background:var(--bg)',
    'color:var(--text)',
    'gap:16px',
    'z-index:999',
    'font-family:var(--font-sans)',
  ].join(';');
  overlay.innerHTML = `
    <svg style="width:48px;height:48px;fill:var(--danger)" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>
    <div style="font-size:18px;font-weight:600">Tab Crashed</div>
    <div style="font-size:13px;color:var(--text-muted);max-width:360px;text-align:center">
      "${escapeHtml(title || 'This tab')}" stopped responding.
    </div>
    <button class="crash-reload-btn"
      style="background:var(--accent);color:var(--bg);border:none;border-radius:8px;padding:10px 24px;font-size:13px;font-weight:600;cursor:pointer;">
      Reload Tab
    </button>
  `;

  overlay.querySelector('.crash-reload-btn').addEventListener('click', () => {
    bb.nav.reload();
    overlay.remove();
  });

  document.getElementById('app').appendChild(overlay);
}

// ─── Omnibar ──────────────────────────────────────────────────────

let suggestionsVisible = false;
let debounceTimer;
let currentFocus = -1;

function setSuggestionsVisible(visible) {
  suggestionsVisible = visible;
  els.suggestions.classList.toggle('visible', visible);
  els.omnibar.setAttribute('aria-expanded', visible);

  if (visible) {
    bb.ui.hideTab();
  } else {
    bb.ui.showTab();
    currentFocus = -1;
  }
}

els.omnibar.addEventListener('focus', () => {
  // Select all text for easy replacement
  setTimeout(() => els.omnibar.select(), 10);
});

els.omnibar.addEventListener('blur', () => {
  // Delay to allow click on suggestion
  setTimeout(() => setSuggestionsVisible(false), 150);
});

els.omnibar.addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  const query = e.target.value.trim();
  currentFocus = -1;

  if (!query) {
    setSuggestionsVisible(false);
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const suggestions = await bb.suggestions.get(query);
      renderSuggestions(query, suggestions);
    } catch {
      setSuggestionsVisible(false);
    }
  }, 120);
});

/**
 * Renders search suggestions dropdown.
 */
function renderSuggestions(query, suggestions) {
  if (!suggestions || suggestions.length === 0) {
    setSuggestionsVisible(false);
    return;
  }

  els.suggestions.innerHTML = '';
  currentFocus = -1;

  // Add current input as first option if it looks like a URL
  const isUrl = /^https?:\/\/|^www\./.test(query);
  const items = isUrl ? [{ text: query, type: 'url' }] : [];

  suggestions.forEach(s => {
    items.push({ text: s, type: 'search' });
  });

  items.slice(0, 8).forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'sug-item';
    div.setAttribute('role', 'option');
    div.setAttribute('aria-selected', 'false');
    div.dataset.index = i;

    const iconSvg = item.type === 'url'
      ? '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';

    div.innerHTML = `
      <span class="sug-icon">${iconSvg}</span>
      <span class="sug-text"></span>
      <span class="sug-type">${item.type === 'url' ? 'Navigate' : 'Search'}</span>
    `;
    div.querySelector('.sug-text').textContent = item.text; // XSS safe

    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      navigateTo(item.text);
    });

    els.suggestions.appendChild(div);
  });

  setSuggestionsVisible(true);
}

els.omnibar.addEventListener('keydown', (e) => {
  const items = $$('.sug-item', els.suggestions);

  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      if (currentFocus >= 0 && items[currentFocus]) {
        navigateTo(items[currentFocus].querySelector('.sug-text').textContent);
      } else {
        navigateTo(els.omnibar.value.trim());
      }
      els.omnibar.blur();
      setSuggestionsVisible(false);
      break;

    case 'ArrowDown':
      e.preventDefault();
      currentFocus = Math.min(currentFocus + 1, items.length - 1);
      highlightSuggestion(items, currentFocus);
      break;

    case 'ArrowUp':
      e.preventDefault();
      currentFocus = Math.max(currentFocus - 1, -1);
      highlightSuggestion(items, currentFocus);
      break;

    case 'Escape':
      setSuggestionsVisible(false);
      els.omnibar.blur();
      break;

    case 'Tab':
      setSuggestionsVisible(false);
      break;
  }
});

function highlightSuggestion(items, index) {
  items.forEach((item, i) => {
    const active = i === index;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', active);
    if (active) {
      els.omnibar.value = item.querySelector('.sug-text').textContent;
    }
  });
}

function navigateTo(input) {
  if (!input) return;
  bb.nav.go(input);
}

// ─── Focus omnibar from main process ─────────────────────────────

onCleanup(bb.onOmnibarFocus(() => {
  els.omnibar.focus();
  els.omnibar.select();
}));

// ─── Bookmark Button ──────────────────────────────────────────────

async function updateBookmarkButton(url) {
  if (!url || url.startsWith('file://')) {
    els.bookmarkBtn.classList.remove('bookmarked');
    return;
  }
  try {
    const isBookmarked = await bb.bookmarks.isBookmarked(url);
    els.bookmarkBtn.classList.toggle('bookmarked', isBookmarked);
    els.bookmarkBtn.title = isBookmarked ? 'Remove bookmark (Ctrl+D)' : 'Bookmark this page (Ctrl+D)';
  } catch {}
}

els.bookmarkBtn.addEventListener('click', async () => {
  const tab = state.tabs.get(state.activeTabId);
  if (!tab || !tab.url || tab.url.startsWith('file://')) return;

  try {
    const isBookmarked = await bb.bookmarks.isBookmarked(tab.url);
    if (isBookmarked) {
      const bm = await bb.bookmarks.get();
      const existing = bm.bookmarks.find(b => b.url === tab.url);
      if (existing) {
        await bb.bookmarks.remove(existing.id);
        els.bookmarkBtn.classList.remove('bookmarked');
        showToast('Bookmark removed');
      }
    } else {
      await bb.bookmarks.add(tab.url, tab.title, null, tab.favicon);
      els.bookmarkBtn.classList.add('bookmarked');
      showToast('Bookmarked!', 'success');
      loadSidebarBookmarks();
    }
  } catch (err) {
    showToast('Failed to update bookmark', 'error');
  }
});

// Handle bookmark toggle from keyboard shortcut
onCleanup(bb.onBookmarkToggleCurrent(() => {
  els.bookmarkBtn.click();
}));

// ─── Ad Block / Shield ────────────────────────────────────────────

bb.adblock.getStats().then(stats => {
  if (stats) updateAdBlockStats(stats);
});

bb.settings.get().then(settings => {
  if (settings) {
    state.adBlockEnabled = settings.adBlockEnabled !== false;
    updateAdBlockUI();

    // Apply saved theme
    let theme = settings.theme || 'dark';
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = theme;
    if (settings.accentColor) {
      document.documentElement.style.setProperty('--accent', settings.accentColor);
    }
  }
});

function updateAdBlockStats(stats) {
  state.adBlockStats = stats;
  const total = stats.ads + stats.trackers;
  if (total > 0 && els.adblockRailBadge) {
    els.adblockRailBadge.textContent = total > 999 ? '999+' : String(total);
  }
}

function updateAdBlockUI() {
  if (els.railShield) {
    els.railShield.style.color = state.adBlockEnabled ? 'var(--accent)' : 'var(--text-muted)';
    els.railShield.title = state.adBlockEnabled ? 'Ad Blocker: ON' : 'Ad Blocker: OFF';
  }
}

if (els.railShield) {
  els.railShield.addEventListener('click', async () => {
    state.adBlockEnabled = !state.adBlockEnabled;
    await bb.adblock.toggle(state.adBlockEnabled);
    updateAdBlockUI();
    showToast(`Ad Blocker ${state.adBlockEnabled ? 'enabled' : 'disabled'}`);
  });
}

onCleanup(bb.onAdBlockStats((stats) => {
  updateAdBlockStats(stats);
}));

// ─── Zoom Indicator ───────────────────────────────────────────────

let zoomHideTimer;
onCleanup(bb.onZoomChanged((level) => {
  state.zoomLevel = level;
  if (level !== 100) {
    els.zoomIndicator.textContent = `${level}%`;
    els.zoomIndicator.classList.add('visible');
    clearTimeout(zoomHideTimer);
    zoomHideTimer = setTimeout(() => {
      els.zoomIndicator.classList.remove('visible');
    }, 2000);
  } else {
    els.zoomIndicator.classList.remove('visible');
  }
}));

// ─── Sidebar ──────────────────────────────────────────────────────

// ─── Sidebar Rail & Panel ─────────────────────────────────────────

let currentSidebarPanel = null;

function setSidebarOpen(open, panelName) {
  state.sidebarOpen = open;
  els.sidebarPanel.classList.toggle('open', open);

  // Update rail button pressed states
  $$('.rail-btn[data-panel]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.panel === panelName && open));
    btn.classList.toggle('active', btn.dataset.panel === panelName && open);
  });

  if (open && panelName) {
    currentSidebarPanel = panelName;
    // Update panel title
    const titles = { bookmarks: 'Bookmarks', history: 'History', downloads: 'Downloads' };
    if (els.sidebarPanelTitle) els.sidebarPanelTitle.textContent = titles[panelName] || panelName;
    // Show correct pane
    Object.entries(els.sidebarPanes).forEach(([name, pane]) => {
      if (pane) pane.classList.toggle('active', name === panelName);
    });
    loadSidebarContent(panelName);
  }
}

// Backward compat for IPC-driven sidebar toggle
onCleanup(bb.onSidebarToggled((isOpen) => {
  setSidebarOpen(isOpen, currentSidebarPanel || 'bookmarks');
}));

// Rail button clicks
$$('.rail-btn[data-panel]').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = btn.dataset.panel;
    if (state.sidebarOpen && currentSidebarPanel === panel) {
      // Clicking active panel = close
      setSidebarOpen(false, null);
      bb.settings.set('sidebarOpen', false);
    } else {
      setSidebarOpen(true, panel);
      bb.settings.set('sidebarOpen', true);
    }
  });
});

// Close button
if (els.sidebarPanelClose) {
  els.sidebarPanelClose.addEventListener('click', () => {
    setSidebarOpen(false, null);
    bb.settings.set('sidebarOpen', false);
  });
}

// Rail settings → open settings page
if (els.railSettings) {
  els.railSettings.addEventListener('click', () => bb.settings.open());
}

// Rail downloads button → open downloads page
if (els.railDownloads) {
  els.railDownloads.addEventListener('click', () => bb.tab.create('bat://downloads'));
}

async function loadSidebarContent(panel) {
  switch (panel) {
    case 'bookmarks': await loadSidebarBookmarks(); break;
    case 'history':   await loadSidebarHistory();   break;
    case 'downloads': await loadSidebarDownloads(); break;
  }
}

async function loadSidebarBookmarks() {
  const pane = els.sidebarPanes.bookmarks;
  if (!pane || !pane.classList.contains('active')) return;

  try {
    const data = await bb.bookmarks.get();
    state.currentBookmarks = data.bookmarks || [];
    pane.innerHTML = '';

    if (state.currentBookmarks.length === 0) {
      pane.innerHTML = '<p style="color:var(--text-muted);font-size:12px;padding:16px 12px">No bookmarks yet.</p>';
      return;
    }

    const rootBms = state.currentBookmarks
      .filter(b => !b.folderId)
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 50);

    rootBms.forEach(bm => {
      const div = document.createElement('div');
      div.className = 'sidebar-item';

      const favicon = document.createElement('img');
      favicon.src = bm.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(bm.url)}&sz=16`;
      favicon.onerror = () => favicon.remove();
      favicon.alt = '';

      const label = document.createElement('span');
      label.className = 'sidebar-item-label';
      label.textContent = bm.title || bm.url;

      div.appendChild(favicon);
      div.appendChild(label);
      div.addEventListener('click', () => bb.nav.go(bm.url));
      pane.appendChild(div);
    });
  } catch (err) {
    pane.innerHTML = '<p style="color:var(--danger);font-size:12px;padding:16px">Failed to load bookmarks.</p>';
  }
}

async function loadSidebarHistory() {
  const pane = els.sidebarPanes.history;
  if (!pane || !pane.classList.contains('active')) return;

  try {
    const groups = await bb.history.get(100);
    pane.innerHTML = '';

    if (!groups || groups.length === 0) {
      pane.innerHTML = '<p style="color:var(--text-muted);font-size:12px;padding:16px 12px">No history yet.</p>';
      return;
    }

    groups.forEach(group => {
      const label = document.createElement('div');
      label.className = 'sidebar-section-label';
      label.textContent = group.label;
      pane.appendChild(label);

      group.entries.slice(0, 10).forEach(entry => {
        const div = document.createElement('div');
        div.className = 'sidebar-item';

        const label2 = document.createElement('span');
        label2.className = 'sidebar-item-label';
        label2.textContent = entry.title || entry.url;

        div.appendChild(label2);
        div.addEventListener('click', () => bb.nav.go(entry.url));
        pane.appendChild(div);
      });
    });
  } catch {}
}

async function loadSidebarDownloads() {
  const pane = els.sidebarPanes.downloads;
  if (!pane || !pane.classList.contains('active')) return;

  try {
    const dls = await bb.downloads.get();
    pane.innerHTML = '';

    if (!dls || dls.length === 0) {
      pane.innerHTML = '<p style="color:var(--text-muted);font-size:12px;padding:16px 12px">No downloads.</p>';
      return;
    }

    dls.forEach(dl => {
      const div = document.createElement('div');
      div.className = 'sidebar-item';

      const label = document.createElement('span');
      label.className = 'sidebar-item-label';
      label.textContent = dl.filename;

      const meta = document.createElement('span');
      meta.className = 'sidebar-item-meta';
      meta.textContent = dl.state === 'completed' ? '✓' : dl.state;

      div.appendChild(label);
      div.appendChild(meta);

      if (dl.state === 'completed') {
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => bb.downloads.openFile(dl.id));
      }

      pane.appendChild(div);
    });
  } catch {}
}

// ─── Find in Page ─────────────────────────────────────────────────

onCleanup(bb.onOpenFind(() => {
  els.findBar.classList.add('visible');
  els.findBar.setAttribute('aria-hidden', 'false');
  els.findInput.focus();
  els.findInput.select();
}));

els.findClose.addEventListener('click', () => {
  els.findBar.classList.remove('visible');
  els.findBar.setAttribute('aria-hidden', 'true');
  bb.tools.stopFind();
  els.findInput.value = '';
  els.findInfo.textContent = '0 / 0';
});

els.findInput.addEventListener('input', () => {
  if (els.findInput.value) {
    bb.tools.find(els.findInput.value, { findNext: false });
  } else {
    bb.tools.stopFind();
    els.findInfo.textContent = '0/0';
  }
});

els.findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    bb.tools.find(els.findInput.value, { forward: !e.shiftKey, findNext: true });
  } else if (e.key === 'Escape') {
    els.findClose.click();
  }
});

els.findNext.addEventListener('click', () => bb.tools.find(els.findInput.value, { forward: true,  findNext: true }));
els.findPrev.addEventListener('click', () => bb.tools.find(els.findInput.value, { forward: false, findNext: true }));

onCleanup(bb.onFindResults((result) => {
  els.findInfo.textContent = `${result.activeMatchOrdinal || 0}/${result.matches || 0}`;
}));

// ─── Command Palette ──────────────────────────────────────────────

let paletteDebounce;
let paletteItems = [];
let paletteFocus = -1;

const commands = [
  { type: 'command', title: 'New Tab',        sub: 'Ctrl+T', icon: 'tab', action: () => bb.tab.create() },
  { type: 'command', title: 'New Incognito',  sub: 'Ctrl+Shift+N', icon: 'incognito', action: () => bb.window.openIncognito() },
  { type: 'command', title: 'Close Tab',       sub: 'Ctrl+W', icon: 'close', action: () => { const t = [...state.tabs.values()].find(t => t.id === state.activeTabId); if (t) bb.tab.close(t.id); } },
  { type: 'command', title: 'Settings',        sub: 'Ctrl+,', icon: 'settings', action: () => bb.settings.open() },
  { type: 'command', title: 'History',          sub: 'Ctrl+H', icon: 'history', action: () => bb.tab.create('bat://history') },
  { type: 'command', title: 'Downloads',        sub: 'Ctrl+J', icon: 'downloads', action: () => bb.tab.create('bat://downloads') },
  { type: 'command', title: 'Bookmarks',        sub: 'Ctrl+B', icon: 'bookmarks', action: () => bb.tab.create('bat://bookmarks') },
  { type: 'command', title: 'Toggle Sidebar',   sub: 'Ctrl+B', icon: 'sidebar', action: () => bb.ui.toggleSidebar() },
  { type: 'command', title: 'Toggle DevTools',  sub: 'F12', icon: 'devtools', action: () => bb.tools.devTools() },
  { type: 'command', title: 'Find in Page',     sub: 'Ctrl+F', icon: 'find', action: () => { closePalette(); els.findBar.classList.add('visible'); els.findInput.focus(); } },
  { type: 'command', title: 'Zoom In',          sub: 'Ctrl++', icon: 'zoom', action: () => bb.zoom.in() },
  { type: 'command', title: 'Zoom Out',          sub: 'Ctrl+-', icon: 'zoom', action: () => bb.zoom.out() },
  { type: 'command', title: 'Reset Zoom',        sub: 'Ctrl+0', icon: 'zoom', action: () => bb.zoom.reset() },
  { type: 'command', title: 'Clear History',     sub: '', icon: 'history', action: async () => { await bb.history.clear(); showToast('History cleared'); } },
  { type: 'command', title: 'Clear Cache',       sub: '', icon: 'privacy', action: async () => { await bb.privacy.clearCache(); showToast('Cache cleared'); } },
  { type: 'command', title: 'Toggle Ad Blocker', sub: '', icon: 'shield', action: () => els.adblockBtn.querySelector('button').click() },
  { type: 'command', title: 'Take Screenshot',   sub: '', icon: 'screenshot', action: async () => { const p = await bb.tools.screenshot(); if (p) showToast(`Saved: ${p}`, 'success'); } },
  { type: 'command', title: 'Print Page',         sub: 'Ctrl+P', icon: 'print', action: () => bb.tools.print() },
  { type: 'command', title: 'View Page Source',   sub: '', icon: 'source', action: () => bb.tools.viewSource() },
];

onCleanup(bb.onOpenCommandPalette(() => openPalette()));

function openPalette() {
  els.paletteOverlay.classList.add('open');
  els.paletteOverlay.setAttribute('aria-hidden', 'false');
  els.paletteInput.value = '';
  els.paletteInput.focus();
  renderPaletteResults('');
  bb.ui.hideTab();
}

function closePalette() {
  els.paletteOverlay.classList.remove('open');
  els.paletteOverlay.setAttribute('aria-hidden', 'true');
  bb.ui.showTab();
  paletteFocus = -1;
}

els.paletteOverlay.addEventListener('click', (e) => {
  if (e.target === els.paletteOverlay) closePalette();
});

els.paletteInput.addEventListener('keydown', (e) => {
  const items = $$('.palette-item', els.paletteResults);

  if (e.key === 'Escape') { closePalette(); return; }
  if (e.key === 'Enter') {
    const focused = items[paletteFocus];
    if (focused) {
      e.preventDefault();
      focused.click();
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    paletteFocus = Math.min(paletteFocus + 1, items.length - 1);
    highlightPaletteItem(items);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    paletteFocus = Math.max(paletteFocus - 1, 0);
    highlightPaletteItem(items);
    return;
  }
});

function highlightPaletteItem(items) {
  items.forEach((item, i) => item.classList.toggle('active', i === paletteFocus));
  const active = items[paletteFocus];
  if (active) active.scrollIntoView({ block: 'nearest' });
}

els.paletteInput.addEventListener('input', () => {
  clearTimeout(paletteDebounce);
  paletteDebounce = setTimeout(() => {
    renderPaletteResults(els.paletteInput.value.trim());
  }, 80);
});

async function renderPaletteResults(query) {
  els.paletteResults.innerHTML = '';
  paletteFocus = 0;

  const q = query.toLowerCase();

  // Open tabs
  const matchingTabs = [...state.tabs.values()].filter(t =>
    !q || t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)
  ).slice(0, 5);

  if (matchingTabs.length > 0) {
    appendPaletteSection('Open Tabs');
    matchingTabs.forEach(tab => {
      const item = createPaletteItem({
        icon:  tab.favicon ? `<img class="palette-item-favicon" src="${escapeAttr(tab.favicon)}">` : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93V17c0-.55.45-1 1-1h.05c.55 0 1 .45 1 1v2.93c-1.05.17-2.14.13-3.05.07V17z"/></svg>',
        title: tab.title || 'New Tab',
        sub:   tab.displayUrl || '',
        action: () => { bb.tab.switch(tab.id); closePalette(); },
      });
      els.paletteResults.appendChild(item);
    });
  }

  // Commands
  const matchingCommands = commands.filter(c =>
    !q || c.title.toLowerCase().includes(q)
  ).slice(0, q ? 8 : 5);

  if (matchingCommands.length > 0) {
    appendPaletteSection('Commands');
    matchingCommands.forEach(cmd => {
      const item = createPaletteItem({
        icon:  '⌘',
        title: cmd.title,
        sub:   cmd.sub,
        action: () => { cmd.action(); closePalette(); },
      });
      els.paletteResults.appendChild(item);
    });
  }

  // History search (if query provided)
  if (q) {
    try {
      const histItems = await bb.history.search(query);
      if (histItems && histItems.length > 0) {
        appendPaletteSection('History');
        histItems.slice(0, 5).forEach(h => {
          const item = createPaletteItem({
            icon:  '🕐',
            title: h.title || h.url,
            sub:   h.url,
            action: () => { bb.nav.go(h.url); closePalette(); },
          });
          els.paletteResults.appendChild(item);
        });
      }
    } catch {}
  }

  // Re-index items for keyboard nav
  paletteFocus = 0;
  const items = $$('.palette-item', els.paletteResults);
  if (items[0]) items[0].classList.add('active');
}

function appendPaletteSection(label) {
  const div = document.createElement('div');
  div.className = 'palette-section-label';
  div.textContent = label;
  els.paletteResults.appendChild(div);
}

function createPaletteItem({ icon, title, sub, action }) {
  const div = document.createElement('div');
  div.className = 'palette-item';
  div.setAttribute('role', 'option');

  const iconEl = document.createElement('div');
  iconEl.className = 'palette-item-icon';
  if (typeof icon === 'string' && (icon.startsWith('<') || icon.length <= 2)) {
    iconEl.innerHTML = icon;
  } else {
    iconEl.textContent = icon;
  }

  const body = document.createElement('div');
  body.className = 'palette-item-body';

  const titleEl = document.createElement('div');
  titleEl.className = 'palette-item-title';
  titleEl.textContent = title; // XSS safe

  body.appendChild(titleEl);

  if (sub) {
    const subEl = document.createElement('div');
    subEl.className = 'palette-item-sub';
    subEl.textContent = sub; // XSS safe
    body.appendChild(subEl);
  }

  div.appendChild(iconEl);
  div.appendChild(body);
  div.addEventListener('click', action);

  return div;
}

// ─── Downloads ────────────────────────────────────────────────────

onCleanup(bb.onDownloadStarted((info) => {
  state.downloads.set(info.id, info);
  showDownloadChip(info);
  if (state.sidebarOpen) loadSidebarDownloads();
}));

onCleanup(bb.onDownloadProgress((info) => {
  state.downloads.set(info.id, info);
  updateDownloadChip(info);
}));

onCleanup(bb.onDownloadCompleted((info) => {
  state.downloads.set(info.id, info);
  updateDownloadChip(info);
  if (info.state === 'completed') {
    showToast(`Downloaded: ${info.filename}`, 'success');
    setTimeout(() => removeDownloadChip(info.id), 5000);
  }
  if (state.sidebarOpen) loadSidebarDownloads();
}));

function showDownloadChip(info) {
  const item = document.createElement('div');
  item.className = 'download-item';
  item.id = `dl-chip-${info.id}`;

  const downloadSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>';

  item.innerHTML = `
    <div class="download-file-icon">${downloadSvg}</div>
    <div class="download-info">
      <div class="download-name"></div>
      <div class="download-progress-track"><div class="download-progress-fill" style="width:0%"></div></div>
      <div class="download-status">Starting…</div>
    </div>
    <div class="download-actions">
      <button class="download-btn dl-cancel-btn" title="Cancel" aria-label="Cancel download">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </div>
  `;

  item.querySelector('.download-name').textContent = info.filename;
  item.querySelector('.dl-cancel-btn').addEventListener('click', () => {
    bb.downloads.cancel(info.id);
    removeDownloadChip(info.id);
  });

  els.downloadBar.appendChild(item);
  updateDownloadChip(info);
}

function updateDownloadChip(info) {
  const item = document.getElementById(`dl-chip-${info.id}`);
  if (!item) return;

  const fill    = item.querySelector('.download-progress-fill');
  const status  = item.querySelector('.download-status');

  if (info.totalBytes > 0) {
    const pct = Math.round((info.receivedBytes / info.totalBytes) * 100);
    if (fill) fill.style.width = pct + '%';
    const speed  = info.speed > 0 ? formatBytes(info.speed) + '/s' : '';
    const remain = formatBytes(info.totalBytes - info.receivedBytes);
    if (status) status.textContent = `${pct}%${speed ? ` · ${speed}` : ''} · ${remain} left`;
  } else if (info.state === 'completed') {
    if (fill) fill.style.width = '100%';
    if (status) { status.textContent = 'Complete'; status.style.color = 'var(--success)'; }
    // Replace cancel button with open button
    const actions = item.querySelector('.download-actions');
    if (actions) {
      actions.innerHTML = `
        <button class="download-btn" title="Open file" aria-label="Open file">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
        </button>
      `;
      actions.querySelector('button').addEventListener('click', () => bb.downloads.openFile(info.id));
    }
  } else if (info.state === 'cancelled' || info.state === 'interrupted') {
    if (status) { status.textContent = 'Cancelled'; status.style.color = 'var(--danger)'; }
  } else {
    if (status) status.textContent = formatBytes(info.receivedBytes) + ' downloaded';
  }
}

function removeDownloadChip(id) {
  const chip = document.getElementById(`dl-chip-${id}`);
  if (chip) {
    chip.style.animation = 'slide-up 0.2s reverse ease-in';
    setTimeout(() => chip.remove(), 200);
  }
}

// ─── Toast Notifications ──────────────────────────────────────────

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const ICONS = {
    success: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
    error:   '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',
    warning: '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
    info:    '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>',
  };

  const iconPath = ICONS[type] || ICONS.info;

  const iconEl = document.createElement('div');
  iconEl.className = 'toast-icon';
  iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">${iconPath}</svg>`;

  const textEl = document.createElement('div');
  textEl.className = 'toast-text';
  textEl.textContent = message; // XSS safe

  toast.appendChild(iconEl);
  toast.appendChild(textEl);
  els.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 200);
  }, 2800);
}

// ─── Utility Functions ────────────────────────────────────────────

/**
 * Escapes HTML special characters for safe innerHTML insertion.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Escapes attribute values.
 */
function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Formats bytes into human-readable string.
 */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k    = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i    = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ─── Theme Management ─────────────────────────────────────────────

async function applyTheme() {
  try {
    const settings = await bb.settings.get();
    let theme = settings.theme || 'dark';
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = theme;

    if (settings.accentColor) {
      document.documentElement.style.setProperty('--accent', settings.accentColor);
    }
  } catch {}
}

applyTheme();

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyTheme();
});

// ─── Click outside to close suggestions ───────────────────────────

document.addEventListener('click', (e) => {
  if (!e.target.closest('#omnibar-wrap') && suggestionsVisible) {
    setSuggestionsVisible(false);
  }
});
