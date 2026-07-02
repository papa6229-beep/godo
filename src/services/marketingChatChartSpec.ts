// Marketing Chat-Driven ChartSpec Bridge v0 — 자연어 질문 → intent → CrossTabRequest →
//   buildMarketingTemporalCrosstab → chartSpec + narrative 의 순수 함수 bridge.
//
// 이번 v0는 "계약 + 계산"만. 중앙 대시보드 UI에 실제 그래프를 렌더하지 않는다(다음 작업).
//
// 원칙:
//   - 주문/고객/상품/매출 조합으로 계산 가능한 질문은 절대 "데이터 없음"으로 답하지 않는다.
//   - 외부(ROAS/방문/상품조회/장바구니/GA4/광고/SNS) 데이터는 requiredData로만 안내(추정/0 금지).
//   - PII(name/phone/email/address/memberKey) 미노출. 인과관계 단정 금지(관찰 표현만). Math.random 미사용.

import {
  buildMarketingTemporalCrosstab,
  type MarketingCrossTabRequest,
  type MarketingCrossTabResult,
  type MarketingCrossTabRow
} from './marketingTemporalCrosstab';

export type { MarketingCrossTabRequest } from './marketingTemporalCrosstab';

// ── ChartSpec 타입 ────────────────────────────────────────────────────────────
export type MarketingChartType = 'line' | 'groupedBar' | 'stackedBar' | 'donut' | 'rankedBar' | 'table' | 'unsupported';

export type MarketingChartSeries = {
  key: string;
  label: string;
  metric: string;
  points: {
    bucketKey: string;
    bucketLabel: string;
    value: number;
    orderCount?: number;
    quantity?: number;
    revenue?: number;
    averageOrderValue?: number;
    notes?: string[];
  }[];
};

export type MarketingChartSpec = {
  id: string;
  title: string;
  subtitle: string;
  chartType: MarketingChartType;
  primaryMetric: string;
  series: MarketingChartSeries[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  unit?: 'krw' | 'count' | 'percent' | 'mixed';
  source: 'temporal_crosstab';
  request: MarketingCrossTabRequest;
  available: boolean;
  unavailableReason?: string;
  requiredData?: string[];
  evidence: string[];
  warnings: string[];
};

export type MarketingChartNarrative = {
  title: string;
  summary: string;
  bullets: string[];
  evidence: string[];
  warnings: string[];
  requiredData?: string[];
};

// ── intent ────────────────────────────────────────────────────────────────────
export type MarketingChartIntent =
  | 'monthly_coupon_aov'
  | 'yearly_revenue_compare'
  | 'scenario_revenue_compare'
  | 'member_group_revenue'
  | 'monthly_first_repeat'
  | 'monthly_order_channel'
  | 'monthly_reward_aov'
  | 'category_revenue_trend'
  | 'top_product_trend'
  | 'unsupported_roas'
  | 'unsupported_visitor_conversion'
  | 'unsupported_product_view_conversion'
  | 'unsupported_cart_abandonment'
  | 'unknown';

const won = (n: number): string => `${Math.round(n).toLocaleString()}원`;

// 외부 데이터 필요(미계산) intent → requiredData / 사유
const UNSUPPORTED: Record<string, { requiredData: string[]; reason: string }> = {
  unsupported_roas: { requiredData: ['adSpend', 'campaignAttribution'], reason: 'ROAS는 광고비와 캠페인 attribution 데이터가 필요해 현재 고도몰 주문·상품 데이터만으로는 산출할 수 없습니다.' },
  unsupported_visitor_conversion: { requiredData: ['visitorSessions'], reason: '방문→주문 전환율은 방문자 세션 데이터가 필요합니다.' },
  unsupported_product_view_conversion: { requiredData: ['productViewEvents'], reason: '상품조회→구매 전환율은 상품 조회 이벤트 데이터가 필요합니다.' },
  unsupported_cart_abandonment: { requiredData: ['cartEvents'], reason: '장바구니 이탈률은 장바구니 이벤트 데이터가 필요합니다.' }
};

// ── intent 감지 (외부 데이터 우선 → 지원 의도 → unknown) ──────────────────────
export function detectMarketingChartIntent(message: string): MarketingChartIntent {
  const t = (message || '').toLowerCase();
  // 1) 외부 데이터 필요(미계산)
  if (/상품\s*조회\s*전환|조회수?\s*전환|상품조회\s*전환|product\s*view/i.test(t)) return 'unsupported_product_view_conversion';
  if (/방문자?\s*전환|방문\s*전환|방문→\s*주문|visitor\s*conversion/i.test(t)) return 'unsupported_visitor_conversion';
  if (/장바구니\s*(이탈|포기)|cart\s*abandon/i.test(t)) return 'unsupported_cart_abandonment';
  if (/roas|광고\s*수익|광고비\s*대비|투자\s*대비\s*수익/i.test(t)) return 'unsupported_roas';
  // 2) 지원 의도
  if (/쿠폰/i.test(t)) return 'monthly_coupon_aov';
  if (/baseline|promotion|기준\s*년|프로모션\s*년|기준년도|프로모션년도/i.test(t)) return 'scenario_revenue_compare';
  if ((/작년|지난\s*해|전년/.test(t) && /올해|금년|올\s*해/.test(t)) || /연도별\s*매출|년도별\s*매출|연\s*별\s*매출/.test(t)) return 'yearly_revenue_compare';
  if (/회원\s*그룹|회원그룹|등급별|그룹별|vip/i.test(t)) return 'member_group_revenue';
  if (/첫\s*구매|재구매|신규\s*구매|first\s*purchase|repeat\s*purchase/i.test(t)) return 'monthly_first_repeat';
  if (/주문\s*채널|채널별|네이버페이|페이코|자사몰/i.test(t)) return 'monthly_order_channel';
  if (/마일리지|적립금|예치금|리워드|포인트/i.test(t)) return 'monthly_reward_aov';
  if (/카테고리|category/i.test(t)) return 'category_revenue_trend';
  if (/상품별|상품\s*매출|인기\s*상품|베스트\s*상품|상품\s*(추이|랭킹|순위)|top\s*product/i.test(t)) return 'top_product_trend';
  return 'unknown';
}

const isUnsupportedIntent = (intent: MarketingChartIntent): boolean => intent.startsWith('unsupported_') || intent === 'unknown';

// ── intent → CrossTabRequest ──────────────────────────────────────────────────
export function buildMarketingCrossTabRequestFromIntent(intent: MarketingChartIntent): MarketingCrossTabRequest | null {
  switch (intent) {
    case 'monthly_coupon_aov':
      return { timeBucket: 'month', dimensions: ['couponUsage'], metrics: ['averageOrderValue', 'orderCount', 'revenue', 'couponDiscountAmount'] };
    case 'yearly_revenue_compare':
      return { timeBucket: 'year', dimensions: ['scenario'], metrics: ['revenue', 'orderCount', 'averageOrderValue'] };
    case 'scenario_revenue_compare':
      return { timeBucket: 'scenario', dimensions: ['scenario'], metrics: ['revenue', 'orderCount', 'averageOrderValue', 'couponDiscountAmount'] };
    case 'member_group_revenue':
      return { timeBucket: 'year', dimensions: ['memberGroup'], metrics: ['revenue', 'orderCount', 'averageOrderValue', 'revenueShare'] };
    case 'monthly_first_repeat':
      return { timeBucket: 'month', dimensions: ['firstRepeat'], metrics: ['revenue', 'orderCount', 'averageOrderValue'] };
    case 'monthly_order_channel':
      return { timeBucket: 'month', dimensions: ['orderChannel'], metrics: ['revenue', 'orderCount', 'averageOrderValue'] };
    case 'monthly_reward_aov':
      return { timeBucket: 'month', dimensions: ['rewardUsage'], metrics: ['averageOrderValue', 'orderCount', 'rewardUseAmount'] };
    case 'category_revenue_trend':
      return { timeBucket: 'month', dimensions: ['category'], metrics: ['revenue', 'orderCount', 'quantity'], limit: 5 };
    case 'top_product_trend':
      return { timeBucket: 'month', dimensions: ['product'], metrics: ['revenue', 'orderCount', 'quantity'], limit: 5 };
    default:
      return null; // unsupported_* / unknown
  }
}

// intent별 차트 타입 / 주 지표
const INTENT_CHART: Record<string, { chartType: MarketingChartType; primaryMetric: string; title: string }> = {
  monthly_coupon_aov: { chartType: 'groupedBar', primaryMetric: 'averageOrderValue', title: '월별 쿠폰 사용/미사용 객단가' },
  yearly_revenue_compare: { chartType: 'groupedBar', primaryMetric: 'revenue', title: '연도별 매출 비교' },
  scenario_revenue_compare: { chartType: 'groupedBar', primaryMetric: 'revenue', title: 'baseline vs promotion 매출' },
  member_group_revenue: { chartType: 'rankedBar', primaryMetric: 'revenue', title: '회원그룹별 매출' },
  monthly_first_repeat: { chartType: 'groupedBar', primaryMetric: 'revenue', title: '월별 첫구매/재구매 매출' },
  monthly_order_channel: { chartType: 'line', primaryMetric: 'revenue', title: '월별 주문채널 매출' },
  monthly_reward_aov: { chartType: 'groupedBar', primaryMetric: 'averageOrderValue', title: '월별 리워드 사용/미사용 객단가' },
  category_revenue_trend: { chartType: 'rankedBar', primaryMetric: 'revenue', title: '카테고리별 월별 매출' },
  top_product_trend: { chartType: 'rankedBar', primaryMetric: 'revenue', title: '상품 매출 추이' }
};

const METRIC_LABEL: Record<string, string> = {
  averageOrderValue: '객단가', revenue: '매출', orderCount: '주문수', quantity: '수량',
  couponDiscountAmount: '쿠폰 할인액', rewardUseAmount: '리워드 사용액', revenueShare: '매출 비중(%)'
};
const unitOf = (metric: string): MarketingChartSpec['unit'] =>
  metric === 'orderCount' || metric === 'quantity' ? 'count' : metric === 'revenueShare' ? 'percent' : 'krw';

const metricVal = (row: MarketingCrossTabRow, metric: string): number => {
  switch (metric) {
    case 'averageOrderValue': return row.averageOrderValue;
    case 'revenue': return row.revenue;
    case 'orderCount': return row.orderCount;
    case 'quantity': return row.quantity ?? 0;
    case 'couponDiscountAmount': return row.couponDiscountAmount;
    case 'rewardUseAmount': return row.rewardUseAmount;
    case 'revenueShare': return row.revenueSharePercent ?? 0;
    default: return row.revenue;
  }
};

const TIME_AXIS_LABEL: Record<string, string> = { day: '일', week: '주', month: '월', quarter: '분기', year: '연도', scenario: '시나리오' };

// ── CrossTabResult → ChartSpec ────────────────────────────────────────────────
export function buildMarketingChartSpecFromCrosstab(input: { intent: MarketingChartIntent; crosstab: MarketingCrossTabResult }): MarketingChartSpec {
  const { intent, crosstab } = input;
  const cfg = INTENT_CHART[intent];
  // 지원 불가(외부 데이터) 또는 crosstab unavailable → unsupported chartSpec
  if (!cfg || !crosstab.available) {
    return {
      id: `mkt_chart_${intent}`,
      title: cfg?.title ?? '지원하지 않는 분석',
      subtitle: '외부 데이터 연결 필요',
      chartType: 'unsupported',
      primaryMetric: cfg?.primaryMetric ?? 'revenue',
      series: [],
      source: 'temporal_crosstab',
      request: crosstab.request,
      available: false,
      unavailableReason: crosstab.unavailableReason,
      requiredData: crosstab.requiredData,
      evidence: [],
      warnings: []
    };
  }

  const primaryMetric = cfg.primaryMetric;
  // dimensionKey별 series, 각 series는 시간 버킷 points (sorted)
  const byDim = new Map<string, { label: string; rows: MarketingCrossTabRow[] }>();
  for (const r of crosstab.rows) {
    const k = r.dimensionKey;
    const e = byDim.get(k) || { label: r.dimensionLabel, rows: [] };
    e.rows.push(r);
    byDim.set(k, e);
  }
  const series: MarketingChartSeries[] = [...byDim.entries()].map(([key, e]) => ({
    key,
    label: e.label,
    metric: primaryMetric,
    points: [...e.rows]
      .sort((a, b) => a.bucketKey.localeCompare(b.bucketKey))
      .map((r) => ({
        bucketKey: r.bucketKey,
        bucketLabel: r.bucketLabel,
        value: metricVal(r, primaryMetric),
        orderCount: r.orderCount,
        revenue: r.revenue,
        averageOrderValue: r.averageOrderValue,
        ...(r.notes ? { notes: r.notes } : {})
      }))
  }));

  const warnings = crosstab.insights.filter((i) => i.severity === 'warning').map((i) => i.summary);

  return {
    id: `mkt_chart_${intent}`,
    title: cfg.title,
    subtitle: `${TIME_AXIS_LABEL[crosstab.request.timeBucket] ?? ''} 기준 · ${METRIC_LABEL[primaryMetric] ?? primaryMetric}`,
    chartType: cfg.chartType,
    primaryMetric,
    series,
    xAxisLabel: TIME_AXIS_LABEL[crosstab.request.timeBucket] ?? undefined,
    yAxisLabel: METRIC_LABEL[primaryMetric] ?? primaryMetric,
    unit: unitOf(primaryMetric),
    source: 'temporal_crosstab',
    request: crosstab.request,
    available: true,
    evidence: crosstab.evidence.map((ev) => `${ev.label}: ${ev.value}`),
    warnings
  };
}

// ── narrative ─────────────────────────────────────────────────────────────────
const INTENT_NARRATIVE_NOTE: Record<string, string> = {
  monthly_coupon_aov: '쿠폰 사용 여부는 주문에 반영된 쿠폰 할인 결과로 판별하고, 월별 객단가는 주문일·주문금액 조합으로 계산합니다.',
  yearly_revenue_compare: '연도별 매출은 주문일·주문금액과 baseline/promotion 라벨 조합으로 계산합니다.',
  scenario_revenue_compare: 'baseline(기준년도)와 promotion(프로모션년도) 매출을 주문 데이터로 비교합니다.',
  member_group_revenue: '회원그룹별 매출은 주문의 회원그룹 라벨과 주문금액 조합으로 계산합니다.',
  monthly_first_repeat: '첫구매/재구매는 회원별 가장 이른 결제 주문 기준으로 판별합니다.',
  monthly_order_channel: '주문채널별 매출은 주문의 채널 코드와 주문금액 조합으로 계산합니다.',
  monthly_reward_aov: '리워드 사용 여부는 주문의 마일리지/예치금 사용액으로 판별합니다.',
  category_revenue_trend: '카테고리별 매출은 주문 라인의 카테고리와 라인 매출 조합으로 계산합니다.',
  top_product_trend: '상품별 매출은 주문 라인의 상품과 라인 매출 조합으로 계산합니다.'
};

export function buildMarketingChartNarrative(input: { intent: MarketingChartIntent; chartSpec: MarketingChartSpec; crosstab?: MarketingCrossTabResult }): MarketingChartNarrative {
  const { intent, chartSpec, crosstab } = input;

  if (!chartSpec.available) {
    const u = UNSUPPORTED[intent];
    const reason = u?.reason ?? chartSpec.unavailableReason ?? '지원하는 분석 질문(월별 쿠폰 객단가, 연도별 매출, 회원그룹 매출 등)으로 다시 물어봐 주세요.';
    const required = u?.requiredData ?? chartSpec.requiredData;
    return {
      title: chartSpec.title,
      summary: `${chartSpec.title}는 현재 계산하지 않습니다. ${reason}`,
      bullets: required && required.length ? [`필요 데이터: ${required.join(', ')}`] : ['지원하는 분석 질문으로 다시 시도해 주세요.'],
      evidence: [],
      warnings: [],
      ...(required ? { requiredData: required } : {})
    };
  }

  const note = INTENT_NARRATIVE_NOTE[intent] ?? '';
  const bullets: string[] = [];
  // 핵심 수치 bullet (series 요약)
  for (const s of chartSpec.series.slice(0, 4)) {
    const last = s.points[s.points.length - 1];
    if (!last) continue;
    const valTxt = chartSpec.unit === 'krw' ? won(last.value) : chartSpec.unit === 'percent' ? `${last.value}%` : `${last.value}건`;
    bullets.push(`${s.label}: 최근 구간 ${METRIC_LABEL[chartSpec.primaryMetric] ?? chartSpec.primaryMetric} ${valTxt}로 나타납니다.`);
  }
  // crosstab insights(관찰) 일부 추가
  if (crosstab) for (const ins of crosstab.insights.slice(0, 2)) bullets.push(ins.summary);

  return {
    title: chartSpec.title,
    summary: `현재 주문 데이터 기준으로 계산 가능합니다. ${note}`.trim(),
    bullets,
    evidence: chartSpec.evidence,
    warnings: chartSpec.warnings
  };
}

// ── 통합 진입점 ───────────────────────────────────────────────────────────────
export function buildMarketingChatChartResponse(input: {
  message: string;
  orders: unknown[];
  products?: unknown[];
  nowMs?: number;
}): {
  intent: MarketingChartIntent;
  request: MarketingCrossTabRequest | null;
  crosstab: MarketingCrossTabResult | null;
  chartSpec: MarketingChartSpec;
  narrative: MarketingChartNarrative;
} {
  const intent = detectMarketingChartIntent(input.message);
  const request = buildMarketingCrossTabRequestFromIntent(intent);

  // 지원 불가(외부 데이터/unknown): crosstab 실행 없이 unsupported chartSpec
  if (!request || isUnsupportedIntent(intent)) {
    const u = UNSUPPORTED[intent];
    const chartSpec: MarketingChartSpec = {
      id: `mkt_chart_${intent}`,
      title: intent === 'unknown' ? '지원하지 않는 분석' : (INTENT_CHART[intent]?.title ?? '지원하지 않는 분석'),
      subtitle: '외부 데이터 연결 필요',
      chartType: 'unsupported',
      primaryMetric: 'revenue',
      series: [],
      source: 'temporal_crosstab',
      request: request ?? { timeBucket: 'month', dimensions: [], metrics: [] },
      available: false,
      unavailableReason: u?.reason ?? '지원하는 분석 질문으로 다시 물어봐 주세요.',
      ...(u?.requiredData ? { requiredData: u.requiredData } : {}),
      evidence: [],
      warnings: []
    };
    const narrative = buildMarketingChartNarrative({ intent, chartSpec });
    return { intent, request, crosstab: null, chartSpec, narrative };
  }

  const crosstab = buildMarketingTemporalCrosstab({ orders: input.orders, products: input.products, request, nowMs: input.nowMs });
  const chartSpec = buildMarketingChartSpecFromCrosstab({ intent, crosstab });
  const narrative = buildMarketingChartNarrative({ intent, chartSpec, crosstab });
  return { intent, request, crosstab, chartSpec, narrative };
}

// ── 채팅 런타임 연결 (코드 주도, LLM 없이 narrative 응답 + chartSpec artifact) ──
// 중앙 그래프 렌더는 다음 작업 — 여기서는 우측 채팅 답변 + 후속 렌더용 artifact만 준비한다.
export type MarketingChatChartArtifact = {
  type: 'marketing_chart_spec';
  source: 'marketingIntelligencePlanner' | 'marketingLlmPlannerAdapter' | 'marketingScopeInsightEngine' | 'marketingChatChartSpec';
  intent?: string;
  // Intelligence Planner v0: 분석 계획/근거/필요데이터를 함께 보관(집계 결과·설명만 — raw order/PII 금지).
  plan?: unknown;
  request?: MarketingCrossTabRequest | null;
  chartSpec: MarketingChartSpec;
  narrative: MarketingChartNarrative;
  evidence?: { id: string; label: string; value: string | number }[];
  requiredData?: string[];
  createdAt: string;
};

// chartSpec/narrative → 우측 채팅용 자연어 답변(결정적). 금지 문구/인과 단정 없음.
function renderMarketingChartReply(chartSpec: MarketingChartSpec, narrative: MarketingChartNarrative): string {
  if (!chartSpec.available) {
    const req = narrative.requiredData && narrative.requiredData.length ? `\n필요 데이터: ${narrative.requiredData.join(', ')}` : '';
    return `${narrative.summary}${req}\n현재 연결된 고도몰 주문·상품 데이터만으로는 이 지표를 산출하지 않습니다.`;
  }
  const lines: string[] = [narrative.summary];
  if (narrative.bullets.length) {
    lines.push('', '핵심 관찰:');
    for (const b of narrative.bullets.slice(0, 5)) lines.push(`- ${b}`);
  }
  lines.push('- 이 결과는 관찰값이며 인과관계를 단정하지 않습니다.');
  return lines.join('\n');
}

// 마케팅 채팅 1턴: chart intent면 handled=true(코드 답변 + artifact), unknown이면 handled=false(기존 facts/LLM fallback).
export function runMarketingChartRequest(input: {
  message: string;
  orders: unknown[];
  products?: unknown[];
  nowMs?: number;
}): { handled: boolean; intent: MarketingChartIntent; reply: string; artifact?: MarketingChatChartArtifact } {
  const nowMs = input.nowMs ?? Date.now();
  const resp = buildMarketingChatChartResponse({ message: input.message, orders: input.orders, products: input.products, nowMs });
  if (resp.intent === 'unknown') {
    return { handled: false, intent: resp.intent, reply: '' };
  }
  const reply = renderMarketingChartReply(resp.chartSpec, resp.narrative);
  const artifact: MarketingChatChartArtifact = {
    type: 'marketing_chart_spec',
    source: 'marketingChatChartSpec',
    intent: resp.intent,
    request: resp.request,
    chartSpec: resp.chartSpec,
    narrative: resp.narrative,
    createdAt: new Date(nowMs).toISOString()
  };
  return { handled: true, intent: resp.intent, reply, artifact };
}
