import React, { useEffect, useRef } from 'react';

export interface FeedEvent {
  id: string;
  timestamp: number;
  type: 'INFO' | 'WARN' | 'BLOCK' | 'ERROR';
  agent: string;
  tool: string;
  message: string;
}

interface LiveFeedProps {
  events: FeedEvent[];
}

export const LiveFeed: React.FC<LiveFeedProps> = ({ events }) => {
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  };

  const getEventClass = (type: string) => {
    switch (type) {
      case 'WARN': return 'event-warn';
      case 'BLOCK': return 'event-block';
      case 'ERROR': return 'event-error';
      default: return 'event-info';
    }
  };

  return (
    <div className="live-feed-container">
      <div className="feed-header">
        <span className="feed-title">REAL-TIME TELEMETRY STREAM</span>
        <span className="feed-meta">{events.length} EVENTS</span>
      </div>
      
      <div className="feed-scroll" ref={feedRef}>
        {events.length === 0 ? (
          <div className="feed-empty">WAITING FOR TELEMETRY...</div>
        ) : (
          events.map(ev => (
            <div key={ev.id} className={`feed-row ${getEventClass(ev.type)}`}>
              <div className="feed-cell col-time">{formatTime(ev.timestamp)}</div>
              <div className="feed-cell col-type">[{ev.type}]</div>
              <div className="feed-cell col-agent">{ev.agent}</div>
              <div className="feed-cell col-tool">{ev.tool}</div>
              <div className="feed-cell col-message">{ev.message}</div>
            </div>
          ))
        )}
      </div>

      <style>{`
        .live-feed-container {
          display: flex;
          flex-direction: column;
          flex: 1;
          margin: 16px;
          border: 1px solid var(--vscode-widget-border, #444);
          background: var(--vscode-editorWidget-background, #252526);
          overflow: hidden;
          font-family: var(--vscode-editor-font-family), monospace;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }

        .feed-header {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          border-bottom: 1px solid var(--vscode-widget-border, #444);
          background: var(--vscode-sideBarTitle-background, #252526);
          font-size: 10px;
          letter-spacing: 0.1em;
          color: var(--vscode-descriptionForeground, #aaa);
        }

        .feed-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
          scrollbar-width: thin;
          scrollbar-color: var(--vscode-scrollbarSlider-background) transparent;
        }

        .feed-scroll::-webkit-scrollbar {
          width: 8px;
        }
        
        .feed-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .feed-scroll::-webkit-scrollbar-thumb {
          background: var(--vscode-scrollbarSlider-background);
        }
        
        .feed-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--vscode-scrollbarSlider-hoverBackground);
        }

        .feed-empty {
          padding: 32px;
          text-align: center;
          color: var(--vscode-descriptionForeground, #aaa);
          font-size: 11px;
          letter-spacing: 0.1em;
          animation: pulse 2s infinite;
        }

        .feed-row {
          display: flex;
          padding: 4px 12px;
          font-size: 12px;
          line-height: 1.4;
          border-bottom: 1px solid transparent;
          animation: slide-in 0.15s ease-out forwards;
        }

        .feed-row:hover {
          background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05));
        }

        .feed-cell {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .col-time { width: 100px; color: var(--vscode-descriptionForeground, #888); }
        .col-type { width: 70px; font-weight: bold; }
        .col-agent { width: 150px; color: var(--vscode-symbolIcon-classForeground, #ee9d28); }
        .col-tool { width: 150px; color: var(--vscode-symbolIcon-functionForeground, #b180d7); }
        .col-message { flex: 1; min-width: 0; }

        /* Types */
        .event-info .col-type { color: var(--vscode-charts-blue, #3794ff); }
        .event-info .col-message { color: var(--vscode-editor-foreground, #d4d4d4); }
        
        .event-warn .col-type { color: var(--vscode-charts-yellow, #cca700); }
        .event-warn .col-message { color: var(--vscode-charts-yellow, #cca700); }
        .event-warn { background: rgba(204, 167, 0, 0.05); border-bottom-color: rgba(204, 167, 0, 0.1); }
        
        .event-block .col-type { color: var(--vscode-charts-red, #f14c4c); }
        .event-block .col-message { color: var(--vscode-charts-red, #f14c4c); font-weight: 500; }
        .event-block { background: rgba(241, 76, 76, 0.05); border-left: 2px solid var(--vscode-charts-red, #f14c4c); }

        .event-error .col-type { color: var(--vscode-errorForeground, #f14c4c); }
        .event-error .col-message { color: var(--vscode-errorForeground, #f14c4c); }

        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        @keyframes slide-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
