import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as secretManager from './secretManager';

let mcpProcess: child_process.ChildProcess | null = null;

export async function startMcpServer(context: vscode.ExtensionContext) {
    if (mcpProcess) {
        vscode.window.showWarningMessage('Vantinel MCP Server is already running.');
        return;
    }

    const apiKey = await secretManager.getApiKey();
    if (!apiKey) {
        vscode.window.showErrorMessage('Vantinel API Key is not set. Please set it using the "Vantinel: Set API Key" command to start the MCP server.');
        return;
    }

    const config = vscode.workspace.getConfiguration('vantinel');
    const projectId = config.get<string>('projectId');

    const env = {
        ...process.env,
        VANTINEL_API_KEY: apiKey,
        VANTINEL_PROJECT_ID: projectId || ''
    };

    try {
        const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        mcpProcess = child_process.spawn(cmd, ['-y', '@vantinel/mcp'], {
            env,
            stdio: ['pipe', 'pipe', 'inherit']
        });

        mcpProcess.on('error', (error: any) => {
            if (error.code === 'ENOENT') {
                vscode.window.showErrorMessage('Node.js/npx not found. Please install Node.js to run the Vantinel MCP server.');
            } else {
                vscode.window.showErrorMessage(`Failed to start Vantinel MCP server: ${error.message}`);
            }
            mcpProcess = null;
        });

        mcpProcess.on('exit', (code, signal) => {
            if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
                vscode.window.showErrorMessage(`Vantinel MCP server exited with code ${code}`);
            }
            mcpProcess = null;
        });

        vscode.window.showInformationMessage('Vantinel MCP Server started successfully.');
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error spawning Vantinel MCP server: ${error.message}`);
        mcpProcess = null;
    }
}

export function stopMcpServer() {
    if (mcpProcess) {
        mcpProcess.kill();
        mcpProcess = null;
    }
}

export function isMcpServerRunning(): boolean {
    return mcpProcess !== null;
}






