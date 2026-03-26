import { assert } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as secretManager from '../../extension/secretManager';
import { startMcpServer, stopMcpServer, isMcpServerRunning } from '../../extension/mcpServer';

suite('MCP Server Test Suite', () => {
    let spawnStub: sinon.SinonStub;
    let getApiKeyStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let mockContext: any;

    setup(() => {
        // Stop any running server
        stopMcpServer();

        mockContext = {};

        const cp = require('child_process');
        spawnStub = sinon.stub(cp, 'spawn');
        getApiKeyStub = sinon.stub(secretManager, 'getApiKey');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
    });

    teardown(() => {
        stopMcpServer();
        sinon.restore();
    });

    test('should spawn MCP server successfully if API key is set', async () => {
        getApiKeyStub.resolves('test-api-key');

        const mockProcess = {
            on: sinon.stub(),
            kill: sinon.stub()
        };

        spawnStub.returns(mockProcess as any);

        await startMcpServer(mockContext as vscode.ExtensionContext);

        assert.isTrue(spawnStub.calledOnce, 'child_process.spawn should be called');
        const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        assert.strictEqual(spawnStub.firstCall.args[0], cmd);
        assert.deepEqual(spawnStub.firstCall.args[1], ['-y', '@vantinel/mcp']);
        assert.strictEqual(spawnStub.firstCall.args[2].env.VANTINEL_API_KEY, 'test-api-key');

        assert.isTrue(showInformationMessageStub.calledWith('Vantinel MCP Server started successfully.'), 'Information message should be shown');
        assert.isTrue(isMcpServerRunning(), 'Server should be marked as running');
    });

    test('should not spawn if API key is not set', async () => {
        getApiKeyStub.resolves(undefined);

        await startMcpServer(mockContext as vscode.ExtensionContext);

        assert.isFalse(spawnStub.called, 'child_process.spawn should not be called');
        assert.isTrue(showErrorMessageStub.calledWith('Vantinel API Key is not set. Please set it using the "Vantinel: Set API Key" command to start the MCP server.'), 'Error message should be shown');
        assert.isFalse(isMcpServerRunning(), 'Server should not be marked as running');
    });

    test('should not spawn if server is already running', async () => {
        getApiKeyStub.resolves('test-api-key');

        const mockProcess = {
            on: sinon.stub(),
            kill: sinon.stub()
        };

        spawnStub.returns(mockProcess as any);

        // Start once
        await startMcpServer(mockContext as vscode.ExtensionContext);
        assert.isTrue(isMcpServerRunning(), 'Server should be marked as running');

        // Reset stub history
        spawnStub.resetHistory();
        showInformationMessageStub.resetHistory();

        // Start again
        await startMcpServer(mockContext as vscode.ExtensionContext);

        assert.isFalse(spawnStub.called, 'child_process.spawn should not be called the second time');
        assert.isTrue(showWarningMessageStub.calledWith('Vantinel MCP Server is already running.'), 'Warning message should be shown');
    });

    test('should handle ENOENT error when node/npx is not found', async () => {
        getApiKeyStub.resolves('test-api-key');

        let errorCallback: any;
        const mockProcess = {
            on: sinon.stub().callsFake((event, cb) => {
                if (event === 'error') {
                    errorCallback = cb;
                }
            }),
            kill: sinon.stub()
        };

        spawnStub.returns(mockProcess as any);

        await startMcpServer(mockContext as vscode.ExtensionContext);

        assert.isTrue(isMcpServerRunning(), 'Server should be initially running');

        // Trigger ENOENT error
        if (errorCallback) {
            errorCallback({ code: 'ENOENT' });
        }

        assert.isTrue(showErrorMessageStub.calledWith('Node.js/npx not found. Please install Node.js to run the Vantinel MCP server.'), 'ENOENT error message should be shown');
        assert.isFalse(isMcpServerRunning(), 'Server should be marked as not running after error');
    });

    test('should handle generic error event', async () => {
        getApiKeyStub.resolves('test-api-key');

        let errorCallback: any;
        const mockProcess = {
            on: sinon.stub().callsFake((event, cb) => {
                if (event === 'error') {
                    errorCallback = cb;
                }
            }),
            kill: sinon.stub()
        };

        spawnStub.returns(mockProcess as any);

        await startMcpServer(mockContext as vscode.ExtensionContext);

        // Trigger generic error
        if (errorCallback) {
            errorCallback({ message: 'Something went wrong' });
        }

        assert.isTrue(showErrorMessageStub.calledWith('Failed to start Vantinel MCP server: Something went wrong'), 'Generic error message should be shown');
        assert.isFalse(isMcpServerRunning(), 'Server should be marked as not running after error');
    });

    test('should handle exit event', async () => {
        getApiKeyStub.resolves('test-api-key');

        let exitCallback: any;
        const mockProcess = {
            on: sinon.stub().callsFake((event, cb) => {
                if (event === 'exit') {
                    exitCallback = cb;
                }
            }),
            kill: sinon.stub()
        };

        spawnStub.returns(mockProcess as any);

        await startMcpServer(mockContext as vscode.ExtensionContext);

        // Trigger exit event with non-zero code
        if (exitCallback) {
            exitCallback(1, null);
        }

        assert.isTrue(showErrorMessageStub.calledWith('Vantinel MCP server exited with code 1'), 'Exit error message should be shown');
        assert.isFalse(isMcpServerRunning(), 'Server should be marked as not running after exit');
    });

    test('should stop MCP server', async () => {
        getApiKeyStub.resolves('test-api-key');

        const mockProcess = {
            on: sinon.stub(),
            kill: sinon.stub()
        };

        spawnStub.returns(mockProcess as any);

        await startMcpServer(mockContext as vscode.ExtensionContext);
        assert.isTrue(isMcpServerRunning(), 'Server should be marked as running');

        stopMcpServer();

        assert.isTrue(mockProcess.kill.calledOnce, 'process.kill should be called');
        assert.isFalse(isMcpServerRunning(), 'Server should be marked as not running');
    });

    test('should handle spawn exception', async () => {
        getApiKeyStub.resolves('test-api-key');

        spawnStub.throws(new Error('Spawn failed'));

        await startMcpServer(mockContext as vscode.ExtensionContext);

        assert.isTrue(showErrorMessageStub.calledWith('Error spawning Vantinel MCP server: Spawn failed'), 'Spawn exception error message should be shown');
        assert.isFalse(isMcpServerRunning(), 'Server should be marked as not running');
    });
});
