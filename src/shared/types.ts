export type WebviewMessageType = 'READY' | 'GET_METRICS' | 'OPEN_SETTINGS' | 'SETUP_WIZARD';

export interface BaseMessage {
  type: WebviewMessageType;
}

export interface ReadyMessage extends BaseMessage {
  type: 'READY';
}

export interface GetMetricsMessage extends BaseMessage {
  type: 'GET_METRICS';
}

export interface OpenSettingsMessage extends BaseMessage {
  type: 'OPEN_SETTINGS';
}

export interface SetupWizardMessage extends BaseMessage {
  type: 'SETUP_WIZARD';
}

export type WebviewMessage = ReadyMessage | GetMetricsMessage | OpenSettingsMessage | SetupWizardMessage;

// Messages from extension to webview
export type ExtensionMessageType = 'METRICS_UPDATED' | 'SETTINGS_UPDATED' | 'CONNECTION_STATUS' | 'PROXY_EVENT' | 'PROXY_STATS';

export interface ExtensionBaseMessage {
  type: ExtensionMessageType;
}

export interface MetricsUpdatedMessage extends ExtensionBaseMessage {
  type: 'METRICS_UPDATED';
  payload: any;
}

export interface SettingsUpdatedMessage extends ExtensionBaseMessage {
  type: 'SETTINGS_UPDATED';
  payload: any;
}

export interface ConnectionStatusMessage extends ExtensionBaseMessage {
  type: 'CONNECTION_STATUS';
  payload: { isConnected: boolean };
}

export interface ProxyEventMessage extends ExtensionBaseMessage {
  type: 'PROXY_EVENT';
  payload: {
    id: string;
    timestamp: number;
    /** 'REQUEST' = LLM call with no tool use, 'TOOL_CALL' = tool allowed, 'BLOCKED' = tool blocked */
    eventType: 'REQUEST' | 'TOOL_CALL' | 'BLOCKED';
    model: string;
    toolName?: string;
    blocked: boolean;
    reason?: string;
    sessionId: string;
    latencyMs: number;
    provider: 'anthropic' | 'openai' | 'gemini';
  };
}

export interface ProxyStatsMessage extends ExtensionBaseMessage {
  type: 'PROXY_STATS';
  payload: {
    requestsIntercepted: number;
    blocked: number;
    proxyRunning: boolean;
    port: number;
  };
}

export type ExtensionMessage =
  | MetricsUpdatedMessage
  | SettingsUpdatedMessage
  | ConnectionStatusMessage
  | ProxyEventMessage
  | ProxyStatsMessage;
