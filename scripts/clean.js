// ═══════════════════════════════════════════════════════════════
// BatBrowser — Clean Script
// Cleans build output, dist directories, and temporary logs.
// ═══════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const dirsToClean = ['dist', 'build-output'];
const filesToClean = ['log.txt', 'launch.log', 'out.log', 'electron.zip'];

console.log('🧹 Cleaning build artifacts and temporary files...\n');

dirsToClean.forEach(d => {
  const p = path.join(ROOT, d);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`Removed directory: ${d}`);
  }
});

filesToClean.forEach(f => {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log(`Removed log/temp file: ${f}`);
  }
});

console.log('\n✨ Workspace clean!');
