import React from 'react';

export interface MetricData {
  id: string;
  label: string;
  value: string | number;
  subtext?: string;
  status?: 'normal' | 'warning' | 'critical' | 'success';
}

interface MetricGridProps {
  metrics: MetricData[];
}

export const MetricGrid: React.FC<MetricGridProps> = ({ metrics }) => {
  return (
    <div className="metric-grid">
      {metrics.map(metric => (
        <MetricCard key={metric.id} {...metric} />
      ))}
      <style>{`
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          padding: 16px;
          background: var(--vscode-editor-background);
        }
      `}</style>
    </div>
  );
};

const MetricCard: React.FC<MetricData> = ({ label, value, subtext, status = 'normal' }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'warning': return 'var(--vscode-charts-yellow, #cca700)';
      case 'critical': return 'var(--vscode-charts-red, #f14c4c)';
      case 'success': return 'var(--vscode-charts-green, #89d185)';
      default: return 'var(--vscode-charts-blue, #3794ff)';
    }
  };

  const statusColor = getStatusColor();

  return (
    <div className="metric-card" style={{ '--status-color': statusColor } as any}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {subtext && <div className="metric-subtext">{subtext}</div>}

      <div className="metric-card-border" />
      <div className="metric-card-glow" />

      <style>{`
        .metric-card {
          position: relative;
          background: var(--vscode-editorWidget-background, #252526);
          padding: 16px;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--vscode-widget-border, #444);
          overflow: hidden;
        }

        .metric-card-border {
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          background: var(--status-color);
        }

        .metric-card-glow {
          position: absolute;
          top: -20%;
          left: -20%;
          width: 140%;
          height: 140%;
          background: radial-gradient(circle at top left, var(--status-color), transparent 70%);
          opacity: 0.05;
          pointer-events: none;
        }

        .metric-label {
          font-family: var(--vscode-editor-font-family), monospace;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--vscode-descriptionForeground, #aaa);
          margin-bottom: 8px;
        }

        .metric-value {
          font-family: var(--vscode-editor-font-family), monospace;
          font-size: 28px;
          font-weight: 300;
          color: var(--vscode-editor-foreground, #fff);
          line-height: 1.1;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }

        .metric-subtext {
          font-size: 11px;
          color: var(--status-color);
          font-family: var(--vscode-editor-font-family), monospace;
          margin-top: auto;
          font-weight: 500;
        }

        /* Glitch effect on hover */
        .metric-card:hover .metric-value {
          animation: text-flicker 0.2s ease-in-out;
        }

        @keyframes text-flicker {
          0% { opacity: 1; text-shadow: none; }
          20% { opacity: 0.8; text-shadow: -2px 0 var(--vscode-charts-red); }
          40% { opacity: 1; text-shadow: none; }
          60% { opacity: 0.9; text-shadow: 2px 0 var(--vscode-charts-blue); }
          80% { opacity: 1; text-shadow: none; }
          100% { opacity: 1; text-shadow: none; }
        }
      `}</style>
    </div>
  );
};
