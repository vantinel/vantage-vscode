import React from 'react';
import { Terminal, Shield, ExternalLink, Settings, HelpCircle } from 'lucide-react';

interface IdeIntegrationProps {
  onClose: () => void;
  port: number;
}

export const IdeIntegration: React.FC<IdeIntegrationProps> = ({ onClose, port }) => {
  const proxyUrl = `http://localhost:${port}`;

  return (
    <div className="ide-integration-overlay">
      <div className="ide-integration-modal">
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <Shield className="text-[#4ec9b0]" size={20} />
            <h2>IDE Integration Guide</h2>
          </div>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <p className="description">
            To intercept native AI requests from Cursor or Antigravity, you must point them to Vantinel's local proxy.
          </p>

          <div className="guide-section">
            <div className="section-title">
              <img src="https://cursor.com/favicon.ico" width="16" height="16" alt="" />
              <h3>Cursor IDE</h3>
            </div>
            <ol>
              <li>Open <strong>Cursor Settings</strong> (Gear icon or <code>Cmd/Ctrl + Shift + J</code>).</li>
              <li>Go to <strong>Models</strong> tab.</li>
              <li>Toggle <strong>Override OpenAI Base URL</strong> to ON.</li>
              <li>Set URL to: <code className="code-snippet">{proxyUrl}/v1</code></li>
              <li>Ensure your API key is set in Cursor as well.</li>
            </ol>
          </div>

          <div className="guide-section">
            <div className="section-title">
              <Terminal size={16} />
              <h3>Google Antigravity / Agent Manager</h3>
            </div>
            <p>Antigravity respects standard environment variables. Set these before starting the agent manager:</p>
            <div className="code-block">
              <code>export ANTHROPIC_BASE_URL={proxyUrl}</code><br/>
              <code>export OPENAI_BASE_URL={proxyUrl}</code><br/>
              <code>export HTTPS_PROXY={proxyUrl}</code>
            </div>
          </div>

          <div className="guide-section">
            <div className="section-title">
              <Settings size={16} />
              <h3>Windsurf / Other IDEs</h3>
            </div>
            <p>Most IDEs that allow custom OpenAI/Anthropic endpoints can be configured using:</p>
            <div className="code-block">
              <code>{proxyUrl}/v1</code>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="done-btn" onClick={onClose}>I've Configured My IDE</button>
        </div>
      </div>

      <style>{`
        .ide-integration-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .ide-integration-modal {
          background: #1e1e1e;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }

        .modal-header {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #fff;
        }

        .close-btn {
          background: none;
          border: none;
          color: #888;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }

        .modal-body {
          padding: 20px;
          overflow-y: auto;
        }

        .description {
          font-size: 13px;
          color: #aaa;
          margin-bottom: 24px;
          line-height: 1.5;
        }

        .guide-section {
          margin-bottom: 24px;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .section-title h3 {
          margin: 0;
          font-size: 14px;
          color: #4ec9b0;
        }

        .guide-section ol {
          margin: 0;
          padding-left: 18px;
          font-size: 13px;
          color: #ccc;
        }

        .guide-section li {
          margin-bottom: 8px;
        }

        .guide-section p {
          font-size: 13px;
          color: #ccc;
          margin-bottom: 10px;
        }

        .code-snippet {
          background: #2d2d2d;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          color: #ce9178;
        }

        .code-block {
          background: #000;
          padding: 12px;
          border-radius: 8px;
          font-family: monospace;
          font-size: 12px;
          color: #9cdcfe;
          border: 1px solid rgba(255,255,255,0.05);
        }

        .modal-footer {
          padding: 16px 20px;
          border-top: 1px solid rgba(255,255,255,0.05);
          display: flex;
          justify-content: flex-end;
        }

        .done-btn {
          background: #4ec9b0;
          color: #000;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};
