import * as vscode from 'vscode';

interface ProxyStatus {
    running: boolean;
    port: number;
    requestsIntercepted: number;
    blocked: number;
}

let statusBarItem: vscode.StatusBarItem;
let collectorActive = false;
let currentProxyStatus: ProxyStatus | null = null;

export function initializeStatusBar(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'vantinel.showDashboard';

    context.subscriptions.push(statusBarItem);

    // Initial state
    updateStatusBar(false);
}

export function updateStatusBar(isActive: boolean) {
    collectorActive = isActive;
    renderStatusBar();
}

export function updateProxyStatus(status: ProxyStatus) {
    currentProxyStatus = status;
    renderStatusBar();
}

function renderStatusBar() {
    const proxyRunning = currentProxyStatus?.running ?? false;
    const blocked = currentProxyStatus?.blocked ?? 0;

    if (proxyRunning) {
        const blockedLabel = blocked > 0 ? ` | ${blocked} blocked` : '';
        statusBarItem.text = `$(shield) Vantinel: Proxy Active${blockedLabel}`;
        statusBarItem.tooltip = new vscode.MarkdownString(
            `**Vantinel Proxy** running on port ${currentProxyStatus?.port}\n\n` +
            `Requests intercepted: ${currentProxyStatus?.requestsIntercepted ?? 0}\n\n` +
            `Blocked: ${blocked}\n\n` +
            `Collector: ${collectorActive ? '✅ Online' : '⚠️ Offline'}\n\n` +
            `Click to open Dashboard.`
        );
    } else if (collectorActive) {
        statusBarItem.text = '$(check) Vantinel: Active';
        statusBarItem.tooltip = 'Vantinel Collector is Active. Click to open Dashboard.';
    } else {
        statusBarItem.text = '$(warning) Vantinel: Offline';
        statusBarItem.tooltip = 'Vantinel Collector is Offline. Click to open Dashboard.';
    }

    statusBarItem.show();
}
