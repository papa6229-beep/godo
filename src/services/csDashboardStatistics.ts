// CS Dashboard Statistics Layout Prototype v0 — 메인 상황판 통계(순수 함수, leaf).
//
// 블록: 문의 유형 비중 / CS 업무 흐름 / AI 처리 성과 / CS 이슈 상품 TOP / 고객 리스크 요약.
// 제외(의도적): 직원별 처리량, 미처리 경과 시간 분포(직원 감시/저우선 통계).
// local state(completed/approvals/caution/blacklist)를 반영. 실제 WRITE 없음.

import { normalizeCsTopic, type CsRiskLevel } from './csDraftComposer';
import type { GroundingOrder } from './csInquiryOrderGrounding';
import {
  buildCsAdminWorkflow, summarizeCsIssueProducts,
  type CsDashInquiry, type CsDashReview, type CsDashContact
} from './csTeamDashboardFacts';
import { buildCsCustomerProfileHub } from './csCustomerManagementFacts';
import type { CsCompletedWorkItem } from './csWorkCompletionState';
import type { CsApprovalQueueItem } from './csApprovalQueueBridge';

export interface CsInquiryTypeSlice { type: string; label: string; count: number; percent: number }
export interface CsWorkflowSummary { unresolved: number; pendingApproval: number; approved: number; completed: number; rejectedOrHeld: number }
export interface CsAiPerformance { draftCount: number; approvalRequestedCount: number; approvedCount: number; rejectedCount: number; aiCompletedCount: number; approvalRate?: number }
export interface CsIssueProductStat { productName: string; goodsNo: string; inquiryCount: number; reviewIssueCount: number; claimCount: number; mainIssueType?: string; riskLevel: CsRiskLevel }
export interface CsCustomerRiskSummary {
  repeatInquiryCount: number; repeatRefundCancelCount: number; cautionCustomerCount: number;
  blacklistCandidateCount: number; highValueCustomerCount: number;
  topRiskCustomers: Array<{ customerId: string; name?: string; tags: string[]; riskLevel: CsRiskLevel }>;
}
export interface CsDashboardStatistics {
  inquiryTypeDistribution: CsInquiryTypeSlice[];
  workflowSummary: CsWorkflowSummary;
  aiPerformance: CsAiPerformance;
  issueProducts: CsIssueProductStat[];
  customerRiskSummary: CsCustomerRiskSummary;
}

const isAnswered = (s?: string): boolean => /^answered$/i.test((s || '').trim()) || /답변\s*완료|처리\s*완료|resolved|closed|done/i.test(s || '');
const isHold = (s?: string): boolean => /hold|보류/i.test(s || '');
const TYPE_GROUPS: Array<{ type: string; label: string; match: (t: string) => boolean }> = [
  { type: 'payment', label: '결제/주문', match: (t) => t === 'payment' },
  { type: 'claim', label: '환불/취소', match: (t) => t === 'refund' || t === 'cancel' || t === 'return' || t === 'exchange' },
  { type: 'delivery', label: '배송', match: (t) => t === 'delivery' },
  { type: 'product', label: '상품', match: (t) => t === 'product' },
  { type: 'general', label: '일반', match: (t) => !['payment', 'refund', 'cancel', 'return', 'exchange', 'delivery', 'product'].includes(t) }
];

export function buildCsDashboardStatistics(params: {
  inquiries: CsDashInquiry[];
  reviews: CsDashReview[];
  orders: GroundingOrder[];
  contacts?: CsDashContact[];
  completed?: CsCompletedWorkItem[];
  approvals?: CsApprovalQueueItem[];
  cautionByKey?: Record<string, boolean>;
  blacklistByKey?: Record<string, boolean>;
  goodsNames?: Record<string, string>;
  nowMs?: number;
}): CsDashboardStatistics {
  const inquiries = params.inquiries || [];
  const reviews = params.reviews || [];
  const completed = params.completed || [];
  const approvals = params.approvals || [];
  const names = params.goodsNames;

  // ── 1) 문의 유형 비중(문의 + 리뷰) ──
  const total = inquiries.length + reviews.length;
  const pct = (n: number): number => (total > 0 ? Math.round((n / total) * 100) : 0);
  const typeCounts = new Map<string, number>();
  for (const q of inquiries) {
    const t = normalizeCsTopic(q.topic);
    const g = TYPE_GROUPS.find((x) => x.match(t)) || TYPE_GROUPS[TYPE_GROUPS.length - 1];
    typeCounts.set(g.type, (typeCounts.get(g.type) || 0) + 1);
  }
  const inquiryTypeDistribution: CsInquiryTypeSlice[] = [
    ...TYPE_GROUPS.map((g) => ({ type: g.type, label: g.label, count: typeCounts.get(g.type) || 0, percent: pct(typeCounts.get(g.type) || 0) })),
    { type: 'review', label: '리뷰', count: reviews.length, percent: pct(reviews.length) }
  ].sort((a, b) => b.count - a.count);

  // ── 워크플로/AI: admin workflow 재사용 ──
  const wf = buildCsAdminWorkflow({ inquiries, reviews, orders: params.orders, contacts: params.contacts, goodsNames: names, nowMs: params.nowMs });
  const completedIds = new Set(completed.map((c) => c.originalId));
  const unresolvedCount = wf.unresolved.items.filter((i) => !completedIds.has(i.inquiryId)).length;
  const answeredCount = inquiries.filter((q) => isAnswered(q.status)).length;
  const pendingApproval = approvals.filter((a) => a.status === 'pending_approval').length;
  const approved = approvals.filter((a) => a.status === 'approved_local').length;
  const rejected = approvals.filter((a) => a.status === 'rejected').length;
  const heldCount = inquiries.filter((q) => isHold(q.status)).length;

  const workflowSummary: CsWorkflowSummary = {
    unresolved: unresolvedCount,
    pendingApproval,
    approved,
    completed: completed.length + answeredCount,
    rejectedOrHeld: rejected + heldCount
  };

  // ── 3) AI 처리 성과 ──
  const aiDraftable = wf.aiAuto.count + wf.unresolved.items.filter((i) => i.aiProcessable).length;
  const aiCompletedCount = completed.filter((c) => c.completionMethod === 'ai_draft' || c.completionMethod === 'ai_auto_batch').length;
  const denom = approved + rejected;
  const aiPerformance: CsAiPerformance = {
    draftCount: aiDraftable,
    approvalRequestedCount: approvals.length,
    approvedCount: approved,
    rejectedCount: rejected,
    aiCompletedCount,
    ...(denom > 0 ? { approvalRate: Math.round((approved / denom) * 100) } : {})
  };

  // ── 4) CS 이슈 상품 TOP (claimCount 보강) ──
  const claimByGoods = new Map<string, number>();
  for (const o of params.orders || []) {
    if (!(o.claim?.hasClaim || o.canceled)) continue;
    const g = (o.lines || [])[0]?.goodsNo;
    if (g) claimByGoods.set(g, (claimByGoods.get(g) || 0) + 1);
  }
  const issueProducts: CsIssueProductStat[] = summarizeCsIssueProducts(inquiries, reviews, names, 5).map((p) => ({
    productName: p.productName, goodsNo: p.goodsNo, inquiryCount: p.inquiryCount, reviewIssueCount: p.reviewIssueCount,
    claimCount: claimByGoods.get(p.goodsNo) || 0, mainIssueType: p.mainTopic, riskLevel: p.riskLevel
  }));

  // ── 5) 고객 리스크 요약(local caution/blacklist 반영) ──
  const hub = buildCsCustomerProfileHub({ inquiries, reviews, orders: params.orders, contacts: params.contacts, goodsNames: names, nowMs: params.nowMs });
  const caution = params.cautionByKey || {};
  const black = params.blacklistByKey || {};
  const cautionCustomerCount = hub.items.filter((c) => caution[c.memberKey] ?? c.tags.includes('주의 고객')).length;
  const blacklistCandidateCount = hub.items.filter((c) => black[c.memberKey] ?? c.tags.includes('블랙리스트 후보')).length;
  const customerRiskSummary: CsCustomerRiskSummary = {
    repeatInquiryCount: hub.byTag.repeatInquiry,
    repeatRefundCancelCount: hub.byTag.repeatClaim,
    cautionCustomerCount,
    blacklistCandidateCount,
    highValueCustomerCount: hub.byTag.highValue,
    topRiskCustomers: hub.items.filter((c) => c.summary.riskLevel === 'high').slice(0, 3).map((c) => ({
      customerId: c.customerId, ...(c.basic.name ? { name: c.basic.name } : {}), tags: c.tags, riskLevel: c.summary.riskLevel
    }))
  };

  return { inquiryTypeDistribution, workflowSummary, aiPerformance, issueProducts, customerRiskSummary };
}
