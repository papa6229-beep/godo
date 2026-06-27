// CS Dashboard Interactive Statistics v0 — 통계 클릭 → 팝업 intent 매퍼(순수 함수).
//
// 통계는 보는 것이 아니라 클릭해서 처리하는 입구. 각 통계 항목 → 기존 CS 팝업 intent로 변환.

export type CsApprovalTab = 'all' | 'pending' | 'approved' | 'rejected';

export type CsPopupIntent =
  | { kind: 'unresolved'; initialTab?: string }
  | { kind: 'completed'; initialTab?: string }
  | { kind: 'aiAuto'; initialTab?: string }
  | { kind: 'approvalQueue'; initialTab?: CsApprovalTab }
  | { kind: 'customer'; initialFilter?: string; selectedCustomerId?: string }
  | { kind: 'issueProduct'; goodsNo: string; productName: string };

// 문의 유형 비중 슬라이스 → intent. review는 AI 자동처리함(리뷰답글) 탭.
export function typeSliceToIntent(type: string): CsPopupIntent {
  switch (type) {
    case 'payment': return { kind: 'unresolved', initialTab: 'pay' };
    case 'claim': return { kind: 'unresolved', initialTab: 'rc' };
    case 'delivery': return { kind: 'unresolved', initialTab: 'dlv' };
    case 'product': return { kind: 'unresolved', initialTab: 'prod' };
    case 'review': return { kind: 'aiAuto', initialTab: 'rev' };
    default: return { kind: 'unresolved', initialTab: 'etc' };
  }
}

// CS 업무 흐름 단계 → intent.
export function workflowStepToIntent(step: string): CsPopupIntent {
  switch (step) {
    case 'unresolved': return { kind: 'unresolved' };
    case 'pendingApproval': return { kind: 'approvalQueue', initialTab: 'pending' };
    case 'approved': return { kind: 'approvalQueue', initialTab: 'approved' };
    case 'completed': return { kind: 'completed' };
    case 'rejectedOrHeld': return { kind: 'approvalQueue', initialTab: 'rejected' };
    default: return { kind: 'unresolved' };
  }
}

// AI 처리 성과 지표 → intent.
export function aiMetricToIntent(metric: string): CsPopupIntent {
  switch (metric) {
    case 'draftCount': return { kind: 'aiAuto' };
    case 'approvalRequestedCount': return { kind: 'approvalQueue', initialTab: 'pending' };
    case 'approvedCount': return { kind: 'approvalQueue', initialTab: 'approved' };
    case 'rejectedCount': return { kind: 'approvalQueue', initialTab: 'rejected' };
    case 'aiCompletedCount': return { kind: 'completed', initialTab: 'ai' };
    default: return { kind: 'approvalQueue', initialTab: 'all' };
  }
}

// 고객 리스크 카드 → 고객관리 필터 intent.
export function riskCardToIntent(card: string): CsPopupIntent {
  switch (card) {
    case 'repeatInquiry': return { kind: 'customer', initialFilter: 'ri' };
    case 'repeatRefundCancel': return { kind: 'customer', initialFilter: 'rc' };
    case 'caution': return { kind: 'customer', initialFilter: 'watch' };
    case 'blacklist': return { kind: 'customer', initialFilter: 'bl' };
    case 'highValue': return { kind: 'customer', initialFilter: 'hv' };
    default: return { kind: 'customer', initialFilter: 'all' };
  }
}

export const riskCustomerToIntent = (customerKey: string): CsPopupIntent => ({ kind: 'customer', selectedCustomerId: customerKey });
export const issueProductToIntent = (goodsNo: string, productName: string): CsPopupIntent => ({ kind: 'issueProduct', goodsNo, productName });
