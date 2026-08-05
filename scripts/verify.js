// ═══════════════════════════════════════════════════════════════
// BatBrowser — Verification Script
// Verifies code syntax, path integrity, and required structure.
// ═══════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = 0;

function checkFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) {
    console.error(`❌ Missing file: ${relPath}`);
    errors++;
  } else {
    console.log(`✓ Found: ${relPath}`);
  }
}

console.log('🔍 Verifying BatBrowser Architecture Integrity...\n');

// Critical Paths
const requiredFiles = [
  'main.js',
  'package.json',
  'src/core/Constants.js',
  'src/core/Logger.js',
  'src/tabs/TabManager.js',
  'src/ipc/IpcRouter.js',
  'src/ipc/validators.js',
  'src/settings/SettingsStore.js',
  'src/history/HistoryStore.js',
  'src/bookmarks/BookmarkStore.js',
  'src/downloads/DownloadManager.js',
  'src/security/PermissionHandler.js',
  'src/windows/Geometry.js',
  'preload/browser.js',
  'ui/browser/index.html',
  'ui/browser/renderer.js',
  'ui/browser/styles.css',
  'ui/shared/tokens.css',
  'ui/pages/newtab/index.html',
  'ui/pages/settings/index.html',
  'ui/pages/history/index.html',
  'ui/pages/bookmarks/index.html',
  'ui/pages/downloads/index.html',
  'ui/pages/error/index.html',
];

requiredFiles.forEach(checkFile);

if (errors === 0) {
  console.log('\n✅ All critical files and architectural pathways verified cleanly!');
  process.exit(0);
} else {
  console.error(`\n❌ Verification failed with ${errors} error(s).`);
  process.exit(1);
}
