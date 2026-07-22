import React from 'react';
import { isUnanswered } from '../services/inquiryStatusContract';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { ApprovalItem } from '../types/approval';

interface AiBriefingProps {
  activeOperationsData: OperationsDataSnapshot;
  approvalQueue: ApprovalItem[];
  onNavigateToLogs: () => void;
  isMini?: boolean;
  operationRunState?: 'idle' | 'running' | 'completed';
}

export const AiBriefing: React.FC<AiBriefingProps> = ({
  activeOperationsData,
  approvalQueue,
  onNavigateToLogs,
  isMini = false,
  operationRunState = 'idle'
}) => {
  // 동적 운영 통계 계산
  const unansweredInquiriesCount = activeOperationsData.inquiries.filter(
    (inq) => isUnanswered(inq.status)
  ).length;

  const pendingApprovalsCount = approvalQueue.filter(
    (item) => item.status === 'waiting'
  ).length;

  const orderIssuesCount = activeOperationsData.orders.filter(
    (o) => o.riskFlags.includes('invoice_missing') || o.riskFlags.includes('delivery_delayed') || o.riskFlags.includes('payment_pending')
  ).length;

  const inventoryIssuesCount = activeOperationsData.inventory.filter(
    (item) => item.status === 'warning' || item.status === 'danger'
  ).length;

  const lowRatingReviews = activeOperationsData.reviews.filter(
    (r) => r.rating <= 2
  ).length;

  const hasIssues = 
    unansweredInquiriesCount > 0 || 
    pendingApprovalsCount > 0 || 
    orderIssuesCount > 0 || 
    inventoryIssuesCount > 0 ||
    lowRatingReviews > 0;

  // 1. 운영 시작 전 안내 렌더링
  if (operationRunState === 'idle') {
    return (
      <div className={`ai-briefing-card ${isMini ? 'mini-briefing' : ''}`} style={isMini ? miniCardStyle : briefingCardStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: isMini ? '1rem' : '1.25rem' }}>🛰️</span>
            <h2 style={isMini ? miniTitleStyle : titleStyle}>AI 운영 브리핑 요약</h2>
          </div>
        </div>
        <div style={isMini ? miniContentAreaStyle : contentAreaStyle}>
          <div style={notStartedTextStyle}>
            아직 오늘의 운영이 시작되지 않았습니다.<br />
            상단의 운영 시작 버튼을 누르거나, 중앙 채팅창에 <strong>“오늘의 운영 시작해줘”</strong>라고 입력해 주세요.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`ai-briefing-card ${isMini ? 'mini-briefing' : ''}`} style={isMini ? miniCardStyle : briefingCardStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: isMini ? '1rem' : '1.25rem' }}>🛰️</span>
          <h2 style={isMini ? miniTitleStyle : titleStyle}>
            {operationRunState === 'running' ? 'AI 운영 분석 중' : '오늘의 운영 점검 완료'}
          </h2>
        </div>
        {!isMini && (
          <span style={blinkBadgeStyle}>
            <span style={blinkDotStyle}></span>
            {operationRunState === 'running' ? 'RUNNING' : 'COMPLETED'}
          </span>
        )}
      </div>

      <div style={isMini ? miniContentAreaStyle : contentAreaStyle}>
        {/* 상단 현재 상태 안내 멘트 */}
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--accent-primary)',
          marginBottom: '10px',
          fontWeight: 600,
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          paddingBottom: '8px',
          lineHeight: '1.3'
        }}>
          {operationRunState === 'running' 
            ? '🛰️ 현재 AI 운영팀이 주문, 문의, 리뷰, 재고, 매출을 확인하고 있습니다.'
            : '✓ 오늘의 운영 점검이 완료되었습니다.'}
        </div>

        {!hasIssues ? (
          <div style={emptyBriefingStyle}>
            {operationRunState === 'completed' 
              ? '🎉 현재 확인이 필요한 주요 이슈는 없습니다.' 
              : '🎉 현재까지 감지된 주요 이슈가 없습니다.'}
          </div>
        ) : (
          <div style={gridStyle}>
            {unansweredInquiriesCount > 0 && (
              <div style={isMini ? miniBulletItemStyle : bulletItemStyle}>
                <span style={bulletIconStyle}>💬</span>
                <span style={bulletTextStyle}>
                  답변이 필요한 고객 문의 <strong>{unansweredInquiriesCount}건</strong> 대기 중
                </span>
              </div>
            )}

            {pendingApprovalsCount > 0 && (
              <div style={isMini ? { ...miniBulletItemStyle, borderColor: 'rgba(245, 158, 11, 0.25)', background: 'rgba(245, 158, 11, 0.02)' } : { ...bulletItemStyle, borderColor: 'rgba(245, 158, 11, 0.25)', background: 'rgba(245, 158, 11, 0.02)' }}>
                <span style={bulletIconStyle}>🔑</span>
                <span style={bulletTextStyle}>
                  승인 대기 중인 AI 초안 <strong>{pendingApprovalsCount}건</strong>
                </span>
              </div>
            )}

            {orderIssuesCount > 0 && (
              <div style={isMini ? miniBulletItemStyle : bulletItemStyle}>
                <span style={bulletIconStyle}>📦</span>
                <span style={bulletTextStyle}>
                  송장 확인이 필요한 주문 <strong>{orderIssuesCount}건</strong>
                </span>
              </div>
            )}

            {inventoryIssuesCount > 0 && (
              <div style={isMini ? miniBulletItemStyle : bulletItemStyle}>
                <span style={bulletIconStyle}>⚠️</span>
                <span style={bulletTextStyle}>
                  재고 위험 상품 <strong>{inventoryIssuesCount}건</strong> 감지
                </span>
              </div>
            )}

            {lowRatingReviews > 0 && (
              <div style={isMini ? miniBulletItemStyle : bulletItemStyle}>
                <span style={bulletIconStyle}>⭐</span>
                <span style={bulletTextStyle}>
                  대응 필요 저평점 리뷰 <strong>{lowRatingReviews}건</strong>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {!isMini && (
        <div style={footerStyle}>
          <button onClick={onNavigateToLogs} style={actionBtnStyle}>
            자세한 작업 기록 보기 &rarr;
          </button>
        </div>
      )}
    </div>
  );
};

// 스타일 가이드 적용
const briefingCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card, #1e1e24)',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  color: 'var(--text-primary, #ffffff)',
  boxSizing: 'border-box'
};

const headerStyle: React.CSSProperties = {
  padding: '12px 15px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.9rem',
  fontWeight: 600,
  color: 'var(--accent-primary, #2df5a2)'
};

const blinkBadgeStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 600,
  color: 'var(--text-secondary, #a0aec0)',
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '2px 6px',
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  borderRadius: '4px',
  border: '1px solid rgba(255, 255, 255, 0.05)'
};

const blinkDotStyle: React.CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  backgroundColor: 'var(--accent-primary, #2df5a2)',
  animation: 'pulse 1.5s infinite'
};

const contentAreaStyle: React.CSSProperties = {
  padding: '15px',
  flex: 1,
  overflowY: 'auto'
};

const emptyBriefingStyle: React.CSSProperties = {
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '0.8rem',
  padding: '20px 0'
};

const gridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
};

const bulletItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '10px 12px',
  backgroundColor: 'rgba(255, 255, 255, 0.01)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  borderRadius: '6px'
};

const bulletIconStyle: React.CSSProperties = {
  fontSize: '1rem',
  lineHeight: '1.2'
};

const bulletTextStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: 'var(--text-primary)',
  lineHeight: '1.4'
};

const footerStyle: React.CSSProperties = {
  padding: '10px 15px',
  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  display: 'flex',
  justifyContent: 'flex-end'
};

const actionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: '0.75rem',
  fontWeight: 500,
  cursor: 'pointer',
  padding: '2px 8px',
  display: 'flex',
  alignItems: 'center',
  transition: 'color 0.2s'
};

const miniCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card, #1e1e24)',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  flexDirection: 'column',
  color: 'var(--text-primary, #ffffff)',
  boxSizing: 'border-box',
  padding: '8px'
};

const miniTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--accent-primary, #2df5a2)'
};

const miniContentAreaStyle: React.CSSProperties = {
  padding: '6px 8px',
  overflowY: 'auto'
};

const notStartedTextStyle: React.CSSProperties = {
  color: 'var(--text-secondary, #a0aec0)',
  fontSize: '0.75rem',
  lineHeight: '1.5',
  padding: '8px 4px',
  textAlign: 'center'
};

const miniBulletItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 10px',
  backgroundColor: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  borderRadius: '6px'
};

