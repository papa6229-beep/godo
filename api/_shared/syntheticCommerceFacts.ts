// Synthetic Commerce Universe — Analytics facts helper (PII 미포함)
//
// 원칙: 숫자는 helper가 계산한다(AI가 만들지 않는다). 고객명/전화/주소 등 PII는 절대 포함하지 않는다.
//   분석은 가명 memberKey 기준. 카테고리/브랜드 라벨은 catalogLookup이 있으면 해석, 없으면 코드.

import type { StandardProduct } from './godomallMapper.js';
import type { GodomallCatalogLookup } from './godomallCatalogBinding.js';
import { buildBrandByProductId, deriveRevenueCatalogBreakdown } from './godomallCatalogBinding.js';
import type { SyntheticCommerceUniverse } from './syntheticCommerceUniverse.js';

export type DistItem = { key: string; count: number; pct: number };
export type RatingItem = { code: string; label?: string; avgRating: number; reviewCount: number };

export type SyntheticCommerceFacts = {
  // 고객/매출
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  repurchaseRate: number; // 재구매(2회+) 고객 비율 0..1
  averageOrderValue: number; // 전체 객단가(미결제 제외 매출/주문)
  vipCandidateCount: number;
  discountSensitiveCount: number;
  highRefundRiskCount: number;
  // 분포
  paymentMethodDistribution: DistItem[];
  orderChannelDistribution: DistItem[];
  // 클레임율 (전체 주문 대비)
  cancelRate: number;
  refundRate: number;
  returnRate: number;
  exchangeRate: number;
  // 카테고리/브랜드 매출
  categoryRevenue: { code: string; label: string; resolved: boolean; revenue: number; orderCount: number }[];
  brandRevenue: { code: string; label: string; resolved: boolean; revenue: number; orderCount: number }[];
  // 리뷰 평점
  categoryReviewRating: RatingItem[];
  brandReviewRating: RatingItem[];
  averageReviewRating: number;
  // CS
  csTopTopics: DistItem[];
  csUnansweredCount: number;
  csNeedsHumanCount: number;
  // 위험/유망 상품(가명 코드 기준)
  refundRiskProducts: { goodsNo: string; refundClaims: number }[];
  repurchaseCandidateProducts: { goodsNo: string; repeatBuyers: number }[];
};

const distOf = (counts: Map<string, number>, total: number): DistItem[] =>
  [...counts.entries()].map(([key, count]) => ({ key, count, pct: total ? +(count / total).toFixed(4) : 0 })).sort((a, b) => b.count - a.count);

export function buildSyntheticCommerceFacts(
  universe: SyntheticCommerceUniverse,
  products: StandardProduct[] = [],
  catalogLookup: GodomallCatalogLookup = { categoriesByCode: {}, brandsByCode: {} }
): SyntheticCommerceFacts {
  const { customers, orders, reviews, inquiries } = universe;

  // 고객
  const totalCustomers = customers.length;
  const newCustomers = customers.filter((c) => c.orderCount <= 1).length;
  const returningCustomers = customers.filter((c) => c.orderCount >= 2).length;
  const repurchaseRate = totalCustomers ? +(returningCustomers / totalCustomers).toFixed(4) : 0;
  const vipCandidateCount = customers.filter((c) => c.segment === 'vip_candidate').length;
  const discountSensitiveCount = customers.filter((c) => c.segment === 'discount_sensitive').length;
  const highRefundRiskCount = customers.filter((c) => c.segment === 'high_refund_risk').length;

  // 매출/객단가 (미결제 제외)
  const paidOrders = orders.filter((o) => o.state.paid);
  const paidTotal = paidOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const averageOrderValue = paidOrders.length ? Math.round(paidTotal / paidOrders.length) : 0;

  // 분포 (결제수단/채널)
  const payCounts = new Map<string, number>();
  const chCounts = new Map<string, number>();
  for (const o of orders) {
    if (o.paymentMethodCode || o.settleKind) payCounts.set(o.paymentMethodCode || o.settleKind!, (payCounts.get(o.paymentMethodCode || o.settleKind!) || 0) + 1);
    if (o.orderChannel) chCounts.set(o.orderChannel, (chCounts.get(o.orderChannel) || 0) + 1);
  }

  // 클레임율
  const total = orders.length || 1;
  const claimCount = (t: string) => orders.filter((o) => o.claimSummary?.claimTypes?.includes(t as never)).length;
  const cancelRate = +(claimCount('cancel') / total).toFixed(4);
  const refundRate = +(claimCount('refund') / total).toFixed(4);
  const returnRate = +(claimCount('return') / total).toFixed(4);
  const exchangeRate = +(claimCount('exchange') / total).toFixed(4);

  // 카테고리/브랜드 매출
  const brandByPid = buildBrandByProductId(products);
  const breakdown = deriveRevenueCatalogBreakdown(orders, catalogLookup, brandByPid);
  const categoryRevenue = breakdown.byCategory.map((x) => ({ code: x.code, label: x.label, resolved: x.resolved, revenue: x.revenue, orderCount: x.orderCount }));
  const brandRevenue = breakdown.byBrand.map((x) => ({ code: x.code, label: x.label, resolved: x.resolved, revenue: x.revenue, orderCount: x.orderCount }));

  // 리뷰 평점
  const ratingAgg = (keyOf: (r: (typeof reviews)[number]) => string | undefined, labels: Record<string, { nm?: string }>): RatingItem[] => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const r of reviews) {
      const k = keyOf(r);
      if (!k) continue;
      const cur = m.get(k) || { sum: 0, n: 0 };
      cur.sum += r.rating;
      cur.n += 1;
      m.set(k, cur);
    }
    return [...m.entries()].map(([code, v]) => ({ code, label: labels[code]?.nm, avgRating: +(v.sum / v.n).toFixed(2), reviewCount: v.n })).sort((a, b) => b.reviewCount - a.reviewCount);
  };
  const catLabels: Record<string, { nm?: string }> = {};
  for (const [code, c] of Object.entries(catalogLookup.categoriesByCode)) catLabels[code] = { nm: c.cateNm };
  const brandLabels: Record<string, { nm?: string }> = {};
  for (const [code, b] of Object.entries(catalogLookup.brandsByCode)) brandLabels[code] = { nm: b.brandNm };
  const categoryReviewRating = ratingAgg((r) => r.categoryCode, catLabels);
  const brandReviewRating = ratingAgg((r) => r.brandCode, brandLabels);
  const averageReviewRating = reviews.length ? +(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2) : 0;

  // CS
  const inqCounts = new Map<string, number>();
  for (const q of inquiries) inqCounts.set(q.topic, (inqCounts.get(q.topic) || 0) + 1);
  const csUnansweredCount = inquiries.filter((q) => q.status === 'unanswered').length;
  const csNeedsHumanCount = inquiries.filter((q) => q.status === 'needs_human').length;

  // 위험/유망 상품
  const refundByGoods = new Map<string, number>();
  for (const o of orders) {
    if (!o.claimSummary?.claimTypes?.some((t) => t === 'refund' || t === 'return')) continue;
    for (const l of o.lines) refundByGoods.set(l.goodsNo, (refundByGoods.get(l.goodsNo) || 0) + 1);
  }
  // 재구매 유망: 동일 상품을 산 고유 구매자 수 기준 상위
  const buyersByGoods = new Map<string, Set<string>>();
  for (const o of orders) {
    if (!o.memberKey) continue;
    for (const l of o.lines) {
      const set = buyersByGoods.get(l.goodsNo) || new Set<string>();
      set.add(o.memberKey);
      buyersByGoods.set(l.goodsNo, set);
    }
  }

  return {
    totalCustomers,
    newCustomers,
    returningCustomers,
    repurchaseRate,
    averageOrderValue,
    vipCandidateCount,
    discountSensitiveCount,
    highRefundRiskCount,
    paymentMethodDistribution: distOf(payCounts, orders.length),
    orderChannelDistribution: distOf(chCounts, orders.length),
    cancelRate,
    refundRate,
    returnRate,
    exchangeRate,
    categoryRevenue,
    brandRevenue,
    categoryReviewRating,
    brandReviewRating,
    averageReviewRating,
    csTopTopics: distOf(inqCounts, inquiries.length),
    csUnansweredCount,
    csNeedsHumanCount,
    refundRiskProducts: [...refundByGoods.entries()].map(([goodsNo, refundClaims]) => ({ goodsNo, refundClaims })).sort((a, b) => b.refundClaims - a.refundClaims).slice(0, 10),
    repurchaseCandidateProducts: [...buyersByGoods.entries()].map(([goodsNo, set]) => ({ goodsNo, repeatBuyers: set.size })).sort((a, b) => b.repeatBuyers - a.repeatBuyers).slice(0, 10)
  };
}
