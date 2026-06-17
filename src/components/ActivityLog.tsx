import React, { useRef, useEffect } from 'react';
import type { LogEntry } from '../types';
import './ActivityLog.css';

interface ActivityLogProps {
  logs: LogEntry[];
  onClearLogs?: () => void;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ logs, onClearLogs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  return (
    <div className="activity-log">
      <div className="log-header">
        <div className="log-header-left">
          <span className="log-dot red"></span>
          <span className="log-dot yellow"></span>
          <span className="log-dot green"></span>
          <h2 className="log-title">🛰️ SYSTEM ACTIVITY LOG</h2>
        </div>
        {onClearLogs && (
          <button className="clear-log-btn" onClick={onClearLogs}>
            CLEAR LOGS
          </button>
        )}
      </div>

      <div className="log-terminal">
        {logs.length === 0 ? (
          <div className="log-line system-type">
            <span className="log-time">[SYSTEM]</span>
            <span className="log-text">No active log entries. Start operation to capture events...</span>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`log-line ${log.type}-type`}>
              <span className="log-time">[{log.timestamp}]</span>
              {log.agentName && <span className="log-agent">[{log.agentName}]</span>}
              <span className="log-text">{log.text}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};
