import { assert } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { initializeSecretManager, setApiKey, getApiKey, deleteApiKey } from '../../extension/secretManager';

suite('SecretManager Test Suite', () => {
    let mockContext: any;
    let mockSecrets: any;

    setup(() => {
        mockSecrets = {
            store: sinon.stub().resolves(),
            get: sinon.stub().resolves('test-api-key'),
            delete: sinon.stub().resolves(),
            onDidChange: sinon.stub()
        };

        mockContext = {
            secrets: mockSecrets
        };
    });

    teardown(() => {
        sinon.restore();
        // Reset the secret manager state for the next test
        try {
            initializeSecretManager({ secrets: undefined } as any);
        } catch (e) {
            // Ignore if it fails
        }
    });

    test('should throw error when setting API key before initialization', async () => {
        try {
            await setApiKey('test-key');
            assert.fail('Should have thrown an error');
        } catch (err: any) {
            assert.strictEqual(err.message, 'SecretStorage is not initialized');
        }
    });

    test('should throw error when getting API key before initialization', async () => {
        try {
            await getApiKey();
            assert.fail('Should have thrown an error');
        } catch (err: any) {
            assert.strictEqual(err.message, 'SecretStorage is not initialized');
        }
    });

    test('should throw error when deleting API key before initialization', async () => {
        try {
            await deleteApiKey();
            assert.fail('Should have thrown an error');
        } catch (err: any) {
            assert.strictEqual(err.message, 'SecretStorage is not initialized');
        }
    });

    test('should set API key after initialization', async () => {
        initializeSecretManager(mockContext as vscode.ExtensionContext);
        
        await setApiKey('new-api-key');
        
        assert.isTrue(mockSecrets.store.calledOnce, 'store should be called once');
        assert.isTrue(mockSecrets.store.calledWith('vantinel.apiKey', 'new-api-key'), 'store should be called with correct arguments');
    });

    test('should get API key after initialization', async () => {
        initializeSecretManager(mockContext as vscode.ExtensionContext);
        mockSecrets.get.resolves('my-secret-key');
        
        const key = await getApiKey();
        
        assert.strictEqual(key, 'my-secret-key');
        assert.isTrue(mockSecrets.get.calledOnce, 'get should be called once');
        assert.isTrue(mockSecrets.get.calledWith('vantinel.apiKey'), 'get should be called with correct arguments');
    });

    test('should delete API key after initialization', async () => {
        initializeSecretManager(mockContext as vscode.ExtensionContext);
        
        await deleteApiKey();
        
        assert.isTrue(mockSecrets.delete.calledOnce, 'delete should be called once');
        assert.isTrue(mockSecrets.delete.calledWith('vantinel.apiKey'), 'delete should be called with correct arguments');
    });
});
