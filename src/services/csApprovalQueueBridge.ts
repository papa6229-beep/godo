// CS Draft → Approval Queue HITL v0 — CS 답변/초안을 승인 큐로 보내는 bridge(순수 함수).
//
// 원칙:
//   - Approval Queue = 사람이 최종 검수하는 대기실. WRITE Bridge(실제 등록)는 별도 후속.
//   - 승인해도 v0에서는 실제 고도몰 WRITE 없음. writeStatus는 'not_connected' 유지.
//   - 승인 item에는 검수에 필요한 최소 정보만(고객명/회원ID 허용, 전화/이메일/주소 금지).
//   - 전부 순수 함수. 상태(승인/반려)는 호출부가 list 교체로 관리.
//
// ⚠️ 기존 전역 ApprovalItem(task/agent 엔진 도메인: taskId/requestedByAgentId/riskLevel)과는
//    성격이 달라 별도 CS 전용 큐로 둔다(대규모 승인 시스템 재작성 회피).

export type CsApprovalSourceType = 'inquiry_reply' | 'review_reply' | 'delivery_reply';
export type CsApprovalStatus = 'pending_approval' | 'approved_local' | 'rejected';
export type CsApprovalMethod = 'ai_draft' | 'manual_reply' | 'ai_auto_batch';

export interface CsApprovalQueueItem {
  id: string;
  source: 'cs';
  sourceType: CsApprovalSourceType;
  status: CsApprovalStatus;
  title: string;
  answerText: string;
  target: { originalId: string; orderNo?: string; productName?: string; customerId?: string; memberId?: string };
  context: { originalText?: string; summary?: string; type?: string; createdAt?: string; elapsedDays?: number; assignee?: string; completionMethod?: CsApprovalMethod };
  writeTarget: { platform: 'godomall'; targetType: 'inquiry_reply' | 'review_reply'; targetId: string };
  writeStatus: 'not_connected';
  rejectReason?: string;
  createdAt: string;
}

// 중복 키: sourceType + originalId + answerText (답변이 바뀌면 새 요청 허용)
export const csApprovalKey = (sourceType: CsApprovalSourceType, originalId: string, answerText: string): string =>
  `${sourceType}:${originalId}:${(answerText || '').trim()}`;

export function buildCsApprovalItem(params: {
  sourceType: CsApprovalSourceType;
  title: string;
  answerText: string;
  target: { originalId: string; orderNo?: string; productName?: string; customerId?: string; memberId?: string };
  context?: { originalText?: string; summary?: string; type?: string; createdAt?: string; elapsedDays?: number; assignee?: string; completionMethod?: CsApprovalMethod };
  createdAt: string;
}): CsApprovalQueueItem {
  const { sourceType, target } = params;
  const writeTargetType: 'inquiry_reply' | 'review_reply' = sourceType === 'review_reply' ? 'review_reply' : 'inquiry_reply';
  return {
    id: `caq_${sourceType}_${target.originalId}_${params.createdAt.replace(/\D/g, '').slice(-6)}`,
    source: 'cs',
    sourceType,
    status: 'pending_approval',
    title: params.title,
    answerText: params.answerText,
    target: {
      originalId: target.originalId,
      ...(target.orderNo ? { orderNo: target.orderNo } : {}),
      ...(target.productName ? { productName: target.productName } : {}),
      ...(target.customerId ? { customerId: target.customerId } : {}),
      ...(target.memberId ? { memberId: target.memberId } : {})
      // 전화/이메일/주소 등 PII는 의도적으로 제외(검수 최소 정보만)
    },
    context: { ...(params.context || {}) },
    writeTarget: { platform: 'godomall', targetType: writeTargetType, targetId: target.orderNo || target.originalId },
    writeStatus: 'not_connected',
    createdAt: params.createdAt
  };
}

// 중복(동일 key) 제외하고 추가. prepend(최신 우선).
export function addCsApprovalItems(existing: CsApprovalQueueItem[], toAdd: CsApprovalQueueItem[]): CsApprovalQueueItem[] {
  const seen = new Set(existing.map((x) => csApprovalKey(x.sourceType, x.target.originalId, x.answerText)));
  const fresh: CsApprovalQueueItem[] = [];
  for (const it of toAdd) {
    const k = csApprovalKey(it.sourceType, it.target.originalId, it.answerText);
    if (seen.has(k)) continue;
    seen.add(k);
    fresh.push(it);
  }
  return [...fresh, ...existing];
}

export const approveCsApprovalItem = (list: CsApprovalQueueItem[], id: string): CsApprovalQueueItem[] =>
  list.map((x) => (x.id === id ? { ...x, status: 'approved_local' as const } : x));

export const rejectCsApprovalItem = (list: CsApprovalQueueItem[], id: string, reason?: string): CsApprovalQueueItem[] =>
  list.map((x) => (x.id === id ? { ...x, status: 'rejected' as const, ...(reason ? { rejectReason: reason } : {}) } : x));

// 원본 항목(originalId) → 최신 승인 상태(리스트 배지용). 같은 originalId 여러건이면 첫(최신) 것.
export function csApprovalStatusByOriginalId(list: CsApprovalQueueItem[]): Record<string, CsApprovalStatus> {
  const out: Record<string, CsApprovalStatus> = {};
  for (const x of list) if (!(x.target.originalId in out)) out[x.target.originalId] = x.status;
  return out;
}

// 이미 동일 답변으로 승인요청된 항목인지(중복 방지 체크)
export const isCsApprovalDuplicate = (list: CsApprovalQueueItem[], sourceType: CsApprovalSourceType, originalId: string, answerText: string): boolean =>
  list.some((x) => csApprovalKey(x.sourceType, x.target.originalId, x.answerText) === csApprovalKey(sourceType, originalId, answerText));
