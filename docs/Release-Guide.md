# BatBrowser Release Guide

## Release Process

1. **Version Bump:**
   Run script to bump version across `package.json` and internal constants:
   ```bash
   node scripts/version.js 2.1.0
   ```

2. **Clean & Verify:**
   ```bash
   node scripts/clean.js
   node scripts/verify.js
   ```

3. **Build Packages:**
   ```bash
   npm run build
   ```

4. **Publish Release:**
   Deploy generated artifacts in `dist/` to GitHub Releases.
