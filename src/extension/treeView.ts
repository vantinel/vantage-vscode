import * as vscode from 'vscode';

export class VantinelTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private viewType: string) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        // Return root items based on view type
        if (this.viewType === 'sessions') {
            const rootItem = new vscode.TreeItem('Open Dashboard', vscode.TreeItemCollapsibleState.None);
            rootItem.command = {
                command: 'vantinel.showDashboard',
                title: 'Open Dashboard',
                tooltip: 'Click to open the Vantinel Dashboard'
            };
            rootItem.iconPath = new vscode.ThemeIcon('dashboard');
            return Promise.resolve([rootItem]);
        } else if (this.viewType === 'alerts') {
            const rootItem = new vscode.TreeItem('No active alerts', vscode.TreeItemCollapsibleState.None);
            rootItem.iconPath = new vscode.ThemeIcon('bell');
            return Promise.resolve([rootItem]);
        }

        return Promise.resolve([]);
    }
}

export function initializeTreeViews(_context: vscode.ExtensionContext) {
    const sessionsProvider = new VantinelTreeDataProvider('sessions');
    const alertsProvider = new VantinelTreeDataProvider('alerts');

    vscode.window.registerTreeDataProvider('vantinel-sessions', sessionsProvider);
    vscode.window.registerTreeDataProvider('vantinel-alerts', alertsProvider);
}
