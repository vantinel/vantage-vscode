# Vantinel VS Code Extension

Vantinel is the "Datadog for AI Agents" – a Real-Time Threat Intelligence System for autonomous AI.

This extension brings the power of Vantinel directly into your IDE, allowing you to monitor agent telemetry, enforce budget caps, and block destructive actions in real-time. It is fully compatible with Visual Studio Code, Cursor, and Windsurf.

## Features

- **Real-Time Observability Dashboard:** View live agent sessions, latency metrics, and budget burn-rates directly in your IDE via a secure React webview.
- **Proactive Guardrails:** Vantinel's Zombie Loop Detector and Anomaly Detector flag problematic agent behavior instantly.
- **MCP Server Integration:** Securely run the Vantinel Model Context Protocol (MCP) server locally, exposing your system state to LM tools without compromising safety.
- **Budget Forecaster:** Predict and prevent budget overruns with predictive alerting before limits are reached.

## Getting Started

1. **Set API Key:** Run `Vantinel: Set API Key` from the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to securely store your credentials in the VS Code Secret Storage.
2. **Open Dashboard:** Click the Vantinel icon in the Activity Bar or run `Vantinel: Show Dashboard`.
3. **Configure Collector:** Set your collector URL in settings (`vantinel.collectorUrl`), default is `http://localhost:8000`.

## Requirements

- Node.js (for running the local MCP server)

## Security Note

This extension is designed with a zero-trust model. We *DO NOT* store request/response bodies or user queries. All telemetry sent to the Vantinel Collector contains only metadata and MD5 hashes of tool arguments.

## Support

For issues, feature requests, or enterprise support, please visit [vantinel.com](https://vantinel.com) or open an issue on our GitHub repository.
