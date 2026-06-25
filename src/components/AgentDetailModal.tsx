import React, { useState } from 'react';
import type { Agent } from '../types';
import type { BrainProviderId } from '../types/aiProvider';
import {
  getAgentBrainChoice,
  setAgentBrainChoice,
  getGlobalBrainSelection,
  providerLabel,
  isBrainConnected
} from '../services/aiBrainSettings';
import './AgentDetailModal.css';

const BRAIN_OPTIONS: { value: 'global' | BrainProviderId; label: string }[] = [
  { value: 'global', label: '전체 기본 AI 따라가기' },
  { value: 'claude_api', label: 'Claude로 고정' },
  { value: 'openai_api', label: 'OpenAI로 고정' },
  { value: 'gemini_api', label: 'Gemini로 고정' },
  { value: 'local_lmstudio', label: 'LM Studio로 고정' }
];

const brainIsLocalDev: boolean =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

interface AgentDetailModalProps {
  agent: Agent;
  onClose: () => void;
  onDirectInstruct: (agentId: string, instruction: string) => void;
  onNavigateToBrain: (itemId: string) => void;
  onNavigateToStudio?: (agentId: string) => void;
}

const agentStatsMap: Record<string, { aiCount: number; dataset: string; synergy: string; level: number }> = {
  manager: { aiCount: 5, dataset: '142K', synergy: '98%', level: 12 },
  cs: { aiCount: 3, dataset: '185K', synergy: '94%', level: 9 },
  order: { aiCount: 2, dataset: '92K', synergy: '96%', level: 10 },
  delivery: { aiCount: 2, dataset: '68K', synergy: '89%', level: 8 },
  review: { aiCount: 3, dataset: '110K', synergy: '91%', level: 9 },
  marketing: { aiCount: 4, dataset: '150K', synergy: '93%', level: 11 },
  product: { aiCount: 3, dataset: '130K', synergy: '92%', level: 9 },
  stock: { aiCount: 2, dataset: '74K', synergy: '95%', level: 10 },
  finance: { aiCount: 3, dataset: '120K', synergy: '97%', level: 11 },
};

const agentEnglishRoleMap: Record<string, string> = {
  manager: 'HQ-01 CENTRAL ORCHESTRATOR',
  cs: 'CS-02 CUSTOMER DIALOGUE ANALYST',
  order: 'ORD-03 TRANSACTION INTEGRITY VERIFIER',
  delivery: 'DLV-04 LOGISTICS LIFECYCLE TRACKER',
  review: 'REV-05 SENTIMENT ANALYSIS SPECIALIST',
  marketing: 'MKT-06 GROWTH CAMPAIGN DESIGNER',
  product: 'PDT-07 CATALOG SEO OPTIMIZER',
  stock: 'STK-08 SUPPLY CHAIN RISK MONITOR',
  finance: 'FIN-09 REVENUE & METRICS ANALYST',
};

export const AgentDetailModal: React.FC<AgentDetailModalProps> = ({
  agent,
  onClose,
  onDirectInstruct,
  onNavigateToBrain,
  onNavigateToStudio
}) => {
  const [instruction, setInstruction] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [brainChoice, setBrainChoice] = useState<'global' | BrainProviderId>(() => getAgentBrainChoice(agent.id));
  const [brainMsg, setBrainMsg] = useState('');

  const handleBrainChange = (value: 'global' | BrainProviderId) => {
    // 선택은 항상 허용하고(저장), 연결 필요 여부만 상태로 안내한다.
    setAgentBrainChoice(agent.id, value);
    setBrainChoice(value);
    if (value !== 'global' && value !== 'local_lmstudio' && !isBrainConnected(value)) {
      setBrainMsg(`저장됨 · ${providerLabel(value)} 연결 키가 필요합니다. (관리자 설정 → AI 연결)`);
    } else if (value === 'local_lmstudio' && !brainIsLocalDev) {
      setBrainMsg('저장됨 · LM Studio는 개발 환경 전용입니다.');
    } else {
      setBrainMsg('저장되었습니다.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim()) return;
    onDirectInstruct(agent.id, instruction);
    setInstruction('');
  };

  const stats = agentStatsMap[agent.id] || { aiCount: 2, dataset: '50K', synergy: '90%', level: 8 };
  const englishRole = agentEnglishRoleMap[agent.id] || 'COGNITIVE AGENT MODULE';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-glow"></div>
          <span className="modal-header-subtitle">SYSTEM COGNITIVE AGENT PROFILE</span>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body-layout">
          {/* 좌측 컬럼: 프로필 카드 영역 */}
          <div className="modal-left-column">
            <div className="agent-profile-card">
              <div className="agent-banner-pattern"></div>
              <div className="agent-avatar-outer">
                <span className="agent-modal-emoji">{agent.emoji}</span>
              </div>
              <h2 className="agent-modal-name">{agent.name}</h2>
              <p className="agent-modal-eng-role">{englishRole}</p>
              <p className="agent-modal-role">{agent.role}</p>

              <div className="agent-status-container">
                <span className={`agent-status-badge ${agent.status}`}>
                  {agent.status === 'idle' && '● 대기 중 (IDLE)'}
                  {agent.status === 'working' && '● 분석 및 작업 중 (RUNNING)'}
                  {agent.status === 'completed' && '● 작업 완료 (SUCCESS)'}
                  {agent.status === 'offline' && '○ 오프라인 (OFFLINE)'}
                </span>
              </div>

              {onNavigateToStudio && (
                <button
                  className="agent-modal-studio-btn"
                  onClick={() => onNavigateToStudio(agent.id)}
                >
                  ⚙️ Studio에서 편집
                </button>
              )}
            </div>

            <div className="modal-left-tags-section">
              <span className="section-title">🏷️ 태그 (TAGS)</span>
              <div className="agent-tags-container">
                {agent.tags.map((tag, i) => (
                  <span key={i} className="tag-badge">#{tag}</span>
                ))}
              </div>
            </div>
          </div>

          {/* 우측 컬럼: 지표 및 상세 정보 */}
          <div className="modal-right-column">
            {/* 성능 지표 (Stats) */}
            <div className="modal-section">
              <h3 className="section-title">📊 핵심 성능 지표 (STATS)</h3>
              <div className="agent-stats-grid">
                <div className="stats-card">
                  <span className="stats-label">보유 AI</span>
                  <span className="stats-value">{stats.aiCount}대</span>
                </div>
                <div className="stats-card">
                  <span className="stats-label">학습 데이터셋</span>
                  <span className="stats-value">{stats.dataset}</span>
                </div>
                <div className="stats-card">
                  <span className="stats-label">시너지율</span>
                  <span className="stats-value">{stats.synergy}</span>
                </div>
                <div className="stats-card">
                  <span className="stats-label">운영 레벨</span>
                  <span className="stats-value">Lv.{stats.level}</span>
                </div>
              </div>
            </div>

            {/* 이 직원이 사용할 AI */}
            <div className="modal-section sub-panel">
              <h3 className="section-title">🧠 이 직원이 사용할 AI</h3>
              <select
                className="agent-brain-select"
                value={brainChoice}
                onChange={(e) => handleBrainChange(e.target.value as 'global' | BrainProviderId)}
              >
                {BRAIN_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.value === 'global'
                      ? `전체 기본 AI 따라가기: ${getGlobalBrainSelection().label || providerLabel(getGlobalBrainSelection().providerId)}`
                      : o.label}
                  </option>
                ))}
              </select>
              <p className="agent-brain-help">
                {brainMsg || '아직 정하지 않았다면 “기본 AI 사용”을 선택하세요. 나중에 직원별로 바꿀 수 있습니다.'}
              </p>
            </div>

            {/* 보유 기능 */}
            <div className="modal-section sub-panel">
              <h3 className="section-title">⚡ 보유 기능 (Capabilities)</h3>
              <ul className="capabilities-list">
                {agent.capabilities.map((cap, i) => (
                  <li key={i} className="capability-item">
                    <span className="bullet">✓</span> <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 최근 참조 지식 (RECENT RAG CONTEXTS) */}
            <div className="modal-section sub-panel">
              <h3 className="section-title">🔍 최근 참조 지식 (RECENT RAG CONTEXTS)</h3>
              <div className="recent-knowledge-box">
                {agent.knowledge && agent.knowledge.length > 0 ? (
                  <div className="recent-kb-list">
                    {agent.knowledge.slice(0, 2).map((item, i) => (
                      <button 
                        key={i} 
                        className="recent-kb-item-btn"
                        onClick={() => onNavigateToBrain(item)}
                        title="Brain 지식 저장소에서 확인"
                      >
                        📂 {item}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="no-kb-text">최근 참조한 지식 문서가 없습니다.</span>
                )}
              </div>
            </div>

            {/* Agent Skill System MVP (Knowledge / Skills / Tools / Permission) */}
            <div className="modal-section skill-system-section sub-panel">
              <h3 className="section-title">🔮 에이전트 시스템 아키텍처 (Agent Architecture)</h3>
              <div className="architecture-grid">
                {/* Knowledge */}
                <div className="arch-card">
                  <div className="arch-card-header">
                    <span className="arch-icon">📚</span>
                    <span className="arch-label">KNOWLEDGE BASE ({(agent.knowledge || []).length})</span>
                  </div>
                  <ul className="arch-list">
                    {(agent.knowledge || []).map((item, i) => (
                      <li key={i} className="arch-item">
                        <button 
                          className="arch-kb-link-btn" 
                          onClick={() => onNavigateToBrain(item)}
                          title="Brain 지식 저장소에서 확인"
                        >
                          📄 {item}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Skills */}
                <div className="arch-card">
                  <div className="arch-card-header">
                    <span className="arch-icon">⚡</span>
                    <span className="arch-label">ACTIVE SKILLS</span>
                  </div>
                  <ul className="arch-list">
                    {(agent.skills || []).map((item, i) => (
                      <li key={i} className="arch-item">{item}</li>
                    ))}
                  </ul>
                </div>

                {/* Tools */}
                <div className="arch-card">
                  <div className="arch-card-header">
                    <span className="arch-icon">🛠️</span>
                    <span className="arch-label">EQUIPPED TOOLS</span>
                  </div>
                  <ul className="arch-list">
                    {(agent.tools || []).map((item, i) => (
                      <li key={i} className="arch-item">{item}</li>
                    ))}
                  </ul>
                </div>

                {/* Permissions */}
                <div className="arch-card">
                  <div className="arch-card-header">
                    <span className="arch-icon">🔑</span>
                    <span className="arch-label">PERMISSIONS</span>
                  </div>
                  <ul className="arch-list">
                    {(agent.permissions || []).map((item, i) => (
                      <li key={i} className="arch-item">{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Memory */}
              {agent.memory && agent.memory.length > 0 && (
                <div className="arch-memory-section">
                  <div className="arch-card-header">
                    <span className="arch-icon">🧠</span>
                    <span className="arch-label">COGNITIVE MEMORY (RECENT HISTORY)</span>
                  </div>
                  <ul className="memory-list">
                    {agent.memory.map((item, i) => (
                      <li key={i} className="memory-item">
                        <span className="memory-bullet">▶</span>
                        <span className="memory-text">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 현재 수행 작업 */}
            <div className="modal-section sub-panel">
              <h3 className="section-title">⚙️ 현재 수행 작업</h3>
              <div className="current-task-box">
                {agent.currentTask}
              </div>
            </div>

            {/* 시스템 프롬프트 */}
            <div className="modal-section">
              <button
                className="toggle-prompt-btn"
                onClick={() => setShowPrompt(!showPrompt)}
              >
                {showPrompt ? '▲ 시스템 프롬프트 숨기기' : '▼ 시스템 프롬프트 (System Prompt) 보기'}
              </button>
              {showPrompt && (
                <pre className="system-prompt-box">
                  <code>{agent.systemPrompt}</code>
                </pre>
              )}
            </div>

            {/* 개별 지시 내리기 */}
            <div className="modal-section instruction-section sub-panel">
              <h3 className="section-title">🛰️ 개별 지시 내리기 (Direct Instruction)</h3>
              <form onSubmit={handleSubmit} className="instruction-form">
                <input
                  type="text"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="이 에이전트에게 내릴 구체적인 명령을 입력하세요..."
                  className="instruction-input"
                />
                <button type="submit" className="instruction-submit-btn">
                  지시 전송
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
