# AGENTS.md — Vantinel VS Code Extension

## What Is This?

A **VS Code extension** for the Vantinel AI Agent Observability platform. Provides in-editor monitoring and interaction with the Vantinel dashboard/collector.

## Project Structure

```
├── src/
│   ├── extension/    # VS Code extension host (activation, commands, providers)
│   ├── webview/      # Webview UI panels (React/HTML)
│   ├── shared/       # Shared types and utilities
│   └── test/         # Extension tests
├── resources/        # Icons, assets
├── esbuild.js        # Build config (esbuild bundler)
├── package.json      # Extension manifest (contributes, commands, activation events)
└── *.vsix            # Pre-built extension packages
```

## Development Commands

```bash
npm install              # Install dependencies
npm run compile          # Build with esbuild
# Debug: Press F5 in VS Code to launch Extension Development Host
```

## Build & Package

```bash
npx vsce package         # Creates .vsix file
npx vsce publish         # Publish to VS Code Marketplace
```

## Architecture Notes

- Uses **esbuild** for bundling (fast builds)
- Extension activates based on events defined in `package.json` `activationEvents`
- Webview panels communicate with extension host via VS Code messaging API
- Connects to Vantinel Collector at URL configured in VS Code settings
