# Contributing to BatBrowser

Thank you for your interest in contributing to BatBrowser!

## Development Workflow

1. Fork and clone the repository.
2. Ensure you have Node.js 18+ installed.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the application in development mode:
   ```bash
   npm start
   ```

## Code Quality Standards

- Maintain strict IPC context isolation and input validation.
- All styles should consume CSS tokens from `ui/shared/tokens.css`.
- Ensure all text colors comply with WCAG AA contrast standards.
- Run code verification before submitting a PR:
   ```bash
   node scripts/verify.js
   ```

## Submitting Pull Requests

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Commit changes with clean, descriptive messages.
3. Push to your branch and open a Pull Request using our template.
