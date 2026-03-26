import { assert } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
const http = require('http');
const https = require('https');

import { triggerFetch, startTelemetryPolling, stopTelemetryPolling } from '../../extension/telemetry';
import * as statusBar from '../../extension/statusBar';
import { VantinelDashboardPanel } from '../../extension/webviewPanel';

suite('Telemetry Test Suite', () => {
    let mockGetConfiguration: sinon.SinonStub;
    let mockUpdateStatusBar: sinon.SinonStub;
    let mockCurrentPanel: any;

    setup(() => {
        // Stop active polling from extension activation
        stopTelemetryPolling();
        // Mock vscode.workspace.getConfiguration
        mockGetConfiguration = sinon.stub(vscode.workspace, 'getConfiguration');
        
        // Mock statusBar to track calls to updateStatusBar
        mockUpdateStatusBar = sinon.stub(statusBar, 'updateStatusBar');

        // Mock VantinelDashboardPanel.currentPanel to avoid real webview updates
        mockCurrentPanel = {
            postMessage: sinon.stub()
        };
        VantinelDashboardPanel.currentPanel = mockCurrentPanel;
    });

    teardown(() => {
        sinon.restore();
        VantinelDashboardPanel.currentPanel = undefined;
        stopTelemetryPolling(); // Clean up any active polling intervals
    });

    test('should update status bar to true on HTTP 200', async () => {
        // Setup config to return http://localhost:8000
        mockGetConfiguration.returns({
            get: sinon.stub().withArgs('collectorUrl').returns('http://localhost:8000')
        } as any);

        const mockReq = {
            on: sinon.stub(),
            end: sinon.stub(),
            destroy: sinon.stub()
        };

        const httpRequestStub = sinon.stub(http, 'request').callsFake((options, cb: any) => {
            const mockRes = {
                statusCode: 200,
                on: sinon.stub()
            };
            if (cb) {
                cb(mockRes);
            }
            return mockReq as any;
        });

        await triggerFetch();

        assert.isTrue(httpRequestStub.calledOnce, 'http.request should be called');
        assert.isTrue(mockUpdateStatusBar.calledWith(true), 'updateStatusBar should be called with true');
        assert.isTrue(mockCurrentPanel.postMessage.calledWith({
            type: 'CONNECTION_STATUS',
            payload: { isConnected: true }
        }), 'postMessage should be called with true');
    });

    test('should degrade gracefully and update status bar to false on HTTP 500', async () => {
        mockGetConfiguration.returns({
            get: sinon.stub().withArgs('collectorUrl').returns('http://localhost:8000')
        } as any);

        const mockReq = {
            on: sinon.stub(),
            end: sinon.stub(),
            destroy: sinon.stub()
        };

        const httpRequestStub = sinon.stub(http, 'request').callsFake((options, cb: any) => {
            const mockRes = {
                statusCode: 500,
                on: sinon.stub()
            };
            if (cb) {
                cb(mockRes);
            }
            return mockReq as any;
        });

        await triggerFetch();

        assert.isTrue(httpRequestStub.calledOnce, 'http.request should be called');
        assert.isTrue(mockUpdateStatusBar.calledWith(false), 'updateStatusBar should be called with false');
        assert.isTrue(mockCurrentPanel.postMessage.calledWith({
            type: 'CONNECTION_STATUS',
            payload: { isConnected: false }
        }), 'postMessage should be called with false');
    });

    test('should degrade gracefully on network error', async () => {
        mockGetConfiguration.returns({
            get: sinon.stub().withArgs('collectorUrl').returns('http://localhost:8000')
        } as any);

        let errorCallback: any;
        const mockReq = {
            on: sinon.stub().callsFake((event, cb) => {
                if (event === 'error') {
                    errorCallback = cb;
                }
            }),
            end: sinon.stub().callsFake(() => {
                if (errorCallback) {
                    errorCallback(new Error('Network error'));
                }
            }),
            destroy: sinon.stub()
        };

        const httpRequestStub = sinon.stub(http, 'request').returns(mockReq as any);

        await triggerFetch();

        assert.isTrue(httpRequestStub.calledOnce, 'http.request should be called');
        assert.isTrue(mockUpdateStatusBar.calledWith(false), 'updateStatusBar should be called with false on error');
    });

    test('should degrade gracefully on timeout', async () => {
        mockGetConfiguration.returns({
            get: sinon.stub().withArgs('collectorUrl').returns('http://localhost:8000')
        } as any);

        let timeoutCallback: any;
        const mockReq = {
            on: sinon.stub().callsFake((event, cb) => {
                if (event === 'timeout') {
                    timeoutCallback = cb;
                }
            }),
            end: sinon.stub().callsFake(() => {
                if (timeoutCallback) {
                    timeoutCallback();
                }
            }),
            destroy: sinon.stub()
        };

        const httpRequestStub = sinon.stub(http, 'request').returns(mockReq as any);

        await triggerFetch();

        assert.isTrue(httpRequestStub.calledOnce, 'http.request should be called');
        assert.isTrue(mockReq.destroy.calledOnce, 'req.destroy should be called on timeout');
        assert.isTrue(mockUpdateStatusBar.calledWith(false), 'updateStatusBar should be called with false on timeout');
    });

    test('should use https.request if collectorUrl is https', async () => {
        mockGetConfiguration.returns({
            get: sinon.stub().withArgs('collectorUrl').returns('https://api.vantinel.com')
        } as any);

        const mockReq = {
            on: sinon.stub(),
            end: sinon.stub(),
            destroy: sinon.stub()
        };

        const httpsRequestStub = sinon.stub(https, 'request').callsFake((options, cb: any) => {
            const mockRes = {
                statusCode: 200,
                on: sinon.stub()
            };
            if (cb) {
                cb(mockRes);
            }
            return mockReq as any;
        });

        await triggerFetch();

        assert.isTrue(httpsRequestStub.calledOnce, 'https.request should be called');
        assert.isTrue(mockUpdateStatusBar.calledWith(true), 'updateStatusBar should be called with true');
    });

    test('should degrade gracefully on invalid URL (synchronous error)', async () => {
        mockGetConfiguration.returns({
            get: sinon.stub().withArgs('collectorUrl').returns('://invalid')
        } as any);

        await triggerFetch();
        assert.isTrue(mockUpdateStatusBar.calledWith(false), 'updateStatusBar should be called with false on invalid URL');
    });
});
