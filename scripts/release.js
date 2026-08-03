// ═══════════════════════════════════════════════════════════════
// BatBrowser — Release Preparation Script
// Prepares release packages and verifies integrity.
// ═══════════════════════════════════════════════════════════════

'use strict';

const { execSync } = require('child_process');

console.log('🚀 Running pre-release checks...');
execSync('node scripts/verify.js', { stdio: 'inherit' });
console.log('✅ Ready for release packaging!');
