// Commerce Universe Auxiliary Data — safe(분석용) 공급 + CS 전용 fake contact 격리.
//
// 목적: orders/revenue 외에 customers/reviews/inquiries를 PII 없이 공급한다(분석용).
//   CS 응대용 fake PII contact는 별도 채널(csOnlyFakeContacts)로만, synthetic mode에서만 공급한다.
//
// 원칙:
//   - safe customer/review/inquiry에는 이름/전화/주소/이메일/계좌/배송메모/문의본문(PII 위험)을 넣지 않는다.
//   - 가명 memberKey·segment·집계 수치만 분석용으로 통과.
//   - csOnlyFakeContacts는 commerce_universe_v1(synthetic)일 때만, includeCsFakeContacts 명시 시에만.
//   - 모든 contact는 origin(isFakePii/piiType/syntheticProfile) 표식을 유지한다.

import type {
  SyntheticCommerceUniverse, SyntheticCsContact
} from './syntheticCommerceUniverse.js';

// 분석용 safe customer (PII 없음, 가명 memberKey만)
export type SafeSyntheticCustomer = {
  memberKey: string;
  segment: string;
  firstOrderDate: string;
  lastOrderDate: string;
  orderCount: number;
  totalRevenue: number;
  totalPaidAmount: number; // analyticsQueryEngine 입력 호환(= totalRevenue)
  averageOrderValue: number;
  claimCount: number;
  reviewCount: number;
  inquiryCount: number;
};

// 분석용 safe review (contact PII 없음, excerpt는 PII-free 템플릿)
export type SafeSyntheticReview = {
  reviewId: string;
  orderNo: string;
  goodsNo: string;
  productId: string;
  categoryCode?: string;
  brandCode?: string;
  rating: number;
  sentiment: string;
  topic: string;
  createdAt: string;
  excerpt: string;
};

// 분석용 safe inquiry (연락처 없음)
export type SafeSyntheticInquiry = {
  inquiryId: string;
  orderNo?: string;
  goodsNo?: string;
  productId?: string;
  categoryCode?: string;
  brandCode?: string;
  topic: string;
  status: string;
  urgency: string;
  createdAt: string;
  title: string;
  excerpt: string;
};

// CS 전용 fake contact (fake PII, origin 표식 유지)
export type CommerceContactSafe = SyntheticCsContact;

export type UniverseAux = {
  customers: SafeSyntheticCustomer[];
  reviews: SafeSyntheticReview[];
  inquiries: SafeSyntheticInquiry[];
  csOnlyFakeContacts?: CommerceContactSafe[];
  meta: { syntheticProfile: 'commerce_universe_v1'; seed?: number; generatedAt?: string };
};

const REVIEW_TOPIC_KO: Record<string, string> = {
  quality: '품질', effect: '효과', delivery: '배송', price: '가격', packaging: '포장', repurchase: '재구매', refund: '환불'
};
const INQ_TITLE_KO: Record<string, string> = {
  delivery: '배송 문의', payment: '결제 문의', refund: '환불 문의', exchange: '교환 문의',
  product_question: '상품 문의', stock: '재입고 문의', coupon: '쿠폰 문의', account: '계정 문의'
};
const sentimentKo = (s: string): string => (s === 'positive' ? '만족' : s === 'negative' ? '불만' : '보통');

// PII 위험 토큰 제거(전화/이메일/계좌형 패턴). 템플릿 텍스트는 본래 PII-free지만 방어적으로 정리.
const sanitizeText = (t: string | undefined, max = 60): string => {
  if (!t) return '';
  const cleaned = t
    .replace(/01[016789]-?\d{3,4}-?\d{4}/g, '[연락처]')
    .replace(/[\w.+-]+@[\w.-]+/g, '[이메일]')
    .replace(/\d{2,}-\d{2,}-\d{2,}/g, '[번호]');
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
};

// universe → safe aux. includeCsFakeContacts일 때만 csOnlyFakeContacts 포함.
export function buildUniverseAux(
  universe: SyntheticCommerceUniverse,
  opts: { includeCsFakeContacts?: boolean; generatedAt?: string } = {}
): UniverseAux {
  // memberKey별 문의 수 집계
  const inqByMember = new Map<string, number>();
  for (const q of universe.inquiries) {
    if (!q.memberKey) continue;
    inqByMember.set(q.memberKey, (inqByMember.get(q.memberKey) || 0) + 1);
  }

  const customers: SafeSyntheticCustomer[] = universe.customers.map((c) => ({
    memberKey: c.memberKey,
    segment: c.segment,
    firstOrderDate: c.firstOrderDate,
    lastOrderDate: c.lastOrderDate,
    orderCount: c.orderCount,
    totalRevenue: c.totalPaidAmount,
    totalPaidAmount: c.totalPaidAmount,
    averageOrderValue: c.averageOrderValue,
    claimCount: c.refundCount,
    reviewCount: c.reviewCount,
    inquiryCount: inqByMember.get(c.memberKey) || 0
  }));

  const reviews: SafeSyntheticReview[] = universe.reviews.map((r) => ({
    reviewId: r.reviewId,
    orderNo: r.orderNo,
    goodsNo: r.goodsNo,
    productId: r.productId,
    categoryCode: r.categoryCode,
    brandCode: r.brandCode,
    rating: r.rating,
    sentiment: r.sentiment,
    topic: r.topic,
    createdAt: r.createdAt,
    excerpt: `${sentimentKo(r.sentiment)} · ${REVIEW_TOPIC_KO[r.topic] || r.topic} 관련 후기`
  }));

  const inquiries: SafeSyntheticInquiry[] = universe.inquiries.map((q) => ({
    inquiryId: q.inquiryId,
    orderNo: q.orderNo,
    goodsNo: q.goodsNo,
    productId: q.productId,
    categoryCode: q.categoryCode,
    brandCode: q.brandCode,
    topic: q.topic,
    status: q.status,
    urgency: q.urgency,
    createdAt: q.createdAt,
    title: INQ_TITLE_KO[q.topic] || '문의',
    excerpt: sanitizeText(q.inquiryText)
  }));

  const aux: UniverseAux = {
    customers,
    reviews,
    inquiries,
    meta: { syntheticProfile: 'commerce_universe_v1', seed: universe.meta.seed, generatedAt: opts.generatedAt }
  };
  // CS 전용 fake contact는 명시 요청 시에만(이미 synthetic universe 산출물이므로 fake 보장).
  if (opts.includeCsFakeContacts) aux.csOnlyFakeContacts = universe.contacts;
  return aux;
}
