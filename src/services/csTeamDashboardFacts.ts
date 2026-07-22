// CS Team Dashboard Facts v0 — CS 중앙 "처리판" 대시보드용 순수 데이터 helper.
//
// 목적: 이미 로드된 데이터(revenue.orders + universeAux.inquiries/reviews)만으로
//   "오늘 무엇을 먼저 처리할지"를 산출한다. 새 API 호출 없음, LLM 호출 없음, 순수 함수.
//
// 원칙:
//   - PII/fake contact/memberKey를 산출물에 절대 싣지 않는다(입력도 safe만).
//   - CS는 "이슈 공급자". 마케팅 제안/광고/캠페인 산출 금지(여기엔 그런 필드 자체가 없다).
//   - orderLinked/draftable/needsHumanCheck는 grounding helper + composer로 deterministic 계산.

import { buildAssociatedOrderFacts, findDuplicatePaymentCandidates, type GroundingOrder } from './csInquiryOrderGrounding';
import { composeCsDraftFromOrders, normalizeCsTopic, type CsDraftInquiry, type CsRiskLevel } from './csDraftComposer';
// C-4: 문의 상태 판정은 공통 계약(inquiryStatusContract)만 사용(원시 문자열 비교·정규식 복붙 금지).
import { isUnanswered, isAnswered, isUnresolved, isOnHold } from './inquiryStatusContract';

// 입력(safe, 연락처 없음). SafeSyntheticInquiry / SafeSyntheticReview 와 구조적 호환.
export type CsDashInquiry = CsDraftInquiry;
export interface CsDashReview {
  reviewId?: string;
  orderNo?: string;
  goodsNo?: string;
  productId?: string;
  rating?: number;
  sentiment?: string;
  topic?: string;
  excerpt?: string;
  createdAt?: string;
}

export interface CsPriorityInquiry {
  rank: number;
  inquiryId: string;
  title: string;
  productName: string;
  topic: string;
  status: string;
  urgency: string;
  createdAt: string;
  orderNo?: string;
  orderLinked: boolean;
  draftable: boolean;
  riskLevel: CsRiskLevel;
  needsHumanCheck: boolean;
}

export interface CsLowRatingReview {
  productName: string;
  goodsNo?: string;
  rating: number;
  sentiment: string;
  topic: string;
  excerpt: string;
  createdAt: string;
}

export interface CsIssueProduct {
  goodsNo: string;
  productName: string;
  inquiryCount: number;
  reviewIssueCount: number;
  totalIssues: number;
  mainTopic: string;
  riskLevel: CsRiskLevel;
}

export interface CsDashboardKpis {
  unansweredCount: number;
  urgentCount: number;
  lowRatingReviewCount: number;
  needsHumanCheckCount: number;
  orderLinkedCount: number;
  draftableCount: number;
  issueProductCount: number;
}

export interface CsDashboardFacts {
  kpis: CsDashboardKpis;
  priorityInquiries: CsPriorityInquiry[];
  lowRatingReviews: CsLowRatingReview[];
  issueProducts: CsIssueProduct[];
  chatHints: string[];
}

// ── helpers ───────────────────────────────────────────────────────────────────
const isUrgent = (u?: string): boolean => !!u && /high|urgent|긴급/i.test(u);
const isLowReview = (r: CsDashReview): boolean =>
  (typeof r.rating === 'number' && r.rating <= 2) || /negative|부정/i.test(r.sentiment || '');
const byCreatedDesc = (a: { createdAt?: string }, b: { createdAt?: string }): number =>
  (b.createdAt || '').localeCompare(a.createdAt || '');
const prodName = (goodsNo?: string, productId?: string, names?: Record<string, string>): string =>
  (goodsNo && names?.[goodsNo]) || (productId && names?.[productId]) || goodsNo || productId || '상품미상';

const TOPIC_KO: Record<string, string> = {
  payment: '결제', refund: '환불', cancel: '취소', return: '반품', exchange: '교환',
  delivery: '배송', product: '상품', product_question: '상품', stock: '재입고', coupon: '쿠폰', account: '계정', general: '기타'
};
export const csTopicKo = (t?: string): string => TOPIC_KO[t || ''] || TOPIC_KO[normalizeCsTopic(t)] || (t || '기타');

const DRAFTABLE_TOPICS = new Set(['product', 'general']);

// 우선순위 점수: 긴급+미처리(0) < 미처리(1) < 긴급(2) < 그 외(3)
// C-4: 우선처리 큐는 "미처리 먼저"이므로 미답변만이 아니라 미처리 전체(unanswered/in_progress/
//   on_hold/needs_human/unknown)를 상위 티어로 둔다. needs_human('관리자 확인 필요')이 답변완료와
//   동급(3)으로 침몰하는 것을 방지 — 라벨 '미답변' 집계(unansweredCount)와는 별개 개념.
const priorityScore = (status?: string, urgency?: string): number => {
  const un = isUnresolved(status);
  const ur = isUrgent(urgency);
  if (un && ur) return 0;
  if (un) return 1;
  if (ur) return 2;
  return 3;
};

// 문의 1건 enrich (orderLinked/draftable/risk/needsHumanCheck) — deterministic
interface EnrichedInquiry extends CsPriorityInquiry {
  score: number;
}
const enrichInquiry = (q: CsDashInquiry, orders: GroundingOrder[], names?: Record<string, string>): EnrichedInquiry => {
  const facts = buildAssociatedOrderFacts({ inquiryId: q.inquiryId || '', orderNo: q.orderNo, goodsNo: q.goodsNo, topic: q.topic }, orders);
  const composer = composeCsDraftFromOrders(q, orders);
  const topic = normalizeCsTopic(q.topic);
  const orderLinked = facts.matched;
  const draftable = orderLinked || DRAFTABLE_TOPICS.has(topic);
  return {
    rank: 0,
    inquiryId: q.inquiryId || '',
    title: q.title || `${csTopicKo(q.topic)} 문의`,
    productName: prodName(q.goodsNo, undefined, names),
    topic,
    status: q.status || '미상',
    urgency: q.urgency || '보통',
    createdAt: q.createdAt || '',
    ...(q.orderNo ? { orderNo: q.orderNo } : {}),
    orderLinked,
    draftable,
    riskLevel: composer.riskLevel,
    needsHumanCheck: composer.requiresHumanCheck,
    score: priorityScore(q.status, q.urgency)
  };
};

// ── 공개 helper ───────────────────────────────────────────────────────────────
export function rankCsPriorityInquiries(
  inquiries: CsDashInquiry[],
  orders: GroundingOrder[],
  names?: Record<string, string>,
  limit = 12
): CsPriorityInquiry[] {
  const enriched = (inquiries || [])
    .filter((q) => q.inquiryId || q.createdAt)
    .map((q) => enrichInquiry(q, orders || [], names));
  enriched.sort((a, b) => a.score - b.score || byCreatedDesc(a, b));
  return enriched.slice(0, limit).map((e, i) => {
    const { score: _score, ...rest } = e;
    void _score;
    return { ...rest, rank: i + 1 };
  });
}

export function summarizeLowRatingReviews(
  reviews: CsDashReview[],
  names?: Record<string, string>,
  limit = 10
): CsLowRatingReview[] {
  return (reviews || [])
    .filter(isLowReview)
    .sort(byCreatedDesc)
    .slice(0, limit)
    .map((r) => ({
      productName: prodName(r.goodsNo, r.productId, names),
      ...(r.goodsNo ? { goodsNo: r.goodsNo } : {}),
      rating: typeof r.rating === 'number' ? r.rating : 0,
      sentiment: r.sentiment || '',
      topic: r.topic || '',
      excerpt: r.excerpt || '',
      createdAt: r.createdAt || ''
    }));
}

export function summarizeCsIssueProducts(
  inquiries: CsDashInquiry[],
  reviews: CsDashReview[],
  names?: Record<string, string>,
  limit = 10
): CsIssueProduct[] {
  type Agg = { goodsNo: string; inquiryCount: number; reviewIssueCount: number; urgentCount: number; topics: Record<string, number> };
  const map = new Map<string, Agg>();
  const get = (goodsNo: string): Agg => {
    let a = map.get(goodsNo);
    if (!a) { a = { goodsNo, inquiryCount: 0, reviewIssueCount: 0, urgentCount: 0, topics: {} }; map.set(goodsNo, a); }
    return a;
  };
  for (const q of inquiries || []) {
    if (!q.goodsNo) continue;
    const a = get(q.goodsNo);
    a.inquiryCount += 1;
    if (isUrgent(q.urgency)) a.urgentCount += 1;
    const t = normalizeCsTopic(q.topic);
    a.topics[t] = (a.topics[t] || 0) + 1;
  }
  for (const r of reviews || []) {
    if (!r.goodsNo || !isLowReview(r)) continue;
    get(r.goodsNo).reviewIssueCount += 1;
  }
  const out: CsIssueProduct[] = [...map.values()].map((a) => {
    const total = a.inquiryCount + a.reviewIssueCount;
    const mainTopic = Object.entries(a.topics).sort((x, y) => y[1] - x[1])[0]?.[0] || 'general';
    const riskLevel: CsRiskLevel = a.urgentCount >= 2 || total >= 6 ? 'high' : total >= 3 || a.urgentCount >= 1 ? 'medium' : 'low';
    return { goodsNo: a.goodsNo, productName: prodName(a.goodsNo, undefined, names), inquiryCount: a.inquiryCount, reviewIssueCount: a.reviewIssueCount, totalIssues: total, mainTopic, riskLevel };
  });
  out.sort((a, b) => b.totalIssues - a.totalIssues || b.inquiryCount - a.inquiryCount);
  return out.slice(0, limit);
}

const CHAT_HINTS = [
  '“1순위 미답변 문의 답변 써줘”',
  '“긴급 문의부터 정리해줘”',
  '“결제 문의 초안 만들어줘”',
  '“저평점 리뷰 상품 알려줘”'
];

export function buildCsDashboardFacts(params: {
  inquiries: CsDashInquiry[];
  reviews: CsDashReview[];
  orders: GroundingOrder[];
  goodsNames?: Record<string, string>;
  priorityLimit?: number;
}): CsDashboardFacts {
  const inquiries = params.inquiries || [];
  const reviews = params.reviews || [];
  const orders = params.orders || [];
  const names = params.goodsNames;

  // 전체 문의 enrich(한 번) → KPI + 우선순위 동시 산출
  const enriched = inquiries
    .filter((q) => q.inquiryId || q.createdAt)
    .map((q) => enrichInquiry(q, orders, names));
  const sorted = [...enriched].sort((a, b) => a.score - b.score || byCreatedDesc(a, b));
  const priorityInquiries = sorted.slice(0, params.priorityLimit ?? 12).map((e, i) => {
    const { score: _s, ...rest } = e; void _s; return { ...rest, rank: i + 1 };
  });

  const lowRatingReviews = summarizeLowRatingReviews(reviews, names);
  const issueProducts = summarizeCsIssueProducts(inquiries, reviews, names);

  const kpis: CsDashboardKpis = {
    unansweredCount: enriched.filter((e) => isUnanswered(e.status)).length,
    urgentCount: enriched.filter((e) => isUrgent(e.urgency)).length,
    lowRatingReviewCount: reviews.filter(isLowReview).length,
    needsHumanCheckCount: enriched.filter((e) => e.needsHumanCheck).length,
    orderLinkedCount: enriched.filter((e) => e.orderLinked).length,
    draftableCount: enriched.filter((e) => e.draftable).length,
    issueProductCount: issueProducts.length
  };

  return { kpis, priorityInquiries, lowRatingReviews, issueProducts, chatHints: [...CHAT_HINTS] };
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI/Popup UX Revision v0 — 접수 현황(미처리 문의·리뷰) vs 처리 분류(AI 자동/내부확인)
//   공식: unresolvedInquiries + unresolvedReviews === aiProcessable + needsInternalCheck
//   규칙: 각 미처리 항목은 처리 분류에서 "하나만". 우선순위 = 내부확인 필요 > AI 자동처리.
// ─────────────────────────────────────────────────────────────────────────────

export interface CsKpiInquiryItem {
  kind: 'inquiry';
  inquiryId: string;
  title: string;
  productName: string;
  topic: string;
  topicKo: string;
  status?: string;
  orderNo?: string;
  goodsNo?: string;
  excerpt?: string;
  createdAt: string;
  ageDays: number;
  stage: string;
  orderLinked: boolean;
  aiProcessable: boolean;
  needsInternalCheck: boolean;
  internalReason?: string;
  riskLevel: CsRiskLevel;
}
export interface CsKpiReviewItem {
  kind: 'review';
  reviewId: string;
  orderNo?: string;
  productName: string;
  goodsNo?: string;
  rating: number;
  sentiment: string;
  topic: string;
  topicKo: string;
  excerpt: string;
  createdAt: string;
  ageDays: number;
  stage: string;
  aiProcessable: boolean;
  needsInternalCheck: boolean;
  internalReason?: string;
  riskLevel: CsRiskLevel;
}
export type CsKpiItem = CsKpiInquiryItem | CsKpiReviewItem;

export interface CsKpiRevisionFacts {
  intake: { unresolvedInquiries: number; unresolvedReviews: number };
  routing: { aiProcessable: number; needsInternalCheck: number };
  breakdowns: {
    inquiryByType: Record<string, number>;
    reviewByType: Record<string, number>;
    aiProcessableByType: Record<string, number>;
    needsInternalCheckByType: Record<string, number>;
  };
  items: {
    unresolvedInquiries: CsKpiInquiryItem[];
    unresolvedReviews: CsKpiReviewItem[];
    aiProcessable: CsKpiItem[];
    needsInternalCheck: CsKpiItem[];
  };
}

const negativeReview = (r: CsDashReview): boolean => /negative|부정|불만/i.test(r.sentiment || '');
const DEFECT_REVIEW_TOPICS = new Set(['quality', 'effect', 'refund', 'packaging']);

const ageDaysOf = (createdAt: string, nowMs: number): number => {
  const t = Date.parse((createdAt || '').replace(' ', 'T'));
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86400000));
};

const inc = (m: Record<string, number>, k: string): void => { m[k] = (m[k] || 0) + 1; };

// 문의 처리 분류: 내부확인 필요 우선, 아니면 AI 자동처리.
const classifyInquiry = (
  q: CsDashInquiry, orders: GroundingOrder[]
): { aiProcessable: boolean; internalReason?: string } => {
  const topic = normalizeCsTopic(q.topic);
  const probe = { inquiryId: q.inquiryId || '', orderNo: q.orderNo, goodsNo: q.goodsNo, topic: q.topic };
  const facts = buildAssociatedOrderFacts(probe, orders);
  if (topic === 'payment') {
    if (facts.matched) {
      const dup = findDuplicatePaymentCandidates(probe, orders).candidates;
      if (dup.length) return { aiProcessable: false, internalReason: '중복결제 후보 있음' };
      return { aiProcessable: true };
    }
    return { aiProcessable: false, internalReason: '주문 매칭 실패(결제 확인 필요)' };
  }
  if (topic === 'refund' || topic === 'cancel' || topic === 'return' || topic === 'exchange') {
    return { aiProcessable: false, internalReason: '환불/취소/교환·반품 완료 여부 불명확' };
  }
  // delivery/product/general/stock/coupon/account → AI 자동처리 후보(단순 안내/답글)
  return { aiProcessable: true };
};

const classifyReview = (r: CsDashReview): { aiProcessable: boolean; internalReason?: string } => {
  if (typeof r.rating === 'number' && r.rating <= 2 && negativeReview(r) && DEFECT_REVIEW_TOPICS.has(r.topic || '')) {
    return { aiProcessable: false, internalReason: '저평점 + 상품 결함/불만 신호' };
  }
  return { aiProcessable: true };
};

const aiBucketOfInquiry = (topic: string): string =>
  topic === 'delivery' ? '배송' : topic === 'payment' ? '단순결제확인' : topic === 'product' || topic === 'stock' ? '상품정보' : '일반';
const internalBucketOfInquiry = (topic: string): string =>
  topic === 'payment' ? '결제' : topic === 'refund' || topic === 'cancel' || topic === 'return' || topic === 'exchange' ? '환불·취소' : topic === 'delivery' ? '배송' : '기타';
const reviewBucket = (rating: number): string => (rating >= 4 ? '좋음' : rating === 3 ? '보통' : '저평점');

export function buildCsKpiRevision(params: {
  inquiries: CsDashInquiry[];
  reviews: CsDashReview[];
  orders: GroundingOrder[];
  goodsNames?: Record<string, string>;
  nowMs?: number;
}): CsKpiRevisionFacts {
  const orders = params.orders || [];
  const names = params.goodsNames;
  const nowMs = params.nowMs ?? (Date.parse(`${(params.inquiries[0]?.createdAt || '2026-06-27').slice(0, 10)}T23:59:59`) || 0);

  const unresolvedQ = (params.inquiries || []).filter((q) => (q.inquiryId || q.createdAt) && isUnresolved(q.status));
  const unresolvedR = params.reviews || []; // synthetic: 답글 플래그 없음 → 전부 미처리

  const inquiryByType: Record<string, number> = {};
  const reviewByType: Record<string, number> = {};
  const aiProcessableByType: Record<string, number> = {};
  const needsInternalCheckByType: Record<string, number> = {};

  const unresolvedInquiries: CsKpiInquiryItem[] = unresolvedQ.map((q) => {
    const topic = normalizeCsTopic(q.topic);
    const facts = buildAssociatedOrderFacts({ inquiryId: q.inquiryId || '', orderNo: q.orderNo, goodsNo: q.goodsNo, topic: q.topic }, orders);
    const cls = classifyInquiry(q, orders);
    const composer = composeCsDraftFromOrders(q, orders);
    inc(inquiryByType, topic);
    const item: CsKpiInquiryItem = {
      kind: 'inquiry',
      inquiryId: q.inquiryId || '',
      title: q.title || `${csTopicKo(q.topic)} 문의`,
      productName: prodName(q.goodsNo, undefined, names),
      topic,
      topicKo: csTopicKo(q.topic),
      ...(q.status ? { status: q.status } : {}),
      ...(q.orderNo ? { orderNo: q.orderNo } : {}),
      ...(q.goodsNo ? { goodsNo: q.goodsNo } : {}),
      ...(q.excerpt ? { excerpt: q.excerpt } : {}),
      createdAt: q.createdAt || '',
      ageDays: ageDaysOf(q.createdAt || '', nowMs),
      stage: cls.aiProcessable ? 'AI 초안 가능' : '내부 확인 중',
      orderLinked: facts.matched,
      aiProcessable: cls.aiProcessable,
      needsInternalCheck: !cls.aiProcessable,
      ...(cls.internalReason ? { internalReason: cls.internalReason } : {}),
      riskLevel: composer.riskLevel
    };
    if (cls.aiProcessable) inc(aiProcessableByType, aiBucketOfInquiry(topic));
    else inc(needsInternalCheckByType, internalBucketOfInquiry(topic));
    return item;
  });

  const unresolvedReviews: CsKpiReviewItem[] = unresolvedR.map((r) => {
    const cls = classifyReview(r);
    const rating = typeof r.rating === 'number' ? r.rating : 0;
    inc(reviewByType, reviewBucket(rating));
    const item: CsKpiReviewItem = {
      kind: 'review',
      reviewId: r.reviewId || '',
      ...(r.orderNo ? { orderNo: r.orderNo } : {}),
      productName: prodName(r.goodsNo, r.productId, names),
      ...(r.goodsNo ? { goodsNo: r.goodsNo } : {}),
      rating,
      sentiment: r.sentiment || '',
      topic: r.topic || '',
      topicKo: csTopicKo(r.topic),
      excerpt: r.excerpt || '',
      createdAt: r.createdAt || '',
      ageDays: ageDaysOf(r.createdAt || '', nowMs),
      stage: cls.aiProcessable ? 'AI 초안 가능' : '내부 확인 중',
      aiProcessable: cls.aiProcessable,
      needsInternalCheck: !cls.aiProcessable,
      ...(cls.internalReason ? { internalReason: cls.internalReason } : {}),
      riskLevel: cls.aiProcessable ? 'low' : 'medium'
    };
    if (cls.aiProcessable) inc(aiProcessableByType, '리뷰');
    else inc(needsInternalCheckByType, '상품');
    return item;
  });

  const allItems: CsKpiItem[] = [...unresolvedInquiries, ...unresolvedReviews];
  const aiProcessable = allItems.filter((i) => i.aiProcessable);
  const needsInternalCheck = allItems.filter((i) => i.needsInternalCheck);

  return {
    intake: { unresolvedInquiries: unresolvedInquiries.length, unresolvedReviews: unresolvedReviews.length },
    routing: { aiProcessable: aiProcessable.length, needsInternalCheck: needsInternalCheck.length },
    breakdowns: { inquiryByType, reviewByType, aiProcessableByType, needsInternalCheckByType },
    items: { unresolvedInquiries, unresolvedReviews, aiProcessable, needsInternalCheck }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CS Inquiry Detail Panel Enrichment v0 — 팝업 우측 상세용 enriched item.
//   ⚠️ customer(고객정보)는 이 detail item에만 담는다. bulk facts(KPI/breakdown)·AI
//      context·타 부서·docs/smoke 에는 절대 싣지 않는다. fake contact는 isSynthetic 표식.
// ─────────────────────────────────────────────────────────────────────────────

// CS 전용 fake contact 입력(구조적 호환: CsFakeContact). bulk facts엔 미사용.
export interface CsDashContact {
  memberKey: string;
  customerId?: string;
  customerName?: string;
  phone?: string;
  email?: string;
  address?: string;
  origin?: { isFakePii?: boolean; piiType?: string; syntheticProfile?: string };
}

export interface CsDetailOrderItem {
  productName?: string;
  optionName?: string;
  quantity?: number;
  amount?: number;
}

export interface CsDetailOrderBlock {
  orderNo?: string;
  orderDate?: string;
  paymentState?: string;
  orderAmount?: number;
  goodsAmount?: number;
  deliveryCharge?: number;
  claimTypes?: string[];
  items?: CsDetailOrderItem[];
  matched: boolean;
}

export interface CsDetailCustomerBlock {
  isSynthetic: boolean;
  memberType?: string;
  memberId?: string;
  name?: string;
  phone?: string;
  email?: string;
  recentOrderCount?: number;
}

export interface CsDashboardDetailItem {
  id: string;
  sourceType: 'inquiry' | 'review';
  title: string;
  productName?: string;
  type?: string;
  status?: string;
  createdAt?: string;
  elapsedDays?: number;
  processStage?: string;
  processRoute?: 'ai_auto' | 'internal_check';
  bodyText?: string;
  summary?: string;
  rating?: number;
  sentiment?: string;
  order?: CsDetailOrderBlock;
  customer?: CsDetailCustomerBlock;
  assignee?: string; // 담당직원(미처리 단계 입력 → 처리완료 handledBy로 연결될 값). v0 미설정.
  flags: { orderLinked: boolean; draftable: boolean; needsInternalCheck: boolean; highRisk: boolean };
}

// 공유: orderNo → 주문 블록(연결 여부 포함). PII 없음.
function buildOrderBlock(orderNo: string | undefined, orders: GroundingOrder[], names?: Record<string, string>): CsDetailOrderBlock {
  const probe = { inquiryId: '', orderNo, goodsNo: undefined, topic: undefined };
  const facts = buildAssociatedOrderFacts(probe, orders);
  const order = orderNo ? orders.find((o) => o.orderNo === orderNo) : undefined;
  if (facts.matched && order) {
    return {
      orderNo: order.orderNo,
      orderDate: order.orderDate || undefined,
      paymentState: order.paid ? '결제완료' : '미결제/미완료',
      orderAmount: order.totalAmount,
      goodsAmount: order.productRevenueByLines,
      deliveryCharge: order.deliveryFee,
      ...(facts.claimSummary?.claimTypes?.length ? { claimTypes: facts.claimSummary.claimTypes } : {}),
      items: (order.lines || []).map((l) => ({ productName: l.goodsName || (l.goodsNo && names?.[l.goodsNo]) || l.goodsNo, quantity: l.quantity, amount: l.lineRevenue })),
      matched: true
    };
  }
  return { orderNo, items: [], matched: false };
}

// 공유: 고객 블록(contacts가 있을 때만 = CS UI 경로). memberKey는 주문에서만 얻음. PII 게이트.
function buildCustomerBlock(orderNo: string | undefined, orders: GroundingOrder[], contacts?: CsDashContact[]): CsDetailCustomerBlock | undefined {
  if (!contacts || !orderNo) return undefined;
  const order = orders.find((o) => o.orderNo === orderNo);
  if (!order?.memberKey) return undefined;
  const c = contacts.find((x) => x.memberKey === order.memberKey);
  if (!c) return undefined;
  return {
    isSynthetic: c.origin?.isFakePii === true || c.origin?.piiType === 'fake' || true,
    memberType: '회원',
    memberId: c.customerId,
    name: c.customerName,
    phone: c.phone,
    email: c.email,
    recentOrderCount: orders.filter((o) => o.memberKey === order.memberKey).length
  };
}

// 단건 enriched detail. customer는 contacts가 주어졌을 때만(=CS 상세 UI 경로) 채운다.
export function buildCsDetailItem(
  item: CsKpiItem,
  ctx: { orders: GroundingOrder[]; contacts?: CsDashContact[]; goodsNames?: Record<string, string> }
): CsDashboardDetailItem {
  const orders = ctx.orders || [];
  const names = ctx.goodsNames;
  const id = item.kind === 'inquiry' ? item.inquiryId : item.reviewId;
  const orderNo = item.orderNo;
  const orderBlock = buildOrderBlock(orderNo, orders, names);

  const detail: CsDashboardDetailItem = {
    id,
    sourceType: item.kind,
    title: item.kind === 'inquiry' ? item.title : `${item.productName} 리뷰`,
    productName: item.productName,
    type: item.topicKo,
    createdAt: item.createdAt,
    elapsedDays: item.ageDays,
    processStage: item.stage,
    processRoute: item.aiProcessable ? 'ai_auto' : 'internal_check',
    bodyText: item.excerpt || undefined,
    summary: item.excerpt || undefined,
    ...(item.kind === 'inquiry' ? {} : { rating: item.rating, sentiment: item.sentiment }),
    order: orderBlock,
    flags: {
      orderLinked: orderBlock.matched,
      draftable: item.aiProcessable,
      needsInternalCheck: item.needsInternalCheck,
      highRisk: item.riskLevel === 'high'
    }
  };
  if (item.kind === 'inquiry') detail.status = item.status;
  const cust = buildCustomerBlock(orderNo, orders, ctx.contacts);
  if (cust) detail.customer = cust;
  return detail;
}

// ─────────────────────────────────────────────────────────────────────────────
// CS Dashboard Admin Workflow Restructure v0
//   KPI = 미처리 문의 / 처리완료 문의 / AI 자동처리함(리뷰+배송만) / 고객관리
//   ⚠️ 고객 PII는 contacts가 주어진 CS UI 경로에서만. bulk counts/AI/타부서엔 미노출.
// ─────────────────────────────────────────────────────────────────────────────

// 문의 타입 → 색상 class token (배지/라인용)
export const csTypeColorClass = (topic?: string): string => {
  const t = normalizeCsTopic(topic);
  if (t === 'payment') return 'type-pay';
  if (t === 'refund' || t === 'cancel' || t === 'return' || t === 'exchange') return 'type-claim';
  if (t === 'delivery') return 'type-delivery';
  if (t === 'product') return 'type-product';
  return 'type-general';
};

export interface CsResolvedItem {
  inquiryId: string;
  title: string;
  type: string;
  productName: string;
  orderNo?: string;
  customerLabel?: string; // contacts 있을 때만 고객명, 없으면 미표시(PII 게이트)
  createdAt: string;
  processedAt?: string;
  result?: string;
  followUp?: boolean;
  questionText?: string; // 고객 질문 원문(safe excerpt)
  prevAnswer?: string; // 이전 답변(placeholder)
  handledBy?: string; // 담당직원(데이터 없으면 undefined → UI에서 '미기록')
  order?: CsDetailOrderBlock;
  customer?: CsDetailCustomerBlock;
  // ── local 완료 이력(CS Work Completion Flow v0)일 때만 ──
  answerText?: string; // 실제 처리한 답변 원문(placeholder 대신 표시)
  localCompleted?: boolean;
  completionMethod?: string;
  writeStatus?: string;
}

const orderMemberKeyMap = (orders: GroundingOrder[]): Map<string, string> => {
  const m = new Map<string, string>();
  for (const o of orders) if (o.orderNo && o.memberKey) m.set(o.orderNo, o.memberKey);
  return m;
};

export function buildCsResolvedInquiries(params: {
  inquiries: CsDashInquiry[];
  orders: GroundingOrder[];
  contacts?: CsDashContact[];
  goodsNames?: Record<string, string>;
  nowMs?: number;
}): { count: number; today: number; last7d: number; repeat: number; items: CsResolvedItem[] } {
  const orders = params.orders || [];
  const names = params.goodsNames;
  const nowMs = params.nowMs ?? (Date.parse(`${(params.inquiries[0]?.createdAt || '2026-06-27').slice(0, 10)}T23:59:59`) || 0);
  const mkMap = orderMemberKeyMap(orders);
  const contactByKey = new Map<string, CsDashContact>();
  for (const c of params.contacts || []) contactByKey.set(c.memberKey, c);

  // memberKey별 전체 문의 수(반복 판정)
  const inqByMember = new Map<string, number>();
  for (const q of params.inquiries || []) {
    const mk = q.orderNo ? mkMap.get(q.orderNo) : undefined;
    if (mk) inqByMember.set(mk, (inqByMember.get(mk) || 0) + 1);
  }

  const answered = (params.inquiries || []).filter((q) => isAnswered(q.status));
  let today = 0, last7d = 0, repeat = 0;
  const items: CsResolvedItem[] = answered
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map((q) => {
      const mk = q.orderNo ? mkMap.get(q.orderNo) : undefined;
      const followUp = !!mk && (inqByMember.get(mk) || 0) >= 2;
      const age = ageDaysOf(q.createdAt || '', nowMs);
      if (age <= 0) today += 1;
      if (age <= 7) last7d += 1;
      if (followUp) repeat += 1;
      const c = mk ? contactByKey.get(mk) : undefined;
      const orderBlock = buildOrderBlock(q.orderNo, orders, names);
      const customerBlock = buildCustomerBlock(q.orderNo, orders, params.contacts);
      const item: CsResolvedItem = {
        inquiryId: q.inquiryId || '',
        title: q.title || `${csTopicKo(q.topic)} 문의`,
        type: csTopicKo(q.topic),
        productName: prodName(q.goodsNo, undefined, names),
        ...(q.orderNo ? { orderNo: q.orderNo } : {}),
        ...(params.contacts && c?.customerName ? { customerLabel: c.customerName } : {}),
        createdAt: q.createdAt || '',
        processedAt: q.createdAt || '', // v0: 실제 처리일시 데이터 없음 → 접수일 대용
        result: '답변 완료',
        followUp,
        ...(q.excerpt ? { questionText: q.excerpt } : {}),
        prevAnswer: '이전 답변 원문은 고도몰 CS 원장 확인 필요 (v0 미연동)',
        // handledBy: 데이터 없음 → 미설정(UI에서 '미기록' placeholder)
        order: orderBlock,
        ...(customerBlock ? { customer: customerBlock } : {})
      };
      return item;
    });
  return { count: items.length, today, last7d, repeat, items };
}

// ── 고객관리 ──────────────────────────────────────────────────────────────────
export interface CsCustomerManagementItem {
  customerId: string;
  memberKey: string;
  isSynthetic?: boolean;
  memberId?: string;
  name?: string;
  phone?: string;
  email?: string;
  orderCount: number;
  totalOrderAmount?: number;
  inquiryCount: number;
  reviewCount: number;
  claimCount?: number;
  refundCancelCount?: number;
  tags: string[];
  riskLevel: CsRiskLevel;
  lastActivityAt?: string;
  recentOrders: Array<{ orderNo: string; orderDate?: string; amount?: number; productNames?: string[] }>;
  recentInquiries: Array<{ inquiryId: string; title?: string; type?: string; createdAt?: string; status?: string }>;
  recentReviews: Array<{ reviewId: string; rating?: number; sentiment?: string; createdAt?: string }>;
}

const HIGH_VALUE_WON = 100000;

export function buildCsCustomerManagementFacts(params: {
  inquiries: CsDashInquiry[];
  reviews: CsDashReview[];
  orders: GroundingOrder[];
  contacts?: CsDashContact[];
  goodsNames?: Record<string, string>;
  limit?: number;
}): {
  count: number;
  byTag: { repeatInquiry: number; repeatClaim: number; highValue: number; watch: number };
  items: CsCustomerManagementItem[];
} {
  const orders = params.orders || [];
  const names = params.goodsNames;
  const mkMap = orderMemberKeyMap(orders);
  const contactByKey = new Map<string, CsDashContact>();
  for (const c of params.contacts || []) contactByKey.set(c.memberKey, c);

  type Agg = {
    memberKey: string;
    orders: GroundingOrder[];
    inquiries: CsDashInquiry[];
    reviews: CsDashReview[];
  };
  const map = new Map<string, Agg>();
  const get = (mk: string): Agg => {
    let a = map.get(mk);
    if (!a) { a = { memberKey: mk, orders: [], inquiries: [], reviews: [] }; map.set(mk, a); }
    return a;
  };
  for (const o of orders) if (o.memberKey) get(o.memberKey).orders.push(o);
  for (const q of params.inquiries || []) { const mk = q.orderNo ? mkMap.get(q.orderNo) : undefined; if (mk) get(mk).inquiries.push(q); }
  for (const r of params.reviews || []) { const mk = r.orderNo ? mkMap.get(r.orderNo) : undefined; if (mk) get(mk).reviews.push(r); }

  const items: CsCustomerManagementItem[] = [...map.values()].map((a) => {
    const paidOrders = a.orders.filter((o) => o.paid);
    const totalOrderAmount = paidOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const claimCount = a.orders.filter((o) => o.claim?.hasClaim).length;
    const refundCancelCount = a.orders.filter((o) => (o.claim?.claimTypes || []).some((t) => /refund|cancel|return/.test(t)) || o.canceled).length;
    const lowReviewCount = a.reviews.filter((r) => (typeof r.rating === 'number' && r.rating <= 2) || /negative|부정/i.test(r.sentiment || '')).length;
    const tags: string[] = [];
    if (a.inquiries.length >= 2) tags.push('반복문의');
    if (refundCancelCount >= 2) tags.push('반복 환불·취소');
    if (lowReviewCount >= 2) tags.push('저평점 반복');
    if (totalOrderAmount >= HIGH_VALUE_WON) tags.push('고액 고객');
    const riskLevel: CsRiskLevel = claimCount >= 2 || refundCancelCount >= 2 ? 'high' : claimCount >= 1 || a.inquiries.length >= 2 ? 'medium' : 'low';
    if (riskLevel !== 'low') tags.push('주의 고객');
    if (riskLevel === 'high' && refundCancelCount >= 2) tags.push('블랙리스트 후보');

    const c = contactByKey.get(a.memberKey);
    const lastActivityAt = [...a.orders.map((o) => o.orderDate || ''), ...a.inquiries.map((q) => q.createdAt || ''), ...a.reviews.map((r) => r.createdAt || '')].sort().pop() || undefined;

    const item: CsCustomerManagementItem = {
      customerId: c?.customerId || a.memberKey,
      memberKey: a.memberKey,
      orderCount: a.orders.length,
      totalOrderAmount,
      inquiryCount: a.inquiries.length,
      reviewCount: a.reviews.length,
      claimCount,
      refundCancelCount,
      tags,
      riskLevel,
      ...(lastActivityAt ? { lastActivityAt } : {}),
      recentOrders: [...a.orders].sort((x, y) => (y.orderDate || '').localeCompare(x.orderDate || '')).slice(0, 5).map((o) => ({
        orderNo: o.orderNo, orderDate: o.orderDate, amount: o.totalAmount, productNames: (o.lines || []).map((l) => l.goodsName || (l.goodsNo && names?.[l.goodsNo]) || l.goodsNo).filter(Boolean) as string[]
      })),
      recentInquiries: [...a.inquiries].sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || '')).slice(0, 5).map((q) => ({
        inquiryId: q.inquiryId || '', title: q.title, type: csTopicKo(q.topic), createdAt: q.createdAt, status: q.status
      })),
      recentReviews: [...a.reviews].sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || '')).slice(0, 5).map((r) => ({
        reviewId: r.reviewId || '', rating: r.rating, sentiment: r.sentiment, createdAt: r.createdAt
      }))
    };
    // 고객 PII는 contacts(CS UI 경로)일 때만.
    if (params.contacts && c) {
      item.isSynthetic = c.origin?.isFakePii === true || c.origin?.piiType === 'fake' || true;
      item.memberId = c.customerId;
      item.name = c.customerName;
      item.phone = c.phone;
      item.email = c.email;
    }
    return item;
  });

  // 정렬: 위험도 high → 활동 많은 순
  const rank = (r: CsRiskLevel): number => (r === 'high' ? 0 : r === 'medium' ? 1 : 2);
  items.sort((x, y) => rank(x.riskLevel) - rank(y.riskLevel) || (y.inquiryCount + (y.claimCount || 0)) - (x.inquiryCount + (x.claimCount || 0)));

  const byTag = {
    repeatInquiry: items.filter((i) => i.tags.includes('반복문의')).length,
    repeatClaim: items.filter((i) => i.tags.includes('반복 환불·취소')).length,
    highValue: items.filter((i) => i.tags.includes('고액 고객')).length,
    watch: items.filter((i) => i.tags.includes('주의 고객')).length
  };
  return { count: items.length, byTag, items: items.slice(0, params.limit ?? 50) };
}

// ── Admin Workflow 오케스트레이터(4 KPI) ──────────────────────────────────────
export interface CsAdminWorkflowFacts {
  unresolved: { count: number; byStage: { aiDraftable: number; internalCheck: number; hold: number }; items: CsKpiInquiryItem[] };
  resolved: { count: number; today: number; last7d: number; repeat: number; items: CsResolvedItem[] };
  aiAuto: { count: number; byType: { review: number; delivery: number }; items: CsKpiItem[] };
  customers: { count: number; byTag: { repeatInquiry: number; repeatClaim: number; highValue: number; watch: number }; items: CsCustomerManagementItem[] };
  chatHints: string[];
}

export function buildCsAdminWorkflow(params: {
  inquiries: CsDashInquiry[];
  reviews: CsDashReview[];
  orders: GroundingOrder[];
  contacts?: CsDashContact[];
  goodsNames?: Record<string, string>;
  nowMs?: number;
}): CsAdminWorkflowFacts {
  const rev = buildCsKpiRevision({ inquiries: params.inquiries, reviews: params.reviews, orders: params.orders, goodsNames: params.goodsNames, nowMs: params.nowMs });
  const unresolvedItems = rev.items.unresolvedInquiries;
  const byStage = {
    aiDraftable: unresolvedItems.filter((i) => i.aiProcessable).length,
    internalCheck: unresolvedItems.filter((i) => i.needsInternalCheck).length,
    hold: unresolvedItems.filter((i) => isOnHold(i.status)).length
  };
  // AI 자동처리함: 리뷰 답글 + 배송안내만(상품/결제/일반/환불·취소 제외)
  const reviewItems = rev.items.unresolvedReviews;
  const deliveryItems = unresolvedItems.filter((i) => i.topic === 'delivery');
  const aiAutoItems: CsKpiItem[] = [...reviewItems, ...deliveryItems];

  const resolved = buildCsResolvedInquiries({ inquiries: params.inquiries, orders: params.orders, contacts: params.contacts, goodsNames: params.goodsNames, nowMs: params.nowMs });
  const customers = buildCsCustomerManagementFacts({ inquiries: params.inquiries, reviews: params.reviews, orders: params.orders, contacts: params.contacts, goodsNames: params.goodsNames });

  return {
    unresolved: { count: unresolvedItems.length, byStage, items: unresolvedItems },
    resolved,
    aiAuto: { count: aiAutoItems.length, byType: { review: reviewItems.length, delivery: deliveryItems.length }, items: aiAutoItems },
    customers: { count: customers.count, byTag: customers.byTag, items: customers.items },
    chatHints: ['“1순위 미처리 문의 답변 써줘”', '“리뷰답글 초안 만들어줘”', '“반복문의 고객 알려줘”']
  };
}
