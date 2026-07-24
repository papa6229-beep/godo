import React from 'react';
import type { ApprovalItem } from '../types/approval';
import type { Agent } from '../types';
import './ApprovalListModal.css';
import { UNKNOWN_AFFILIATION_LABEL, approvalActorDisplay } from '../services/taskLifecycleAppAdapter';
import { isSameAgent, toCanonicalAgentId } from '../services/agentIdRegistry';
import { defaultNativeAgents } from '../data/defaultNativeAgentRuntime';

interface ApprovalListModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ApprovalItem[];
  agents: Agent[];
  statuses?: ApprovalItem['status'][];
  title: string;
  onSelectApproval?: (item: ApprovalItem) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

const STATUS_LABEL: Record<ApprovalItem['status'], string> = {
  waiting: '승인 대기',
  approved: '승인 완료',
  rejected: '거절 처리',
  // RC-2: 사용자 문구(내부 상태명 노출 금지)
  not_adopted: '이번 결과 사용 안 함',
  cancelled: '작업 중단',
};

export const ApprovalListModal: React.FC<ApprovalListModalProps> = ({
  isOpen,
  onClose,
  items,
  agents,
  statuses,
  title,
  onSelectApproval,
  onApprove,
  onReject,
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

  const filtered = statuses && statuses.length > 0
    ? items.filter(it => statuses.includes(it.status))
    : items;

  const getAgentInfo = (agentId: string) => {
    // RC-2 D-1.3: 정본은 canonical id, 화면 캐릭터 목록은 legacy id 다.
    //   별칭표(isSameAgent)를 거쳐 찾는다 — 정확 일치로만 찾으면 알려진 AI 도 미상으로 보인다.
    const agent = agents.find((a) => isSameAgent(a.id, agentId));
    if (agent) return { name: agent.name, emoji: agent.emoji };
    // 런타임 정의에 있는 AI 는 그 표시명을 쓴다(내부 id 를 그대로 노출하지 않는다).
    const known = defaultNativeAgents.find((a) => a.id === toCanonicalAgentId(agentId));
    if (known) return { name: known.name, emoji: '🤖' };
    return agentId ? { name: UNKNOWN_AFFILIATION_LABEL, emoji: '❓' } : { name: '수행자 미정', emoji: '🕓' };
  };

  const handleSelect = (item: ApprovalItem) => {
    onSelectApproval?.(item);
    onClose();
  };

  return (
    <div className="approval-list-overlay" onClick={onClose}>
      <div className="approval-list-modal" onClick={e => e.stopPropagation()}>

        <div className="approval-list-header">
          <div className="approval-list-header-left">
            <span className="approval-list-badge">🔑 승인 대기열</span>
            <h2 className="approval-list-title">{title}</h2>
            <span className="approval-list-count">{filtered.length}건</span>
          </div>
          <button className="approval-list-close-btn" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="approval-list-body">
          {filtered.length === 0 ? (
            <div className="approval-list-empty">
              <span className="approval-list-empty-icon">🔑</span>
              <p>해당 상태의 승인 항목이 없습니다.</p>
              <p className="approval-list-empty-hint">고객 답변, 상품 수정, 캠페인 실행처럼 최종 확인이 필요한 작업이 생기면 이곳에 표시됩니다.</p>
            </div>
          ) : (
            <div className="approval-list-cards">
              {filtered.map(item => {
                // RC-2 D-1.3.3.2: 확인요청·인간 제출자는 공통 표시 함수로, AI 는 캐릭터 명단으로.
                const info = approvalActorDisplay(item) ?? getAgentInfo(item.requestedByAgentId);
                return (
                  <div
                    key={item.id}
                    className={`approval-list-card status-${item.status} risk-${item.riskLevel}`}
                  >
                    <button
                      type="button"
                      className="approval-list-card-clickable"
                      onClick={() => handleSelect(item)}
                      title="승인안 상세 보기"
                    >
                      <div className="approval-list-card-top">
                        <span className="approval-list-agent">
                          {info.emoji} {info.name}
                        </span>
                        <span className={`approval-list-risk risk-${item.riskLevel}`}>
                          {item.riskLevel.toUpperCase()} RISK
                        </span>
                        <span className={`approval-list-status status-${item.status}`}>
                          {STATUS_LABEL[item.status]}
                        </span>
                      </div>
                      <h3 className="approval-list-card-title">{item.title}</h3>
                      <p className="approval-list-card-reason">💡 <strong>검토 사유:</strong> {item.reason}</p>
                      <p className="approval-list-card-proposal">
                        📝 <strong>요약 제안:</strong> {(item.proposedAction || '').split('\n')[0]}
                      </p>
                      <span className="approval-list-card-hint">상세 보기 →</span>
                    </button>

                    {item.status === 'waiting' && (onApprove || onReject) && (
                      <div className="approval-list-card-actions">
                        {onReject && (
                          <button
                            type="button"
                            className="approval-list-reject"
                            onClick={() => onReject(item.id)}
                          >
                            거절
                          </button>
                        )}
                        {onApprove && (
                          <button
                            type="button"
                            className="approval-list-approve"
                            onClick={() => onApprove(item.id)}
                          >
                            승인
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
