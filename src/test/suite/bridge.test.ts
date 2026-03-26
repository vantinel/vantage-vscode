import { assert } from 'chai';
import * as sinon from 'sinon';
import { WebviewMessage, ExtensionMessage } from '../../shared/types';

suite('Webview Bridge Test Suite', () => {
    let bridgeModule: any;

    setup(async () => {
        // Clear cache so each test gets a fresh module state
        const bridgePath = require.resolve('../../webview/bridge');
        delete require.cache[bridgePath];
        
        // Dynamically import to get fresh instance
        bridgeModule = require('../../webview/bridge');
    });

    teardown(() => {
        sinon.restore();
        if ('acquireVsCodeApi' in global) {
            delete (global as any).acquireVsCodeApi;
        }
        if ('window' in global) {
            delete (global as any).window;
        }
    });

    test('getVsCodeApi returns mock when acquireVsCodeApi is undefined', () => {
        // Temporarily stub console.log to suppress output, without erroring if not found
        const originalLog = console.log;
        console.log = sinon.stub();
        
        const api = bridgeModule.getVsCodeApi();
        assert.isDefined(api);
        assert.isFunction(api.postMessage);
        assert.isFunction(api.getState);
        assert.isFunction(api.setState);
        
        // Verify mock behavior
        api.postMessage({ type: 'hello', payload: {} });
        api.setState({ foo: 'bar' });
        
        const state = api.getState();
        assert.deepEqual(state, {});

        console.log = originalLog;
    });

    test('getVsCodeApi uses acquireVsCodeApi when defined globally', () => {
        const mockVscodeApi = {
            postMessage: sinon.stub(),
            getState: sinon.stub().returns({ state: true }),
            setState: sinon.stub()
        };
        (global as any).acquireVsCodeApi = sinon.stub().returns(mockVscodeApi);

        const api = bridgeModule.getVsCodeApi();
        
        assert.isTrue((global as any).acquireVsCodeApi.calledOnce, 'acquireVsCodeApi should be called');
        assert.strictEqual(api, mockVscodeApi, 'Should return the provided mock API');
    });

    test('postMessageToExtension calls postMessage on the api', () => {
        const mockVscodeApi = {
            postMessage: sinon.stub(),
            getState: sinon.stub(),
            setState: sinon.stub()
        };
        (global as any).acquireVsCodeApi = sinon.stub().returns(mockVscodeApi);

        const message: WebviewMessage = { type: 'hello' } as any;
        bridgeModule.postMessageToExtension(message);

        assert.isTrue(mockVscodeApi.postMessage.calledOnce, 'postMessage should be called once');
        assert.isTrue(mockVscodeApi.postMessage.calledWith(message), 'postMessage should be called with message');
    });

    test('onExtensionMessage registers a handler and returns a cleanup function', () => {
        const addEventListenerStub = sinon.stub();
        const removeEventListenerStub = sinon.stub();
        
        (global as any).window = {
            addEventListener: addEventListenerStub,
            removeEventListener: removeEventListenerStub
        };

        const callback = sinon.stub();
        const cleanup = bridgeModule.onExtensionMessage(callback);

        // Verify addEventListener
        assert.isTrue(addEventListenerStub.calledOnce, 'addEventListener should be called once');
        assert.isTrue(addEventListenerStub.calledWith('message', sinon.match.func), 'addEventListener should be called with "message" and handler');
        
        // Retrieve the registered handler
        const handler = addEventListenerStub.firstCall.args[1];

        // Simulate a message event
        const mockMessage = { type: 'someEvent' } as any;
        handler({ data: mockMessage } as MessageEvent);
        
        assert.isTrue(callback.calledOnce, 'callback should be called once');
        assert.isTrue(callback.calledWith(mockMessage), 'callback should be called with event data');

        // Verify cleanup function
        cleanup();
        assert.isTrue(removeEventListenerStub.calledOnce, 'removeEventListener should be called once');
        assert.isTrue(removeEventListenerStub.calledWith('message', handler), 'removeEventListener should be called with "message" and same handler');
    });
});
