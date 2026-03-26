import React from 'react';

interface HeaderProps {
  collectorStatus?: 'online' | 'offline' | 'connecting';
}

export const Header: React.FC<HeaderProps> = ({ collectorStatus = 'connecting' }) => {
  const isOnline = collectorStatus === 'online';
  const statusClass = isOnline ? 'status-online' : 'status-offline';
  const statusLabel = collectorStatus.toUpperCase();

  return (
    <header className="header">
      <div className="header-logo">
        <span className="logo-accent">⚡</span> VANTINEL
      </div>
      <div className="header-status">
        {isOnline && <div className="pulse-dot"></div>}
        <span>COLLECTOR <span className={statusClass}>{statusLabel}</span></span>
      </div>
      <style>{`
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--vscode-widget-border, #444);
          background: var(--vscode-editor-background);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 600;
          font-family: var(--vscode-editor-font-family), monospace;
          font-size: 12px;
        }

        .header-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--vscode-editor-foreground);
        }

        .logo-accent {
          color: var(--vscode-charts-yellow, #e5b567);
          animation: pulse-accent 2s infinite;
        }

        .header-status {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--vscode-descriptionForeground, #aaa);
          font-size: 11px;
        }

        .status-online {
          color: var(--vscode-charts-green, #89d185);
          font-weight: bold;
        }

        .status-offline {
          color: var(--vscode-errorForeground, #f48771);
          font-weight: bold;
        }

        .pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--vscode-charts-green, #89d185);
          box-shadow: 0 0 8px var(--vscode-charts-green, #89d185);
          animation: blink 1.5s ease-in-out infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }

        @keyframes pulse-accent {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(229,181,103,0.8)); }
          50% { filter: drop-shadow(0 0 8px rgba(229,181,103,1)); }
        }
      `}</style>
    </header>
  );
};
