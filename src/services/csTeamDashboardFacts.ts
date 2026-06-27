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

// 입력(safe, 연락처 없음). SafeSyntheticInquiry / SafeSyntheticReview 와 구조적 호환.
export type CsDashInquiry = CsDraftInquiry;
export interface CsDashReview {
  reviewId?: string;
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
const isUnanswered = (s?: string): boolean => !!s && /unanswered|pending|open|미답변|needs_human/i.test(s);
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

// 우선순위 점수: 긴급+미답변(0) < 미답변(1) < 긴급(2) < 그 외(3)
const priorityScore = (status?: string, urgency?: string): number => {
  const un = isUnanswered(status);
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
  orderNo?: string;
  goodsNo?: string;
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

// 답변완료 문의는 미처리에서 제외("answered" 단어경계 — "unanswered" 오탐 방지).
const isAnsweredInquiry = (s?: string): boolean => /^answered$/i.test((s || '').trim()) || /답변\s*완료|처리\s*완료|resolved|closed|done/i.test(s || '');
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

  const unresolvedQ = (params.inquiries || []).filter((q) => (q.inquiryId || q.createdAt) && !isAnsweredInquiry(q.status));
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
      ...(q.orderNo ? { orderNo: q.orderNo } : {}),
      ...(q.goodsNo ? { goodsNo: q.goodsNo } : {}),
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
