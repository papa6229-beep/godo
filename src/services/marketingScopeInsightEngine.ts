// Marketing Scope Insight Engine v0 — 질문을 "분석 범위(scope)"로 해석하고, 그 범위 안에서
//   사용 가능한 모든 비PII 데이터를 스캔해 자동으로 insight pack을 만든다.
//
// 목적: "총합은 얼마입니다" 수준의 통계 조회에서 벗어나, 마케팅팀이 기간/상품/카테고리/고객/쿠폰/채널/
//   문의·리뷰 신호를 함께 보고 비교·관계·이상치·흐름을 설명하게 한다.
//
// 원칙(절대):
//   - 숫자는 전부 deterministic 코드로 계산(LLM/Math.random 미사용). 인과 단정 금지(때문에/덕분에/원인입니다).
//   - PII(name/phone/email/address/memberKey/orderNo) 및 raw order/review/inquiry row 미노출 — 집계값만.
//   - 외부(방문/광고/ROAS/GA4) 데이터는 requiredData로만 안내(추정/0 금지).

import type { MarketingChatChartArtifact, MarketingChartSpec, MarketingChartSeries, MarketingChartNarrative, MarketingChartType } from './marketingChatChartSpec';
import { parseMarketingChatQuery } from './marketingChatQueryRouting';
import { buildMarketingAnalysisResponse } from './marketingAnalysisExecutor';

// ── 타입 ──────────────────────────────────────────────────────────────────────
export type MarketingAnalysisScope = {
  dateRange?: { start: string; end: string; label: string };
  productScope?: { goodsNos?: string[]; productNames?: string[]; categoryNames?: string[]; brandNames?: string[] };
  customerScope?: { memberGroups?: string[]; firstRepeat?: 'first' | 'repeat' | 'all' };
  promotionScope?: { couponUsage?: 'used' | 'not_used' | 'all'; rewardUsage?: 'used' | 'not_used' | 'all' };
  channelScope?: { orderChannels?: string[] };
  csScope?: { includeInquiries?: boolean; includeReviews?: boolean; includeClaims?: boolean };
};

export type MarketingQuestionFocus = 'period' | 'year_compare' | 'category' | 'product' | 'coupon' | 'customer' | 'channel' | 'relationship' | 'summary';
export type MarketingQuestionInterpretation = {
  originalQuestion: string;
  focus: MarketingQuestionFocus;
  primaryDimension?: 'time' | 'category' | 'product' | 'brand' | 'memberGroup' | 'couponUsage' | 'orderChannel' | 'firstRepeat';
  primaryMetric: string;
  secondaryMetric?: string;
  timeBucket?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  yearCompare?: { years: number[] };
};

export type MarketingInsightChartSpec = {
  chartType: 'line' | 'bar' | 'groupedBar' | 'rankedBar' | 'dualMetricBar' | 'scatter' | 'table' | 'unsupported';
  title: string;
  subtitle?: string;
  xKey?: string;
  primaryMetric: string;
  secondaryMetric?: string;
  series: Array<{
    key: string;
    label: string;
    metric: string;
    unit?: 'currency' | 'count' | 'percent' | 'score';
    points: Array<{ key: string; label: string; value: number; secondaryValue?: number; orderCount?: number; metadata?: Record<string, string | number | boolean> }>;
  }>;
  evidence?: string[];
  requiredData?: string[];
};

export type MarketingInsightPack = {
  summary: { totalRevenue: number; orderCount: number; averageOrderValue: number; periodLabel: string };
  timeTrend?: {
    bucket: 'day' | 'week' | 'month' | 'quarter' | 'year';
    points: Array<{ bucketKey: string; label: string; revenue: number; orderCount: number; averageOrderValue: number; previousDelta?: number; previousDeltaRate?: number }>;
    highestRevenuePoint?: string; lowestRevenuePoint?: string; largestIncreasePoint?: string; largestDecreasePoint?: string;
    trendDirection: 'up' | 'down' | 'mixed' | 'flat'; volatilityNote?: string;
  };
  categoryBreakdown?: Array<{ category: string; revenue: number; revenueShare: number; orderCount: number; averageOrderValue: number; couponUsageRate?: number }>;
  productBreakdown?: Array<{ goodsNo?: string; productName: string; category?: string; brand?: string; revenue: number; revenueShare: number; orderCount: number; quantity: number; averageOrderValue: number; inquiryCount?: number; reviewCount?: number; averageRating?: number }>;
  customerBreakdown?: {
    firstRepeat?: Array<{ label: 'first' | 'repeat'; revenue: number; revenueShare: number; orderCount: number; averageOrderValue: number }>;
    memberGroup?: Array<{ memberGroup: string; revenue: number; revenueShare: number; orderCount: number; averageOrderValue: number }>;
  };
  promotionBreakdown?: {
    couponUsage?: Array<{ label: 'used' | 'not_used'; revenue: number; revenueShare: number; orderCount: number; averageOrderValue: number; couponDiscountAmount: number }>;
    rewardUsage?: Array<{ label: 'used' | 'not_used'; revenue: number; revenueShare: number; orderCount: number; averageOrderValue: number; rewardUseAmount: number }>;
  };
  channelBreakdown?: Array<{ orderChannel: string; revenue: number; revenueShare: number; orderCount: number; averageOrderValue: number }>;
  csSignals?: {
    inquiryHeavyProducts?: Array<{ productName: string; inquiryCount: number; revenue: number; revenueShare: number }>;
    lowRatingProducts?: Array<{ productName: string; averageRating: number; reviewCount: number; revenue: number; revenueShare: number }>;
  };
  relationships?: Array<{ label: string; xMetric: string; yMetric: string; direction: 'positive' | 'negative' | 'mixed' | 'weak' | 'none'; coefficient?: number; sampleSize: number; notes: string[] }>;
  anomalies?: Array<{ label: string; type: 'spike' | 'drop' | 'outlier' | 'concentration' | 'weakness'; metric: string; value: number; notes: string[] }>;
};

export type MarketingInsightNarrative = {
  headline: string;
  scopeSummary: string;
  chartReading: string;
  sections: { title: string; lines: string[] }[];
  causalCautions: string[];
  bullets: string[];
};
export type MarketingInsightEvidence = { id: string; label: string; value: string | number };
export type MarketingScopeInsightResult = {
  scope: MarketingAnalysisScope;
  primaryQuestion: MarketingQuestionInterpretation;
  primaryChart: MarketingInsightChartSpec;
  insightPack: MarketingInsightPack;
  narrative: MarketingInsightNarrative;
  evidence: MarketingInsightEvidence[];
  requiredData: string[];
  warnings: string[];
  piiCheck: { containsPii: boolean; fields: string[] };
};

// ── 유틸 ──────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown> & { lines?: Record<string, unknown>[]; state?: Record<string, unknown> };
const numv = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const strv = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const boolv = (v: unknown): boolean => v === true || v === 'true' || v === 'y' || v === 1;
const won = (n: number): string => `${Math.round(n).toLocaleString()}원`;
const pctStr = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const round1 = (n: number): number => +n.toFixed(1);
const isCounted = (o: Row): boolean => { const st = o.state as Record<string, unknown> | undefined; if (st && (st.paid !== undefined || st.canceled !== undefined)) return boolv(st.paid) && !boolv(st.canceled); if (o.paid !== undefined || o.canceled !== undefined) return boolv(o.paid) && !boolv(o.canceled); return numv(o.totalAmount) > 0; };
const hasCoupon = (o: Row): boolean => { const d = o.discountSummary as Record<string, unknown> | undefined; return boolv(d?.hasCoupon); };
const couponDiscount = (o: Row): number => { const d = o.discountSummary as Record<string, unknown> | undefined; return numv(d?.totalCouponDiscountAmount); };
const rewardAmt = (o: Row): number => numv(o.rewardUseAmount) || (numv(o.useMileageAmount) + numv(o.useDepositAmount));
const usesReward = (o: Row): boolean => rewardAmt(o) > 0;
const orderMs = (o: Row): number => Date.parse(strv(o.orderDate).replace(' ', 'T'));
const MONTH_LABEL = (mm: string): string => `${Number(mm)}월`;

// ── PII self-check ──────────────────────────────────────────────────────────
const FORBIDDEN_PII = ['name', 'customerName', 'phone', 'mobile', 'email', 'address', 'receiverName', 'receiverPhone', 'receiverAddress', 'memberKey', 'orderNo'];
export function assertScopeInsightNoPii(value: unknown): { containsPii: boolean; fields: string[] } {
  const found = new Set<string>();
  const visit = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || depth > 8) return;
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return; }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN_PII.includes(k)) found.add(k);
      if (typeof val === 'string' && /syn_member_/.test(val)) found.add('syn_member_');
      visit(val, depth + 1);
    }
  };
  visit(value, 0);
  return { containsPii: found.size > 0, fields: [...found] };
}

// ── scope/질문 해석 ────────────────────────────────────────────────────────────
const detectYears = (t: string): number[] => [...new Set([...t.matchAll(/((?:20)\d{2})\s*년/g)].map((m) => Number(m[1])))];
const lastDay = (y: number, m: number): string => String(new Date(y, m, 0).getDate()).padStart(2, '0');

export function interpretMarketingQuestion(message: string): { scope: MarketingAnalysisScope; question: MarketingQuestionInterpretation } {
  const t = (message || '').toLowerCase();
  const scope: MarketingAnalysisScope = {};
  const years = detectYears(message);
  const monthRange = message.match(/(\d{1,2})\s*월\s*(?:부터|~|-|에서)\s*(\d{1,2})\s*월/);
  const mStart = monthRange ? String(monthRange[1]).padStart(2, '0') : '01';
  const mEnd = monthRange ? String(monthRange[2]).padStart(2, '0') : '12';

  // 기간
  if (years.length === 1) {
    const y = years[0];
    scope.dateRange = { start: `${y}-${mStart}-01`, end: `${y}-${mEnd}-${lastDay(y, Number(mEnd))}`, label: `${y}년${monthRange ? ` ${Number(mStart)}~${Number(mEnd)}월` : ''}` };
  } else if (years.length >= 2) {
    const lo = Math.min(...years), hi = Math.max(...years);
    scope.dateRange = { start: `${lo}-01-01`, end: `${hi}-12-31`, label: `${lo}~${hi}년` };
  }

  // 고객/쿠폰/채널/csScope
  if (/신규\s*회원|신규회원/.test(t)) scope.customerScope = { ...scope.customerScope, memberGroups: [...(scope.customerScope?.memberGroups || []), '신규회원'] };
  if (/vip/i.test(t)) scope.customerScope = { ...scope.customerScope, memberGroups: [...(scope.customerScope?.memberGroups || []), 'VIP'] };
  if (/재구매\s*회원|재구매회원/.test(t)) scope.customerScope = { ...scope.customerScope, memberGroups: [...(scope.customerScope?.memberGroups || []), '재구매회원'] };
  if (/재구매/.test(t)) scope.customerScope = { ...scope.customerScope, firstRepeat: 'repeat' };
  else if (/첫구매/.test(t)) scope.customerScope = { ...scope.customerScope, firstRepeat: 'first' };
  // "쿠폰 사용률/사용율"은 metric(사용률)이므로 filter로 잡지 않음(부정 lookahead).
  if (/쿠폰\s*미사용|쿠폰\s*안\s*쓴/.test(t)) scope.promotionScope = { ...scope.promotionScope, couponUsage: 'not_used' };
  else if (/쿠폰\s*(?:사용|쓴)(?!\s*률|\s*율|률|율)/.test(t)) scope.promotionScope = { ...scope.promotionScope, couponUsage: 'used' };
  if (/문의/.test(t)) scope.csScope = { ...scope.csScope, includeInquiries: true };
  if (/리뷰|평점/.test(t)) scope.csScope = { ...scope.csScope, includeReviews: true };
  if (/클레임|환불/.test(t)) scope.csScope = { ...scope.csScope, includeClaims: true };

  // focus / primary dimension·metric
  let focus: MarketingQuestionFocus = 'summary';
  let primaryDimension: MarketingQuestionInterpretation['primaryDimension'];
  let primaryMetric = 'revenue';
  let secondaryMetric: string | undefined;
  let timeBucket: MarketingQuestionInterpretation['timeBucket'];

  const isRelation = /관계|상관|연관|영향|있는지|낮은지|높은지/.test(t);
  if (years.length >= 2) { focus = 'year_compare'; timeBucket = 'month'; }
  else if (/카테고리/.test(t)) {
    focus = 'category'; primaryDimension = 'category';
    if (/쿠폰\s*사용률|쿠폰\s*사용율/.test(t)) { primaryMetric = 'couponUsageRate'; secondaryMetric = 'revenueShare'; }
    else if (/비중/.test(t)) primaryMetric = 'revenueShare';
  } else if (/상품/.test(t)) {
    focus = 'product'; primaryDimension = 'product';
    if (/문의/.test(t)) { primaryMetric = 'inquiryCount'; secondaryMetric = 'revenue'; }
    else if (/리뷰|평점/.test(t)) { primaryMetric = 'averageRating'; secondaryMetric = 'revenue'; }
    else if (/비중/.test(t)) primaryMetric = 'revenueShare';
  } else if (/쿠폰/.test(t)) { focus = 'coupon'; primaryDimension = 'couponUsage'; }
  else if (/회원\s*그룹|등급별|vip|신규회원|재구매회원|일반회원/i.test(t)) { focus = 'customer'; primaryDimension = 'memberGroup'; }
  else if (/채널/.test(t)) { focus = 'channel'; primaryDimension = 'orderChannel'; }
  else if (/월별|매월|달별|추이|흐름|트렌드/.test(t) || scope.dateRange) { focus = 'period'; timeBucket = 'month'; }

  if (isRelation && (focus === 'category' || focus === 'product')) focus = 'relationship';
  if (/일별/.test(t)) timeBucket = 'day';
  else if (/주별|주간/.test(t)) timeBucket = 'week';
  else if (/분기/.test(t)) timeBucket = 'quarter';
  else if (/연도별|년도별/.test(t)) timeBucket = 'year';
  else if ((focus === 'period') && !timeBucket) timeBucket = 'month';

  const question: MarketingQuestionInterpretation = {
    originalQuestion: message, focus, primaryDimension, primaryMetric, secondaryMetric, timeBucket,
    ...(years.length >= 2 ? { yearCompare: { years: [...years].sort() } } : {})
  };
  return { scope, question };
}

// ── 집계 헬퍼 ──────────────────────────────────────────────────────────────────
type Agg = { revenue: number; orderCount: number; coupon: number; couponOrders: number; reward: number; quantity: number };
const newAgg = (): Agg => ({ revenue: 0, orderCount: 0, coupon: 0, couponOrders: 0, reward: 0, quantity: 0 });
const aov = (a: Agg): number => (a.orderCount ? Math.round(a.revenue / a.orderCount) : 0);

const withinRange = (o: Row, r?: { start: string; end: string }): boolean => {
  if (!r) return true;
  const ms = orderMs(o); if (Number.isNaN(ms)) return false;
  return ms >= Date.parse(`${r.start}T00:00:00`) && ms <= Date.parse(`${r.end}T23:59:59`);
};
const dateWithin = (dateStr: string, r?: { start: string; end: string }): boolean => {
  if (!r) return true;
  const ms = Date.parse(strv(dateStr).replace(' ', 'T')); if (Number.isNaN(ms)) return false;
  return ms >= Date.parse(`${r.start}T00:00:00`) && ms <= Date.parse(`${r.end}T23:59:59`);
};

const pearson = (rows: { x: number; y: number }[]): { r: number | null; n: number } => {
  const n = rows.length; if (n < 3) return { r: null, n };
  const mx = rows.reduce((s, v) => s + v.x, 0) / n, my = rows.reduce((s, v) => s + v.y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (const v of rows) { const a = v.x - mx, b = v.y - my; num += a * b; dx += a * a; dy += b * b; }
  return { r: dx > 0 && dy > 0 ? +(num / Math.sqrt(dx * dy)).toFixed(3) : 0, n };
};

// ── insight pack 빌더 ──────────────────────────────────────────────────────────
const TIME_LABEL: Record<string, string> = { day: '일', week: '주', month: '월', quarter: '분기', year: '연도' };
function buildInsightPack(input: { scope: MarketingAnalysisScope; question: MarketingQuestionInterpretation; orders: Row[]; products: Row[]; reviews: Row[]; inquiries: Row[] }): { pack: MarketingInsightPack; requiredData: string[]; warnings: string[] } {
  const { scope, question } = input;
  const range = scope.dateRange ? { start: scope.dateRange.start, end: scope.dateRange.end } : undefined;
  const warnings: string[] = [];
  const requiredData: string[] = [];

  // 명시 필터(질문에 명시된 조건만 제한; 나머지는 보조 분석 축)
  const passFilter = (o: Row): boolean => {
    if (!withinRange(o, range)) return false;
    if (scope.customerScope?.memberGroups?.length && !scope.customerScope.memberGroups.includes(strv(o.memberGroupName))) return false;
    if (scope.customerScope?.firstRepeat === 'first' && !boolv(o.isFirstPurchase)) return false;
    if (scope.customerScope?.firstRepeat === 'repeat' && boolv(o.isFirstPurchase)) return false;
    if (scope.promotionScope?.couponUsage === 'used' && !hasCoupon(o)) return false;
    if (scope.promotionScope?.couponUsage === 'not_used' && hasCoupon(o)) return false;
    return true;
  };
  const scoped = input.orders.filter((o) => isCounted(o) && passFilter(o));

  const prodIndex = new Map<string, Row>();
  for (const p of input.products) { const id = strv(p.productId) || strv(p.goodsNo); if (id) prodIndex.set(id, p); }
  const goodsMeta = (g: string): { name: string; category: string; brand: string } => {
    const p = prodIndex.get(g);
    return { name: strv(p?.productName) || `상품 ${g || '미상'}`, category: strv(p?.categoryCode) || strv(p?.allCategoryCode) || 'uncategorized', brand: strv(p?.brandCode) || 'unknown' };
  };

  // summary
  let totRev = 0, totOrders = 0;
  for (const o of scoped) { totRev += numv(o.totalAmount); totOrders += 1; }
  const summary = { totalRevenue: Math.round(totRev), orderCount: totOrders, averageOrderValue: totOrders ? Math.round(totRev / totOrders) : 0, periodLabel: scope.dateRange?.label || '전체 기간' };

  // timeTrend
  const tb = question.timeBucket || 'month';
  const trendMap = new Map<string, Agg>();
  const bucketKeyOf = (o: Row): string => {
    const d = strv(o.orderDate);
    if (tb === 'year') return d.slice(0, 4);
    if (tb === 'quarter') { const mo = Number(d.slice(5, 7)); return `${d.slice(0, 4)}-Q${Math.floor((mo - 1) / 3) + 1}`; }
    if (tb === 'day') return d.slice(0, 10);
    if (tb === 'week') { const ms = orderMs(o); const wk = Math.floor(ms / (7 * 86400000)); return `W${wk}`; }
    return d.slice(0, 7); // month
  };
  for (const o of scoped) { const k = bucketKeyOf(o); const a = trendMap.get(k) || newAgg(); a.revenue += numv(o.totalAmount); a.orderCount += 1; trendMap.set(k, a); }
  const trendKeys = [...trendMap.keys()].sort();
  let timeTrend: MarketingInsightPack['timeTrend'];
  if (trendKeys.length >= 1) {
    const points = trendKeys.map((k, i) => {
      const a = trendMap.get(k)!;
      const prev = i > 0 ? trendMap.get(trendKeys[i - 1])! : undefined;
      const delta = prev ? a.revenue - prev.revenue : undefined;
      const rate = prev && prev.revenue ? round1((a.revenue - prev.revenue) / prev.revenue * 100) : undefined;
      const label = tb === 'month' ? `${k.slice(0, 4)}-${k.slice(5, 7)}` : k;
      return { bucketKey: k, label, revenue: Math.round(a.revenue), orderCount: a.orderCount, averageOrderValue: aov(a), previousDelta: delta != null ? Math.round(delta) : undefined, previousDeltaRate: rate };
    });
    let hi = points[0], lo = points[0], up = points[0], down = points[0];
    for (const p of points) { if (p.revenue > hi.revenue) hi = p; if (p.revenue < lo.revenue) lo = p; if ((p.previousDelta ?? -Infinity) > (up.previousDelta ?? -Infinity)) up = p; if ((p.previousDelta ?? Infinity) < (down.previousDelta ?? Infinity)) down = p; }
    const first = points[0].revenue, last = points[points.length - 1].revenue;
    const dir: 'up' | 'down' | 'mixed' | 'flat' = points.length < 2 ? 'flat' : last > first * 1.05 ? 'up' : last < first * 0.95 ? 'down' : 'mixed';
    const mean = points.reduce((s, p) => s + p.revenue, 0) / points.length;
    const variance = points.reduce((s, p) => s + (p.revenue - mean) ** 2, 0) / points.length;
    const cv = mean ? Math.sqrt(variance) / mean : 0;
    timeTrend = {
      bucket: tb, points,
      highestRevenuePoint: hi.label, lowestRevenuePoint: lo.label,
      largestIncreasePoint: points.length > 1 ? up.label : undefined,
      largestDecreasePoint: points.length > 1 ? down.label : undefined,
      trendDirection: dir,
      volatilityNote: cv > 0.4 ? '월별 변동 폭이 큰 편입니다.' : cv < 0.15 ? '월별 변동이 비교적 안정적입니다.' : undefined
    };
  }

  // dimension 집계 헬퍼(주문 기반)
  const byOrderDim = (keyFn: (o: Row) => { key: string; label: string }): Map<string, Agg & { label: string }> => {
    const m = new Map<string, Agg & { label: string }>();
    for (const o of scoped) { const { key, label } = keyFn(o); const a = m.get(key) || { ...newAgg(), label }; a.revenue += numv(o.totalAmount); a.orderCount += 1; a.coupon += couponDiscount(o); if (hasCoupon(o)) a.couponOrders += 1; a.reward += rewardAmt(o); m.set(key, a); }
    return m;
  };
  const shareOf = (rev: number): number => (summary.totalRevenue ? round1(rev / summary.totalRevenue * 100) : 0);

  // categoryBreakdown / productBreakdown (라인 기반)
  const catMap = new Map<string, Agg & { label: string }>();
  const prodMap = new Map<string, Agg & { name: string; category: string; brand: string }>();
  let lineTotalRev = 0;
  for (const o of scoped) {
    const oCoupon = hasCoupon(o);
    for (const l of (o.lines || []) as Row[]) {
      const g = strv(l.goodsNo); const meta = goodsMeta(g); const lr = numv(l.lineRevenue); const q = numv(l.quantity);
      lineTotalRev += lr;
      const c = catMap.get(meta.category) || { ...newAgg(), label: meta.category === 'uncategorized' ? '미분류' : `카테고리 ${meta.category}` };
      c.revenue += lr; c.orderCount += 1; c.quantity += q; if (oCoupon) c.couponOrders += 1; catMap.set(meta.category, c);
      const pk = g || meta.name;
      const p = prodMap.get(pk) || { ...newAgg(), name: meta.name, category: meta.category, brand: meta.brand };
      p.revenue += lr; p.orderCount += 1; p.quantity += q; if (oCoupon) p.couponOrders += 1; prodMap.set(pk, p);
    }
  }
  const lineShare = (rev: number): number => (lineTotalRev ? round1(rev / lineTotalRev * 100) : 0);
  const categoryBreakdown = [...catMap.entries()].map(([, a]) => ({ category: a.label, revenue: Math.round(a.revenue), revenueShare: lineShare(a.revenue), orderCount: a.orderCount, averageOrderValue: aov(a), couponUsageRate: a.orderCount ? round1(a.couponOrders / a.orderCount * 100) : 0 })).sort((x, y) => y.revenue - x.revenue);

  // 문의/리뷰 by goods (기간 내)
  const inqByGoods = new Map<string, number>();
  const revByGoods = new Map<string, { count: number; ratingSum: number }>();
  if (scope.csScope?.includeInquiries || question.primaryMetric === 'inquiryCount' || question.focus === 'period' || question.focus === 'product') {
    for (const r of input.inquiries) { const g = strv(r.goodsNo) || strv(r.productId); if (!g) continue; if (!dateWithin(strv(r.createdAt), range)) continue; inqByGoods.set(g, (inqByGoods.get(g) || 0) + 1); }
  }
  if (scope.csScope?.includeReviews || question.primaryMetric === 'averageRating' || question.focus === 'period' || question.focus === 'product') {
    for (const r of input.reviews) { const g = strv(r.goodsNo) || strv(r.productId); if (!g) continue; if (!dateWithin(strv(r.createdAt), range)) continue; const e = revByGoods.get(g) || { count: 0, ratingSum: 0 }; e.count += 1; e.ratingSum += numv(r.rating); revByGoods.set(g, e); }
  }
  const productBreakdown = [...prodMap.entries()].map(([g, a]) => {
    const rv = revByGoods.get(g);
    return { goodsNo: g, productName: a.name, category: a.category, brand: a.brand, revenue: Math.round(a.revenue), revenueShare: lineShare(a.revenue), orderCount: a.orderCount, quantity: a.quantity, averageOrderValue: aov(a), inquiryCount: inqByGoods.get(g) || 0, reviewCount: rv?.count || 0, averageRating: rv && rv.count ? +(rv.ratingSum / rv.count).toFixed(2) : 0 };
  }).sort((x, y) => y.revenue - x.revenue);

  // customerBreakdown
  const frMap = byOrderDim((o) => boolv(o.isFirstPurchase) ? { key: 'first', label: '첫구매' } : { key: 'repeat', label: '재구매' });
  const mgMap = byOrderDim((o) => { const l = strv(o.memberGroupName) || '미분류'; return { key: l, label: l }; });
  const customerBreakdown = {
    firstRepeat: ['first', 'repeat'].filter((k) => frMap.has(k)).map((k) => { const a = frMap.get(k)!; return { label: k as 'first' | 'repeat', revenue: Math.round(a.revenue), revenueShare: shareOf(a.revenue), orderCount: a.orderCount, averageOrderValue: aov(a) }; }),
    memberGroup: [...mgMap.entries()].map(([, a]) => ({ memberGroup: a.label, revenue: Math.round(a.revenue), revenueShare: shareOf(a.revenue), orderCount: a.orderCount, averageOrderValue: aov(a) })).sort((x, y) => y.revenue - x.revenue)
  };

  // promotionBreakdown
  const couponMap = byOrderDim((o) => hasCoupon(o) ? { key: 'used', label: '쿠폰 사용' } : { key: 'not_used', label: '쿠폰 미사용' });
  const rewardMap = byOrderDim((o) => usesReward(o) ? { key: 'used', label: '리워드 사용' } : { key: 'not_used', label: '리워드 미사용' });
  const promotionBreakdown = {
    couponUsage: ['used', 'not_used'].filter((k) => couponMap.has(k)).map((k) => { const a = couponMap.get(k)!; return { label: k as 'used' | 'not_used', revenue: Math.round(a.revenue), revenueShare: shareOf(a.revenue), orderCount: a.orderCount, averageOrderValue: aov(a), couponDiscountAmount: Math.round(a.coupon) }; }),
    rewardUsage: ['used', 'not_used'].filter((k) => rewardMap.has(k)).map((k) => { const a = rewardMap.get(k)!; return { label: k as 'used' | 'not_used', revenue: Math.round(a.revenue), revenueShare: shareOf(a.revenue), orderCount: a.orderCount, averageOrderValue: aov(a), rewardUseAmount: Math.round(a.reward) }; })
  };

  // channelBreakdown
  const chMap = byOrderDim((o) => { const c = strv(o.orderChannel) || 'unknown'; return { key: c, label: c === 'unknown' ? '채널 미상' : c }; });
  const channelBreakdown = [...chMap.entries()].map(([, a]) => ({ orderChannel: a.label, revenue: Math.round(a.revenue), revenueShare: shareOf(a.revenue), orderCount: a.orderCount, averageOrderValue: aov(a) })).sort((x, y) => y.revenue - x.revenue);

  // csSignals
  const inquiryHeavy = [...productBreakdown].filter((p) => (p.inquiryCount || 0) > 0).sort((a, b) => (b.inquiryCount || 0) - (a.inquiryCount || 0)).slice(0, 5).map((p) => ({ productName: p.productName, inquiryCount: p.inquiryCount || 0, revenue: p.revenue, revenueShare: p.revenueShare }));
  const lowRating = [...productBreakdown].filter((p) => (p.reviewCount || 0) >= 2 && (p.averageRating || 0) > 0).sort((a, b) => (a.averageRating || 0) - (b.averageRating || 0)).slice(0, 5).map((p) => ({ productName: p.productName, averageRating: p.averageRating || 0, reviewCount: p.reviewCount || 0, revenue: p.revenue, revenueShare: p.revenueShare }));
  const csSignals = { inquiryHeavyProducts: inquiryHeavy.length ? inquiryHeavy : undefined, lowRatingProducts: lowRating.length ? lowRating : undefined };

  // relationships
  const relationships: NonNullable<MarketingInsightPack['relationships']> = [];
  if (question.focus === 'relationship' || question.primaryMetric === 'inquiryCount' || question.primaryMetric === 'couponUsageRate' || question.primaryMetric === 'averageRating') {
    if (question.primaryDimension === 'product' && (question.primaryMetric === 'inquiryCount' || question.secondaryMetric === 'revenue')) {
      const rows = productBreakdown.map((p) => ({ x: p.inquiryCount || 0, y: p.revenue }));
      const { r, n } = pearson(rows);
      relationships.push({ label: '상품별 문의수 vs 매출', xMetric: 'inquiryCount', yMetric: 'revenue', direction: r == null ? 'none' : Math.abs(r) < 0.2 ? 'weak' : r > 0 ? 'positive' : 'negative', coefficient: r ?? undefined, sampleSize: n, notes: ['상관계수는 관계의 강도를 보는 참고값이며, 원인을 증명하지 않습니다.'] });
    }
    if (question.primaryDimension === 'category') {
      const rows = categoryBreakdown.map((c) => ({ x: c.couponUsageRate || 0, y: c.revenueShare }));
      const { r, n } = pearson(rows);
      relationships.push({ label: '카테고리별 쿠폰 사용률 vs 매출 비중', xMetric: 'couponUsageRate', yMetric: 'revenueShare', direction: r == null ? 'none' : Math.abs(r) < 0.2 ? 'weak' : r > 0 ? 'positive' : 'negative', coefficient: r ?? undefined, sampleSize: n, notes: ['상관계수는 관계의 강도를 보는 참고값이며, 원인을 증명하지 않습니다.'] });
    }
  }

  // anomalies (집중도/이상 구간)
  const anomalies: NonNullable<MarketingInsightPack['anomalies']> = [];
  if (categoryBreakdown[0] && categoryBreakdown[0].revenueShare >= 50) anomalies.push({ label: `${categoryBreakdown[0].category} 매출 집중`, type: 'concentration', metric: 'revenueShare', value: categoryBreakdown[0].revenueShare, notes: [`${categoryBreakdown[0].category}가 기간 매출의 ${categoryBreakdown[0].revenueShare}%를 차지합니다.`] });
  if (timeTrend && timeTrend.largestDecreasePoint && timeTrend.points.length > 2) { const dp = timeTrend.points.find((p) => p.label === timeTrend!.largestDecreasePoint); if (dp && (dp.previousDeltaRate ?? 0) <= -25) anomalies.push({ label: `${dp.label} 매출 급감`, type: 'drop', metric: 'revenue', value: dp.revenue, notes: [`${dp.label}에 전 구간 대비 ${pctStr(dp.previousDeltaRate || 0)} 변화가 관찰됩니다.`] }); }

  // baseline 기간(2024)이면 쿠폰 효과 해석 주의 데이터
  const couponDuringBaseline = scoped.some((o) => strv(o.syntheticYearLabel) === 'baseline');

  const pack: MarketingInsightPack = {
    summary,
    timeTrend,
    categoryBreakdown: categoryBreakdown.length ? categoryBreakdown : undefined,
    productBreakdown: productBreakdown.length ? productBreakdown : undefined,
    customerBreakdown: (customerBreakdown.firstRepeat.length || customerBreakdown.memberGroup.length) ? customerBreakdown : undefined,
    promotionBreakdown: (promotionBreakdown.couponUsage.length || promotionBreakdown.rewardUsage.length) ? promotionBreakdown : undefined,
    channelBreakdown: channelBreakdown.length ? channelBreakdown : undefined,
    csSignals: (csSignals.inquiryHeavyProducts || csSignals.lowRatingProducts) ? csSignals : undefined,
    relationships: relationships.length ? relationships : undefined,
    anomalies: anomalies.length ? anomalies : undefined
  };
  if (couponDuringBaseline) warnings.push('2024 baseline 기간에는 쿠폰/프로모션이 없었으므로 해당 기간 흐름을 쿠폰 효과로 해석하면 안 됩니다.');
  return { pack, requiredData, warnings };
}

// ── primary chart 선택 ──────────────────────────────────────────────────────────
function buildPrimaryChart(input: { question: MarketingQuestionInterpretation; scope: MarketingAnalysisScope; pack: MarketingInsightPack; orders: Row[]; products: Row[] }): MarketingInsightChartSpec {
  const { question, pack } = input;
  // 연도 비교 (groupedBar, 12개월)
  if (question.focus === 'year_compare' && question.yearCompare) {
    const years = question.yearCompare.years;
    const byYearMonth = new Map<string, Map<string, number>>();
    for (const o of input.orders) {
      if (!isCounted(o)) continue;
      const y = strv(o.orderDate).slice(0, 4); if (!years.includes(Number(y))) continue;
      const mm = strv(o.orderDate).slice(5, 7);
      const m = byYearMonth.get(y) || new Map(); m.set(mm, (m.get(mm) || 0) + numv(o.totalAmount)); byYearMonth.set(y, m);
    }
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    const series = years.map((y) => ({
      key: `${y}`, label: `${y}년`, metric: 'revenue', unit: 'currency' as const,
      points: months.map((mm) => ({ key: mm, label: MONTH_LABEL(mm), value: Math.round(byYearMonth.get(String(y))?.get(mm) || 0) }))
    }));
    return { chartType: 'groupedBar', title: `${years.join('·')}년 월별 매출 비교`, subtitle: '월별 · 매출', xKey: 'month', primaryMetric: 'revenue', series };
  }
  // 관계형: category 쿠폰사용률 vs 매출비중 / product 문의수 vs 매출 → dualMetricBar
  if (question.focus === 'relationship' || question.secondaryMetric) {
    if (question.primaryDimension === 'category' && pack.categoryBreakdown) {
      return {
        chartType: 'dualMetricBar', title: '카테고리별 쿠폰 사용률과 매출 비중', subtitle: '쿠폰 사용률(%) · 매출 비중(%)', xKey: 'category',
        primaryMetric: 'couponUsageRate', secondaryMetric: 'revenueShare',
        series: [{ key: 'category', label: '카테고리', metric: 'couponUsageRate', unit: 'percent', points: pack.categoryBreakdown.map((c) => ({ key: c.category, label: c.category, value: c.couponUsageRate || 0, secondaryValue: c.revenueShare, orderCount: c.orderCount, metadata: { revenue: c.revenue } })) }]
      };
    }
    if (question.primaryDimension === 'product' && pack.productBreakdown) {
      const top = pack.productBreakdown.slice(0, 10);
      return {
        chartType: 'dualMetricBar', title: '상품별 문의수와 매출', subtitle: '문의수(건) · 매출(원)', xKey: 'product',
        primaryMetric: 'inquiryCount', secondaryMetric: 'revenue',
        series: [{ key: 'product', label: '상품', metric: 'inquiryCount', unit: 'count', points: top.map((p) => ({ key: p.goodsNo || p.productName, label: p.productName, value: p.inquiryCount || 0, secondaryValue: p.revenue, orderCount: p.orderCount })) }]
      };
    }
  }
  // 카테고리/상품 순위 (rankedBar)
  if (question.primaryDimension === 'category' && pack.categoryBreakdown) {
    return { chartType: 'rankedBar', title: '카테고리별 매출', subtitle: '매출 비중', xKey: 'category', primaryMetric: question.primaryMetric === 'couponUsageRate' ? 'couponUsageRate' : 'revenue', series: [{ key: 'category', label: '카테고리', metric: 'revenue', unit: 'currency', points: pack.categoryBreakdown.map((c) => ({ key: c.category, label: c.category, value: question.primaryMetric === 'couponUsageRate' ? (c.couponUsageRate || 0) : c.revenue, orderCount: c.orderCount })) }] };
  }
  if (question.primaryDimension === 'product' && pack.productBreakdown) {
    const top = pack.productBreakdown.slice(0, 10);
    const metric = question.primaryMetric;
    return { chartType: 'rankedBar', title: '상품별 분석', subtitle: TIME_LABEL.month, xKey: 'product', primaryMetric: metric, series: [{ key: 'product', label: '상품', metric, unit: metric === 'inquiryCount' ? 'count' : metric === 'averageRating' ? 'score' : 'currency', points: top.map((p) => ({ key: p.goodsNo || p.productName, label: p.productName, value: metric === 'inquiryCount' ? (p.inquiryCount || 0) : metric === 'averageRating' ? (p.averageRating || 0) : p.revenue, secondaryValue: p.revenue, orderCount: p.orderCount })) }] };
  }
  if (question.primaryDimension === 'couponUsage' && pack.promotionBreakdown?.couponUsage) {
    return { chartType: 'groupedBar', title: '쿠폰 사용/미사용 비교', subtitle: '매출·객단가', xKey: 'couponUsage', primaryMetric: 'revenue', series: [{ key: 'coupon', label: '쿠폰', metric: 'revenue', unit: 'currency', points: pack.promotionBreakdown.couponUsage.map((c) => ({ key: c.label, label: c.label === 'used' ? '쿠폰 사용' : '쿠폰 미사용', value: c.revenue, orderCount: c.orderCount, metadata: { averageOrderValue: c.averageOrderValue } })) }] };
  }
  if (question.primaryDimension === 'memberGroup' && pack.customerBreakdown?.memberGroup) {
    return { chartType: 'rankedBar', title: '회원그룹별 매출', subtitle: '매출·객단가', xKey: 'memberGroup', primaryMetric: 'revenue', series: [{ key: 'memberGroup', label: '회원그룹', metric: 'revenue', unit: 'currency', points: pack.customerBreakdown.memberGroup.map((m) => ({ key: m.memberGroup, label: m.memberGroup, value: m.revenue, orderCount: m.orderCount, metadata: { averageOrderValue: m.averageOrderValue } })) }] };
  }
  // 기본: 기간 추이 (line, 월별)
  if (pack.timeTrend) {
    return {
      chartType: 'line', title: `${pack.summary.periodLabel} 매출 추이`, subtitle: `${TIME_LABEL[pack.timeTrend.bucket]}별 · 매출`, xKey: pack.timeTrend.bucket, primaryMetric: 'revenue',
      series: [{ key: 'revenue', label: '매출', metric: 'revenue', unit: 'currency', points: pack.timeTrend.points.map((p) => ({ key: p.bucketKey, label: p.label, value: p.revenue, orderCount: p.orderCount, metadata: { averageOrderValue: p.averageOrderValue, ...(p.previousDeltaRate != null ? { previousDeltaRate: p.previousDeltaRate } : {}) } })) }]
    };
  }
  return { chartType: 'table', title: pack.summary.periodLabel, primaryMetric: 'revenue', series: [{ key: 'revenue', label: '매출', metric: 'revenue', unit: 'currency', points: [{ key: 'all', label: '전체', value: pack.summary.totalRevenue, orderCount: pack.summary.orderCount }] }] };
}

// ── chartSpec adapter (insight chart → 기존 MarketingChartSpec) ──────────────────
const CHART_MAP: Record<MarketingInsightChartSpec['chartType'], MarketingChartType> = {
  line: 'line', bar: 'groupedBar', groupedBar: 'groupedBar', rankedBar: 'rankedBar', dualMetricBar: 'rankedBar', scatter: 'rankedBar', table: 'table', unsupported: 'unsupported'
};
const UNIT_MAP: Record<string, MarketingChartSpec['unit']> = { currency: 'krw', count: 'count', percent: 'percent', score: 'mixed' };
export function adaptScopeInsightChartToMarketingChartSpec(chart: MarketingInsightChartSpec, opts?: { available?: boolean; requiredData?: string[] }): MarketingChartSpec {
  const series: MarketingChartSeries[] = chart.series.map((s) => ({
    key: s.key, label: s.label, metric: s.metric,
    points: s.points.map((p) => ({ bucketKey: p.key, bucketLabel: p.label, value: p.value, orderCount: p.orderCount, ...(p.secondaryValue != null ? { notes: [`보조: ${p.secondaryValue.toLocaleString()}`] } : {}) }))
  }));
  const unit = chart.series[0]?.unit ? UNIT_MAP[chart.series[0].unit!] : 'krw';
  return {
    id: `mkt_scope_${chart.chartType}`, title: chart.title, subtitle: chart.subtitle || '', chartType: CHART_MAP[chart.chartType], primaryMetric: chart.primaryMetric,
    series, xAxisLabel: chart.xKey, yAxisLabel: chart.primaryMetric, unit, source: 'temporal_crosstab',
    request: { timeBucket: 'month', dimensions: [], metrics: [chart.primaryMetric, ...(chart.secondaryMetric ? [chart.secondaryMetric] : [])] as unknown as MarketingChartSpec['request']['metrics'] },
    available: opts?.available ?? series.some((s) => s.points.length > 0), evidence: chart.evidence || [], warnings: [], ...(opts?.requiredData?.length ? { requiredData: opts.requiredData } : {})
  };
}

// ── narrative (insightPack 기반, 10 섹션) ────────────────────────────────────────
const CAUSAL_CAUTION = '위 내용은 관찰값이며, 원인 판단에는 방문자·광고비·노출수 등 외부 데이터가 필요합니다.';
export function buildMarketingScopeInsightNarrative(result: MarketingScopeInsightResult): MarketingInsightNarrative {
  const { insightPack: pack, scope, primaryQuestion: q } = result;
  const sections: { title: string; lines: string[] }[] = [];
  const bullets: string[] = [];
  const add = (title: string, lines: string[]): void => { const f = lines.filter(Boolean); if (f.length) { sections.push({ title, lines: f }); bullets.push(...f); } };

  // 1. 핵심 결론 / headline
  let headline = `${pack.summary.periodLabel} 분석: 매출 ${won(pack.summary.totalRevenue)} · 주문 ${pack.summary.orderCount.toLocaleString()}건 · 객단가 ${won(pack.summary.averageOrderValue)}.`;
  if (pack.timeTrend && q.focus !== 'year_compare') headline += ` 최고 매출 ${pack.timeTrend.highestRevenuePoint}, 최저 ${pack.timeTrend.lowestRevenuePoint}.`;

  // 2. 범위 요약
  const scopeBits: string[] = [pack.summary.periodLabel];
  if (scope.customerScope?.memberGroups?.length) scopeBits.push(`회원그룹 ${scope.customerScope.memberGroups.join('·')}`);
  if (scope.customerScope?.firstRepeat && scope.customerScope.firstRepeat !== 'all') scopeBits.push(scope.customerScope.firstRepeat === 'first' ? '첫구매' : '재구매');
  if (scope.promotionScope?.couponUsage && scope.promotionScope.couponUsage !== 'all') scopeBits.push(scope.promotionScope.couponUsage === 'used' ? '쿠폰 사용' : '쿠폰 미사용');
  const scopeSummary = `요청 범위: ${scopeBits.join(' · ')} (명시되지 않은 축은 보조 분석으로 함께 살펴봤습니다).`;

  // 3+4. 주 그래프/흐름 — 연도 비교가 우선(timeTrend는 비교 외 질문에서).
  let chartReading = '';
  if (q.yearCompare && result.primaryChart.series.length >= 2) {
    const s = result.primaryChart.series;
    const tot = (i: number): number => s[i].points.reduce((t, p) => t + p.value, 0);
    const a = tot(0), b = tot(1);
    let win = 0; for (let i = 0; i < Math.min(s[0].points.length, s[1].points.length); i++) if (s[1].points[i].value > s[0].points[i].value) win++;
    let gapM = '', gapV = -1; for (let i = 0; i < Math.min(s[0].points.length, s[1].points.length); i++) { const g = Math.abs(s[1].points[i].value - s[0].points[i].value); if (g > gapV) { gapV = g; gapM = s[1].points[i].label; } }
    chartReading = `${s[1].label}(${won(b)})과 ${s[0].label}(${won(a)})을 월별로 비교하면 총 ${s[1].points.length}개월 중 ${win}개월에서 ${s[1].label}이 더 높게 나타납니다.`;
    add('연도 비교', [chartReading, `두 해 차이가 가장 큰 월은 ${gapM}입니다.`, `합계 차이는 ${won(Math.abs(b - a))}(${pctStr(a ? (b - a) / a * 100 : 0)})입니다.`]);
  } else if (pack.timeTrend) {
    const tt = pack.timeTrend;
    chartReading = `${TIME_LABEL[tt.bucket]}별 매출은 최고 ${tt.highestRevenuePoint}, 최저 ${tt.lowestRevenuePoint} 구간이 관찰되며 전체 흐름은 ${tt.trendDirection === 'up' ? '상승' : tt.trendDirection === 'down' ? '하락' : tt.trendDirection === 'flat' ? '평탄' : '혼조'}에 가깝습니다.`;
    add('매출 흐름', [
      chartReading,
      tt.largestIncreasePoint ? `전 구간 대비 가장 크게 오른 구간은 ${tt.largestIncreasePoint}입니다.` : '',
      tt.largestDecreasePoint ? `가장 크게 낮아진 구간은 ${tt.largestDecreasePoint}입니다.` : '',
      tt.volatilityNote || ''
    ]);
  }

  // 5. 카테고리/상품
  if (pack.categoryBreakdown?.length) {
    const top = pack.categoryBreakdown[0];
    add('카테고리 관찰', [`매출 비중이 가장 높은 카테고리는 ${top.category}(${top.revenueShare}%)입니다.`, pack.categoryBreakdown.length > 1 ? `상위 ${Math.min(3, pack.categoryBreakdown.length)}개 카테고리: ${pack.categoryBreakdown.slice(0, 3).map((c) => `${c.category} ${c.revenueShare}%`).join(', ')}.` : '']);
  }
  if (pack.productBreakdown?.length) {
    const tp = pack.productBreakdown[0];
    add('상품 관찰', [`매출 기여가 큰 상품은 ${tp.productName}(${tp.revenueShare}%)입니다.`]);
  }

  // 6. 고객/회원그룹
  if (pack.customerBreakdown) {
    const fr = pack.customerBreakdown.firstRepeat || [];
    const mg = pack.customerBreakdown.memberGroup || [];
    add('고객 관찰', [
      fr.length === 2 ? `첫구매/재구매 매출 비중은 ${fr.map((x) => `${x.label === 'first' ? '첫구매' : '재구매'} ${x.revenueShare}%`).join(', ')}이며 객단가는 ${fr.map((x) => `${x.label === 'first' ? '첫구매' : '재구매'} ${won(x.averageOrderValue)}`).join(', ')}입니다.` : '',
      mg.length ? `회원그룹 기준 매출 1위는 ${mg[0].memberGroup}(${mg[0].revenueShare}%)입니다.` : ''
    ]);
  }

  // 7. 쿠폰/채널
  const promoLines: string[] = [];
  if (pack.promotionBreakdown?.couponUsage?.length === 2) { const used = pack.promotionBreakdown.couponUsage.find((c) => c.label === 'used'); const non = pack.promotionBreakdown.couponUsage.find((c) => c.label === 'not_used'); if (used && non) promoLines.push(`쿠폰 사용 주문 매출 비중 ${used.revenueShare}%(객단가 ${won(used.averageOrderValue)}), 미사용 ${non.revenueShare}%(객단가 ${won(non.averageOrderValue)}).`); }
  if (pack.channelBreakdown?.length) promoLines.push(`주문 채널 1위는 ${pack.channelBreakdown[0].orderChannel}(${pack.channelBreakdown[0].revenueShare}%)입니다.`);
  add('쿠폰/채널 관찰', promoLines);

  // 8. 문의/리뷰 신호
  const csLines: string[] = [];
  if (pack.csSignals?.inquiryHeavyProducts?.length) { const i = pack.csSignals.inquiryHeavyProducts[0]; csLines.push(`문의가 많은 상품은 ${i.productName}(문의 ${i.inquiryCount}건, 매출 비중 ${i.revenueShare}%)입니다.`); }
  if (pack.csSignals?.lowRatingProducts?.length) { const l = pack.csSignals.lowRatingProducts[0]; csLines.push(`평점이 낮은 편인 상품은 ${l.productName}(평점 ${l.averageRating}, 리뷰 ${l.reviewCount}건)입니다.`); }
  if (pack.relationships?.length) { const r = pack.relationships[0]; csLines.push(`${r.label}의 상관계수는 ${r.coefficient ?? 'n/a'}로 ${r.direction === 'positive' ? '같은 방향' : r.direction === 'negative' ? '반대 방향' : r.direction === 'weak' ? '약한' : '뚜렷하지 않은'} 관계가 관찰됩니다(표본 ${r.sampleSize}).`); }
  add('문의/리뷰 신호', csLines);

  // 9. 추가 확인 포인트 / anomalies
  const nextLines: string[] = [];
  if (pack.anomalies?.length) for (const a of pack.anomalies) nextLines.push(...a.notes);
  nextLines.push('월별 차이가 큰 구간은 쿠폰·채널·상품 분해로 추가 확인할 수 있습니다.');
  add('추가 확인 포인트', nextLines);

  // 10. 인과 단정 주의
  const causalCautions = [CAUSAL_CAUTION, ...result.warnings];

  return { headline, scopeSummary, chartReading, sections, causalCautions, bullets };
}

const toChartNarrative = (n: MarketingInsightNarrative, requiredData: string[]): MarketingChartNarrative => ({
  title: n.headline.split(':')[0] || '마케팅 분석',
  summary: `${n.headline} ${n.scopeSummary}`,
  bullets: n.bullets,
  evidence: [],
  warnings: n.causalCautions,
  ...(requiredData.length ? { requiredData } : {})
});

// ── 진입점 ──────────────────────────────────────────────────────────────────────
const ANALYSIS_SIGNAL = /매출|주문|객단가|쿠폰|할인|리워드|마일리지|회원|vip|신규|재구매|첫구매|채널|카테고리|상품|리뷰|평점|문의|클레임|전환|비중|비교|추이|월별|연도|분기|상반기|하반기/i;

export function buildMarketingScopeInsightResponse(input: { message: string; orders: unknown[]; products?: unknown[]; reviews?: unknown[]; inquiries?: unknown[]; claims?: unknown[]; nowMs?: number }): {
  handled: boolean;
  result?: MarketingScopeInsightResult;
  artifact?: MarketingChatChartArtifact;
  reply: string;
  suppressChart: boolean;
} {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.message || !ANALYSIS_SIGNAL.test(input.message) || !(input.orders && input.orders.length)) {
    return { handled: false, reply: '', suppressChart: false };
  }

  // Query Compiler: 질문을 AnalysisPlan으로 컴파일해 기간(월/월범위/분기/반기)·metric·세그먼트를 정확히 계산.
  // broad year_compare로 가로채지 않는다(저신뢰 broad만 아래 기존 분석으로 위임).
  const analysisResp = buildMarketingAnalysisResponse({ message: input.message, orders: input.orders, nowMs });
  if (analysisResp) {
    return { handled: analysisResp.handled, artifact: analysisResp.artifact, reply: analysisResp.reply, suppressChart: analysisResp.suppressChart };
  }

  // broad 경로에서도 차트 억제 요청은 반영(아래 결과의 suppressChart로 호출부가 처리).
  const queryParse = parseMarketingChatQuery(input.message);
  const orders = input.orders as Row[];
  const products = (input.products || []) as Row[];
  const reviews = (input.reviews || []) as Row[];
  const inquiries = (input.inquiries || []) as Row[];

  const { scope, question } = interpretMarketingQuestion(input.message);
  const { pack, requiredData, warnings } = buildInsightPack({ scope, question, orders, products, reviews, inquiries });
  const primaryChart = buildPrimaryChart({ question, scope, pack, orders, products });

  const result: MarketingScopeInsightResult = {
    scope, primaryQuestion: question, primaryChart, insightPack: pack,
    narrative: { headline: '', scopeSummary: '', chartReading: '', sections: [], causalCautions: [], bullets: [] },
    evidence: [], requiredData, warnings, piiCheck: { containsPii: false, fields: [] }
  };
  result.narrative = buildMarketingScopeInsightNarrative(result);
  result.evidence = [
    { id: 'ev_orders', label: '분석 주문수(결제·미취소)', value: pack.summary.orderCount },
    { id: 'ev_revenue', label: '분석 매출', value: pack.summary.totalRevenue },
    { id: 'ev_period', label: '분석 기간', value: pack.summary.periodLabel },
    { id: 'ev_axes', label: '분석 축', value: ['기간', pack.categoryBreakdown ? '카테고리' : '', pack.productBreakdown ? '상품' : '', pack.customerBreakdown ? '고객' : '', pack.promotionBreakdown ? '쿠폰/리워드' : '', pack.channelBreakdown ? '채널' : '', pack.csSignals ? '문의/리뷰' : ''].filter(Boolean).join('·') }
  ];

  const chartSpec = adaptScopeInsightChartToMarketingChartSpec(primaryChart, { requiredData });
  const narrative = toChartNarrative(result.narrative, requiredData);
  result.piiCheck = assertScopeInsightNoPii({ scope, question, primaryChart, insightPack: pack, narrative: result.narrative, evidence: result.evidence });

  const artifact: MarketingChatChartArtifact = {
    type: 'marketing_chart_spec', source: 'marketingScopeInsightEngine', intent: question.focus,
    plan: { focus: question.focus, primaryDimension: question.primaryDimension, primaryMetric: question.primaryMetric, secondaryMetric: question.secondaryMetric, timeBucket: question.timeBucket, scope },
    request: chartSpec.request, chartSpec, narrative,
    evidence: result.evidence, requiredData, createdAt: new Date(nowMs).toISOString()
  };
  const reply = renderReply(result);
  return { handled: true, result, artifact, reply, suppressChart: queryParse.suppressChart };
}

function renderReply(result: MarketingScopeInsightResult): string {
  const n = result.narrative;
  const lines: string[] = [n.headline, '', n.scopeSummary];
  for (const sec of n.sections) { lines.push('', `[${sec.title}]`); for (const l of sec.lines.slice(0, 4)) lines.push(`- ${l}`); }
  if (result.requiredData.length) lines.push('', `필요 데이터: ${result.requiredData.join(', ')}`);
  lines.push('', `- ${n.causalCautions[0]}`);
  for (const c of n.causalCautions.slice(1)) lines.push(`- ${c}`);
  return lines.join('\n');
}
