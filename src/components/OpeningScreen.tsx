import React, { useEffect, useState } from 'react';
import './OpeningScreen.css';

interface OpeningScreenProps {
  onFinished: () => void;
}

export const OpeningScreen: React.FC<OpeningScreenProps> = ({ onFinished }) => {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('CONNECTING TO GODO SERVER...');

  const statusLogs = [
    'CONNECTING TO GODO API GATEWAY...',
    'INITIALIZING HQ-01 GENERAL MANAGER...',
    'LOADING CUSTOMER SERVICE AGENTS (CS-02)...',
    'SYNCHRONIZING ORDER TRACKING SYSTEM (ORD-03)...',
    'SETTING UP LOGISTICS INTERFACES (DLV-04)...',
    'BOOTING REVIEW AGENT BRAIN (REV-05)...',
    'PARSING MARKETING CAMPAIGN RULES (MKT-06)...',
    'INDEXING PRODUCT CATALOG (PDT-07)...',
    'CALIBRATING INVENTORY MONITORS (STK-08)...',
    'MOUNTING FINANCIAL REPORTING SYSTEM (FIN-09)...',
    'ESTABLISHING AUTONOMOUS CHANNELS...',
    'SYSTEM READY. STARTING AI OPERATING CENTER...'
  ];

  useEffect(() => {
    // 프로그레스 바 업데이트
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, 40);

    return () => clearInterval(progressInterval);
  }, []);

  useEffect(() => {
    // 상태 텍스트 순차 변경
    const statusIndex = Math.min(
      Math.floor((progress / 100) * statusLogs.length),
      statusLogs.length - 1
    );
    setStatusText(statusLogs[statusIndex]);

    if (progress === 100) {
      const timeout = setTimeout(() => {
        onFinished();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [progress, onFinished]);

  return (
    <div className="opening-container">
      <div className="scanline"></div>
      <div className="terminal-glow"></div>
      <div className="opening-content">
        <div className="glitch-wrapper">
          <h1 className="opening-title" data-text="GODO AI OPERATING CENTER">
            GODO AI OPERATING CENTER
          </h1>
        </div>
        <p className="opening-subtitle">Autonomous Shopping Mall Agent Team v1.0.0</p>

        <div className="loader-container">
          <div className="loader-header">
            <span className="loader-status-text">{statusText}</span>
            <span className="loader-percent">{progress}%</span>
          </div>
          <div className="loader-bar-bg">
            <div className="loader-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
        </div>

        <div className="boot-terminal">
          <div className="terminal-line">&gt; SYSTEM BOOT SEQUENCE INITIATED...</div>
          <div className="terminal-line">&gt; SECURE PROTOCOL ENFORCED (SSL/TLS)</div>
          <div className="terminal-line">&gt; DEPLOYING AGENT INSTANCES IN SANDBOX_MODE</div>
          {progress > 30 && <div className="terminal-line green-text">&gt; [OK] AGENT KERNELS INITIALIZED</div>}
          {progress > 60 && <div className="terminal-line green-text">&gt; [OK] MEMORY VECTOR STORE CONNECTED</div>}
          {progress > 85 && <div className="terminal-line green-text">&gt; [OK] GODO MALL SYNC SUCCESSFUL</div>}
        </div>
      </div>
    </div>
  );
};
