import React, { useState } from 'react';
import type { ApprovalItem } from '../types/approval';
import { executorDisplayName, approvalActorDisplay } from '../services/taskLifecycleAppAdapter';
import { DEPT_TEAM_META, type DeptTeamId } from '../types/teamMessage';

interface ApprovalDetailModalProps {
  item: ApprovalItem;
  onClose: () => void;
  onApprove: (id: string) => void;
  /** B-use-5: 승인하지 않을 때는 **한 줄 사유**를 함께 넘긴다(not_adopted 결정 이력에 남는다). */
  onReject: (id: string, reason: string) => void;
  /** RC-2: 작업 중단. 기록은 삭제하지 않고 대기열에서만 내린다. */
  onCancel?: (id: string, reason?: string) => void;
  /** RC-2 D-1: 수정 요청 — 기존 결과를 보존하고 새 revision 업무를 만든다(사유 필수). */
  onRequestRevision?: (id: string, reason: string) => void;
  /** 협업 자식 업무에서만 노출. */
  onReturn?: (id: string, reason?: string) => void;
}

export const ApprovalDetailModal: React.FC<ApprovalDetailModalProps> = ({
  item,
  onClose,
  onApprove,
  onReject,
  onCancel,
  onRequestRevision,
  onReturn
}) => {
  const [showTechDetails, setShowTechDetails] = useState(false);
  // RC-2 D-1: 수정 요청은 사유가 필요하다(빈 사유 금지).
  const [revisionReason, setRevisionReason] = useState('');
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  // B-use-5: 승인하지 않을 때도 **한 줄 사유**가 필요하다(빈 사유 금지 · 기록 전 창을 닫지 않는다).
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  // B-use-5: 원본/마스킹·수정요청·중단·반송은 기본 화면에서 접어 둔다.
  const [showInput, setShowInput] = useState(false);
  const [showOtherActions, setShowOtherActions] = useState(false);

  // 담당팀 표시(있을 때만). 정본에 실제로 있는 `submittingTeamId`(= ownerTeamId 투영)만 쓴다.
  //   없는 필드를 만들지 않는다. 값이 없으면 칸 자체를 만들지 않는다.
  const requestingTeamLabel = item.submittingTeamId
    ? (DEPT_TEAM_META[item.submittingTeamId as DeptTeamId]?.name ?? item.submittingTeamId)
    : null;

  // ESC 키로 닫기
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleApproveAction = () => {
    onApprove(item.id);
    onClose();
  };

  // B-use-5: 사유 없이 반려하지 않는다. 사유가 기록되기 전에는 창을 닫지 않는다.
  const handleRejectAction = () => {
    const reason = rejectReason.trim();
    if (!reason) return;
    onReject(item.id, reason);
    onClose();
  };

  const handleCancelAction = () => {
    onCancel?.(item.id, '운영자 작업 중단');
    onClose();
  };

  const handleRevisionAction = () => {
    const reason = revisionReason.trim();
    if (!reason) return;              // 빈 사유 금지
    onRequestRevision?.(item.id, reason);
    onClose();
  };

  const handleReturnAction = () => {
    onReturn?.(item.id, '수행 불가로 반송');
    onClose();
  };

  const getRiskColor = (risk: string) => {
    switch (risk?.toLowerCase()) {
      case 'low': return '#2df5a2';
      case 'medium': return '#f59e0b';
      case 'high': return '#ef4444';
      case 'critical': return '#b91c1c';
      default: return 'var(--text-secondary)';
    }
  };

  const getRouteLabel = (route: string) => {
    switch (route?.toLowerCase()) {
      case 'local': return '내부 AI 처리 (보안 우수)';
      case 'hybrid': return '고급 AI 도움 (클라우드/로컬)';
      case 'human': return '사람 직접 확인 필요';
      default: return route || '정보 없음';
    }
  };

  const getLatencyText = (ms: number | undefined) => {
    if (ms === undefined || ms === 0) return '응답 시간 기록 없음';
    return `${ms}ms`;
  };

  const getPiiText = (pii: boolean | undefined) => {
    return pii ? '개인정보 마스킹 적용' : '개인정보 없음';
  };

  const getFallbackText = (fallback: boolean | undefined) => {
    return fallback ? '예 (템플릿 대체 답변 사용함)' : '대체 답변 사용 안 함';
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={modalOverlayStyle}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={modalContentStyle}>
        
        {/* 헤더 */}
        <div className="modal-header" style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>🔑</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {item.title}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                승인 요청 상세 대조 및 검토 (Human-in-the-loop)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="close-btn" style={closeBtnStyle}>&times;</button>
        </div>

        {/* ── 바디: 기본은 "승인에 필요한 것"만. 나머지는 접어 둔다(B-use-5) ── */}
        <div className="modal-body" style={modalBodyStyle}>

          {/* 1. 요청팀·수행자·상태 */}
          <div style={summaryRowStyle}>
            <div style={summaryItemStyle}>
              {/* RC-2 D-1.3.3.2: 확인요청은 제출팀·제출자, 인간 수행은 사람 이름, AI 는 기존 표시명. */}
              <span style={summaryLabelStyle}>{item.reviewOnly ? '제출' : item.executorKind === 'human' ? '수행자' : '담당 에이전트'}</span>
              <span style={summaryValueStyle}>{approvalActorDisplay(item)?.name ?? executorDisplayName(item.requestedByAgentId)}</span>
            </div>
            {requestingTeamLabel && (
              <div style={summaryItemStyle}>
                <span style={summaryLabelStyle}>담당팀</span>
                <span style={summaryValueStyle}>{requestingTeamLabel}</span>
              </div>
            )}
            <div style={summaryItemStyle}>
              <span style={summaryLabelStyle}>상태</span>
              <span style={summaryValueStyle}>
                {item.status === 'waiting' ? '⏳ 확인 필요'
                  : item.status === 'approved' ? '✓ 승인 완료'
                  : item.status === 'not_adopted' ? '이번 결과 사용 안 함'
                  : item.status === 'cancelled' ? '작업 중단'
                  : '✗ 거절됨'}
              </span>
            </div>
          </div>

          {/* 2. 제출된 결과 — 승인자가 실제로 읽어야 하는 본문 */}
          <div style={sectionStyle}>
            <h4 style={sectionTitleStyle}>📄 제출된 결과</h4>
            <div style={generatedDraftBoxStyle}>
              {item.generatedDraft || item.proposedAction || '제출된 결과 내용이 없습니다.'}
            </div>
          </div>

          {/* 3. 확인이 필요한 이유 */}
          <div style={sectionStyle}>
            <h4 style={sectionTitleStyle}>💡 확인이 필요한 이유</h4>
            <div style={reasonBoxStyle}>{item.reason}</div>
          </div>

          {/* 사실 안내만 남긴다 — 하지 않는 일을 했다고 쓰지 않는다. */}
          <div style={apiNoticeBoxStyle}>
            <span style={{ fontSize: '1rem', marginRight: '6px' }}>🛡️</span>
            <span>
              <strong>안내:</strong> 현재 승인은 <strong>내부 결정으로 기록</strong>됩니다.
              실제 고도몰에 자동 등록되지 않으며, 고도몰 외부 WRITE 는 아직 연결되지 않았습니다.
            </span>
          </div>

          {/* 4. 접힘 — 원본/마스킹. **값이 있을 때만** 만든다(빈 상자를 만들지 않는다). */}
          {(item.originalIssue || item.maskedInput) && (
            <div style={{ marginTop: '5px' }}>
              <button onClick={() => setShowInput(!showInput)} style={techToggleBtnStyle}>
                {showInput ? '▲ 처리 대상 원본 숨기기' : '▼ 처리 대상 원본 보기'}
              </button>
              {showInput && (
                <div style={dataComparisonGridStyle}>
                  {item.originalIssue && (
                    <div style={dataColumnStyle}>
                      <span style={dataLabelStyle}>원본 내용</span>
                      <div style={dataContentBoxStyle}>{item.originalIssue}</div>
                    </div>
                  )}
                  {item.maskedInput && (
                    <div style={dataColumnStyle}>
                      <span style={dataLabelStyle}>안전 마스킹 적용 내역</span>
                      <div style={dataContentBoxStyle}>{item.maskedInput}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 5. 접힘 — 기술 메타데이터(개발자용). 기본 화면에 두지 않는다. */}
          <div style={{ marginTop: '5px' }}>
            <button onClick={() => setShowTechDetails(!showTechDetails)} style={techToggleBtnStyle}>
              {showTechDetails ? '▲ 상세 정보 숨기기' : '▼ 상세 정보 보기'}
            </button>

            {showTechDetails && (
              <div style={techDetailsContainerStyle}>
                <div style={engineMetaGridStyle}>
                  <div style={engineMetaRowStyle}>
                    <span style={engineMetaLabelStyle}>위험 수준</span>
                    <span style={{ ...engineMetaValueStyle, color: getRiskColor(item.riskLevel) }}>{item.riskLevel.toUpperCase()}</span>
                  </div>
                  <div style={engineMetaRowStyle}>
                    <span style={engineMetaLabelStyle}>사용 추론 엔진 (AI Model)</span>
                    <span style={engineMetaValueStyle}>{item.metadata?.modelId || '정보 없음'}</span>
                  </div>
                  <div style={engineMetaRowStyle}>
                    <span style={engineMetaLabelStyle}>라우팅 경로 (Route)</span>
                    <span style={engineMetaValueStyle}>{getRouteLabel(item.metadata?.route || '')}</span>
                  </div>
                  <div style={engineMetaRowStyle}>
                    <span style={engineMetaLabelStyle}>추론 응답 속도 (Latency)</span>
                    <span style={engineMetaValueStyle}>{getLatencyText(item.metadata?.latency)}</span>
                  </div>
                  <div style={engineMetaRowStyle}>
                    <span style={engineMetaLabelStyle}>대체 답변 사용 (Fallback Used)</span>
                    <span style={{ ...engineMetaValueStyle, color: item.metadata?.fallbackUsed ? '#ef4444' : 'var(--text-secondary)' }}>
                      {getFallbackText(item.metadata?.fallbackUsed)}
                    </span>
                  </div>
                  <div style={engineMetaRowStyle}>
                    <span style={engineMetaLabelStyle}>개인정보 마스킹 (PII Guard)</span>
                    <span style={{ ...engineMetaValueStyle, color: item.metadata?.piiRemoved ? '#f59e0b' : 'var(--text-secondary)' }}>
                      {getPiiText(item.metadata?.piiRemoved)}
                    </span>
                  </div>
                  <div style={engineMetaRowStyle}>
                    <span style={engineMetaLabelStyle}>참조 매뉴얼 (RAG Docs)</span>
                    <span style={engineMetaValueStyle}>
                      {item.metadata?.referencedKnowledge?.join(', ') || '정보 없음'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── 액션 푸터: 주 버튼 하나 + 보조 하나. 나머지는 '다른 처리'로 접는다 ── */}
        <div style={modalFooterStyle}>
          <button onClick={onClose} style={cancelBtnStyle}>닫기</button>
          {item.status === 'waiting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', flex: 1 }}>

              {/* 승인하지 않음 — 한 줄 사유. 사유가 기록되기 전에는 창을 닫지 않는다. */}
              {showRejectInput && (
                <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                  <input
                    autoFocus
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="승인하지 않는 이유를 한 줄로 적어주세요 (필수)"
                    style={inlineReasonInputStyle}
                  />
                  <button onClick={handleRejectAction} disabled={!rejectReason.trim()}
                    style={{ ...rejectActionBtnStyle, opacity: rejectReason.trim() ? 1 : 0.5 }}>
                    사유 남기고 반려
                  </button>
                </div>
              )}

              {/* 수정 요청 — 기존 기능 그대로. '다른 처리' 안에서만 연다. */}
              {showRevisionInput && (
                <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                  <input
                    autoFocus
                    value={revisionReason}
                    onChange={(e) => setRevisionReason(e.target.value)}
                    placeholder="수정이 필요한 이유를 적어주세요 (필수)"
                    style={inlineReasonInputStyle}
                  />
                  <button onClick={handleRevisionAction} disabled={!revisionReason.trim()}
                    style={{ ...approveActionBtnStyle, opacity: revisionReason.trim() ? 1 : 0.5 }}>
                    수정 요청 보내기
                  </button>
                </div>
              )}

              {/* 접힘: 다른 처리 — 권한상 가능한 것만 나온다(기능 삭제 없음). */}
              {showOtherActions && (onRequestRevision || onCancel || onReturn) && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {onRequestRevision && (
                    <button onClick={() => { setShowRevisionInput((v) => !v); setShowRejectInput(false); }} style={secondaryActionBtnStyle}>
                      수정 요청
                    </button>
                  )}
                  {onCancel && <button onClick={handleCancelAction} style={secondaryActionBtnStyle}>작업 중단</button>}
                  {onReturn && <button onClick={handleReturnAction} style={secondaryActionBtnStyle}>협업 요청 반송</button>}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {(onRequestRevision || onCancel || onReturn) && (
                  <button onClick={() => setShowOtherActions((v) => !v)} style={techToggleBtnStyle}>
                    {showOtherActions ? '▲ 다른 처리 숨기기' : '▼ 다른 처리'}
                  </button>
                )}
                <button onClick={() => { setShowRejectInput((v) => !v); setShowRevisionInput(false); }} style={secondaryActionBtnStyle}>
                  승인하지 않음
                </button>
                <button onClick={handleApproveAction} style={approveActionBtnStyle}>
                  확인 완료
                </button>
              </div>

              <span style={{ fontSize: '0.72em', color: 'var(--text-secondary, #9fb0c0)' }}>
                ※ 확인 기록만 남습니다. 고도몰 외부 실제 실행은 아직 연동되지 않았습니다.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// B-use-5: 한 줄 사유 입력(반려·수정 요청 공용). 테마 변수를 써서 다크·라이트 모두 읽힌다.
const inlineReasonInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--line-subtle, #444)',
  background: 'var(--bg-surface, transparent)',
  color: 'var(--text-primary, inherit)',
  fontSize: '0.85em'
};

// B-use-5: 보조 동작 버튼(승인하지 않음 · 다른 처리 안의 항목들).
const secondaryActionBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--line-subtle, #444)',
  background: 'transparent',
  color: 'var(--text-secondary, #9fb0c0)',
  fontSize: '0.82rem',
  fontWeight: 700,
  cursor: 'pointer'
};

// CSS-in-JS 스타일 정의
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1100,
  backdropFilter: 'blur(8px)'
};

const modalContentStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card, #1e1e24)',
  borderRadius: '12px',
  width: '90%',
  maxWidth: '700px',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  color: 'var(--text-primary, #ffffff)',
  animation: 'fadeIn 0.2s ease-out'
};

const modalHeaderStyle: React.CSSProperties = {
  padding: '15px 20px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary, #a0aec0)',
  fontSize: '1.5rem',
  cursor: 'pointer'
};

const modalBodyStyle: React.CSSProperties = {
  padding: '15px 20px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '15px'
};

const summaryRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '15px',
  backgroundColor: 'rgba(255, 255, 255, 0.01)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
  borderRadius: '8px',
  padding: '10px'
};

const summaryItemStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center'
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  marginBottom: '2px'
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 600
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column'
};

const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 6px 0',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--text-secondary, #a0aec0)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  paddingBottom: '4px'
};

const reasonBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255, 255, 255, 0.01)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
  borderRadius: '6px',
  padding: '10px',
  fontSize: '0.8rem',
  color: 'var(--text-primary)',
  lineHeight: '1.4'
};

const dataComparisonGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px'
};

const dataColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
};

const dataLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  fontWeight: 500
};

const dataContentBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(0, 0, 0, 0.25)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
  borderRadius: '6px',
  padding: '8px 10px',
  fontSize: '0.78rem',
  color: 'var(--text-primary)',
  lineHeight: '1.45',
  minHeight: '60px',
  whiteSpace: 'pre-wrap'
};

const generatedDraftBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(45, 245, 162, 0.02)',
  border: '1px solid rgba(45, 245, 162, 0.25)',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '0.82rem',
  color: 'var(--text-primary)',
  lineHeight: '1.45',
  minHeight: '80px',
  whiteSpace: 'pre-wrap'
};


const apiNoticeBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(59, 130, 246, 0.04)',
  border: '1px solid rgba(59, 130, 246, 0.15)',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '0.75rem',
  // B-use-5 4.6: 고정 연파랑(#93c5fd)은 라이트 테마 흰 배경에서 읽히지 않는다.
  color: 'var(--text-primary)',
  lineHeight: '1.4',
  display: 'flex',
  alignItems: 'center'
};

const techToggleBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary, #a0aec0)',
  fontSize: '0.75rem',
  cursor: 'pointer',
  padding: '5px 0',
  display: 'flex',
  alignItems: 'center'
};

const techDetailsContainerStyle: React.CSSProperties = {
  marginTop: '8px',
  padding: '10px 12px',
  borderRadius: '8px',
  backgroundColor: 'rgba(0,0,0,0.15)',
  border: '1px solid rgba(255,255,255,0.03)'
};

const engineMetaGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '6px 20px'
};

const engineMetaRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '0.75rem'
};

const engineMetaLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)'
};

const engineMetaValueStyle: React.CSSProperties = {
  fontWeight: 500,
  color: 'var(--text-primary)'
};

const modalFooterStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const cancelBtnStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  color: 'var(--text-primary)',
  padding: '5px 14px',
  fontSize: '0.8rem',
  borderRadius: '4px',
  cursor: 'pointer'
};

const approveActionBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent-primary, #2df5a2)',
  border: 'none',
  color: '#0e0e11',
  padding: '6px 14px',
  fontSize: '0.8rem',
  fontWeight: 600,
  borderRadius: '4px',
  cursor: 'pointer'
};

const rejectActionBtnStyle: React.CSSProperties = {
  backgroundColor: 'transparent',
  border: '1px solid #ef4444',
  color: '#ef4444',
  padding: '5px 14px',
  fontSize: '0.8rem',
  fontWeight: 600,
  borderRadius: '4px',
  cursor: 'pointer'
};
