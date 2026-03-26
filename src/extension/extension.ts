import { VantinelDashboardPanel } from './webviewPanel';
import * as vscode from 'vscode';

import * as mcpServer from './mcpServer';
import * as secretManager from './secretManager';

import * as statusBar from './statusBar';
import * as treeView from './treeView';
import * as telemetry from './telemetry';
import * as proxyServer from './proxyServer';
import * as terminalEnv from './terminalEnv';

export function activate(context: vscode.ExtensionContext) {
    secretManager.initializeSecretManager(context);
    console.log('Vantinel extension is now active!');

    // Initialize UI components
    statusBar.initializeStatusBar(context);
    treeView.initializeTreeViews(context);
    telemetry.startTelemetryPolling(context);

    // Start the local LLM proxy and inject env vars into terminals.
    // Read the port from getProxyStatus() after start so we use the actual bound port.
    proxyServer.startProxyServer(context).then(() => {
        const status = proxyServer.getProxyStatus();
        if (status.running) {
            terminalEnv.injectProxyEnvVars(context, status.port);
        }
        statusBar.updateProxyStatus(status);
    }).catch(console.error);

    // Forward proxy intercept events to the webview dashboard in real time
    const unsubscribeProxy = proxyServer.onProxyEvent((event) => {
        const status = proxyServer.getProxyStatus();
        statusBar.updateProxyStatus(status);
        if (VantinelDashboardPanel.currentPanel) {
            VantinelDashboardPanel.currentPanel.postMessage({ type: 'PROXY_EVENT', payload: event });
            VantinelDashboardPanel.currentPanel.postMessage({ type: 'PROXY_STATS', payload: { proxyRunning: status.running, port: status.port, requestsIntercepted: status.requestsIntercepted, blocked: status.blocked } });
        }
    });
    context.subscriptions.push({ dispose: unsubscribeProxy });

    let disposableShowDashboard = vscode.commands.registerCommand('vantinel.showDashboard', () => {
        VantinelDashboardPanel.createOrShow(context.extensionUri);
    });

    let disposableSetApiKey = vscode.commands.registerCommand('vantinel.setApiKey', async () => {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Vantinel API Key',
            placeHolder: 'vntl_...',
            password: true,
            ignoreFocusOut: true
        });

        if (apiKey) {
            await secretManager.setApiKey(apiKey);
            vscode.window.showInformationMessage('API Key saved successfully.');
            return true;
        }
        return false;
    });

    let disposableSetProjectId = vscode.commands.registerCommand('vantinel.setProjectId', async () => {
        const projectId = await vscode.window.showInputBox({
            prompt: 'Enter your Vantinel Project ID (UUID)',
            placeHolder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
            ignoreFocusOut: true
        });

        if (projectId) {
            await vscode.workspace.getConfiguration('vantinel').update('projectId', projectId, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('Project ID saved successfully.');
            return true;
        }
        return false;
    });

    let disposableSetup = vscode.commands.registerCommand('vantinel.setupWizard', async () => {
        const apiKeySet = await vscode.commands.executeCommand('vantinel.setApiKey');
        if (!apiKeySet) return;

        const projectIdSet = await vscode.commands.executeCommand('vantinel.setProjectId');
        if (!projectIdSet) return;

        const collectorChoice = await vscode.window.showQuickPick(
            [
                { label: 'Vantinel Cloud', description: 'https://api.vantinel.com', target: 'https://api.vantinel.com' },
                { label: 'Local Collector', description: 'http://localhost:8000', target: 'http://localhost:8000' },
                { label: 'Custom URL', description: 'Enter a custom collector endpoint' }
            ],
            { placeHolder: 'Select your Vantinel Collector endpoint' }
        );

        if (collectorChoice) {
            let url = collectorChoice.target;
            if (collectorChoice.label === 'Custom URL') {
                url = await vscode.window.showInputBox({
                    prompt: 'Enter your custom Collector URL',
                    placeHolder: 'https://...',
                    ignoreFocusOut: true
                });
            }

            if (url) {
                await vscode.workspace.getConfiguration('vantinel').update('collectorUrl', url, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Vantinel is now connected to ${url}`);
            }
        }
    });

    let disposableEnableProxy = vscode.commands.registerCommand('vantinel.enableProxy', async () => {
        await proxyServer.startProxyServer(context);
        const status = proxyServer.getProxyStatus();
        if (status.running) {
            terminalEnv.injectProxyEnvVars(context, status.port);
        }
        statusBar.updateProxyStatus(status);
        vscode.window.showInformationMessage('Vantinel proxy enabled. Open a new terminal to apply.');
    });

    let disposableDisableProxy = vscode.commands.registerCommand('vantinel.disableProxy', () => {
        proxyServer.stopProxyServer();
        terminalEnv.clearProxyEnvVars(context);
        statusBar.updateProxyStatus(proxyServer.getProxyStatus());
        vscode.window.showInformationMessage('Vantinel proxy disabled. Open a new terminal to apply.');
    });

    context.subscriptions.push(disposableShowDashboard);
    context.subscriptions.push(disposableSetApiKey);
    context.subscriptions.push(disposableSetProjectId);
    context.subscriptions.push(disposableSetup);
    context.subscriptions.push(disposableEnableProxy);
    context.subscriptions.push(disposableDisableProxy);

    // Prompt for setup if needed
    checkConfiguration();

    // Commands for MCP server
    let disposableStartMcp = vscode.commands.registerCommand('vantinel.startMcpServer', async () => {
        await mcpServer.startMcpServer(context);
    });

    let disposableStopMcp = vscode.commands.registerCommand('vantinel.stopMcpServer', () => {
        mcpServer.stopMcpServer();
        vscode.window.showInformationMessage('Vantinel MCP Server stopped.');
    });

    context.subscriptions.push(disposableStartMcp);
    context.subscriptions.push(disposableStopMcp);

    // Start the MCP server automatically on activation
    // Don't await to avoid blocking the main thread
    mcpServer.startMcpServer(context).catch(console.error);

    // Return the public API for other extensions to consume
    return {
        getMcpStatus: () => mcpServer.isMcpServerRunning(),
        startMcp: async () => await mcpServer.startMcpServer(context)
    };
}





async function checkConfiguration() {
    const apiKey = await secretManager.getApiKey();
    const config = vscode.workspace.getConfiguration('vantinel');
    const projectId = config.get<string>('projectId');

    if (!apiKey || !projectId) {
        const action = await vscode.window.showWarningMessage(
            'Vantinel is not fully configured. Set your API Key and Project ID to start monitoring.',
            'Setup Now'
        );

        if (action === 'Setup Now') {
            await vscode.commands.executeCommand('vantinel.setupWizard');
        }
    }
}

export function deactivate() {
    mcpServer.stopMcpServer();
    proxyServer.stopProxyServer();
}
