// ==========================================
// VANTINEL TERMINAL ENVIRONMENT INJECTION
// Injects proxy env vars into all VS Code
// terminals so IDE AI agents route through
// the local Vantinel proxy automatically.
// ==========================================

import * as vscode from 'vscode';

export function injectProxyEnvVars(context: vscode.ExtensionContext, port: number): void {
    const collection = context.environmentVariableCollection;
    const proxyUrl = `http://localhost:${port}`;

    // Claude Code / Anthropic SDK
    collection.replace('ANTHROPIC_BASE_URL', proxyUrl);

    // OpenAI SDK
    collection.replace('OPENAI_BASE_URL', proxyUrl);
    collection.replace('OPENAI_API_BASE', proxyUrl);

    // Google Generative AI SDK (some wrappers respect these)
    collection.replace('GEMINI_API_BASE_URL', proxyUrl);
    collection.replace('GOOGLE_AI_API_BASE_URL', proxyUrl);

    // Standard HTTP proxy env vars — Node.js https module respects these,
    // which covers Gemini SDK and any other HTTP client that doesn't have
    // a dedicated base URL env var.
    collection.replace('HTTP_PROXY', proxyUrl);
    collection.replace('HTTPS_PROXY', proxyUrl);
    collection.replace('http_proxy', proxyUrl);
    collection.replace('https_proxy', proxyUrl);

    // Description shown to users in the terminal profile UI
    collection.description = new vscode.MarkdownString(
        `**Vantinel Proxy Active** — AI agent LLM requests are monitored on port ${port}`
    );
}

export function clearProxyEnvVars(context: vscode.ExtensionContext): void {
    context.environmentVariableCollection.clear();
}
