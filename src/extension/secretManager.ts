import * as vscode from 'vscode';

let secretStorage: vscode.SecretStorage;

export function initializeSecretManager(context: vscode.ExtensionContext) {
    secretStorage = context.secrets;
}

export async function setApiKey(apiKey: string): Promise<void> {
    if (!secretStorage) {
        throw new Error('SecretStorage is not initialized');
    }
    await secretStorage.store('vantinel.apiKey', apiKey);
}

export async function getApiKey(): Promise<string | undefined> {
    if (!secretStorage) {
        throw new Error('SecretStorage is not initialized');
    }
    return await secretStorage.get('vantinel.apiKey');
}

export async function deleteApiKey(): Promise<void> {
    if (!secretStorage) {
        throw new Error('SecretStorage is not initialized');
    }
    await secretStorage.delete('vantinel.apiKey');
}
