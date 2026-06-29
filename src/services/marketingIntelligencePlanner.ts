// Marketing Intelligence Planner v0 — 질문 → 분석계획(plan) → capability 검증 → 실행 → chartSpec + narrative.
//
// 목적: fixed intent 매칭이 아니라 "사용자 질문을 분석 계획으로 바꿔" 실행한다. 마케팅팀은 통계 조회팀이
//   아니라 데이터 간 관계를 분석하고 그래프로 설명하는 팀이다.
//
// 원칙:
//   - 숫자는 전부 deterministic 코드로 계산(LLM이 숫자 생성/추정하지 않음). Math.random 미사용.
//   - 계산 가능한 질문은 "데이터 없음"으로 답하지 않는다. 불가능하면 requiredData + 가능한 proxy 분석 제시.
//   - PII(name/phone/email/address/memberKey) 미포함. 인과 단정 금지(관찰/가능성 표현만).
//   - 기존 계산 엔진(crosstab/facts) 미변경. 이 파일은 자체 deterministic 집계 + crosstab helper 재사용.

import { getMarketingTimeBucketKey, getMarketingDimensionKey, type MarketingTimeBucket, type MarketingCrossTabDimension, type MarketingCrossTabRequest } from './marketingTemporalCrosstab';
import type { MarketingChartSpec, MarketingChartSeries, MarketingChatChartArtifact, MarketingChartNarrative } from './marketingChatChartSpec';

// ── plan/result 타입 ──────────────────────────────────────────────────────────
export type MarketingPlanGoal = 'compare' | 'trend' | 'rank' | 'share' | 'relationship' | 'conversion' | 'diagnose' | 'summary';
export type MarketingPlannedMetric = string;
export type MarketingPlannedDimension = MarketingCrossTabDimension | 'time' | 'reviewRating' | 'inquiryStatus' | 'claimStatus';
export type MarketingPlannedSegment = { kind: 'memberGroup' | 'firstRepeat' | 'couponUsage' | 'scenario'; key: string; label: string };
export type MarketingPlannedFilter = { kind: 'couponUsage' | 'scenario' | 'memberGroup'; key: string; label: string };
export type MarketingPlannedPeriod = { label: string; startDate?: string; endDate?: string };
export type MarketingDataRequirement = { key: string; label: string; reason: string; requiredData: string[] };

export type MarketingIntelligencePlan = {
  id: string;
  originalQuestion: string;
  goal: MarketingPlanGoal;
  requestedMetrics: MarketingPlannedMetric[];
  executableMetrics: MarketingPlannedMetric[];
  periods: MarketingPlannedPeriod[];
  timeBucket?: MarketingTimeBucket;
  dimensions: MarketingPlannedDimension[];
  segments: MarketingPlannedSegment[];
  filters: MarketingPlannedFilter[];
  comparison?: 'period_over_period' | 'year_over_year' | 'segment_vs_segment' | 'coupon_vs_non_coupon' | 'baseline_vs_promotion' | 'before_after' | 'none';
  relationshipTargets?: { xMetric: MarketingPlannedMetric; yMetric: MarketingPlannedMetric; bucket?: 'month' | 'week' | 'year' }[];
  chartRecommendation: { chartType: MarketingChartSpec['chartType']; reason: string };
  dataRequirements: MarketingDataRequirement[];
  proxyPlan?: MarketingIntelligencePlan;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
};

export type MarketingIntelligenceEvidence = { id: string; label: string; value: string | number; source: 'orders' | 'orderLines' | 'products' | 'reviews' | 'inquiries' | 'syntheticScenario' | 'derived' };
export type MarketingRelationshipSummary = {
  xMetric: string;
  yMetric: string;
  correlation: number | null;
  direction: 'co_move_up' | 'co_move_down' | 'mixed' | 'insufficient';
  sampleBuckets: number;
  notes: string[];
};
export type MarketingIntelligenceNarrative = {
  title: string;
  summary: string;
  answerType: 'calculated' | 'partial_with_proxy' | 'required_data' | 'unsupported';
  bullets: string[];
  evidence: string[];
  relationshipNotes: string[];
  causalCautions: string[];
  requiredData?: string[];
  nextQuestions?: string[];
};
export type MarketingIntelligenceResult = {
  plan: MarketingIntelligencePlan;
  primaryChartSpec: MarketingChartSpec;
  supportingChartSpecs: MarketingChartSpec[];
  narrative: MarketingIntelligenceNarrative;
  evidence: MarketingIntelligenceEvidence[];
  relationshipSummary?: MarketingRelationshipSummary;
  available: boolean;
  requiredData: MarketingDataRequirement[];
  piiCheck: { containsPii: boolean; checkedKeys: string[] };
};

// ── Data Capability Map ───────────────────────────────────────────────────────
export type MarketingCapabilityMetric = { key: string; label: string; requires: string[] };
export type MarketingCapabilityDimension = { key: string; label: string };
export type MarketingUnavailableMetric = { key: string; label: string; requiredData: string[] };
export type MarketingDataCapabilityMap = {
  availableSources: { orders: boolean; orderLines: boolean; products: boolean; reviews: boolean; inquiries: boolean; customers: boolean; syntheticScenario: boolean };
  availableFields: string[];
  availableMetrics: MarketingCapabilityMetric[];
  availableDimensions: MarketingCapabilityDimension[];
  unavailableMetrics: MarketingUnavailableMetric[];
};

export function buildMarketingDataCapabilityMap(): MarketingDataCapabilityMap {
  const m = (key: string, label: string, requires: string[] = ['orders']): MarketingCapabilityMetric => ({ key, label, requires });
  return {
    availableSources: { orders: true, orderLines: true, products: true, reviews: true, inquiries: true, customers: true, syntheticScenario: true },
    availableFields: [
      'orderDate', 'totalAmount', 'isFirstPurchase', 'memberGroupName', 'orderChannel', 'discountSummary.hasCoupon',
      'discountAmount', 'discountSummary.totalCouponDiscountAmount', 'useMileageAmount', 'useDepositAmount', 'rewardUseAmount',
      'syntheticYearLabel', 'lines.categoryCode', 'lines.goodsNo', 'lines.lineRevenue', 'lines.quantity', 'state.paid'
    ],
    availableMetrics: [
      m('revenue', '매출'), m('orderCount', '주문수'), m('averageOrderValue', '객단가'), m('quantity', '판매수량', ['orderLines']),
      m('discountAmount', '할인액'), m('couponDiscountAmount', '쿠폰 할인액'),
      m('couponUsageRateWithinOrders', '주문 내 쿠폰 사용률'), m('rewardUseAmount', '리워드 사용액'),
      m('rewardUsageRateWithinOrders', '주문 내 리워드 사용률'), m('revenueShare', '매출 비중'), m('orderShare', '주문 비중'),
      m('firstPurchaseRevenue', '첫구매 매출'), m('repeatPurchaseRevenue', '재구매 매출'),
      m('firstPurchaseOrderCount', '첫구매 주문수'), m('repeatPurchaseOrderCount', '재구매 주문수'),
      m('reviewCount', '리뷰수', ['reviews']), m('averageRating', '평균 평점', ['reviews']),
      m('inquiryCount', '문의수', ['inquiries']), m('claimCount', '클레임수', ['orders'])
    ],
    availableDimensions: [
      { key: 'time', label: '기간' }, { key: 'scenario', label: '시나리오(baseline/promotion)' },
      { key: 'couponUsage', label: '쿠폰 사용 여부' }, { key: 'memberGroup', label: '회원그룹' },
      { key: 'firstRepeat', label: '첫구매/재구매' }, { key: 'orderChannel', label: '주문채널' },
      { key: 'rewardUsage', label: '리워드 사용 여부' }, { key: 'product', label: '상품' },
      { key: 'category', label: '카테고리' }, { key: 'brand', label: '브랜드' },
      { key: 'reviewRating', label: '리뷰 평점대' }, { key: 'inquiryStatus', label: '문의 상태' }, { key: 'claimStatus', label: '클레임 상태' }
    ],
    unavailableMetrics: [
      { key: 'visitorConversionRate', label: '방문자 전환율', requiredData: ['visitorSessions'] },
      { key: 'productViewConversionRate', label: '상품조회 전환율', requiredData: ['productViewEvents'] },
      { key: 'cartAbandonmentRate', label: '장바구니 이탈률', requiredData: ['cartEvents'] },
      { key: 'ROAS', label: 'ROAS', requiredData: ['adSpend', 'campaignAttribution'] },
      { key: 'adCTR', label: '광고 CTR', requiredData: ['adClicks', 'adImpressions'] },
      { key: 'GA4Behavior', label: 'GA4 행동', requiredData: ['ga4'] },
      { key: 'SNSPerformance', label: 'SNS 성과', requiredData: ['snsMetrics'] },
      { key: 'signupToPurchaseConversionRate', label: '가입→구매 전환율', requiredData: ['memberSignupDate', 'signupCount'] }
    ]
  };
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────
const won = (n: number): string => `${Math.round(n).toLocaleString()}원`;
const numv = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const strv = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const boolv = (v: unknown): boolean => v === true || v === 'true' || v === 'y' || v === 1;

type Order = Record<string, unknown> & { lines?: Record<string, unknown>[] };
const isCounted = (o: Order): boolean => {
  const st = o.state as Record<string, unknown> | undefined;
  if (st && (st.paid !== undefined || st.canceled !== undefined)) return boolv(st.paid) && !boolv(st.canceled);
  if (o.paid !== undefined || o.canceled !== undefined) return boolv(o.paid) && !boolv(o.canceled);
  return numv(o.totalAmount) > 0;
};
const hasCoupon = (o: Order): boolean => { const d = o.discountSummary as Record<string, unknown> | undefined; return boolv(d?.hasCoupon); };
const usesReward = (o: Order): boolean => numv(o.useMileageAmount) > 0 || numv(o.useDepositAmount) > 0 || numv(o.rewardUseAmount) > 0;
const orderMs = (o: Order): number => { const t = Date.parse(strv(o.orderDate).replace(' ', 'T')); return Number.isNaN(t) ? NaN : t; };

// ── PII self-check ────────────────────────────────────────────────────────────
const FORBIDDEN_PII = ['name', 'customerName', 'phone', 'mobile', 'email', 'address', 'receiverName', 'receiverPhone', 'receiverAddress', 'memberKey'];
const FORBIDDEN_SET = new Set(FORBIDDEN_PII);
export function assertMarketingIntelligenceNoPii(value: unknown): { containsPii: boolean; checkedKeys: string[] } {
  const found = new Set<string>();
  const visit = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || depth > 7) return;
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return; }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN_SET.has(k)) found.add(k);
      if (typeof val === 'string' && /syn_member_/.test(val)) found.add('syn_member_');
      visit(val, depth + 1);
    }
  };
  visit(value, 0);
  return { containsPii: found.size > 0, checkedKeys: [...FORBIDDEN_PII, 'syn_member_'] };
}

// ── 메트릭 라벨/단위 ──────────────────────────────────────────────────────────
const METRIC_LABEL: Record<string, string> = {
  revenue: '매출', orderCount: '주문수', averageOrderValue: '객단가', quantity: '판매수량',
  discountAmount: '할인액', couponDiscountAmount: '쿠폰 할인액', couponUsageRateWithinOrders: '쿠폰 사용률',
  rewardUseAmount: '리워드 사용액', rewardUsageRateWithinOrders: '리워드 사용률', revenueShare: '매출 비중', orderShare: '주문 비중',
  firstPurchaseRevenue: '첫구매 매출', repeatPurchaseRevenue: '재구매 매출', firstPurchaseOrderCount: '첫구매 주문수', repeatPurchaseOrderCount: '재구매 주문수',
  reviewCount: '리뷰수', averageRating: '평균 평점', inquiryCount: '문의수', claimCount: '클레임수'
};
const unitOf = (metric: string): MarketingChartSpec['unit'] => {
  if (/Rate|Share/.test(metric)) return 'percent';
  if (/orderCount|quantity|reviewCount|inquiryCount|claimCount|OrderCount/.test(metric)) return 'count';
  if (metric === 'averageRating') return 'mixed';
  return 'krw';
};

// ── 질문 파서 ─────────────────────────────────────────────────────────────────
const PROXY_FOR: Record<string, string[]> = {
  signupToPurchaseConversionRate: ['firstPurchaseOrderCount', 'firstPurchaseRevenue', 'averageOrderValue', 'revenueShare'],
  visitorConversionRate: [],
  productViewConversionRate: [],
  cartAbandonmentRate: [],
  ROAS: [],
  adCTR: [],
  GA4Behavior: [],
  SNSPerformance: []
};
const UNAVAILABLE_KEYS = new Set(Object.keys(PROXY_FOR));

const detectGoal = (t: string): MarketingPlanGoal => {
  if (/관계|상관|연관|영향|있는지|낮은지|높은지|효과/.test(t)) {
    if (/효과/.test(t)) return 'diagnose';
    return 'relationship';
  }
  if (/전환율|전환/.test(t)) return 'conversion';
  if (/비중|구성비|비율|점유/.test(t)) return 'share';
  if (/순위|랭킹|top|많은|적은/.test(t)) return 'rank';
  if (/추이|흐름|트렌드|변화|월별|일별|주별|분기/.test(t)) return 'trend';
  if (/비교|대비|차이|vs|보다/.test(t)) return 'compare';
  return 'summary';
};

const detectMetrics = (t: string): string[] => {
  const out: string[] = [];
  if (/전환율/.test(t)) {
    if (/방문/.test(t)) out.push('visitorConversionRate');
    else if (/조회/.test(t)) out.push('productViewConversionRate');
    else out.push('signupToPurchaseConversionRate');
  }
  if (/roas/i.test(t)) out.push('ROAS');
  if (/장바구니/.test(t)) out.push('cartAbandonmentRate');
  if (/객단가|평균\s*구매|aov/i.test(t)) out.push('averageOrderValue');
  if (/사용률|사용율|사용\s*비율/.test(t) && /쿠폰/.test(t)) out.push('couponUsageRateWithinOrders');
  if (/사용률|사용율/.test(t) && /리워드|마일리지|예치금|포인트/.test(t)) out.push('rewardUsageRateWithinOrders');
  if (/비중|구성비|점유/.test(t)) out.push('revenueShare');
  if (/주문수|주문\s*건수|건수/.test(t)) out.push('orderCount');
  if (/할인/.test(t)) out.push('couponDiscountAmount');
  if (/리뷰|평점/.test(t)) out.push('reviewCount', 'averageRating');
  if (/문의/.test(t)) out.push('inquiryCount');
  if (/클레임|환불|취소/.test(t)) out.push('claimCount');
  if (/매출/.test(t) || out.length === 0) out.push('revenue');
  return [...new Set(out)];
};

const detectTimeBucket = (t: string): MarketingTimeBucket | undefined => {
  if (/일별/.test(t)) return 'day';
  if (/주별|주간/.test(t)) return 'week';
  if (/분기/.test(t)) return 'quarter';
  if (/연도별|년도별|연별/.test(t)) return 'year';
  if (/월별|매월|달별/.test(t)) return 'month';
  if (/baseline|promotion|시나리오/.test(t)) return 'scenario';
  return undefined;
};

// 연도/월범위 등 기간 추출 (deterministic). "2025년", "2026년 1월부터 6월" 등.
const detectPeriods = (t: string): MarketingPlannedPeriod[] => {
  const periods: MarketingPlannedPeriod[] = [];
  const years = [...t.matchAll(/((?:19|20)\d{2})\s*년/g)].map((mm) => mm[1]);
  const monthRange = t.match(/(\d{1,2})\s*월\s*(?:부터|~|-|에서)\s*(\d{1,2})\s*월/);
  const mStart = monthRange ? String(monthRange[1]).padStart(2, '0') : '01';
  const mEnd = monthRange ? String(monthRange[2]).padStart(2, '0') : '12';
  const lastDay = (y: string, mm: string): string => String(new Date(Number(y), Number(mm), 0).getDate()).padStart(2, '0');
  if (years.length >= 1) {
    for (const y of [...new Set(years)]) {
      periods.push({ label: `${y}년${monthRange ? ` ${Number(mStart)}~${Number(mEnd)}월` : ''}`, startDate: `${y}-${mStart}-01`, endDate: `${y}-${mEnd}-${lastDay(y, mEnd)}` });
    }
  }
  return periods;
};

const detectSegments = (t: string): MarketingPlannedSegment[] => {
  const out: MarketingPlannedSegment[] = [];
  if (/신규\s*회원|신규회원/.test(t)) out.push({ kind: 'memberGroup', key: '신규회원', label: '신규회원' });
  if (/vip/i.test(t)) out.push({ kind: 'memberGroup', key: 'VIP', label: 'VIP' });
  if (/재구매\s*회원|재구매회원/.test(t)) out.push({ kind: 'memberGroup', key: '재구매회원', label: '재구매회원' });
  return out;
};

const detectFilters = (t: string): MarketingPlannedFilter[] => {
  const out: MarketingPlannedFilter[] = [];
  if (/쿠폰\s*기간|프로모션\s*기간|promotion/i.test(t)) out.push({ kind: 'scenario', key: 'promotion', label: '프로모션년도' });
  if (/baseline|기준\s*년/i.test(t)) out.push({ kind: 'scenario', key: 'baseline', label: '기준년도' });
  return out;
};

const detectDimensions = (t: string): MarketingPlannedDimension[] => {
  const out: MarketingPlannedDimension[] = [];
  if (/쿠폰/.test(t)) out.push('couponUsage');
  if (/회원\s*그룹|회원그룹|등급별|그룹별/.test(t)) out.push('memberGroup'); // 명시적 그룹 축만(특정 그룹 언급은 segment)
  if (/첫구매|재구매/.test(t)) out.push('firstRepeat');
  if (/채널|네이버페이|페이코|자사몰/.test(t)) out.push('orderChannel');
  if (/리워드|마일리지|예치금|포인트/.test(t)) out.push('rewardUsage');
  if (/카테고리/.test(t)) out.push('category');
  if (/상품별|상품\s*매출|상품군/.test(t)) out.push('product');
  if (/baseline|promotion|시나리오/.test(t)) out.push('scenario');
  return [...new Set(out)];
};

const detectComparison = (t: string, periods: MarketingPlannedPeriod[], segs: MarketingPlannedSegment[]): MarketingIntelligencePlan['comparison'] => {
  if (/전년\s*대비|작년\s*대비|year.?over.?year|작년.*올해|올해.*작년/.test(t)) return 'year_over_year';
  if (periods.length >= 2) return 'year_over_year';
  if (/baseline.*promotion|promotion.*baseline|쿠폰\s*이벤트.*효과|쿠폰.*전후/.test(t)) return 'baseline_vs_promotion';
  if (/쿠폰\s*(사용|쓴).*(미사용|안\s*쓴)|쿠폰\s*vs/.test(t)) return 'coupon_vs_non_coupon';
  // 세그먼트 비교는 "비교 신호(보다/vs/대비)" 또는 2개 이상 그룹/일반회원 언급일 때만(단일 그룹 주어는 filter).
  if (segs.length >= 2 || (/보다|vs|대비/.test(t) && segs.length >= 1) || /일반회원/.test(t)) return 'segment_vs_segment';
  return 'none';
};

export function parseMarketingQuestionToPlan(input: { message: string; nowMs?: number; capabilityMap?: MarketingDataCapabilityMap }): MarketingIntelligencePlan {
  const t = (input.message || '').toLowerCase();
  const goal = detectGoal(t);
  const requestedMetrics = detectMetrics(t);
  const periods = detectPeriods(t);
  const segments = detectSegments(t);
  const filters = detectFilters(t);
  let dimensions = detectDimensions(t);
  const comparison = detectComparison(t, periods, segments);
  let timeBucket = detectTimeBucket(t);
  if (!timeBucket && (goal === 'compare' || goal === 'trend') && periods.length >= 2) timeBucket = 'month';
  // 세그먼트 비교 → memberGroup을 그룹 축으로(특정 그룹들은 series가 됨)
  if (comparison === 'segment_vs_segment' && !dimensions.includes('memberGroup')) dimensions = [...dimensions, 'memberGroup'];
  if (dimensions.length === 0 && comparison === 'coupon_vs_non_coupon') dimensions = ['couponUsage'];
  // 작년 대비(연도 비교)인데 명시 연도 없음 → baseline/promotion 시나리오 축으로
  if (comparison === 'year_over_year' && periods.length < 2 && !dimensions.some((d) => d !== 'time')) dimensions = [...dimensions, 'scenario'];

  const relationshipTargets = goal === 'relationship' || goal === 'diagnose'
    ? [{ xMetric: requestedMetrics.find((x) => /reviewCount|inquiryCount|averageRating/.test(x)) ?? requestedMetrics[0], yMetric: 'revenue', bucket: 'month' as const }]
    : undefined;

  const plan: MarketingIntelligencePlan = {
    id: `mkt_plan_${goal}`,
    originalQuestion: input.message,
    goal,
    requestedMetrics,
    executableMetrics: [],
    periods,
    timeBucket,
    dimensions,
    segments,
    filters,
    comparison,
    relationshipTargets,
    chartRecommendation: { chartType: 'table', reason: '' },
    dataRequirements: [],
    confidence: 'medium',
    warnings: []
  };
  plan.chartRecommendation = recommendMarketingChartForPlan(plan);
  return plan;
}

// ── Capability Validator ──────────────────────────────────────────────────────
export function validateMarketingIntelligencePlan(input: { plan: MarketingIntelligencePlan; capabilityMap: MarketingDataCapabilityMap }): MarketingIntelligencePlan {
  const { plan, capabilityMap } = input;
  const available = new Set(capabilityMap.availableMetrics.map((x) => x.key));
  const unavailable = new Map(capabilityMap.unavailableMetrics.map((x) => [x.key, x]));
  const executableMetrics: string[] = [];
  const dataRequirements: MarketingDataRequirement[] = [];
  const proxyMetrics: string[] = [];

  for (const metric of plan.requestedMetrics) {
    if (available.has(metric)) {
      executableMetrics.push(metric);
    } else if (unavailable.has(metric)) {
      const u = unavailable.get(metric)!;
      dataRequirements.push({ key: metric, label: u.label, reason: `${u.label}는 현재 주문·상품 데이터만으로는 정확히 계산하지 않습니다.`, requiredData: u.requiredData });
      for (const p of PROXY_FOR[metric] || []) if (available.has(p)) proxyMetrics.push(p);
    } else {
      executableMetrics.push(metric);
    }
  }
  if (executableMetrics.length === 0 && proxyMetrics.length === 0 && dataRequirements.length === 0) executableMetrics.push('revenue');

  const out: MarketingIntelligencePlan = { ...plan, executableMetrics: [...new Set(executableMetrics)], dataRequirements };

  if (dataRequirements.length > 0 && proxyMetrics.length > 0) {
    out.proxyPlan = {
      ...plan,
      id: `${plan.id}_proxy`,
      goal: plan.goal === 'conversion' ? 'summary' : plan.goal,
      requestedMetrics: [...new Set(proxyMetrics)],
      executableMetrics: [...new Set(proxyMetrics)],
      dimensions: plan.dimensions.length ? plan.dimensions : ['time'],
      dataRequirements: [],
      proxyPlan: undefined,
      warnings: ['정확 지표 대신 주문 기반 proxy 분석']
    };
    out.confidence = 'medium';
  }
  return out;
}

// ── 집계 (deterministic) ──────────────────────────────────────────────────────
type Acc = { revenue: number; orderCount: number; discount: number; coupon: number; reward: number; quantity: number; couponOrders: number; rewardOrders: number; firstOrders: number; firstRevenue: number; repeatOrders: number; repeatRevenue: number };
const newAcc = (): Acc => ({ revenue: 0, orderCount: 0, discount: 0, coupon: 0, reward: 0, quantity: 0, couponOrders: 0, rewardOrders: 0, firstOrders: 0, firstRevenue: 0, repeatOrders: 0, repeatRevenue: 0 });
const addOrder = (a: Acc, o: Order): void => {
  const amt = numv(o.totalAmount);
  a.revenue += amt; a.orderCount += 1;
  a.discount += numv(o.discountAmount); const ds = o.discountSummary as Record<string, unknown> | undefined; a.coupon += numv(ds?.totalCouponDiscountAmount);
  a.reward += numv(o.rewardUseAmount) || numv(o.useMileageAmount) + numv(o.useDepositAmount);
  for (const l of o.lines || []) a.quantity += numv(l.quantity);
  if (hasCoupon(o)) a.couponOrders += 1;
  if (usesReward(o)) a.rewardOrders += 1;
  if (boolv(o.isFirstPurchase)) { a.firstOrders += 1; a.firstRevenue += amt; } else { a.repeatOrders += 1; a.repeatRevenue += amt; }
};
const metricFromAcc = (a: Acc, metric: string, totals: { revenue: number; orderCount: number }): number => {
  switch (metric) {
    case 'revenue': return a.revenue;
    case 'orderCount': return a.orderCount;
    case 'averageOrderValue': return a.orderCount ? Math.round(a.revenue / a.orderCount) : 0;
    case 'quantity': return a.quantity;
    case 'discountAmount': return a.discount;
    case 'couponDiscountAmount': return a.coupon;
    case 'couponUsageRateWithinOrders': return a.orderCount ? +((a.couponOrders / a.orderCount) * 100).toFixed(1) : 0;
    case 'rewardUseAmount': return a.reward;
    case 'rewardUsageRateWithinOrders': return a.orderCount ? +((a.rewardOrders / a.orderCount) * 100).toFixed(1) : 0;
    case 'revenueShare': return totals.revenue ? +((a.revenue / totals.revenue) * 100).toFixed(1) : 0;
    case 'orderShare': return totals.orderCount ? +((a.orderCount / totals.orderCount) * 100).toFixed(1) : 0;
    case 'firstPurchaseRevenue': return a.firstRevenue;
    case 'repeatPurchaseRevenue': return a.repeatRevenue;
    case 'firstPurchaseOrderCount': return a.firstOrders;
    case 'repeatPurchaseOrderCount': return a.repeatOrders;
    default: return a.revenue;
  }
};

const passesPlanFilters = (o: Order, plan: MarketingIntelligencePlan): boolean => {
  const dimSet = new Set(plan.dimensions);
  // segment가 그룹 축(dimension)이면 filter가 아니라 비교 series → 건너뜀
  for (const s of plan.segments) if (s.kind === 'memberGroup' && !dimSet.has('memberGroup') && strv(o.memberGroupName) !== s.key) return false;
  for (const f of plan.filters) {
    if (f.kind === 'scenario') { if (dimSet.has('scenario')) continue; if (strv(o.syntheticYearLabel) !== f.key) return false; }
    if (f.kind === 'memberGroup' && !dimSet.has('memberGroup') && strv(o.memberGroupName) !== f.key) return false;
    if (f.kind === 'couponUsage') { const used = hasCoupon(o); if ((f.key === 'used') !== used) return false; }
  }
  return true;
};

// ── chartSpec 빌더 (집계 결과 → MarketingChartSpec) ───────────────────────────
const TIME_AXIS: Record<string, string> = { day: '일', week: '주', month: '월', quarter: '분기', year: '연도', scenario: '시나리오' };
const buildPlanChartSpec = (plan: MarketingIntelligencePlan, orders: Order[]): { chartSpec: MarketingChartSpec; evidence: MarketingIntelligenceEvidence[] } => {
  const primaryMetric = plan.executableMetrics[0] || 'revenue';
  const counted = orders.filter((o) => isCounted(o) && passesPlanFilters(o, plan));
  const totalsAll = { revenue: 0, orderCount: 0 };
  for (const o of counted) { totalsAll.revenue += numv(o.totalAmount); totalsAll.orderCount += 1; }

  type Cell = { seriesKey: string; seriesLabel: string; bucketKey: string; bucketLabel: string; acc: Acc };
  const cells = new Map<string, Cell>();
  const dim = plan.dimensions.find((d) => d !== 'time') as MarketingCrossTabDimension | undefined;
  const bucket = plan.timeBucket && plan.timeBucket !== 'scenario' ? plan.timeBucket : (plan.timeBucket === 'scenario' ? 'scenario' : undefined);
  const periodCompare = plan.comparison === 'year_over_year' && plan.periods.length >= 2;

  const resolveKeys = (o: Order): { seriesKey: string; seriesLabel: string; bucketKey: string; bucketLabel: string } | null => {
    if (periodCompare) {
      const ms = orderMs(o);
      const per = plan.periods.find((p) => { const s = p.startDate ? Date.parse(`${p.startDate}T00:00:00`) : -Infinity; const e = p.endDate ? Date.parse(`${p.endDate}T23:59:59`) : Infinity; return ms >= s && ms <= e; });
      if (!per) return null;
      const d = new Date(ms);
      return { seriesKey: per.label, seriesLabel: per.label, bucketKey: String(d.getMonth() + 1).padStart(2, '0'), bucketLabel: `${d.getMonth() + 1}월` };
    }
    let seriesKey = '전체', seriesLabel = '전체';
    if (dim) { const k = getMarketingDimensionKey(o, dim); seriesKey = k.key; seriesLabel = k.label; }
    let bucketKey = 'all', bucketLabel = '전체';
    if (bucket === 'scenario') { const y = strv(o.syntheticYearLabel); bucketKey = y || 'unknown'; bucketLabel = y === 'baseline' ? 'baseline' : y === 'promotion' ? 'promotion' : '미상'; }
    else if (bucket) { bucketKey = getMarketingTimeBucketKey(strv(o.orderDate), bucket); bucketLabel = bucketKey; }
    else if (dim) { bucketKey = seriesKey; bucketLabel = seriesLabel; }
    return { seriesKey, seriesLabel, bucketKey, bucketLabel };
  };

  for (const o of counted) {
    const keys = resolveKeys(o);
    if (!keys) continue;
    const ck = `${keys.seriesKey}|${keys.bucketKey}`;
    let cell = cells.get(ck);
    if (!cell) { cell = { ...keys, acc: newAcc() }; cells.set(ck, cell); }
    addOrder(cell.acc, o);
  }

  const seriesMap = new Map<string, MarketingChartSeries>();
  for (const cell of cells.values()) {
    let s = seriesMap.get(cell.seriesKey);
    if (!s) { s = { key: cell.seriesKey, label: cell.seriesLabel, metric: primaryMetric, points: [] }; seriesMap.set(cell.seriesKey, s); }
    s.points.push({ bucketKey: cell.bucketKey, bucketLabel: cell.bucketLabel, value: metricFromAcc(cell.acc, primaryMetric, totalsAll), orderCount: cell.acc.orderCount, revenue: cell.acc.revenue, averageOrderValue: cell.acc.orderCount ? Math.round(cell.acc.revenue / cell.acc.orderCount) : 0 });
  }
  for (const s of seriesMap.values()) s.points.sort((a, b) => a.bucketKey.localeCompare(b.bucketKey));
  const series = [...seriesMap.values()];

  const request: MarketingCrossTabRequest = { timeBucket: (plan.timeBucket ?? 'month'), dimensions: dim ? [dim] : [], metrics: plan.executableMetrics as unknown as MarketingCrossTabRequest['metrics'] };
  const chartSpec: MarketingChartSpec = {
    id: `mkt_chart_${plan.goal}`,
    title: planTitle(plan),
    subtitle: `${plan.timeBucket ? (TIME_AXIS[plan.timeBucket] + '별 · ') : ''}${METRIC_LABEL[primaryMetric] ?? primaryMetric}`,
    chartType: plan.chartRecommendation.chartType,
    primaryMetric,
    series,
    xAxisLabel: plan.timeBucket ? TIME_AXIS[plan.timeBucket] : undefined,
    yAxisLabel: METRIC_LABEL[primaryMetric] ?? primaryMetric,
    unit: unitOf(primaryMetric),
    source: 'temporal_crosstab',
    request,
    available: series.length > 0,
    evidence: [],
    warnings: counted.length < 20 ? ['표본 주문수가 적어 해석 시 주문수 확인이 필요합니다.'] : []
  };
  const evidence: MarketingIntelligenceEvidence[] = [
    { id: 'ev_orders', label: '분석 주문수(결제·미취소)', value: counted.length, source: 'orders' },
    { id: 'ev_revenue', label: '분석 매출', value: totalsAll.revenue, source: 'orders' },
    { id: 'ev_metric', label: '주 지표', value: METRIC_LABEL[primaryMetric] ?? primaryMetric, source: 'derived' },
    { id: 'ev_basis', label: '근거 데이터 조각', value: '주문일·주문금액·쿠폰 사용 여부·회원그룹·첫구매/재구매·시나리오', source: 'derived' }
  ];
  return { chartSpec, evidence };
};

const planTitle = (plan: MarketingIntelligencePlan): string => {
  const m = METRIC_LABEL[plan.executableMetrics[0] || 'revenue'] ?? '매출';
  const seg = plan.segments.map((s) => s.label).join('·');
  const tb = plan.timeBucket ? `${TIME_AXIS[plan.timeBucket]}별 ` : '';
  const cmp = plan.comparison === 'year_over_year' ? '연도 비교 ' : plan.comparison === 'coupon_vs_non_coupon' ? '쿠폰 사용/미사용 ' : plan.comparison === 'segment_vs_segment' ? '세그먼트 비교 ' : plan.comparison === 'baseline_vs_promotion' ? 'baseline/promotion ' : '';
  return `${seg ? seg + ' ' : ''}${tb}${cmp}${m}`.trim();
};

// ── Relationship Analysis ─────────────────────────────────────────────────────
export function buildMarketingRelationshipSummary(input: { rows: { bucketKey?: string; x: number; y: number }[]; xMetric: string; yMetric: string; bucketKey?: string }): MarketingRelationshipSummary {
  const rows = input.rows.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y));
  const n = rows.length;
  const notes: string[] = [];
  if (n < 3) return { xMetric: input.xMetric, yMetric: input.yMetric, correlation: null, direction: 'insufficient', sampleBuckets: n, notes: ['표본 구간이 적어 관계 해석이 어렵습니다.'] };
  const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
  const xs = rows.map((r) => r.x), ys = rows.map((r) => r.y);
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b; }
  const r = dx > 0 && dy > 0 ? +(num / Math.sqrt(dx * dy)).toFixed(3) : 0;
  const direction = Math.abs(r) < 0.2 ? 'mixed' : r > 0 ? 'co_move_up' : 'co_move_down';
  notes.push('상관계수는 관계의 강도를 보는 참고값이며, 원인을 증명하지 않습니다.');
  return { xMetric: input.xMetric, yMetric: input.yMetric, correlation: r, direction, sampleBuckets: n, notes };
}

// ── Chart Recommendation ──────────────────────────────────────────────────────
export type MarketingChartRecommendation = MarketingIntelligencePlan['chartRecommendation'];
export function recommendMarketingChartForPlan(plan: MarketingIntelligencePlan): MarketingChartRecommendation {
  const hasUnavailableOnly = plan.requestedMetrics.length > 0 && plan.requestedMetrics.every((m) => UNAVAILABLE_KEYS.has(m)) && !plan.proxyPlan;
  if (hasUnavailableOnly) return { chartType: 'unsupported', reason: '외부 데이터가 필요한 지표' };
  if (plan.goal === 'relationship') return { chartType: 'line', reason: '두 지표의 같은 기간 흐름 비교' };
  if (plan.goal === 'share') {
    const manyCats = plan.dimensions.includes('category') || plan.dimensions.includes('product');
    return manyCats ? { chartType: 'rankedBar', reason: '범주가 많은 구성비는 순위 막대' } : { chartType: 'donut', reason: '구성비' };
  }
  if (plan.goal === 'rank') return { chartType: 'rankedBar', reason: '순위' };
  if (plan.goal === 'trend' || (plan.timeBucket && !plan.dimensions.find((d) => d !== 'time') && plan.comparison === 'none')) return { chartType: 'line', reason: '시간 흐름' };
  if (plan.comparison === 'year_over_year' || plan.comparison === 'coupon_vs_non_coupon' || plan.comparison === 'segment_vs_segment' || plan.comparison === 'baseline_vs_promotion') return { chartType: 'groupedBar', reason: '두 그룹/기간 비교' };
  if (plan.timeBucket) return { chartType: 'groupedBar', reason: '기간별 비교' };
  return { chartType: 'rankedBar', reason: '범주 비교' };
}

// ── Plan Executor ─────────────────────────────────────────────────────────────
export function executeMarketingIntelligencePlan(input: { plan: MarketingIntelligencePlan; orders: unknown[]; products?: unknown[]; reviews?: unknown[]; inquiries?: unknown[]; nowMs?: number }): MarketingIntelligenceResult {
  const plan = input.plan;
  const orders = (input.orders || []) as Order[];

  if (plan.executableMetrics.length === 0 && plan.dataRequirements.length > 0 && !plan.proxyPlan) {
    const required = plan.dataRequirements;
    const unsupportedSpec: MarketingChartSpec = {
      id: `mkt_chart_${plan.goal}`, title: required[0]?.label ?? '지원하지 않는 분석', subtitle: '외부 데이터 연결 필요', chartType: 'unsupported',
      primaryMetric: 'revenue', series: [], source: 'temporal_crosstab', request: { timeBucket: 'month', dimensions: [], metrics: [] }, available: false,
      unavailableReason: required[0]?.reason, requiredData: required.flatMap((r) => r.requiredData), evidence: [], warnings: []
    };
    const narrative = buildIntelNarrative('required_data', [], unsupportedSpec, undefined, required);
    const result: MarketingIntelligenceResult = { plan, primaryChartSpec: unsupportedSpec, supportingChartSpecs: [], narrative, evidence: [], available: false, requiredData: required, piiCheck: { containsPii: false, checkedKeys: [] } };
    result.piiCheck = assertMarketingIntelligenceNoPii({ plan, primaryChartSpec: unsupportedSpec, narrative });
    return result;
  }

  const execPlan = plan.executableMetrics.length > 0 ? plan : (plan.proxyPlan ?? plan);
  const answerType: MarketingIntelligenceNarrative['answerType'] = plan.dataRequirements.length > 0 ? 'partial_with_proxy' : 'calculated';
  const { chartSpec, evidence } = buildPlanChartSpec(execPlan, orders);

  let relationshipSummary: MarketingRelationshipSummary | undefined;
  if ((plan.goal === 'relationship' || plan.goal === 'diagnose') && plan.relationshipTargets?.length) {
    relationshipSummary = buildRelationshipFromOrders(orders, input.reviews, input.inquiries, plan.relationshipTargets[0]);
  }

  const narrative = buildIntelNarrative(answerType, evidence, chartSpec, relationshipSummary, plan.dataRequirements);
  const result: MarketingIntelligenceResult = {
    plan, primaryChartSpec: chartSpec, supportingChartSpecs: [], narrative, evidence, ...(relationshipSummary ? { relationshipSummary } : {}),
    available: chartSpec.available, requiredData: plan.dataRequirements, piiCheck: { containsPii: false, checkedKeys: [] }
  };
  result.piiCheck = assertMarketingIntelligenceNoPii({ plan, primaryChartSpec: chartSpec, narrative, evidence, relationshipSummary });
  return result;
}

const buildRelationshipFromOrders = (orders: Order[], reviews?: unknown[], inquiries?: unknown[], target?: { xMetric: string; yMetric: string }): MarketingRelationshipSummary => {
  const x = target?.xMetric ?? 'inquiryCount';
  const revByGoods = new Map<string, number>();
  for (const o of orders) { if (!isCounted(o)) continue; for (const l of o.lines || []) { const g = strv(l.goodsNo); if (g) revByGoods.set(g, (revByGoods.get(g) || 0) + numv(l.lineRevenue)); } }
  const xByGoods = new Map<string, number>();
  const src = /inquiry/i.test(x) ? (inquiries || []) : (reviews || []);
  for (const r of src as Record<string, unknown>[]) {
    const g = strv(r.goodsNo) || strv(r.productId); if (!g) continue;
    const add = x === 'averageRating' ? numv(r.rating) : 1;
    xByGoods.set(g, (xByGoods.get(g) || 0) + add);
  }
  const rows = [...revByGoods.keys()].map((g) => ({ bucketKey: g, x: xByGoods.get(g) || 0, y: revByGoods.get(g) || 0 }));
  return buildMarketingRelationshipSummary({ rows, xMetric: x, yMetric: 'revenue' });
};

// ── Narrative Builder ─────────────────────────────────────────────────────────
const CAUSAL_CAUTION = '관찰된 차이는 가능성으로만 해석하며, 인과관계를 단정하지 않습니다.';
export function buildMarketingIntelligenceNarrative(input: { plan: MarketingIntelligencePlan; result: MarketingIntelligenceResult }): MarketingIntelligenceNarrative {
  return buildIntelNarrative(input.result.narrative.answerType, input.result.evidence, input.result.primaryChartSpec, input.result.relationshipSummary, input.result.requiredData);
}
function buildIntelNarrative(answerType: MarketingIntelligenceNarrative['answerType'], evidence: MarketingIntelligenceEvidence[], chartSpec: MarketingChartSpec, rel?: MarketingRelationshipSummary, required?: MarketingDataRequirement[]): MarketingIntelligenceNarrative {
  const title = chartSpec.title;
  const bullets: string[] = [];
  const relationshipNotes: string[] = [];
  const causalCautions: string[] = [CAUSAL_CAUTION];
  const reqKeys = (required || []).flatMap((r) => r.requiredData);

  let summary: string;
  if (answerType === 'required_data') {
    summary = `${title}는 현재 계산하지 않습니다. 정확한 지표에는 외부 데이터 연결이 필요합니다.`;
    bullets.push(`필요 데이터: ${reqKeys.join(', ')}`);
  } else if (answerType === 'partial_with_proxy') {
    summary = `정확한 지표(${(required || []).map((r) => r.label).join(', ')})는 아직 계산하지 않지만, 현재 주문 데이터로 가능한 대체(proxy) 분석은 다음과 같습니다.`;
    bullets.push(`필요 데이터: ${reqKeys.join(', ')}`);
  } else {
    summary = '현재 주문 데이터 기준으로 계산 가능합니다.';
  }

  for (const s of chartSpec.series.slice(0, 4)) {
    const last = s.points[s.points.length - 1];
    if (!last) continue;
    const v = chartSpec.unit === 'krw' ? won(last.value) : chartSpec.unit === 'percent' ? `${last.value}%` : `${last.value}건`;
    bullets.push(`${s.label}: ${METRIC_LABEL[chartSpec.primaryMetric] ?? chartSpec.primaryMetric} ${v}로 나타납니다.`);
  }
  if (rel) {
    if (rel.correlation === null) relationshipNotes.push('표본이 적어 관계 해석이 어렵습니다.');
    else relationshipNotes.push(`${METRIC_LABEL[rel.xMetric] ?? rel.xMetric}과 ${METRIC_LABEL[rel.yMetric] ?? rel.yMetric}의 상관계수는 ${rel.correlation}로 ${rel.direction === 'co_move_up' ? '같은 방향' : rel.direction === 'co_move_down' ? '반대 방향' : '뚜렷하지 않은'} 움직임이 관찰됩니다.`);
    relationshipNotes.push(...rel.notes);
  }
  const evNotes = evidence.map((e) => `${e.label}: ${typeof e.value === 'number' ? e.value.toLocaleString() : e.value}`);

  return {
    title,
    summary,
    answerType,
    bullets,
    evidence: evNotes,
    relationshipNotes,
    causalCautions,
    ...(reqKeys.length ? { requiredData: reqKeys } : {}),
    nextQuestions: answerType === 'partial_with_proxy' ? ['회원 가입일/방문 데이터가 연결되면 정확한 전환율을 계산할 수 있습니다.'] : undefined
  };
}

const toChartNarrative = (n: MarketingIntelligenceNarrative): MarketingChartNarrative => ({
  title: n.title,
  summary: n.summary,
  bullets: [...n.bullets, ...n.relationshipNotes],
  evidence: n.evidence,
  warnings: [...n.causalCautions, ...(n.answerType === 'required_data' ? ['외부 데이터 연결 필요'] : [])],
  ...(n.requiredData ? { requiredData: n.requiredData } : {})
});

// ── 단일 진입점 ───────────────────────────────────────────────────────────────
const ANALYSIS_SIGNAL = /매출|주문|객단가|쿠폰|할인|리워드|마일리지|예치금|회원|vip|신규|재구매|첫구매|채널|카테고리|상품|리뷰|평점|문의|클레임|전환|비중|비교|추이|월별|연도|작년|올해|baseline|promotion|roas|방문/i;

export function buildMarketingIntelligenceResponse(input: { message: string; orders: unknown[]; products?: unknown[]; reviews?: unknown[]; inquiries?: unknown[]; nowMs?: number }): {
  handled: boolean;
  plan: MarketingIntelligencePlan | null;
  result: MarketingIntelligenceResult | null;
  artifact: MarketingChatChartArtifact | null;
  reply: string | null;
} {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.message || !ANALYSIS_SIGNAL.test(input.message) || !(input.orders && input.orders.length)) {
    return { handled: false, plan: null, result: null, artifact: null, reply: null };
  }
  const capabilityMap = buildMarketingDataCapabilityMap();
  const parsed = parseMarketingQuestionToPlan({ message: input.message, nowMs, capabilityMap });
  const plan = validateMarketingIntelligencePlan({ plan: parsed, capabilityMap });
  return buildMarketingResponseFromPlan({ plan, orders: input.orders, products: input.products, reviews: input.reviews, inquiries: input.inquiries, nowMs, source: 'marketingIntelligencePlanner' });
}

// 검증된 plan → 실행 + chartSpec artifact + reply (deterministic / LLM adapter 공용 코어).
// narrative/evidence는 항상 deterministic builder가 생성한다(LLM이 narrative를 쓰지 않는다).
export function buildMarketingResponseFromPlan(input: { plan: MarketingIntelligencePlan; orders: unknown[]; products?: unknown[]; reviews?: unknown[]; inquiries?: unknown[]; nowMs?: number; source?: 'marketingIntelligencePlanner' | 'marketingLlmPlannerAdapter' }): {
  handled: boolean;
  plan: MarketingIntelligencePlan;
  result: MarketingIntelligenceResult;
  artifact: MarketingChatChartArtifact;
  reply: string;
} {
  const nowMs = input.nowMs ?? Date.now();
  const plan = input.plan;
  const result = executeMarketingIntelligencePlan({ plan, orders: input.orders, products: input.products, reviews: input.reviews, inquiries: input.inquiries, nowMs });
  const chartNarrative = toChartNarrative(result.narrative);
  const reply = renderIntelReply(result.narrative);
  const artifact: MarketingChatChartArtifact = {
    type: 'marketing_chart_spec',
    source: input.source ?? 'marketingIntelligencePlanner',
    intent: plan.goal,
    plan: { goal: plan.goal, requestedMetrics: plan.requestedMetrics, executableMetrics: plan.executableMetrics, timeBucket: plan.timeBucket, dimensions: plan.dimensions, comparison: plan.comparison, periods: plan.periods, segments: plan.segments, filters: plan.filters, dataRequirements: plan.dataRequirements },
    request: result.primaryChartSpec.request,
    chartSpec: result.primaryChartSpec,
    narrative: chartNarrative,
    evidence: result.evidence.map((e) => ({ id: e.id, label: e.label, value: e.value })),
    requiredData: result.requiredData.flatMap((r) => r.requiredData),
    createdAt: new Date(nowMs).toISOString()
  };
  return { handled: true, plan, result, artifact, reply };
}

function renderIntelReply(n: MarketingIntelligenceNarrative): string {
  const lines: string[] = [n.summary];
  if (n.bullets.length) { lines.push('', '핵심 관찰:'); for (const b of n.bullets.slice(0, 5)) lines.push(`- ${b}`); }
  if (n.relationshipNotes.length) { lines.push('', '관계 분석:'); for (const r of n.relationshipNotes.slice(0, 3)) lines.push(`- ${r}`); }
  if (n.evidence.length) lines.push('', `근거: ${n.evidence.slice(0, 5).join(' · ')}`);
  if (n.requiredData && n.requiredData.length) lines.push('', `필요 데이터: ${n.requiredData.join(', ')}`);
  lines.push('- 위 수치는 관찰값이며 인과관계를 단정하지 않습니다.');
  return lines.join('\n');
}
