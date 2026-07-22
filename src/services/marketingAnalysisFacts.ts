// Marketing Analysis Facts Core v0 — 마케팅 분석팀 공통 facts builder (순수 함수, deterministic).
//
// 목적: Spec-Based Synthetic Enrichment v0로 보강된 주문 데이터(회원그룹/쿠폰·할인/마일리지·예치금)를
//   이용해, "코드가 숫자를 계산하고 AI는 그 안에서만 설명"하는 마케팅 분석 facts를 생성한다.
//   UI/채팅 연결 없음. 이번 v0는 facts service + smoke + 문서만.
//
// 핵심 원칙:
//   - deterministic 계산(Math.random 미사용, 외부/네트워크/시간 의존 최소화).
//   - PII(name/phone/email/address 등) 미포함. 식별은 가명 memberKey/customerId/segment/memberGroupName만.
//   - 가입→구매 전환율 / 방문→주문 / 상품조회→구매 / 장바구니 / ROAS / CTR / GA4 / SNS는 계산 금지 →
//     requiredData notice로만 남긴다(추측 생성 금지).
//   - 인과관계 단정 금지. "쿠폰 때문에 매출이 올랐다"(X) → "쿠폰 사용 주문의 객단가가 높게 나타났다"(O).
//   - 매출 집계 대상(유효 주문) 판정은 revenueMetricContract.isValidOrder로 단일화(부서 공통 기준).

import { isValidOrder } from './revenueMetricContract';
import { classifyFirstPurchase, FIRST_PURCHASE_LABEL } from './firstPurchaseContract';

// ── 기간/축/필수데이터 타입 ───────────────────────────────────────────────────
export type MarketingAnalysisPeriodPreset =
  | 'all'
  | 'today'
  | 'last7d'
  | 'last30d'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom';

export type MarketingAnalysisPeriod = {
  preset: MarketingAnalysisPeriodPreset;
  startDate?: string;
  endDate?: string;
};

export type MarketingAnalysisDimension =
  | 'overall'
  | 'product'
  | 'category'
  | 'brand'
  | 'memberGroup'
  | 'orderChannel'
  | 'coupon'
  | 'reward';

export type MarketingRequiredData =
  | 'memberSignupDate'
  | 'visitorSessions'
  | 'productViewEvents'
  | 'cartEvents'
  | 'ga4'
  | 'adSpend'
  | 'adClicks'
  | 'adImpressions'
  | 'snsMetrics';

// ── 결과 보조 타입 ────────────────────────────────────────────────────────────
export type MarketingDimensionMetric = {
  key: string;
  label: string;
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  sharePercent: number;
};

export type MarketingProductMetric = MarketingDimensionMetric & {
  productName?: string;
  goodsNo?: string | number;
  categoryName?: string;
  brandName?: string;
  quantity?: number;
};

export type MarketingInsight = {
  id: string;
  title: string;
  severity: 'info' | 'positive' | 'warning';
  summary: string;
  evidenceIds: string[];
  recommendedNextAction?: string;
};

export type MarketingRequiredDataNotice = {
  key: MarketingRequiredData;
  label: string;
  reason: string;
  unlocks: string[];
};

export type MarketingEvidence = {
  id: string;
  label: string;
  value: string | number;
  source: 'orders' | 'orderLines' | 'products' | 'synthetic_enrichment' | 'derived';
};

export type MarketingAnalysisFacts = {
  period: MarketingAnalysisPeriod;
  generatedAt: string;

  summary: {
    totalRevenue: number;
    orderCount: number;
    averageOrderValue: number;

    firstPurchaseOrderCount: number;
    firstPurchaseRevenue: number;
    firstPurchaseAverageOrderValue: number;

    repeatPurchaseOrderCount: number;
    repeatPurchaseRevenue: number;
    repeatPurchaseAverageOrderValue: number;
    unknownFirstPurchaseOrderCount: number;
    unknownFirstPurchaseRevenue: number;
    unknownFirstPurchaseAverageOrderValue: number;

    couponOrderCount: number;
    couponRevenue: number;
    couponAverageOrderValue: number;
    nonCouponAverageOrderValue: number;
    totalDiscountAmount: number;
    totalCouponDiscountAmount: number;

    mileageOrderCount: number;
    depositOrderCount: number;
    totalRewardUseAmount: number;
  };

  byMemberGroup: MarketingDimensionMetric[];
  byOrderChannel: MarketingDimensionMetric[];
  byCouponUsage: MarketingDimensionMetric[];
  byRewardUsage: MarketingDimensionMetric[];
  topProducts: MarketingProductMetric[];
  topCategories: MarketingDimensionMetric[];
  topBrands: MarketingDimensionMetric[];

  insights: MarketingInsight[];
  requiredData: MarketingRequiredDataNotice[];
  evidence: MarketingEvidence[];

  piiCheck: {
    containsPii: boolean;
    checkedKeys: string[];
  };
};

// ── PII 정책 (이 facts에 절대 포함하면 안 되는 키) ────────────────────────────
// marketingDataCoverageAudit.ts와 동일 정책(가명/집계만 허용). 단일 파일 self-check를 위해 로컬 정의.
export const MARKETING_ANALYSIS_FORBIDDEN_PII_KEYS = [
  'name',
  'customerName',
  'phone',
  'mobile',
  'email',
  'address',
  'receiverName',
  'receiverPhone',
  'receiverAddress',
  'deliveryMemo',
  'refundAccount'
] as const;

export const MARKETING_ANALYSIS_ALLOWED_IDENTITY_KEYS = [
  'memberKey',
  'customerId',
  'segment',
  'memberGroupName',
  'memberGroupCode'
] as const;

const FORBIDDEN = new Set<string>(MARKETING_ANALYSIS_FORBIDDEN_PII_KEYS);

// facts(중첩 포함)에 금지 PII 키가 있으면 그 키 목록을 반환한다(없으면 []).
export function assertMarketingFactsNoPii(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || depth > 6) return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN.has(k)) found.add(k);
      visit(val, depth + 1);
    }
  };
  visit(value, 0);
  return [...found];
}

// ── 좁은 내부 adapter (RevenueOrder 구조의 필요한 필드만) ─────────────────────
type OrderLineLike = {
  goodsNo?: unknown;
  goodsName?: unknown;
  categoryCode?: unknown;
  categoryLabel?: unknown;
  lineRevenue?: unknown;
  quantity?: unknown;
};
type OrderLike = {
  orderNo?: unknown;
  orderDate?: unknown;
  totalAmount?: unknown;
  productRevenueByLines?: unknown;
  isFirstPurchase?: unknown;
  memberKey?: unknown;
  memberGroupName?: unknown;
  memberGroupCode?: unknown;
  orderChannel?: unknown;
  orderChannelLabel?: unknown;
  settleKind?: unknown;
  discountSummary?: { hasCoupon?: unknown; totalCouponDiscountAmount?: unknown; totalDiscountAmount?: unknown };
  discountAmount?: unknown;
  useMileageAmount?: unknown;
  useDepositAmount?: unknown;
  rewardUseAmount?: unknown;
  state?: { paid?: unknown; canceled?: unknown };
  // RevenueOrderLite(프론트)는 state를 평탄화해 paid/canceled를 최상위로 둔다 — 둘 다 수용.
  paid?: unknown;
  canceled?: unknown;
  lines?: OrderLineLike[];
};
type ProductLike = { productId?: unknown; productCode?: unknown; productName?: unknown; categoryCode?: unknown; brandCode?: unknown };

// ── 좌표 유틸 ─────────────────────────────────────────────────────────────────
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 'y' || v === 1;
const parseMs = (s: unknown): number => {
  const t = Date.parse(str(s).replace(' ', 'T'));
  return Number.isNaN(t) ? NaN : t;
};
export function calculateAverageOrderValue(revenue: number, orderCount: number): number {
  return orderCount > 0 ? Math.round(revenue / orderCount) : 0;
}

const CHANNEL_LABEL: Record<string, string> = { shop: '자사몰', naverpay: '네이버페이', payco: '페이코' };

// ── 기간 필터 ─────────────────────────────────────────────────────────────────
function resolvePeriodRange(period: MarketingAnalysisPeriod, nowMs: number): { startMs: number; endMs: number } {
  const NEG = -8.64e15;
  const POS = 8.64e15;
  if (period.preset === 'all') return { startMs: NEG, endMs: POS };
  if (period.preset === 'custom') {
    const s = period.startDate ? parseMs(period.startDate) : NaN;
    const e = period.endDate ? parseMs(`${period.endDate} 23:59:59`) : NaN;
    return { startMs: Number.isNaN(s) ? NEG : s, endMs: Number.isNaN(e) ? POS : e };
  }
  const now = new Date(nowMs);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const startOfDay = new Date(y, m, d).getTime();
  if (period.preset === 'today') return { startMs: startOfDay, endMs: nowMs };
  if (period.preset === 'last7d') return { startMs: nowMs - 7 * 86400000, endMs: nowMs };
  if (period.preset === 'last30d') return { startMs: nowMs - 30 * 86400000, endMs: nowMs };
  if (period.preset === 'thisMonth') return { startMs: new Date(y, m, 1).getTime(), endMs: nowMs };
  if (period.preset === 'lastMonth') return { startMs: new Date(y, m - 1, 1).getTime(), endMs: new Date(y, m, 1).getTime() - 1 };
  if (period.preset === 'thisYear') return { startMs: new Date(y, 0, 1).getTime(), endMs: nowMs };
  return { startMs: NEG, endMs: POS };
}

export function filterMarketingOrdersByPeriod<T extends { orderDate?: unknown }>(
  orders: T[],
  period: MarketingAnalysisPeriod,
  nowMs: number = Date.now()
): T[] {
  const { startMs, endMs } = resolvePeriodRange(period, nowMs);
  if (startMs <= -8.64e15 && endMs >= 8.64e15) return [...orders];
  return orders.filter((o) => {
    const t = parseMs(o.orderDate);
    return !Number.isNaN(t) && t >= startMs && t <= endMs;
  });
}

// 매출 집계 대상 주문: 결제완료 & 미취소 (미결제/취소는 매출 미포함).
// revenueMetricContract.isValidOrder로 단일화 — 동일 로직(중첩 state / 평탄 paid·canceled / 금액 폴백).
const isCounted = (o: OrderLike): boolean => isValidOrder(o);
const hasCoupon = (o: OrderLike): boolean => bool(o.discountSummary?.hasCoupon);
const usesMileage = (o: OrderLike): boolean => num(o.useMileageAmount) > 0;
const usesDeposit = (o: OrderLike): boolean => num(o.useDepositAmount) > 0;

// ── 차원 집계 (totalAmount 기준, share는 totalRevenue 대비) ─────────────────────
function buildDimension(
  orders: OrderLike[],
  keyOf: (o: OrderLike) => { key: string; label: string } | undefined,
  totalRevenue: number
): MarketingDimensionMetric[] {
  const agg = new Map<string, { label: string; revenue: number; orderCount: number }>();
  for (const o of orders) {
    const k = keyOf(o);
    if (!k) continue;
    const cur = agg.get(k.key) || { label: k.label, revenue: 0, orderCount: 0 };
    cur.revenue += num(o.totalAmount);
    cur.orderCount += 1;
    agg.set(k.key, cur);
  }
  return [...agg.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      revenue: v.revenue,
      orderCount: v.orderCount,
      averageOrderValue: calculateAverageOrderValue(v.revenue, v.orderCount),
      sharePercent: totalRevenue > 0 ? +((v.revenue / totalRevenue) * 100).toFixed(1) : 0
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ── requiredData notices (이번 v0에서 계산 금지 — 추측 생성 금지) ───────────────
export function buildMarketingRequiredDataNotices(): MarketingRequiredDataNotice[] {
  return [
    { key: 'memberSignupDate', label: '회원 가입일', reason: '가입일 부재 — Order 스펙 밖(회원 도메인). 첫구매 분석으로 대체.', unlocks: ['가입→구매 전환율', '가입 코호트'] },
    { key: 'visitorSessions', label: '방문자/세션', reason: '고도몰 밖 행동 데이터 필요.', unlocks: ['방문→주문 전환율'] },
    { key: 'productViewEvents', label: '상품 조회 이벤트', reason: '고도몰 밖 행동 로그 필요.', unlocks: ['상품조회→구매 전환율'] },
    { key: 'cartEvents', label: '장바구니 이벤트', reason: '고도몰 밖 행동 로그 필요.', unlocks: ['장바구니 이탈률'] },
    { key: 'ga4', label: 'GA4 행동/유입', reason: '외부 analytics 연동 필요.', unlocks: ['유입 경로/세션/이탈 분석'] },
    { key: 'adSpend', label: '광고비/캠페인 귀속', reason: '광고 매체 데이터 + 캠페인 attribution 필요.', unlocks: ['ROAS', 'CPA'] },
    { key: 'adClicks', label: '광고 클릭수', reason: '광고 매체 API 필요.', unlocks: ['광고 CTR'] },
    { key: 'adImpressions', label: '광고 노출수', reason: '광고 매체 API 필요.', unlocks: ['광고 CTR'] },
    { key: 'snsMetrics', label: 'SNS 성과', reason: '외부 SNS/콘텐츠 지표 필요.', unlocks: ['SNS/블로그/유튜브/틱톡 성과'] }
  ];
}

// ── 메인 빌더 ─────────────────────────────────────────────────────────────────
export function buildMarketingAnalysisFacts(input: {
  orders: unknown[];
  products?: unknown[];
  reviews?: unknown[];
  inquiries?: unknown[];
  period?: MarketingAnalysisPeriod;
  nowMs?: number;
  generatedAt?: string;
}): MarketingAnalysisFacts {
  const period: MarketingAnalysisPeriod = input.period ?? { preset: 'all' };
  const nowMs = input.nowMs ?? Date.now();
  const generatedAt = input.generatedAt ?? new Date(nowMs).toISOString();

  const allOrders = (input.orders || []) as OrderLike[];
  const periodOrders = filterMarketingOrdersByPeriod(allOrders, period, nowMs);
  const counted = periodOrders.filter(isCounted);

  // 상품 메타 인덱스 (goodsNo → brand/category/name)
  const products = (input.products || []) as ProductLike[];
  const prodById = new Map<string, ProductLike>();
  for (const p of products) {
    const id = str(p.productId);
    if (id) prodById.set(id, p);
  }
  const brandMetaAvailable = products.some((p) => str(p.brandCode));

  // ── summary ──
  const totalRevenue = counted.reduce((s, o) => s + num(o.totalAmount), 0);
  const orderCount = counted.length;

  // C-8: 3상태. unknown은 first/repeat 어느 쪽에도 넣지 않고 별도로 센다.
  //   전체(orderCount/totalRevenue)에는 계속 포함되므로 first+repeat+unknown = 전체다.
  const firstOrders = counted.filter((o) => classifyFirstPurchase(o.isFirstPurchase) === 'first');
  const repeatOrders = counted.filter((o) => classifyFirstPurchase(o.isFirstPurchase) === 'repeat');
  const unknownFirstPurchaseOrders = counted.filter((o) => classifyFirstPurchase(o.isFirstPurchase) === 'unknown');
  const firstRevenue = firstOrders.reduce((s, o) => s + num(o.totalAmount), 0);
  const repeatRevenue = repeatOrders.reduce((s, o) => s + num(o.totalAmount), 0);
  const unknownFirstPurchaseRevenue = unknownFirstPurchaseOrders.reduce((s, o) => s + num(o.totalAmount), 0);

  const couponOrders = counted.filter(hasCoupon);
  const nonCouponOrders = counted.filter((o) => !hasCoupon(o));
  const couponRevenue = couponOrders.reduce((s, o) => s + num(o.totalAmount), 0);
  const nonCouponRevenue = nonCouponOrders.reduce((s, o) => s + num(o.totalAmount), 0);
  const totalDiscountAmount = counted.reduce((s, o) => s + (num(o.discountAmount) || num(o.discountSummary?.totalDiscountAmount)), 0);
  const totalCouponDiscountAmount = counted.reduce((s, o) => s + num(o.discountSummary?.totalCouponDiscountAmount), 0);

  const mileageOrders = counted.filter(usesMileage);
  const depositOrders = counted.filter(usesDeposit);
  const totalRewardUseAmount = counted.reduce(
    (s, o) => s + (num(o.rewardUseAmount) || num(o.useMileageAmount) + num(o.useDepositAmount)),
    0
  );

  const summary = {
    totalRevenue,
    orderCount,
    averageOrderValue: calculateAverageOrderValue(totalRevenue, orderCount),
    firstPurchaseOrderCount: firstOrders.length,
    firstPurchaseRevenue: firstRevenue,
    firstPurchaseAverageOrderValue: calculateAverageOrderValue(firstRevenue, firstOrders.length),
    repeatPurchaseOrderCount: repeatOrders.length,
    repeatPurchaseRevenue: repeatRevenue,
    repeatPurchaseAverageOrderValue: calculateAverageOrderValue(repeatRevenue, repeatOrders.length),
    // C-8: 미분류(첫구매 여부 불명). first+repeat+unknown = orderCount/totalRevenue.
    unknownFirstPurchaseOrderCount: unknownFirstPurchaseOrders.length,
    unknownFirstPurchaseRevenue,
    unknownFirstPurchaseAverageOrderValue: calculateAverageOrderValue(unknownFirstPurchaseRevenue, unknownFirstPurchaseOrders.length),
    couponOrderCount: couponOrders.length,
    couponRevenue,
    couponAverageOrderValue: calculateAverageOrderValue(couponRevenue, couponOrders.length),
    nonCouponAverageOrderValue: calculateAverageOrderValue(nonCouponRevenue, nonCouponOrders.length),
    totalDiscountAmount,
    totalCouponDiscountAmount,
    mileageOrderCount: mileageOrders.length,
    depositOrderCount: depositOrders.length,
    totalRewardUseAmount
  };

  // ── 차원 ──
  const byMemberGroup = buildDimension(
    counted,
    (o) => {
      const label = str(o.memberGroupName) || str(o.memberGroupCode) || '미분류';
      return { key: str(o.memberGroupCode) || label, label };
    },
    totalRevenue
  );
  const byOrderChannel = buildDimension(
    counted,
    (o) => {
      const code = str(o.orderChannel);
      if (!code) return { key: 'unknown', label: '미상' };
      return { key: code, label: CHANNEL_LABEL[code] || code };
    },
    totalRevenue
  );
  const byCouponUsage = buildDimension(
    counted,
    (o) => (hasCoupon(o) ? { key: 'coupon', label: '쿠폰 사용' } : { key: 'non_coupon', label: '쿠폰 미사용' }),
    totalRevenue
  );
  const byRewardUsage = buildDimension(
    counted,
    (o) => (usesMileage(o) || usesDeposit(o) ? { key: 'reward', label: '리워드 사용' } : { key: 'non_reward', label: '리워드 미사용' }),
    totalRevenue
  );

  // ── 상품/카테고리/브랜드 (라인 기준, share는 totalLineRevenue 대비) ──
  type LineAgg = { label: string; revenue: number; orders: Set<string>; quantity: number; meta?: ProductLike };
  const prodAgg = new Map<string, LineAgg>();
  const catAgg = new Map<string, LineAgg>();
  const brandAgg = new Map<string, LineAgg>();
  let totalLineRevenue = 0;
  for (const o of counted) {
    const oNo = str(o.orderNo);
    for (const l of o.lines || []) {
      const rev = num(l.lineRevenue);
      totalLineRevenue += rev;
      const gNo = str(l.goodsNo);
      const meta = gNo ? prodById.get(gNo) : undefined;
      // 상품
      if (gNo) {
        const cur = prodAgg.get(gNo) || { label: str(l.goodsName) || gNo, revenue: 0, orders: new Set<string>(), quantity: 0, meta };
        cur.revenue += rev;
        cur.quantity += num(l.quantity);
        if (oNo) cur.orders.add(oNo);
        prodAgg.set(gNo, cur);
      }
      // 카테고리
      const catCode = str(l.categoryCode) || str(meta?.categoryCode) || 'uncategorized';
      // C-1: 내부 key는 'uncategorized'로 통일하되, 화면 label만 '미분류'로 노출한다(내부 키 노출 금지).
      //   어댑터(departmentDataService)가 categoryLabel도 'uncategorized'로 정규화하므로
      //   'label이 비었을 때만' 규칙으로는 부족하다 — key가 'uncategorized'이면 label 값과
      //   무관하게 '미분류'로 확정한다(key 우선). 실제 코드값의 폴백은 범위 밖이라 그대로 둔다.
      const catLabel =
        catCode === 'uncategorized'
          ? '미분류'
          : str(l.categoryLabel) || catCode;
      const c = catAgg.get(catCode) || { label: catLabel, revenue: 0, orders: new Set<string>(), quantity: 0 };
      c.revenue += rev;
      if (oNo) c.orders.add(oNo);
      catAgg.set(catCode, c);
      // 브랜드 (products 메타 필요)
      const brandCode = str(meta?.brandCode);
      if (brandCode) {
        const b = brandAgg.get(brandCode) || { label: brandCode, revenue: 0, orders: new Set<string>(), quantity: 0 };
        b.revenue += rev;
        if (oNo) b.orders.add(oNo);
        brandAgg.set(brandCode, b);
      }
    }
  }
  const lineShare = (rev: number): number => (totalLineRevenue > 0 ? +((rev / totalLineRevenue) * 100).toFixed(1) : 0);
  const topProducts: MarketingProductMetric[] = [...prodAgg.entries()]
    .map(([gNo, v]) => ({
      key: gNo,
      label: v.label,
      goodsNo: gNo,
      productName: v.label,
      categoryName: str(v.meta?.categoryCode) || undefined,
      brandName: str(v.meta?.brandCode) || undefined,
      revenue: v.revenue,
      orderCount: v.orders.size,
      quantity: v.quantity,
      averageOrderValue: calculateAverageOrderValue(v.revenue, v.orders.size),
      sharePercent: lineShare(v.revenue)
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  const dimFromLineAgg = (m: Map<string, LineAgg>): MarketingDimensionMetric[] =>
    [...m.entries()]
      .map(([key, v]) => ({
        key,
        label: v.label,
        revenue: v.revenue,
        orderCount: v.orders.size,
        averageOrderValue: calculateAverageOrderValue(v.revenue, v.orders.size),
        sharePercent: lineShare(v.revenue)
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  const topCategories = dimFromLineAgg(catAgg);
  const topBrands = dimFromLineAgg(brandAgg);

  // ── evidence ──
  const evidence: MarketingEvidence[] = [
    { id: 'ev_total_revenue', label: '총매출(결제완료·미취소)', value: totalRevenue, source: 'orders' },
    { id: 'ev_order_count', label: '분석 주문수', value: orderCount, source: 'orders' },
    { id: 'ev_aov', label: '전체 객단가', value: summary.averageOrderValue, source: 'derived' },
    { id: 'ev_first_aov', label: '첫구매 객단가', value: summary.firstPurchaseAverageOrderValue, source: 'derived' },
    { id: 'ev_repeat_aov', label: '재구매 객단가', value: summary.repeatPurchaseAverageOrderValue, source: 'derived' },
    { id: 'ev_repeat_share', label: '재구매 매출 비중(%)', value: totalRevenue > 0 ? +((repeatRevenue / totalRevenue) * 100).toFixed(1) : 0, source: 'derived' },
    { id: 'ev_coupon_aov', label: '쿠폰 사용 객단가', value: summary.couponAverageOrderValue, source: 'synthetic_enrichment' },
    { id: 'ev_noncoupon_aov', label: '쿠폰 미사용 객단가', value: summary.nonCouponAverageOrderValue, source: 'synthetic_enrichment' },
    { id: 'ev_coupon_discount', label: '쿠폰 할인 총액', value: totalCouponDiscountAmount, source: 'synthetic_enrichment' },
    { id: 'ev_reward_use', label: '총 리워드 사용액', value: totalRewardUseAmount, source: 'synthetic_enrichment' },
    { id: 'ev_top_member_group', label: '최대 매출 회원그룹', value: byMemberGroup[0] ? `${byMemberGroup[0].label} (${byMemberGroup[0].sharePercent}%)` : '-', source: 'synthetic_enrichment' },
    { id: 'ev_top_channel', label: '최대 매출 채널', value: byOrderChannel[0] ? `${byOrderChannel[0].label} (${byOrderChannel[0].sharePercent}%)` : '-', source: 'orders' },
    { id: 'ev_top_category', label: '최대 매출 카테고리', value: topCategories[0] ? `${topCategories[0].label} (${topCategories[0].sharePercent}%)` : '-', source: 'orderLines' },
    { id: 'ev_brand_meta', label: '브랜드 메타데이터', value: brandMetaAvailable ? 'brandCode 보유(브랜드명 미연동)' : '상품 메타데이터 부족(브랜드 미연동)', source: 'products' }
  ];

  // ── insights (deterministic rule, 인과 단정 금지, ≥5) ──
  const insights = buildInsights({ summary, byMemberGroup, byOrderChannel, topCategories, repeatRevenue, totalRevenue });

  // ── piiCheck ──
  const draft: Omit<MarketingAnalysisFacts, 'piiCheck'> = {
    period,
    generatedAt,
    summary,
    byMemberGroup,
    byOrderChannel,
    byCouponUsage,
    byRewardUsage,
    topProducts,
    topCategories,
    topBrands,
    insights,
    requiredData: buildMarketingRequiredDataNotices(),
    evidence
  };
  const leaked = assertMarketingFactsNoPii(draft);

  return {
    ...draft,
    piiCheck: { containsPii: leaked.length > 0, checkedKeys: [...MARKETING_ANALYSIS_FORBIDDEN_PII_KEYS] }
  };
}

// ── insights 규칙 (관찰 표현만, 인과 단정 금지) ──────────────────────────────────
function buildInsights(ctx: {
  summary: MarketingAnalysisFacts['summary'];
  byMemberGroup: MarketingDimensionMetric[];
  byOrderChannel: MarketingDimensionMetric[];
  topCategories: MarketingDimensionMetric[];
  repeatRevenue: number;
  totalRevenue: number;
}): MarketingInsight[] {
  const out: MarketingInsight[] = [];
  const { summary, byMemberGroup, byOrderChannel, topCategories, repeatRevenue, totalRevenue } = ctx;
  // C-8: 미분류가 있으면 데이터 완전성 관찰을 남긴다(0건이면 붙이지 않는다).
  //   첫구매+재구매가 전체보다 작은 이유를 값으로 설명한다.
  if (summary.unknownFirstPurchaseOrderCount > 0) {
    const share = totalRevenue ? Math.round((summary.unknownFirstPurchaseRevenue / totalRevenue) * 1000) / 10 : 0;
    out.push({
      id: 'first_purchase_unknown',
      title: `첫구매 여부 ${FIRST_PURCHASE_LABEL.unknown} ${summary.unknownFirstPurchaseOrderCount}건`,
      summary: `첫구매 여부가 없는 주문 ${summary.unknownFirstPurchaseOrderCount}건(${summary.unknownFirstPurchaseRevenue.toLocaleString('ko-KR')}원, 전체 매출의 ${share}%)은 전체 실적에는 포함되지만 첫구매·재구매 두 그룹에는 포함되지 않습니다. 두 값의 합이 전체와 다를 수 있습니다.`,
      severity: 'warning',
      evidenceIds: ['unknownFirstPurchaseOrderCount', 'unknownFirstPurchaseRevenue']
    });
  }

  // 1. 최대 매출 회원그룹
  if (byMemberGroup[0]) {
    out.push({
      id: 'ins_top_member_group',
      title: '매출 기여 1위 회원그룹',
      severity: 'info',
      summary: `${byMemberGroup[0].label} 그룹이 매출의 ${byMemberGroup[0].sharePercent}%로 가장 큰 비중을 차지하는 것으로 나타났습니다.`,
      evidenceIds: ['ev_top_member_group', 'ev_total_revenue'],
      recommendedNextAction: `${byMemberGroup[0].label} 대상 리텐션/타겟 캠페인 후보 검토`
    });
  }
  // 2. 쿠폰 사용 vs 미사용 객단가 (관찰만)
  if (summary.couponOrderCount > 0) {
    const higher = summary.couponAverageOrderValue >= summary.nonCouponAverageOrderValue;
    out.push({
      id: 'ins_coupon_aov',
      title: '쿠폰 사용 주문의 객단가 관찰',
      severity: 'info',
      summary: `쿠폰 사용 주문의 객단가(${summary.couponAverageOrderValue})가 미사용 주문(${summary.nonCouponAverageOrderValue})보다 ${higher ? '높게' : '낮게'} 나타났습니다. (인과관계 아님, 관찰값)`,
      evidenceIds: ['ev_coupon_aov', 'ev_noncoupon_aov']
    });
  }
  // 3. 재구매 매출 비중
  {
    const share = totalRevenue > 0 ? +((repeatRevenue / totalRevenue) * 100).toFixed(1) : 0;
    out.push({
      id: 'ins_repeat_share',
      title: '재구매 매출 비중',
      severity: share >= 50 ? 'positive' : 'info',
      summary: `재구매 주문이 전체 매출의 ${share}%로 나타났습니다.`,
      evidenceIds: ['ev_repeat_share', 'ev_repeat_aov'],
      recommendedNextAction: share < 30 ? '재구매 유도(리텐션) 캠페인 후보 검토' : undefined
    });
  }
  // 4. 주문채널 집중
  if (byOrderChannel[0]) {
    const concentrated = byOrderChannel[0].sharePercent >= 70;
    out.push({
      id: 'ins_channel_concentration',
      title: '주문채널 매출 집중도',
      severity: concentrated ? 'warning' : 'info',
      summary: `${byOrderChannel[0].label} 채널이 매출의 ${byOrderChannel[0].sharePercent}%를 차지하는 것으로 나타났습니다.${concentrated ? ' 단일 채널 의존도가 높습니다.' : ''}`,
      evidenceIds: ['ev_top_channel'],
      recommendedNextAction: concentrated ? '채널 다변화 검토' : undefined
    });
  }
  // 5. 리워드 사용 주문 기여
  {
    out.push({
      id: 'ins_reward_usage',
      title: '리워드(마일리지/예치금) 사용 관찰',
      severity: 'info',
      summary: `마일리지 사용 ${summary.mileageOrderCount}건 · 예치금 사용 ${summary.depositOrderCount}건, 총 리워드 사용액 ${summary.totalRewardUseAmount}로 나타났습니다.`,
      evidenceIds: ['ev_reward_use']
    });
  }
  // 6. 카테고리 쏠림
  if (topCategories[0]) {
    const concentrated = topCategories[0].sharePercent >= 50;
    out.push({
      id: 'ins_category_concentration',
      title: '카테고리 매출 쏠림',
      severity: concentrated ? 'warning' : 'info',
      summary: `${topCategories[0].label} 카테고리가 상품매출의 ${topCategories[0].sharePercent}%로 가장 큰 비중으로 나타났습니다.`,
      evidenceIds: ['ev_top_category'],
      recommendedNextAction: concentrated ? '카테고리 편중 점검 및 라인업 확장 검토' : undefined
    });
  }
  return out;
}
