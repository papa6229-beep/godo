// CS Work Completion Flow v0 — 처리 완료 트리거의 local state 모델(순수 함수).
//
// 원칙:
//   - 실제 WRITE/발송 없음. writeStatus는 항상 'not_connected'(v0).
//   - 나중에 WRITE 연결 시 동일 트리거가 실제 고도몰 등록으로 이어질 수 있게 writeTarget 필드를 남긴다.
//   - 고객 PII(customerName/memberId)는 호출부가 CS UI 경로(contacts)에서 만든 customer 블록에서만 전달.
//   - 전부 순수 함수. 시간(completedAt)은 호출부가 주입(테스트 결정성).

import type { CsDetailOrderBlock, CsDetailCustomerBlock, CsResolvedItem } from './csTeamDashboardFacts';

export type CsCompletionSource = 'inquiry' | 'review' | 'delivery';
export type CsCompletionMethod = 'ai_draft' | 'manual_reply' | 'ai_auto_batch';
export type CsWriteStatus = 'not_connected' | 'pending' | 'success' | 'failed';

export interface CsWriteTarget {
  platform: 'godomall';
  targetType: 'inquiry_reply' | 'review_reply';
  targetId: string;
}

export interface CsCompletedWorkItem {
  id: string;
  originalId: string;
  sourceType: CsCompletionSource;
  title: string;
  type?: string;
  productName?: string;
  orderNo?: string;
  customerName?: string;
  memberId?: string;
  originalText?: string;
  answerText: string;
  assignee?: string;
  completedAt: string;
  completionMethod: CsCompletionMethod;
  completionStatus: 'completed_local';
  stage: string;
  writeStatus: CsWriteStatus;
  writeTarget?: CsWriteTarget;
  note?: string;
  order?: CsDetailOrderBlock;
  customer?: CsDetailCustomerBlock;
}

// 중복 완료 방지 키: sourceType + originalId
export const completionKey = (sourceType: CsCompletionSource, originalId: string): string => `${sourceType}:${originalId}`;

// AI 자동처리함 완료 대상 여부: 리뷰/배송 + draft 존재
export const isAiAutoCompletable = (sourceType: CsCompletionSource, draft?: string): boolean =>
  (sourceType === 'review' || sourceType === 'delivery') && !!(draft && draft.trim());

export function buildCompletedWorkItem(params: {
  sourceType: CsCompletionSource;
  originalId: string;
  title: string;
  type?: string;
  productName?: string;
  orderNo?: string;
  originalText?: string;
  answerText: string;
  assignee?: string;
  completedAt: string;
  completionMethod: CsCompletionMethod;
  order?: CsDetailOrderBlock;
  customer?: CsDetailCustomerBlock;
}): CsCompletedWorkItem {
  const { sourceType, originalId, orderNo } = params;
  return {
    id: `cw_${sourceType}_${originalId}`,
    originalId,
    sourceType,
    title: params.title,
    ...(params.type ? { type: params.type } : {}),
    ...(params.productName ? { productName: params.productName } : {}),
    ...(orderNo ? { orderNo } : {}),
    ...(params.customer?.name ? { customerName: params.customer.name } : {}),
    ...(params.customer?.memberId ? { memberId: params.customer.memberId } : {}),
    ...(params.originalText ? { originalText: params.originalText } : {}),
    answerText: params.answerText,
    ...(params.assignee ? { assignee: params.assignee } : {}),
    completedAt: params.completedAt,
    completionMethod: params.completionMethod,
    completionStatus: 'completed_local',
    stage: '처리 완료',
    writeStatus: 'not_connected',
    writeTarget: {
      platform: 'godomall',
      targetType: sourceType === 'review' ? 'review_reply' : 'inquiry_reply',
      targetId: orderNo || originalId
    },
    ...(params.order ? { order: params.order } : {}),
    ...(params.customer ? { customer: params.customer } : {})
  };
}

// 중복 제거 후 추가(앞에 prepend, 최신 우선). 이미 있으면 skip.
export function addCompletedWorkItems(
  existing: CsCompletedWorkItem[],
  toAdd: CsCompletedWorkItem[]
): CsCompletedWorkItem[] {
  const seen = new Set(existing.map((c) => completionKey(c.sourceType, c.originalId)));
  const fresh: CsCompletedWorkItem[] = [];
  for (const c of toAdd) {
    const k = completionKey(c.sourceType, c.originalId);
    if (seen.has(k)) continue;
    seen.add(k);
    fresh.push(c);
  }
  return [...fresh, ...existing];
}

// 완료 처리된 originalId 집합(미처리/AI함 목록 필터용)
export const completedOriginalIdSet = (items: CsCompletedWorkItem[]): Set<string> =>
  new Set(items.map((c) => c.originalId));

// local 완료 item → 처리완료 리스트(CsResolvedItem) 표시용 매핑
export function toResolvedItem(c: CsCompletedWorkItem): CsResolvedItem {
  return {
    inquiryId: c.originalId,
    title: c.title,
    type: c.type || '',
    productName: c.productName || '',
    ...(c.orderNo ? { orderNo: c.orderNo } : {}),
    ...(c.customerName ? { customerLabel: c.customerName } : {}),
    createdAt: c.completedAt,
    processedAt: c.completedAt,
    result: '처리 완료',
    followUp: false,
    ...(c.originalText ? { questionText: c.originalText } : {}),
    prevAnswer: c.answerText,
    answerText: c.answerText,
    ...(c.assignee ? { handledBy: c.assignee } : {}),
    localCompleted: true,
    completionMethod: c.completionMethod,
    writeStatus: c.writeStatus,
    ...(c.order ? { order: c.order } : {}),
    ...(c.customer ? { customer: c.customer } : {})
  };
}
