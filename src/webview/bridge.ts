import { WebviewMessage, ExtensionMessage } from '../shared/types';

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): any;
  setState(state: any): void;
}

// Ensure `acquireVsCodeApi` is only called once.
let vscodeApi: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
  if (!vscodeApi) {
    if (typeof acquireVsCodeApi === 'function') {
      vscodeApi = acquireVsCodeApi();
    } else {
      // Mock for development in standard browser
      vscodeApi = {
        postMessage: (message: WebviewMessage) => console.log('Mock postMessage:', message),
        getState: () => ({}),
        setState: (state: any) => console.log('Mock setState:', state),
      };
    }
  }
  return vscodeApi!;
}

export function postMessageToExtension(message: WebviewMessage): void {
  getVsCodeApi().postMessage(message);
}

export function onExtensionMessage(callback: (message: ExtensionMessage) => void): () => void {
  const handler = (event: MessageEvent<ExtensionMessage>) => {
    callback(event.data);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
