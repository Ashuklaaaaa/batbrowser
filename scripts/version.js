// ═══════════════════════════════════════════════════════════════
// BatBrowser — Version Management Script
// Bumps version in package.json.
// ═══════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');

const targetVersion = process.argv[2];
if (!targetVersion) {
  console.log('Usage: node scripts/version.js <new-version>');
  process.exit(1);
}

const pkgPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

pkg.version = targetVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

console.log(`✅ Bumped BatBrowser version to v${targetVersion}`);
