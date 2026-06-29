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
export type MarketingInsightNarrativeSections = {
  headline: string;
  comparisonSummary: string[];
  largestGaps: string[];
  patternNotes: string[];
  possibleExplanations: string[];
  evidence: string[];
  requiredData: string[];
  nextQuestions: string[];
  causalCautions: string[];
};
export type MarketingComparisonInsights = {
  totalComparison?: string;
  largestGap?: string;
  strongestPeriod?: string;
  weakestPeriod?: string;
  trendNote?: string;
  evidence: string[];
  warnings: string[];
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
  sections?: MarketingInsightNarrativeSections;
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
  if (/카테고리|품목군/.test(t)) out.push('category');
  // 상품 분석 단위: "상품별/상품 매출/상품군/상품의/상품이/특정 상품/문의가 많은 상품/리뷰...상품" 등 폭넓게.
  if (/상품별|상품\s*매출|상품군|상품의|상품이|상품에|상품\s*중|어떤\s*상품|특정\s*상품|상품\s*순위|상품\b/.test(t)) out.push('product');
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
    // proxy는 계산 가능한 지표만 가지므로 chartRecommendation을 새로 산출(원 plan의 unsupported 상속 금지).
    out.proxyPlan.chartRecommendation = recommendMarketingChartForPlan(out.proxyPlan);
    out.confidence = 'medium';
  }
  return out;
}

// ── 집계 (deterministic) ──────────────────────────────────────────────────────
//   inquiryCount/reviewCount/ratingSum/claimCount는 상품/카테고리/브랜드(goods) 차원에서만 merge됨.
type Acc = { revenue: number; orderCount: number; discount: number; coupon: number; reward: number; quantity: number; couponOrders: number; rewardOrders: number; firstOrders: number; firstRevenue: number; repeatOrders: number; repeatRevenue: number; lineRevenue: number; inquiryCount: number; reviewCount: number; ratingSum: number; claimCount: number };
const newAcc = (): Acc => ({ revenue: 0, orderCount: 0, discount: 0, coupon: 0, reward: 0, quantity: 0, couponOrders: 0, rewardOrders: 0, firstOrders: 0, firstRevenue: 0, repeatOrders: 0, repeatRevenue: 0, lineRevenue: 0, inquiryCount: 0, reviewCount: 0, ratingSum: 0, claimCount: 0 });
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
    // 문의/리뷰/평점/클레임 — goods 차원에서 merge된 실제 연결값(아니면 0). revenue로 둔갑 금지.
    case 'inquiryCount': return a.inquiryCount;
    case 'reviewCount': return a.reviewCount;
    case 'averageRating': return a.reviewCount ? +(a.ratingSum / a.reviewCount).toFixed(2) : 0;
    case 'claimCount': return a.claimCount;
    // 미지원 metric은 revenue로 둔갑시키지 않고 0 (호출부에서 warning).
    default: return 0;
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

// ── 기간 필터 / 분석 차원 선택 (P0 계약 복구) ─────────────────────────────────
const GOODS_DIMS = new Set<string>(['product', 'category', 'brand']);
const dateWithinPeriods = (dateStr: string, periods: MarketingPlannedPeriod[]): boolean => {
  if (!periods || periods.length === 0) return true;
  const ms = Date.parse(strv(dateStr).replace(' ', 'T'));
  if (Number.isNaN(ms)) return false;
  for (const p of periods) {
    const s = p.startDate ? Date.parse(`${p.startDate}T00:00:00`) : -Infinity;
    const e = p.endDate ? Date.parse(`${p.endDate}T23:59:59`) : Infinity;
    if (ms >= s && ms <= e) return true;
  }
  return false;
};
export function isOrderWithinPlannedPeriods(order: Record<string, unknown>, periods: MarketingPlannedPeriod[]): boolean {
  return dateWithinPeriods(strv((order || {}).orderDate), periods);
}
// 관계/진단 질문은 product/category 같은 "분석 단위" 차원을 쿠폰/리워드 같은 조건 차원보다 우선.
const REL_DIM_PRIORITY = ['product', 'category', 'brand', 'memberGroup', 'orderChannel', 'couponUsage', 'firstRepeat', 'rewardUsage', 'scenario'];
export function choosePrimaryAnalysisDimension(plan: MarketingIntelligencePlan): MarketingPlannedDimension | null {
  const dims = plan.dimensions.filter((d) => d !== 'time');
  if (dims.length === 0) return null;
  if (plan.goal === 'relationship' || plan.goal === 'diagnose') {
    for (const d of REL_DIM_PRIORITY) if ((dims as string[]).includes(d)) return d as MarketingPlannedDimension;
  }
  return dims[0];
}

// ── chartSpec 빌더 (집계 결과 → MarketingChartSpec) ───────────────────────────
const TIME_AXIS: Record<string, string> = { day: '일', week: '주', month: '월', quarter: '분기', year: '연도', scenario: '시나리오' };
const REVIEW_INQUIRY_METRICS = new Set(['inquiryCount', 'reviewCount', 'averageRating']);
const buildPlanChartSpec = (plan: MarketingIntelligencePlan, orders: Order[], products: Record<string, unknown>[] = [], reviews: Record<string, unknown>[] = [], inquiries: Record<string, unknown>[] = []): { chartSpec: MarketingChartSpec; evidence: MarketingIntelligenceEvidence[] } => {
  const primaryMetric = plan.executableMetrics[0] || 'revenue';
  const warnings: string[] = [];
  const periodCompare = plan.comparison === 'year_over_year' && plan.periods.length >= 2;
  // P0-1: plan.periods를 항상 execution 필터로 적용(year_over_year도 union으로 두 기간 포함 → resolveKeys가 series 분리).
  const counted = orders.filter((o) => isCounted(o) && passesPlanFilters(o, plan) && isOrderWithinPlannedPeriods(o, plan.periods));

  const dim = choosePrimaryAnalysisDimension(plan);
  const bucket = plan.timeBucket && plan.timeBucket !== 'scenario' ? plan.timeBucket : (plan.timeBucket === 'scenario' ? 'scenario' : undefined);
  const goodsMode = !!dim && GOODS_DIMS.has(dim) && !periodCompare;

  type Cell = { seriesKey: string; seriesLabel: string; bucketKey: string; bucketLabel: string; acc: Acc };
  const cells = new Map<string, Cell>();
  const cellAcc = (sKey: string, sLabel: string, bKey: string, bLabel: string): Acc => {
    const ck = `${sKey}|${bKey}`;
    let c = cells.get(ck);
    if (!c) { c = { seriesKey: sKey, seriesLabel: sLabel, bucketKey: bKey, bucketLabel: bLabel, acc: newAcc() }; cells.set(ck, c); }
    return c.acc;
  };
  const calBucket = (dateStr: string): { key: string; label: string } => {
    if (bucket === 'scenario') return { key: 'all', label: '전체' }; // goods×scenario는 미지원 → 전체
    if (bucket) { const k = getMarketingTimeBucketKey(dateStr, bucket); return { key: k, label: k }; }
    return { key: 'all', label: '전체' };
  };

  let totalRevenue = 0;
  if (goodsMode) {
    // P0-3/4: 상품/카테고리/브랜드 = 라인(goods) 기반 집계. series=goods 차원, bucket=시간(또는 전체).
    const prodIndex = new Map<string, Record<string, unknown>>();
    for (const p of products) { const id = strv(p.productId) || strv(p.goodsNo); if (id) prodIndex.set(id, p); }
    const goodsKey = (goodsNo: string, goodsName?: string): { key: string; label: string } => {
      const p = prodIndex.get(goodsNo);
      if (dim === 'product') return { key: goodsNo || 'unknown', label: strv(p?.productName) || goodsName || `상품 ${goodsNo || '미상'}` };
      if (dim === 'category') { const c = strv(p?.categoryCode) || strv(p?.allCategoryCode) || 'uncategorized'; return { key: c, label: c === 'uncategorized' ? '미분류' : `카테고리 ${c}` }; }
      const b = strv(p?.brandCode) || 'unknown'; return { key: b, label: b !== 'unknown' ? `브랜드 ${b}` : '브랜드 미연동' };
    };
    for (const o of counted) {
      const cb = calBucket(strv(o.orderDate));
      const oCoupon = hasCoupon(o), oReward = usesReward(o), oFirst = boolv(o.isFirstPurchase);
      for (const l of (o.lines || []) as Record<string, unknown>[]) {
        const g = strv(l.goodsNo);
        const k = goodsKey(g, strv(l.goodsName));
        const acc = cellAcc(k.key, k.label, cb.key, cb.label);
        const lr = numv(l.lineRevenue);
        acc.revenue += lr; acc.lineRevenue += lr; acc.orderCount += 1; acc.quantity += numv(l.quantity);
        if (oCoupon) acc.couponOrders += 1; if (oReward) acc.rewardOrders += 1;
        if (oFirst) { acc.firstOrders += 1; acc.firstRevenue += lr; } else { acc.repeatOrders += 1; acc.repeatRevenue += lr; }
        totalRevenue += lr;
      }
    }
    // 문의/리뷰 merge — 같은 goods key + 기간 내. 시간버킷이 있으면 createdAt으로 분해.
    const mergeRows = (rows: Record<string, unknown>[], kind: 'inquiry' | 'review'): void => {
      for (const r of rows) {
        const g = strv(r.goodsNo) || strv(r.productId); if (!g) continue;
        const created = strv(r.createdAt);
        if (!dateWithinPeriods(created, plan.periods)) continue;
        const k = goodsKey(g);
        const cb = bucket && bucket !== 'scenario' ? calBucket(created) : { key: 'all', label: '전체' };
        const acc = cellAcc(k.key, k.label, cb.key, cb.label);
        if (kind === 'inquiry') acc.inquiryCount += 1; else { acc.reviewCount += 1; acc.ratingSum += numv(r.rating); }
      }
    };
    if (plan.executableMetrics.some((m) => REVIEW_INQUIRY_METRICS.has(m)) || plan.goal === 'relationship' || plan.goal === 'diagnose') {
      mergeRows(inquiries, 'inquiry'); mergeRows(reviews, 'review');
    }
  } else {
    // 주문 기반 집계(시간/쿠폰/회원그룹/시나리오 등). goods 전용 metric은 여기서 0 + warning.
    for (const o of counted) {
      let sKey = '전체', sLabel = '전체';
      let bKey = 'all', bLabel = '전체';
      if (periodCompare) {
        const ms = orderMs(o);
        const per = plan.periods.find((p) => dateWithinPeriods(strv(o.orderDate), [p]));
        if (!per || Number.isNaN(ms)) continue;
        const d = new Date(ms);
        sKey = per.label; sLabel = per.label; bKey = String(d.getMonth() + 1).padStart(2, '0'); bLabel = `${d.getMonth() + 1}월`;
      } else {
        if (dim) { const k = getMarketingDimensionKey(o, dim as MarketingCrossTabDimension); sKey = k.key; sLabel = k.label; }
        if (bucket === 'scenario') { const y = strv(o.syntheticYearLabel); bKey = y || 'unknown'; bLabel = y === 'baseline' ? 'baseline' : y === 'promotion' ? 'promotion' : '미상'; }
        else if (bucket) { bKey = getMarketingTimeBucketKey(strv(o.orderDate), bucket); bLabel = bKey; }
        else if (dim) { bKey = sKey; bLabel = sLabel; }
      }
      addOrder(cellAcc(sKey, sLabel, bKey, bLabel), o);
      totalRevenue += numv(o.totalAmount);
    }
    if (plan.executableMetrics.some((m) => REVIEW_INQUIRY_METRICS.has(m))) {
      warnings.push('문의/리뷰/평점 지표는 상품·카테고리·브랜드 축에서만 집계됩니다(현재 축에서는 0으로 표시).');
    }
  }
  if (plan.executableMetrics.includes('claimCount')) warnings.push('클레임 수는 현재 데이터로 정확히 집계하지 않아 0으로 표시됩니다(필요: claimData).');

  const totalsAll = { revenue: totalRevenue, orderCount: counted.length };
  const seriesMap = new Map<string, MarketingChartSeries>();
  for (const cell of cells.values()) {
    let s = seriesMap.get(cell.seriesKey);
    if (!s) { s = { key: cell.seriesKey, label: cell.seriesLabel, metric: primaryMetric, points: [] }; seriesMap.set(cell.seriesKey, s); }
    s.points.push({ bucketKey: cell.bucketKey, bucketLabel: cell.bucketLabel, value: metricFromAcc(cell.acc, primaryMetric, totalsAll), orderCount: cell.acc.orderCount, revenue: cell.acc.revenue, averageOrderValue: cell.acc.orderCount ? Math.round(cell.acc.revenue / cell.acc.orderCount) : 0 });
  }
  // rankedBar(순위)면 값 큰 순 정렬, 그 외엔 bucketKey 정렬.
  for (const s of seriesMap.values()) s.points.sort((a, b) => a.bucketKey.localeCompare(b.bucketKey));
  const series = [...seriesMap.values()];

  const request: MarketingCrossTabRequest = { timeBucket: (plan.timeBucket ?? 'month'), dimensions: dim ? [dim as MarketingCrossTabDimension] : [], metrics: plan.executableMetrics as unknown as MarketingCrossTabRequest['metrics'] };
  if (counted.length < 20) warnings.push('표본 주문수가 적어 해석 시 주문수 확인이 필요합니다.');
  const chartSpec: MarketingChartSpec = {
    id: `mkt_chart_${plan.goal}`,
    title: planTitle(plan),
    subtitle: `${plan.timeBucket ? (TIME_AXIS[plan.timeBucket] + '별 · ') : ''}${METRIC_LABEL[primaryMetric] ?? primaryMetric}`,
    chartType: plan.chartRecommendation.chartType,
    primaryMetric,
    series,
    xAxisLabel: plan.timeBucket ? TIME_AXIS[plan.timeBucket] : (dim ? (METRIC_LABEL[dim] ?? dim) : undefined),
    yAxisLabel: METRIC_LABEL[primaryMetric] ?? primaryMetric,
    unit: unitOf(primaryMetric),
    source: 'temporal_crosstab',
    request,
    available: series.length > 0,
    evidence: [],
    warnings
  };
  const periodLabel = plan.periods.length ? plan.periods.map((p) => p.label).join(' / ') : '전체 기간';
  const evidence: MarketingIntelligenceEvidence[] = [
    { id: 'ev_orders', label: '분석 주문수(결제·미취소)', value: counted.length, source: 'orders' },
    { id: 'ev_revenue', label: '분석 매출', value: totalsAll.revenue, source: goodsMode ? 'orderLines' : 'orders' },
    { id: 'ev_period', label: '분석 기간', value: periodLabel, source: 'derived' },
    { id: 'ev_metric', label: '주 지표', value: METRIC_LABEL[primaryMetric] ?? primaryMetric, source: 'derived' },
    { id: 'ev_basis', label: '근거 데이터 조각', value: goodsMode ? '주문라인·상품·문의/리뷰(집계)·기간' : '주문일·주문금액·쿠폰 사용 여부·회원그룹·첫구매/재구매·시나리오', source: 'derived' }
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

// ── 비교 분석 인사이트 (단순 낭독 → 차이/최대격차/패턴) ───────────────────────
const pct = (a: number, b: number): string => (b !== 0 ? `${a - b >= 0 ? '+' : ''}${(((a - b) / Math.abs(b)) * 100).toFixed(1)}%` : 'n/a');
export function buildMarketingComparisonInsights(input: { chartSpec: MarketingChartSpec; plan: MarketingIntelligencePlan }): MarketingComparisonInsights {
  const cs = input.chartSpec;
  const out: MarketingComparisonInsights = { evidence: [], warnings: [] };
  if (!cs.available || cs.series.length === 0) return out;
  const fmt = (v: number): string => (cs.unit === 'krw' ? won(v) : cs.unit === 'percent' ? `${v}%` : `${Math.round(v)}건`);
  const total = (s: MarketingChartSeries): number => { let t = 0; for (const p of s.points) t += p.value; return t; };
  const series = [...cs.series].sort((a, b) => total(b) - total(a));

  // 1) 시리즈 총합 비교 (상위 2개)
  if (series.length >= 2) {
    const a = series[0], b = series[1];
    const ta = total(a), tb = total(b);
    out.totalComparison = `${a.label}(${fmt(ta)})이(가) ${b.label}(${fmt(tb)})보다 ${ta >= tb ? '높게' : '낮게'} 나타납니다(차이 ${fmt(Math.abs(ta - tb))}, ${pct(ta, tb)}).`;
    out.evidence.push(`${a.label} 총합 ${fmt(ta)}`, `${b.label} 총합 ${fmt(tb)}`);
    // 2) 같은 버킷에서 차이가 가장 큰 구간
    const bmapA = new Map(a.points.map((p) => [p.bucketKey, p]));
    let gapBucket = '', gapVal = -1, gapLabel = '';
    for (const pb of b.points) { const pa = bmapA.get(pb.bucketKey); if (!pa) continue; const g = Math.abs(pa.value - pb.value); if (g > gapVal) { gapVal = g; gapBucket = pb.bucketKey; gapLabel = pa.bucketLabel; } }
    if (gapBucket) { const pa = bmapA.get(gapBucket)!; const pb = b.points.find((p) => p.bucketKey === gapBucket)!; out.largestGap = `가장 큰 차이가 나타난 구간은 ${gapLabel}로, ${a.label} ${fmt(pa.value)} vs ${b.label} ${fmt(pb.value)}(차이 ${fmt(gapVal)})입니다.`; }
    // 우세 버킷 수
    let aWins = 0, compared = 0;
    for (const pb of b.points) { const pa = bmapA.get(pb.bucketKey); if (!pa) continue; compared++; if (pa.value > pb.value) aWins++; }
    if (compared > 0) out.trendNote = `비교 가능한 ${compared}개 구간 중 ${aWins}개에서 ${a.label}이(가) 더 높게 나타납니다.`;
  } else {
    const a = series[0];
    out.totalComparison = `${a.label} 총합은 ${fmt(total(a))}로 나타납니다.`;
  }

  // 3) 최고/최저 구간 (주 시리즈 기준)
  const main = series[0];
  if (main.points.length >= 2) {
    let hi = main.points[0], lo = main.points[0];
    for (const p of main.points) { if (p.value > hi.value) hi = p; if (p.value < lo.value) lo = p; }
    out.strongestPeriod = `${main.label} 기준 가장 높은 구간은 ${hi.bucketLabel}(${fmt(hi.value)})입니다.`;
    out.weakestPeriod = `${main.label} 기준 가장 낮은 구간은 ${lo.bucketLabel}(${fmt(lo.value)})입니다.`;
  }

  // 4) 표본 적은 구간 경고
  let lowBuckets = 0;
  for (const s of cs.series) for (const p of s.points) if ((p.orderCount ?? 0) > 0 && (p.orderCount ?? 0) <= 5) lowBuckets++;
  if (lowBuckets > 0) out.warnings.push(`주문수가 적은(5건 이하) 구간이 ${lowBuckets}개 있어 해석 시 주문수 확인이 필요합니다.`);
  return out;
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
  // 비교형(연도/쿠폰/세그먼트/시나리오)은 groupedBar 우선 — 각 구간 차이를 나란히 보는 게 핵심(line보다 비교력↑).
  if (plan.comparison && plan.comparison !== 'none') {
    if (plan.comparison === 'year_over_year' && plan.timeBucket === 'month' && plan.periods.length >= 2)
      return { chartType: 'groupedBar', reason: '월별 연도 비교는 각 월의 차이를 나란히 보는 것이 중요하므로 groupedBar가 적합합니다.' };
    return { chartType: 'groupedBar', reason: '두 그룹/기간을 나란히 비교하는 groupedBar가 적합합니다.' };
  }
  // 비교가 아닌 시간 흐름 → line
  if (plan.goal === 'trend' || (plan.timeBucket && !plan.dimensions.find((d) => d !== 'time'))) return { chartType: 'line', reason: '시간 흐름' };
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
  const { chartSpec, evidence } = buildPlanChartSpec(execPlan, orders, (input.products || []) as Record<string, unknown>[], (input.reviews || []) as Record<string, unknown>[], (input.inquiries || []) as Record<string, unknown>[]);

  let relationshipSummary: MarketingRelationshipSummary | undefined;
  if ((plan.goal === 'relationship' || plan.goal === 'diagnose') && plan.relationshipTargets?.length) {
    relationshipSummary = buildRelationshipFromOrders(orders, input.reviews, input.inquiries, plan.relationshipTargets[0]);
  }

  const comparison = (plan.goal === 'compare' || plan.goal === 'trend' || plan.goal === 'diagnose' || plan.goal === 'summary' || plan.goal === 'share')
    ? buildMarketingComparisonInsights({ chartSpec, plan: execPlan })
    : undefined;
  const narrative = buildIntelNarrative(answerType, evidence, chartSpec, relationshipSummary, plan.dataRequirements, comparison);
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
function buildIntelNarrative(answerType: MarketingIntelligenceNarrative['answerType'], evidence: MarketingIntelligenceEvidence[], chartSpec: MarketingChartSpec, rel?: MarketingRelationshipSummary, required?: MarketingDataRequirement[], comparison?: MarketingComparisonInsights): MarketingIntelligenceNarrative {
  const title = chartSpec.title;
  const bullets: string[] = [];
  const relationshipNotes: string[] = [];
  const causalCautions: string[] = [CAUSAL_CAUTION];
  const reqKeys = (required || []).flatMap((r) => r.requiredData);
  const comparisonSummary: string[] = [];
  const largestGaps: string[] = [];
  const patternNotes: string[] = [];

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

  // 비교 인사이트(단순 낭독 대신 총합/차이/최대격차/패턴)
  if (comparison) {
    if (comparison.totalComparison) { comparisonSummary.push(comparison.totalComparison); bullets.push(comparison.totalComparison); }
    if (comparison.largestGap) { largestGaps.push(comparison.largestGap); bullets.push(comparison.largestGap); }
    if (comparison.trendNote) { patternNotes.push(comparison.trendNote); bullets.push(comparison.trendNote); }
    if (comparison.strongestPeriod) patternNotes.push(comparison.strongestPeriod);
    if (comparison.weakestPeriod) patternNotes.push(comparison.weakestPeriod);
  }
  // 비교 인사이트가 빈약하면 series 수치 보조 표시
  if (comparisonSummary.length === 0) {
    for (const s of chartSpec.series.slice(0, 4)) {
      const last = s.points[s.points.length - 1];
      if (!last) continue;
      const v = chartSpec.unit === 'krw' ? won(last.value) : chartSpec.unit === 'percent' ? `${last.value}%` : `${last.value}건`;
      bullets.push(`${s.label}: ${METRIC_LABEL[chartSpec.primaryMetric] ?? chartSpec.primaryMetric} ${v}로 나타납니다.`);
    }
  }
  if (rel) {
    if (rel.correlation === null) relationshipNotes.push('표본이 적어 관계 해석이 어렵습니다.');
    else relationshipNotes.push(`${METRIC_LABEL[rel.xMetric] ?? rel.xMetric}과 ${METRIC_LABEL[rel.yMetric] ?? rel.yMetric}의 상관계수는 ${rel.correlation}로 ${rel.direction === 'co_move_up' ? '같은 방향' : rel.direction === 'co_move_down' ? '반대 방향' : '뚜렷하지 않은'} 움직임이 관찰됩니다.`);
    relationshipNotes.push(...rel.notes);
  }
  const evNotes = evidence.map((e) => `${e.label}: ${typeof e.value === 'number' ? e.value.toLocaleString() : e.value}`);
  if (comparison) for (const ev of comparison.evidence) evNotes.push(ev);
  const warnings = comparison ? comparison.warnings : [];
  // 가능한 해석(인과 단정 아님)
  const possibleExplanations = comparisonSummary.length > 0
    ? ['관찰된 차이의 배경을 확정하려면 쿠폰 노출/방문자/광고비 등 추가 데이터가 필요합니다.']
    : [];
  const nextQuestions = answerType === 'partial_with_proxy'
    ? ['회원 가입일/방문 데이터가 연결되면 정확한 전환율을 계산할 수 있습니다.']
    : (comparisonSummary.length > 0 ? ['차이가 큰 구간의 쿠폰/채널/세그먼트 분해를 추가로 볼 수 있습니다.'] : undefined);

  const sections: MarketingInsightNarrativeSections = {
    headline: summary,
    comparisonSummary,
    largestGaps,
    patternNotes,
    possibleExplanations,
    evidence: evNotes,
    requiredData: reqKeys,
    nextQuestions: nextQuestions ?? [],
    causalCautions
  };

  return {
    title,
    summary,
    answerType,
    bullets: [...bullets, ...warnings],
    evidence: evNotes,
    relationshipNotes,
    causalCautions,
    ...(reqKeys.length ? { requiredData: reqKeys } : {}),
    nextQuestions,
    sections
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
