import React from 'react';
import type { AgentHandoff, AgentResult } from '../engine/nativeAgentRuntime/types';
import './HandoffDetailModal.css';

interface HandoffDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  handoff: AgentHandoff;
  relatedResults?: AgentResult[];
}

const DEPT_LABEL: Record<string, string> = {
  product: '상품관리팀',
  cs: 'CS 운영팀',
  marketing: '마케팅팀',
  manager: '총괄 HQ',
};

const DEPT_ICONS: Record<string, string> = {
  product: '📦',
  cs: '💬',
  marketing: '📢',
  manager: '👑',
};

export const HandoffDetailModal: React.FC<HandoffDetailModalProps> = ({
  isOpen,
  onClose,
  handoff,
  relatedResults = [],
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="handoff-detail-overlay" onClick={onClose}>
      <div className="handoff-detail-modal" onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="handoff-detail-header">
          <div className="handoff-detail-title-group">
            <span className="handoff-detail-badge">부서 간 전달 상세</span>
            <h2 className="handoff-detail-title">{handoff.title}</h2>
          </div>
          <button className="handoff-detail-close" onClick={onClose}>×</button>
        </div>

        {/* 전달 경로 시각화 */}
        <div className="handoff-route-visual">
          <div className="handoff-route-dept from">
            <span className="route-dept-icon">{DEPT_ICONS[handoff.fromDepartmentId] ?? '🏢'}</span>
            <div className="route-dept-info">
              <span className="route-dept-label">보낸 부서</span>
              <span className="route-dept-name">{DEPT_LABEL[handoff.fromDepartmentId] ?? handoff.fromDepartmentId}</span>
            </div>
          </div>
          <div className="handoff-route-arrow">
            <div className="arrow-line" />
            <span className="arrow-icon">→</span>
            <div className="arrow-label">전달</div>
          </div>
          <div className="handoff-route-dept to">
            <span className="route-dept-icon">{DEPT_ICONS[handoff.toDepartmentId] ?? '🏢'}</span>
            <div className="route-dept-info">
              <span className="route-dept-label">받은 부서</span>
              <span className="route-dept-name">{DEPT_LABEL[handoff.toDepartmentId] ?? handoff.toDepartmentId}</span>
            </div>
          </div>
        </div>

        {/* 상세 내용 */}
        <div className="handoff-detail-body">

          {/* 전달 정보 */}
          <div className="handoff-info-section">
            <div className="handoff-info-row">
              <span className="handoff-info-label">전달 시각</span>
              <span className="handoff-info-value mono">
                {new Date(handoff.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="handoff-info-row">
              <span className="handoff-info-label">보낸 에이전트</span>
              <span className="handoff-info-value mono">{handoff.fromAgentId}</span>
            </div>
            {handoff.toAgentId && (
              <div className="handoff-info-row">
                <span className="handoff-info-label">받은 에이전트</span>
                <span className="handoff-info-value mono">{handoff.toAgentId}</span>
              </div>
            )}
            <div className="handoff-info-row">
              <span className="handoff-info-label">Run ID</span>
              <span className="handoff-info-value mono small">{handoff.runId}</span>
            </div>
          </div>

          {/* 전달 메시지 */}
          <div className="handoff-message-section">
            <h3 className="handoff-section-title">전달 메시지</h3>
            <div className="handoff-message-box">
              <p>{handoff.message}</p>
            </div>
          </div>

          {/* 관련 처리 결과 */}
          {relatedResults.length > 0 && (
            <div className="handoff-results-section">
              <h3 className="handoff-section-title">관련 처리 결과 ({relatedResults.length}건)</h3>
              <div className="handoff-results-list">
                {relatedResults.map(r => (
                  <div key={r.id} className={`handoff-result-card ${r.status}`}>
                    <div className="handoff-result-header">
                      <span className={`handoff-result-badge ${r.status}`}>
                        {r.status === 'success' ? '완료' : r.status === 'failed' ? '실패' : r.status === 'needs_review' ? '검토 필요' : r.status}
                      </span>
                      {r.approvalRequired && <span className="handoff-approval-tag">승인 필요</span>}
                    </div>
                    <div className="handoff-result-summary">{r.summary}</div>
                    {r.findings.length > 0 && (
                      <ul className="handoff-result-findings">
                        {r.findings.slice(0, 3).map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
