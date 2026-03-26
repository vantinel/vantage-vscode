import * as vscode from 'vscode';
import { WebviewMessage, ExtensionMessage } from '../shared/types';
import * as crypto from 'crypto';

export class VantinelDashboardPanel {
  public static currentPanel: VantinelDashboardPanel | undefined;
  public static readonly viewType = 'vantinelDashboard';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (VantinelDashboardPanel.currentPanel) {
      VantinelDashboardPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      VantinelDashboardPanel.viewType,
      'Vantinel Dashboard',
      column || vscode.ViewColumn.One,
      getWebviewOptions(extensionUri)
    );

    VantinelDashboardPanel.currentPanel = new VantinelDashboardPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the extension is deactivated
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        switch (message.type) {
          case 'READY':
            vscode.window.showInformationMessage('Vantinel Dashboard is ready.');
            // Send initial data if needed
            break;
          case 'GET_METRICS':
            vscode.window.showInformationMessage('Requested metrics from webview.');
            break;
          case 'OPEN_SETTINGS':
            vscode.commands.executeCommand('workbench.action.openSettings', 'vantinel');
            break;
          case 'SETUP_WIZARD':
            vscode.commands.executeCommand('vantinel.setupWizard');
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public postMessage(message: ExtensionMessage) {
    this._panel.webview.postMessage(message);
  }

  public dispose() {
    VantinelDashboardPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview() {
    const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js');
    const scriptUri = this._panel.webview.asWebviewUri(scriptPathOnDisk);

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <!--
          Use a content security policy to only allow loading styles from our extension directory,
          and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vantinel Dashboard</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    // Enable javascript in the webview
    enableScripts: true,

    // And restrict the webview to only loading content from our extension's `dist` directory.
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')]
  };
}

function getNonce() {
  return crypto.randomBytes(16).toString('hex');
}
