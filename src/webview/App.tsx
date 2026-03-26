import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { MetricGrid, MetricData } from './components/MetricsCard';
import { LiveFeed, FeedEvent } from './components/LiveFeed';
import { IdeIntegration } from './components/IdeIntegration';
import { postMessageToExtension, onExtensionMessage } from './bridge';
import { HelpCircle } from 'lucide-react';

// Initial state
const INITIAL_METRICS: MetricData[] = [
  { id: 'm1', label: 'TOTAL REQUESTS', value: 0, subtext: 'LAST 24H' },
  { id: 'm2', label: 'LATENCY (P99)', value: '0ms', subtext: 'NORMAL', status: 'normal' },
  { id: 'm3', label: 'SESSION COST', value: '$0.00', subtext: 'SAFE', status: 'success' },
  { id: 'm4', label: 'THREATS BLOCKED', value: 0, subtext: '0 ANOMALIES', status: 'normal' },
];

export const App: React.FC = () => {
  const [metrics, setMetrics] = useState<MetricData[]>(INITIAL_METRICS);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [collectorConnected, setCollectorConnected] = useState(false);
  const [proxyRunning, setProxyRunning] = useState(false);
  const [proxyPort, setProxyPort] = useState(3099);
  const [showIdeGuide, setShowIdeGuide] = useState(false);

  // Accumulate proxy stats across events
  const proxyStatsRef = React.useRef({ intercepted: 0, blocked: 0 });

  // Initialize bridge and listener
  useEffect(() => {
    postMessageToExtension({ type: 'READY' });

    const cleanup = onExtensionMessage((msg) => {
      if (msg.type === 'CONNECTION_STATUS') {
        setCollectorConnected(msg.payload.isConnected);
      } else if (msg.type === 'PROXY_STATS') {
        const { proxyRunning: running, requestsIntercepted, blocked, port } = msg.payload as any;
        setProxyRunning(running);
        if (port) setProxyPort(port);
        proxyStatsRef.current = { intercepted: requestsIntercepted, blocked };
        // Refresh metric cards with real proxy numbers
        setMetrics(prev => prev.map(m => {
          if (m.id === 'm1') return { ...m, value: requestsIntercepted.toLocaleString(), subtext: 'INTERCEPTED BY PROXY' };
          if (m.id === 'm4') return { ...m, value: blocked, subtext: `${blocked} BLOCKED`, status: blocked > 0 ? 'warning' : 'normal' };
          return m;
        }));
      } else if (msg.type === 'PROXY_EVENT') {
        const e = msg.payload as any;
        const feedEvent: FeedEvent = {
          id: e.id,
          timestamp: e.timestamp,
          type: e.eventType === 'BLOCKED' ? 'BLOCK' : e.eventType === 'TOOL_CALL' ? 'WARN' : 'INFO',
          agent: e.provider ?? 'ide-agent',
          tool: e.toolName ?? e.model ?? 'llm_request',
          message: e.eventType === 'BLOCKED'
            ? `Blocked: ${e.toolName} — ${e.reason ?? 'policy violation'}`
            : e.eventType === 'TOOL_CALL'
            ? `Tool call allowed: ${e.toolName} (${e.latencyMs}ms)`
            : `LLM request via ${e.provider} — ${e.model} (${e.latencyMs}ms)`,
        };
        setProxyRunning(true);
        setEvents(prev => [...prev.slice(-99), feedEvent]);
      }
    });

    return cleanup;
  }, []);


  const bannerClass = proxyRunning ? 'connected' : (collectorConnected ? 'connected' : 'demo');
  const bannerText = proxyRunning
    ? `Proxy Active — intercepting IDE AI agent requests`
    : collectorConnected
    ? `Connected to Vantinel Collector`
    : `Showing Demo Data — Proxy Offline`;

  return (
    <div className="app-container">
      <Header />
      <div className={`status-banner ${bannerClass}`}>
        <div className="status-info">
          <span className={`dot ${proxyRunning || collectorConnected ? '' : 'pulse'}`}></span>
          {bannerText}
        </div>
        <div className="flex items-center gap-2">
          {proxyRunning && (
            <button 
              className="guide-btn" 
              onClick={() => setShowIdeGuide(true)}
              title="How to integrate with Cursor / Windsurf / Antigravity"
            >
              <HelpCircle size={14} />
              <span>IDE Setup</span>
            </button>
          )}
          {!proxyRunning && !collectorConnected && (
            <button className="setup-btn" onClick={() => postMessageToExtension({ type: 'SETUP_WIZARD' })}>
              Setup Vantinel
            </button>
          )}
        </div>
      </div>
      <div className="main-content">
        <MetricGrid metrics={metrics} />
        <LiveFeed events={events} />
      </div>

      {showIdeGuide && (
        <IdeIntegration port={proxyPort} onClose={() => setShowIdeGuide(false)} />
      )}

      <style>{`
        /* Global Reset & Base */
        :root {
          /* Fallbacks in case VSCode vars are missing in dev browser */
          --vscode-editor-background: #1e1e1e;
          --vscode-editor-foreground: #d4d4d4;
          --vscode-editor-font-family: Consolas, "Courier New", monospace;
          --status-connected: #4ec9b0;
          --status-demo: #ce9178;
        }

        .status-banner {
          padding: 8px 16px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .status-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .flex { display: flex; }
        .items-center { align-items: center; }
        .gap-2 { gap: 8px; }

        .setup-btn {
          background: var(--status-demo);
          color: #000;
          border: none;
          border-radius: 4px;
          padding: 4px 10px;
          font-size: 10px;
          font-weight: bold;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .guide-btn {
          background: rgba(78, 201, 176, 0.1);
          color: var(--status-connected);
          border: 1px solid rgba(78, 201, 176, 0.2);
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 10px;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .guide-btn:hover {
          background: rgba(78, 201, 176, 0.2);
        }

        .setup-btn:hover {
          opacity: 0.9;
        }

        .status-banner.connected { color: var(--status-connected); }
        .status-banner.demo { color: var(--status-demo); }
...

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
        }

        .dot.pulse {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }

        body {
          margin: 0;
          padding: 0;
          background-color: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
          font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif);
          overflow: hidden;
        }

        * {
          box-sizing: border-box;
        }

        .app-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100vw;
          background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.03) 0%, transparent 70%);
        }

        .main-content {
          display: flex;
          flex-direction: column;
          flex: 1;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};
