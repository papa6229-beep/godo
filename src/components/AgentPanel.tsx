import React from 'react';
import type { Agent } from '../types';
import './AgentPanel.css';

interface AgentPanelProps {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ agents, onSelectAgent }) => {
  return (
    <div className="agent-panel">
      <div className="panel-header">
        <h2 className="panel-title">🤖 AI OPERATING AGENTS ({agents.length})</h2>
        <span className="panel-subtitle">각 카드를 클릭하여 시스템 프롬프트 및 상세 모니터링을 확인하세요.</span>
      </div>

      <div className="agents-grid">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`agent-card ${agent.status}`}
            onClick={() => onSelectAgent(agent)}
          >
            <div className="card-top">
              <div className="card-avatar">
                <span className="card-emoji">{agent.emoji}</span>
              </div>
              <div className="card-meta">
                <div className="card-name-row">
                  <h3 className="card-name">{agent.name}</h3>
                </div>
                <div className="card-role">{agent.role}</div>
              </div>
            </div>

            <div className="card-status-row">
              <span className={`status-dot ${agent.status}`}></span>
              <span className="status-text">
                {agent.status === 'idle' && '대기 중'}
                {agent.status === 'working' && '분석 및 작업 중'}
                {agent.status === 'completed' && '작업 완료'}
                {agent.status === 'offline' && '오프라인'}
              </span>
            </div>

            <div className="card-task-preview">
              <span className="task-label">CURRENT TASK:</span>
              <span className="task-text">{agent.currentTask}</span>
            </div>

            {agent.skills && agent.skills.length > 0 && (
              <div className="card-skills-preview">
                <span className="skills-label">ACTIVE SKILLS:</span>
                <div className="skills-chips">
                  {agent.skills.slice(0, 2).map((skill, i) => (
                    <span key={i} className="skill-chip">{skill}</span>
                  ))}
                  {agent.skills.length > 2 && (
                    <span className="skill-chip-more">+{agent.skills.length - 2}</span>
                  )}
                </div>
              </div>
            )}

            {/* 연결 지식 정보 표시 */}
            {agent.knowledge && agent.knowledge.length > 0 && (
              <div className="card-knowledge-preview">
                <span className="kb-label">LINKED KNOWLEDGE ({agent.knowledge.length}):</span>
                <div className="kb-files-row">
                  {agent.knowledge.slice(0, 2).map((file, i) => (
                    <span key={i} className="kb-file-tag" title={file}>📄 {file}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="card-tags">
              {agent.tags.slice(0, 3).map((tag, i) => (
                <span key={i} className="card-tag">#{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
