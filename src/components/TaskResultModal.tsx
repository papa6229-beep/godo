import React, { useState } from 'react';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';

interface TaskResultModalProps {
  task: OperationTask;
  onClose: () => void;
  approvalQueue: ApprovalItem[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

export const TaskResultModal: React.FC<TaskResultModalProps> = ({
  task,
  onClose,
  approvalQueue,
  onApprove,
  onReject
}) => {
  const [showTechDetails, setShowTechDetails] = useState(false);

  // ESC 키 입력 시 닫기
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 관련 Approval Queue 아이템 찾기
  const relatedApprovals = approvalQueue.filter(
    (item) => item.taskId === task.id || (task.approvalItemIds && task.approvalItemIds.includes(item.id))
  );

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '대기 중';
      case 'assigned': return 'AI 배정 완료';
      case 'running': return 'AI 분석 진행 중';
      case 'completed': return '확인 완료';
      case 'needs_approval': return '운영자 승인 대기';
      case 'failed': return '확인 실패';
      default: return status;
    }
  };

  const getPermissionLabel = (perm: string) => {
    switch (perm?.toLowerCase()) {
      case 'draft_only': return '초안만 생성';
      case 'approval_required': return '승인 필요';
      case 'auto': return '자동 확인 완료';
      case 'manual_only': return '사람 확인 필요';
      default: return perm || '정보 없음';
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

  const isCS = task.assignedAgentId === 'cs' || task.title.includes('CS') || task.title.includes('문의');
  const isReview = task.assignedAgentId === 'review' || task.title.includes('리뷰');
  const isOrder = task.assignedAgentId === 'order' || task.title.includes('주문') || task.title.includes('배송');
  const isStock = task.assignedAgentId === 'stock' || task.title.includes('재고') || task.title.includes('품절');
  const isMarketing = task.assignedAgentId === 'marketing' || task.title.includes('캠페인') || task.title.includes('제안');
  const isSales = task.assignedAgentId === 'finance' || task.title.includes('매출');

  // 1. 도메인별 한 줄 결론 및 기본 안내
  const getOpSummaryHeader = () => {
    const count = task.inputCount || 0;
    if (isCS) {
      return (
        <div style={opSummaryBoxStyle}>
          📢 답변이 필요한 고객 문의 <strong>{count > 0 ? `${count}건` : '들'}</strong>을 찾았습니다. 
          이 중 일부는 <strong>환불/교환 요청</strong>이 포함되어 있어 먼저 확인이 필요합니다. 
          아래 생성된 AI 답변 초안을 검토하시고 승인 또는 직접 수정을 진행해 주십시오.
        </div>
      );
    } else if (isReview) {
      return (
        <div style={opSummaryBoxStyle}>
          📢 고객 피드백 리뷰를 분석했습니다. 평점 2점 이하의 저평점 부정 리뷰가 감지되어, 
          고객 불만을 케어하기 위한 <strong>정중한 답글 초안</strong>을 생성했습니다. 
          답안을 승인하거나 거절해 주십시오.
        </div>
      );
    } else if (task.title.includes('배송 지연') || task.title.includes('송장')) {
      return (
        <div style={opSummaryBoxStyle}>
          🚚 <strong>배송 지연 의심 주문</strong>을 감지했습니다. 
          주문 상태는 배송중 또는 배송대기 상태이나 실제 송장번호 등록이 보이지 않아 
          고도몰 관리자 시스템과의 대조가 필요합니다.
        </div>
      );
    } else if (isOrder) {
      return (
        <div style={opSummaryBoxStyle}>
          📢 신규 접수 주문들을 확인했습니다. 
          송장번호가 아직 누락된 출고 대기 건 및 입금 대기 상태인 고액 주문들의 상태 검증을 완료하였습니다.
        </div>
      );
    } else if (isStock) {
      return (
        <div style={opSummaryBoxStyle}>
          ⚠️ 현재고 수량이 운영자가 지정한 <strong>안전재고 수준 이하</strong>로 떨어진 품목이 발견되었습니다. 
          쇼핑몰 품절로 인한 판매 기회 손실을 막기 위해 <strong>추가 발주 검토</strong>가 권장됩니다.
        </div>
      );
    } else if (isMarketing) {
      return (
        <div style={opSummaryBoxStyle}>
          💡 특정 베스트셀러 상품 구매 이력 고객을 타겟으로 한 <strong>재구매 할인 쿠폰 발행 캠페인</strong>을 기획 제안합니다. 
          할인/쿠폰 발행은 쇼핑몰 마진율에 직접적 영향을 주므로 인간 운영자의 의사결정이 필요합니다.
        </div>
      );
    } else if (isSales) {
      return (
        <div style={opSummaryBoxStyle}>
          📊 오늘의 실시간 누적 매출 분석 리포트입니다. 
          주문 전환율 및 인기 판매 상품 통계를 분석하여 제공합니다.
        </div>
      );
    }

    return <div style={opSummaryBoxStyle}>{task.resultSummary || '작업이 성공적으로 완수되었습니다.'}</div>;
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={modalOverlayStyle}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={modalContentStyle}>
        
        {/* 헤더 */}
        <div className="modal-header" style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>📋</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {task.title}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                담당 AI: {task.assignedAgentId.toUpperCase()} 에이전트 | 상태: {getStatusText(task.status)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="close-btn" style={closeBtnStyle}>&times;</button>
        </div>

        {/* 바디 */}
        <div className="modal-body" style={modalBodyStyle}>
          
          {/* 1. 운영 브리핑 & 한 줄 결론 */}
          {getOpSummaryHeader()}

          {/* 2. 대상 목록 및 상세 대조 */}
          {task.artifacts && task.artifacts.length > 0 ? (
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}>🎯 세부 분석 대상 및 AI 제안 내용</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
                {task.artifacts.map((art, idx) => (
                  <div key={art.id || idx} style={artifactCardStyle}>
                    
                    {/* 카드 헤더 */}
                    <div style={artifactHeaderStyle}>
                      <span style={artifactTitleStyle}>
                        #{idx + 1} {art.title}
                      </span>
                      {art.riskLevel && (
                        <span style={{ 
                          fontSize: '0.62rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: art.riskLevel === 'high' || art.riskLevel === 'critical' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.05)', 
                          color: art.riskLevel === 'high' || art.riskLevel === 'critical' ? '#ef4444' : 'var(--text-secondary)' 
                        }}>
                          🚨 {art.riskLevel.toUpperCase()} 위험도 감지
                        </span>
                      )}
                    </div>

                    {/* CS 답변 상세 대조 */}
                    {isCS && (
                      <div style={artifactBodyGridStyle}>
                        <div style={contentBoxContainerStyle}>
                          <span style={contentLabelStyle}>📥 고객 문의글 (Original)</span>
                          <div style={contentBoxStyle}>{art.originalIssue || '내용 없음'}</div>
                        </div>
                        <div style={contentBoxContainerStyle}>
                          <span style={contentLabelStyle}>🛡️ 마스킹 후 본문 (Masked)</span>
                          <div style={contentBoxStyle}>{art.maskedInput || '내용 없음'}</div>
                        </div>
                        <div style={{ ...contentBoxContainerStyle, gridColumn: 'span 2' }}>
                          <span style={{ ...contentLabelStyle, color: 'var(--accent-primary, #2df5a2)', fontWeight: 600 }}>
                            ✨ AI 작성 답변 제안 초안
                          </span>
                          <div style={{ ...contentBoxStyle, border: '1px solid rgba(45, 245, 162, 0.25)', background: 'rgba(45, 245, 162, 0.02)' }}>
                            {art.generatedDraft || '초안이 생성되지 않았습니다.'}
                          </div>
                        </div>
                        <div style={{ gridColumn: 'span 2', fontSize: '0.75rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.05)', padding: '8px 10px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                          💡 <strong>운영자 가이드:</strong> 초안의 고객명과 마스킹된 핵심 정보를 확인하고, 만족하실 경우 결제 승인을 수락해 주십시오.
                        </div>
                      </div>
                    )}

                    {/* 리뷰 상세 대조 */}
                    {isReview && (
                      <div style={artifactBodyGridStyle}>
                        <div style={{ ...contentBoxContainerStyle, gridColumn: 'span 2' }}>
                          <span style={contentLabelStyle}>📥 고객 피드백 리뷰 원문</span>
                          <div style={contentBoxStyle}>
                            <strong>평점:</strong> {'⭐'.repeat(art.riskLevel === 'high' || art.riskLevel === 'critical' ? 1 : 4)} | {art.originalIssue || '리뷰 본문 없음'}
                          </div>
                        </div>
                        <div style={{ ...contentBoxContainerStyle, gridColumn: 'span 2' }}>
                          <span style={{ ...contentLabelStyle, color: 'var(--accent-primary, #2df5a2)', fontWeight: 600 }}>
                            ✨ AI 추천 답글 초안
                          </span>
                          <div style={{ ...contentBoxStyle, border: '1px solid rgba(45, 245, 162, 0.25)', background: 'rgba(45, 245, 162, 0.02)' }}>
                            {art.generatedDraft || '초안 없음'}
                          </div>
                        </div>
                        <div style={{ gridColumn: 'span 2', fontSize: '0.75rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.05)', padding: '8px 10px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                          💡 <strong>운영자 가이드:</strong> 사과 및 후속 포장/상태 케어 안내에 대해 검증한 뒤 결제 및 발행을 승인해 주십시오.
                        </div>
                      </div>
                    )}

                    {/* 주문 상세 대조 */}
                    {isOrder && !task.title.includes('배송 지연') && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={contentBoxStyle}>
                          <strong>주문 고유 코드:</strong> {art.id?.split('-')[2] || 'GD-20260619-0001'}<br />
                          <strong>검증 상태:</strong> {art.riskLevel === 'high' || art.riskLevel === 'critical' ? '⚠️ 고액 주문 / 미배송' : '✓ 정상 수납 완료'}<br />
                          <strong>대조 내역:</strong> {art.generatedDraft || art.summary || '정상 처리'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          💡 <strong>운영자 가이드:</strong> 고도몰 물류 출고 지연을 방지하기 위해 택배 발송 여부를 정기 검증해 주십시오.
                        </div>
                      </div>
                    )}

                    {/* 배송 지연 상세 */}
                    {task.title.includes('배송 지연') && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ ...contentBoxStyle, border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)' }}>
                          🚨 <strong>배송 지연 의심 주문 건</strong><br />
                          주문정보: [주문자 박*호] CJ대한통운 송장 번호 누락 의심<br />
                          주문 경과 일수: 결제 완료 후 <strong>영업일 5일 경과</strong>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)', padding: '8px 10px', borderRadius: '4px' }}>
                          ⚠️ <strong>추천 조치:</strong> 고도몰 파트너 관리자에서 해당 고객의 배송 운송장 번호가 올바르게 발행되어 매칭되었는지 긴급 조회가 요구됩니다.
                        </div>
                      </div>
                    )}

                    {/* 재고 부족 상세 */}
                    {isStock && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ ...contentBoxStyle, border: '1px solid rgba(245, 158, 11, 0.25)', background: 'rgba(245, 158, 11, 0.02)' }}>
                          📦 <strong>재고 부족 경보 대상 상품</strong><br />
                          상품명: [기본옵션] 센서티브 힐링 마사지 오일 (100ml)<br />
                          현재고 수량: <strong>2개</strong> (안전 기준재고 수량: 5개)
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          💡 <strong>운영자 가이드:</strong> 공급망 도매 물류 파트너 채널을 통해 추가 사입/발주 주문서를 생성하실 것을 권장합니다.
                        </div>
                      </div>
                    )}

                    {/* 마케팅 제안 상세 */}
                    {isMarketing && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={contentBoxStyle}>
                          🎯 <strong>캠페인 기획 제안서</strong><br />
                          - 기획 의도: 베스트셀러 오일 구매자 타겟 크로스셀 유도<br />
                          - 제공 혜택: 7일 내 사용 가능한 리페어 크림 10% 감사 할인 쿠폰 발급<br />
                          - 발송 채널: 고도몰 마케팅 문자(SMS/LMS) 자동 전송
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          💡 <strong>운영자 가이드:</strong> 승인할 경우, 타겟팅된 발송 대상자 목록 필터가 가동되며 가상 마케팅 LMS가 발송 큐에 대기합니다.
                        </div>
                      </div>
                    )}

                    {/* 매출 분석 상세 */}
                    {isSales && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={contentBoxStyle}>
                          📈 <strong>일일 쇼핑몰 매출 분석 요약</strong><br />
                          - 금일 실시간 총 매출액: <strong>894,000원</strong> (주문 총 22건 완료)<br />
                          - 주문 전환율: <strong>3.4%</strong> (전일 대비 +0.6% 상승)<br />
                          - 베스트셀러 상품: 센서티브 힐링 마사지 오일 (라벤더향)
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          💡 <strong>운영자 가이드:</strong> 오늘 기획 할인 프로모션의 영향으로 전환율이 상승세에 있습니다.
                        </div>
                      </div>
                    )}

                  </div>
                ))}
              </div>
            </div>
          ) : (
            task.status === 'running' && (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                <span>🛰️ AI 에이전트가 쇼핑몰 데이터 및 산출물 초안을 작성하고 있습니다...</span>
              </div>
            )
          )}

          {/* 3. 승인 대기열 연계 현황 (있을 때만 노출) */}
          {relatedApprovals.length > 0 && (
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}>🔑 검토 및 승인 연동 현황</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '5px' }}>
                {relatedApprovals.map((appr) => (
                  <div key={appr.id} style={approvalLinkCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{appr.title}</span>
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: appr.status === 'waiting' ? 'rgba(245, 158, 11, 0.15)' : appr.status === 'approved' ? 'rgba(45, 245, 162, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: appr.status === 'waiting' ? '#f59e0b' : appr.status === 'approved' ? '#2df5a2' : '#ef4444'
                      }}>
                        {appr.status === 'waiting' ? '승인 대기 중' : appr.status === 'approved' ? '승인 완료' : '반려됨'}
                      </span>
                    </div>
                    {appr.status === 'waiting' && onApprove && onReject && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                        <button onClick={() => onReject(appr.id)} style={modalRejectBtnStyle}>
                          거절 (Reject)
                        </button>
                        <button onClick={() => onApprove(appr.id)} style={modalApproveBtnStyle}>
                          승인 (Approve)
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. 접힘식 개발자/기술 정보 보기 */}
          <div style={{ marginTop: '10px' }}>
            <button 
              onClick={() => setShowTechDetails(!showTechDetails)} 
              style={techToggleBtnStyle}
            >
              {showTechDetails ? '▲ 기술적 분석 정보 숨기기' : '▼ 개발자용 기술 정보 보기'}
            </button>

            {showTechDetails && (
              <div style={techDetailsContainerStyle}>
                <div style={engineInfoGridStyle}>
                  <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>데이터 소스 (Data Source)</span>
                    <span style={infoValueStyle}>{task.dataSourceType || '정보 없음'}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>라우팅 방식 (Route Type)</span>
                    <span style={infoValueStyle}>{getRouteLabel(task.routeType)}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>AI 작동 권한 (Permission)</span>
                    <span style={infoValueStyle}>{getPermissionLabel(task.permission)}</span>
                  </div>
                  {task.artifacts && task.artifacts.length > 0 && (
                    <>
                      <div style={infoRowStyle}>
                        <span style={infoLabelStyle}>AI 모델 (Model ID)</span>
                        <span style={{ ...infoValueStyle, fontFamily: 'monospace' }}>
                          {task.artifacts[0].modelId || '정보 없음'}
                        </span>
                      </div>
                      <div style={infoRowStyle}>
                        <span style={infoLabelStyle}>추론 응답 속도 (Latency)</span>
                        <span style={infoValueStyle}>{getLatencyText(task.artifacts[0].latency)}</span>
                      </div>
                      <div style={infoRowStyle}>
                        <span style={infoLabelStyle}>PII 마스킹 필터 (Privacy Guard)</span>
                        <span style={infoValueStyle}>{getPiiText(task.artifacts[0].piiRemoved)}</span>
                      </div>
                      <div style={infoRowStyle}>
                        <span style={infoLabelStyle}>대체 답변 사용 (Fallback Used)</span>
                        <span style={infoValueStyle}>{getFallbackText(task.artifacts[0].fallbackUsed)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* 기술적 로그 파일 */}
                {task.logs && task.logs.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      시스템 내부 연산 로그 원문
                    </span>
                    <div style={logConsoleStyle}>
                      {task.logs.map((log, idx) => (
                        <div key={idx} style={{ padding: '1px 0' }}>{log}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        <div style={modalFooterStyle}>
          <button onClick={onClose} style={footerCloseBtnStyle}>닫기</button>
        </div>
      </div>
    </div>
  );
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

const opSummaryBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(45, 245, 162, 0.03)',
  border: '1px solid rgba(45, 245, 162, 0.15)',
  color: 'rgba(255, 255, 255, 0.95)',
  borderRadius: '8px',
  padding: '12px 15px',
  fontSize: '0.82rem',
  lineHeight: '1.5'
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column'
};

const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 8px 0',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--text-secondary, #a0aec0)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  paddingBottom: '4px'
};

const artifactCardStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255, 255, 255, 0.01)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
  borderRadius: '8px',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
};

const artifactHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  paddingBottom: '6px'
};

const artifactTitleStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--text-primary)'
};

const artifactBodyGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '10px'
};

const contentBoxContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
};

const contentLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  fontWeight: 500
};

const contentBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(0, 0, 0, 0.25)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
  borderRadius: '6px',
  padding: '8px 10px',
  fontSize: '0.78rem',
  whiteSpace: 'pre-wrap',
  lineHeight: '1.45',
  color: 'var(--text-primary)'
};

const approvalLinkCardStyle: React.CSSProperties = {
  backgroundColor: 'rgba(245, 158, 11, 0.02)',
  border: '1px solid rgba(245, 158, 11, 0.12)',
  borderRadius: '8px',
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column'
};

const modalApproveBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent-primary, #2df5a2)',
  border: 'none',
  color: '#0e0e11',
  padding: '5px 12px',
  fontSize: '0.72rem',
  fontWeight: 600,
  borderRadius: '4px',
  cursor: 'pointer'
};

const modalRejectBtnStyle: React.CSSProperties = {
  backgroundColor: 'transparent',
  border: '1px solid #ef4444',
  color: '#ef4444',
  padding: '4px 12px',
  fontSize: '0.72rem',
  fontWeight: 600,
  borderRadius: '4px',
  cursor: 'pointer'
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
  marginTop: '10px',
  padding: '12px',
  borderRadius: '8px',
  backgroundColor: 'rgba(0,0,0,0.15)',
  border: '1px solid rgba(255,255,255,0.03)'
};

const engineInfoGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '6px 20px'
};

const infoRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '0.75rem'
};

const infoLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)'
};

const infoValueStyle: React.CSSProperties = {
  fontWeight: 500,
  color: 'var(--text-primary)'
};

const logConsoleStyle: React.CSSProperties = {
  backgroundColor: '#07070a',
  border: '1px solid rgba(255, 255, 255, 0.04)',
  borderRadius: '6px',
  padding: '10px',
  fontFamily: 'monospace',
  fontSize: '0.7rem',
  color: '#777',
  maxHeight: '100px',
  overflowY: 'auto'
};

const modalFooterStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  justifyContent: 'flex-end'
};

const footerCloseBtnStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  color: 'var(--text-primary)',
  padding: '5px 14px',
  fontSize: '0.8rem',
  borderRadius: '4px',
  cursor: 'pointer'
};
