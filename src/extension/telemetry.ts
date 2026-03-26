import * as vscode from 'vscode';
import { updateStatusBar } from './statusBar';
import { VantinelDashboardPanel } from './webviewPanel';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

let pollingInterval: NodeJS.Timeout | undefined;

export function startTelemetryPolling(context: vscode.ExtensionContext) {
    // Initial check
    checkCollectorStatus();

    // Poll every 5 seconds
    pollingInterval = setInterval(() => {
        checkCollectorStatus();
    }, 5000);

    context.subscriptions.push({
        dispose: () => stopTelemetryPolling()
    });
}

export function stopTelemetryPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = undefined;
    }
}

async function checkCollectorStatus() {
    try {
        const config = vscode.workspace.getConfiguration('vantinel');
        const collectorUrl = config.get<string>('collectorUrl') || 'http://localhost:8000';
        
        const healthUrl = new URL('/health', collectorUrl);
        
        // Non-blocking fetch using native http/https module
        const isSecure = healthUrl.protocol === 'https:';
        const requestModule = isSecure ? https : http;
        
        const options = {
            hostname: healthUrl.hostname,
            port: healthUrl.port || (isSecure ? 443 : 80),
            path: healthUrl.pathname,
            method: 'GET',
            timeout: 2000 // Short timeout to fail fast
        };
        
        const req = requestModule.request(options, (res) => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                updateStatusBar(true);
                updateWebviewStatus(true);
            } else {
                updateStatusBar(false);
                updateWebviewStatus(false);
            }
            // Consume response data to free up memory
            res.on('data', () => {});
        });
        
        req.on('error', (e) => {
            // Fail silently and just update status bar
            updateStatusBar(false);
            updateWebviewStatus(false);
        });

        req.on('timeout', () => {
            req.destroy();
            updateStatusBar(false);
            updateWebviewStatus(false);
        });
        
        req.end();

    } catch (error) {
        // If anything fails synchronously (like invalid URL), fail gracefully
        updateStatusBar(false);
        updateWebviewStatus(false);
    }
}

function updateWebviewStatus(isConnected: boolean) {
    if (VantinelDashboardPanel.currentPanel) {
        VantinelDashboardPanel.currentPanel.postMessage({
            type: 'CONNECTION_STATUS',
            payload: { isConnected }
        });
    }
}

/**
 * Manual trigger from webview or commands to check and fetch data if needed
 */
export async function triggerFetch(): Promise<void> {
    await checkCollectorStatus();
}
