import React from 'react';
import type { Agent } from '../types';
import type { NativeAgentRun } from '../engine/nativeAgentRuntime/types';
import './AgentPanel.css';

interface AgentPanelProps {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
  lastNativeAgentRun?: NativeAgentRun | null;
}

const DEPARTMENTS = [
  {
    id: 'manager',
    name: '👑 본부 및 오케스트레이션 (HQ)',
    description: '전체 운영 프로세스 총괄 및 브리핑 작성',
    leadId: 'manager',
    memberIds: [] as string[]
  },
  {
    id: 'product',
    name: '📦 상품 및 재고 관리팀',
    description: '상품 정보 무결성 검수 및 안전 재고 실시간 관제',
    leadId: 'product',
    memberIds: ['order', 'stock']
  },
  {
    id: 'cs',
    name: '💬 CS 및 평판 관리팀',
    description: '1:1 고객 문의 자동 답변 설계 및 브랜드 부정 리스크 수집',
    leadId: 'cs',
    memberIds: ['delivery', 'review']
  },
  {
    id: 'marketing',
    name: '📈 마케팅 및 전략 분석팀',
    description: '트렌드 분석을 통한 타겟 캠페인 기획 및 매출 통계 요약',
    leadId: 'marketing',
    memberIds: ['finance']
  }
];

export const AgentPanel: React.FC<AgentPanelProps> = ({ agents, onSelectAgent }) => {
  // Helper to render an agent card
  const renderAgentCard = (agent: Agent, isLead: boolean) => {
    return (
      <div
        key={agent.id}
        className={`agent-card ${agent.status} ${isLead ? 'lead-card' : 'member-card'}`}
        onClick={() => onSelectAgent(agent)}
      >
        {isLead && <span className="lead-badge">TEAM LEAD</span>}
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
    );
  };

  return (
    <div className="agent-panel">
      <div className="panel-header">
        <h2 className="panel-title">🤖 GODO NATIVE AGENT ORG CHART ({agents.length} Agents)</h2>
        <span className="panel-subtitle">부서별 팀장 및 부서원들의 인지 그리드(Cognitive Grid) 현황입니다.</span>
      </div>

      <div className="departments-container">
        {DEPARTMENTS.map((dept) => {
          const leadAgent = agents.find(a => a.id === dept.leadId);
          const memberAgents = agents.filter(a => dept.memberIds.includes(a.id));

          if (!leadAgent && memberAgents.length === 0) return null;

          return (
            <div key={dept.id} className="department-section">
              <div className="dept-section-header">
                <h3 className="dept-section-title">{dept.name}</h3>
                <p className="dept-section-desc">{dept.description}</p>
              </div>

              <div className="dept-agents-layout">
                {/* 팀장 렌더링 */}
                {leadAgent && (
                  <div className="dept-lead-zone">
                    {renderAgentCard(leadAgent, true)}
                  </div>
                )}

                {/* 팀원들 렌더링 */}
                {memberAgents.length > 0 && (
                  <div className="dept-members-zone">
                    <div className="members-grid">
                      {memberAgents.map(member => renderAgentCard(member, false))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
