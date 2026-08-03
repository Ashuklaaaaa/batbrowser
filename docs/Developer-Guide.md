# Developer Onboarding Guide

## Prerequisites
- Node.js 18.0.0 or higher
- npm 9.0.0 or higher

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/batbrowser/batbrowser.git
   cd batbrowser
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start local development:**
   ```bash
   npm start
   ```

4. **Verify project integrity:**
   ```bash
   node scripts/verify.js
   ```

## Packaging for Release
```bash
npm run build
```
Build outputs will be generated in `dist/`.
