// ────────────────────────────────────────────────────────────────────────────
// Marketing Analysis Executor v0 — AnalysisPlan을 받아 실제 데이터로 계산한다.
//
// 숫자는 전부 여기서 canonical 운영 지표(net 유효 주문: isValidOrder)로 계산한다(LLM이 숫자 생성 금지).
//   - 월 범위/분기/반기는 구간 전체 합산.
//   - 객단가는 (구간 합 매출) ÷ (구간 합 주문수) — 월별 객단가의 단순 평균이 아님.
//   - gross 상품 라인합을 대표 매출로 쓰지 않는다(net 기준).
// ────────────────────────────────────────────────────────────────────────────

import { isValidOrder } from './revenueMetricContract';
import {
  type MarketingAnalysisPlan,
  type MarketingAnalysisMetric,
  type ResolvedRange,
  resolvePeriodToRange,
  METRIC_LABEL,
  compileMarketingAnalysisQuery
} from './marketingAnalysisQueryCompiler';
import type { MarketingChatChartArtifact, MarketingChartSpec } from './marketingChatChartSpec';
import { buildMarketingAnalysisNarrative } from './marketingAnalysisNarrative';

export interface MarketingAnalysisRow {
  label: string; value: number; revenue: number; orderCount: number; aov: number; quantity: number;
}
export interface MarketingAnalysisResult {
  plan: MarketingAnalysisPlan;
  title: string;
  metricLabel: string;
  rows: MarketingAnalysisRow[];
  diff?: { absolute: number; percent: number; direction: 'up' | 'down' | 'flat' };
  chartSpec: MarketingChartSpec;
  available: boolean;
  unsupported: boolean;
  unsupportedReason?: string;
}

interface OrderLike {
  orderDate?: unknown; totalAmount?: unknown; paid?: unknown; canceled?: unknown;
  state?: { paid?: unknown; canceled?: unknown };
  lines?: { quantity?: unknown; lineRevenue?: unknown }[];
  discountSummary?: { hasCoupon?: unknown };
  isFirstPurchase?: unknown; memberGroupName?: unknown; orderChannel?: unknown;
}
const numv = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const boolv = (v: unknown): boolean => v === true || v === 'true' || v === 'Y' || v === 'y' || v === 1;

interface Agg { revenue: number; orderCount: number; quantity: number; aov: number }
const emptyAgg = (): Agg => ({ revenue: 0, orderCount: 0, quantity: 0, aov: 0 });
const withAov = (a: Agg): Agg => ({ ...a, aov: a.orderCount > 0 ? Math.round(a.revenue / a.orderCount) : 0 });

function aggregateRange(orders: OrderLike[], year: number, startMonth: number, endMonth: number): Agg {
  const a = emptyAgg();
  for (const o of orders) {
    const d = String(o.orderDate ?? '');
    const y = Number(d.slice(0, 4)); const m = Number(d.slice(5, 7));
    if (y !== year || !(m >= startMonth && m <= endMonth)) continue;
    if (!isValidOrder(o)) continue;
    a.revenue += numv(o.totalAmount); a.orderCount += 1;
    for (const l of o.lines ?? []) a.quantity += numv(l.quantity);
  }
  return withAov(a);
}

function aggregateAllValid(orders: OrderLike[], pred: (o: OrderLike) => boolean): Agg {
  const a = emptyAgg();
  for (const o of orders) {
    if (!isValidOrder(o) || !pred(o)) continue;
    a.revenue += numv(o.totalAmount); a.orderCount += 1;
    for (const l of o.lines ?? []) a.quantity += numv(l.quantity);
  }
  return withAov(a);
}

const valueOf = (a: Agg, metric: MarketingAnalysisMetric): number =>
  (metric === 'revenue' ? a.revenue : metric === 'orderCount' ? a.orderCount : metric === 'quantity' ? a.quantity : a.aov);
const unitOf = (metric: MarketingAnalysisMetric): MarketingChartSpec['unit'] => (metric === 'orderCount' || metric === 'quantity' ? 'count' : 'krw');
const aggToRow = (label: string, a: Agg, metric: MarketingAnalysisMetric): MarketingAnalysisRow =>
  ({ label, value: valueOf(a, metric), revenue: a.revenue, orderCount: a.orderCount, aov: a.aov, quantity: a.quantity });

function rangeFilter(orders: OrderLike[], r: ResolvedRange): OrderLike[] {
  return orders.filter((o) => { const d = String(o.orderDate ?? ''); const y = Number(d.slice(0, 4)); const m = Number(d.slice(5, 7)); return y === r.year && m >= r.startMonth && m <= r.endMonth; });
}

function buildChartSpec(input: {
  id: string; title: string; subtitle: string; metric: MarketingAnalysisMetric;
  chartType: MarketingChartSpec['chartType']; compact: boolean;
  series: MarketingChartSpec['series'];
}): MarketingChartSpec {
  return {
    id: input.id, title: input.title, subtitle: input.subtitle, chartType: input.chartType, primaryMetric: input.metric,
    series: input.series, xAxisLabel: '기간', yAxisLabel: METRIC_LABEL[input.metric], unit: unitOf(input.metric),
    source: 'temporal_crosstab',
    request: { timeBucket: 'month', dimensions: [], metrics: [input.metric] as unknown as MarketingChartSpec['request']['metrics'] },
    available: input.series.some((s) => s.points.some((p) => p.value > 0)), evidence: [], warnings: [],
    ...(input.compact ? { requiredData: undefined } : {})
  };
}

export function executeMarketingAnalysisPlan(plan: MarketingAnalysisPlan, ordersRaw: unknown[], nowMs: number): MarketingAnalysisResult {
  const orders = (ordersRaw || []) as OrderLike[];
  const metric = plan.metric;
  const label = METRIC_LABEL[metric];

  if (plan.intent === 'unsupported') {
    return { plan, title: '지원 범위 밖 분석', metricLabel: label, rows: [], available: false, unsupported: true, unsupportedReason: plan.unsupportedReason,
      chartSpec: buildChartSpec({ id: 'mkt_unsupported', title: '지원 범위 밖', subtitle: '', metric, chartType: 'unsupported', compact: true, series: [] }) };
  }

  // 세그먼트 비교(쿠폰/첫구매·재구매/회원그룹/채널)
  if (plan.comparison?.type === 'segmentCompare') {
    const dim = plan.comparison.dimension;
    const scoped = plan.comparison.period ? rangeFilter(orders, resolvePeriodToRange(plan.comparison.period, nowMs ? new Date(nowMs).getFullYear() : 0, nowMs)) : orders;
    let groups: { key: string; label: string; pred: (o: OrderLike) => boolean }[];
    if (dim === 'coupon') groups = [{ key: 'used', label: '쿠폰 사용', pred: (o) => boolv(o.discountSummary?.hasCoupon) }, { key: 'unused', label: '쿠폰 미사용', pred: (o) => !boolv(o.discountSummary?.hasCoupon) }];
    else if (dim === 'firstRepeat') groups = [{ key: 'first', label: '첫구매', pred: (o) => boolv(o.isFirstPurchase) }, { key: 'repeat', label: '재구매', pred: (o) => !boolv(o.isFirstPurchase) }];
    else {
      const field = dim === 'memberGroup' ? 'memberGroupName' : 'orderChannel';
      const keys = [...new Set(scoped.filter((o) => isValidOrder(o)).map((o) => String((o as Record<string, unknown>)[field] ?? '미분류')))];
      groups = keys.map((k) => ({ key: k, label: k, pred: (o) => String((o as Record<string, unknown>)[field] ?? '미분류') === k }));
    }
    const rows = groups.map((g) => aggToRow(g.label, aggregateAllValid(scoped, g.pred), metric)).sort((a, b) => b.value - a.value);
    const title = `${plan.comparison.period ? resolvePeriodToRange(plan.comparison.period, nowMs ? new Date(nowMs).getFullYear() : 0, nowMs).label + ' ' : ''}${dim === 'coupon' ? '쿠폰 사용/미사용' : dim === 'firstRepeat' ? '첫구매/재구매' : dim === 'memberGroup' ? '회원그룹별' : '주문채널별'} ${label} 비교`;
    const chartSpec = buildChartSpec({ id: `mkt_segment_${dim}_${metric}`, title, subtitle: label, metric, chartType: 'rankedBar', compact: rows.length <= 4,
      series: [{ key: metric, label, metric, points: rows.map((r) => ({ bucketKey: r.label, bucketLabel: r.label, value: r.value, orderCount: r.orderCount, revenue: r.revenue, averageOrderValue: r.aov })) }] });
    return { plan, title, metricLabel: label, rows, available: rows.some((r) => r.value > 0), unsupported: false, chartSpec, diff: diffOf(rows) };
  }

  // 월별 추이 연도 비교(12개월)
  if (plan.comparison?.type === 'monthlyTrend') {
    const years = plan.comparison.years;
    const series = years.map((y) => ({
      key: String(y), label: `${y}년`, metric,
      points: Array.from({ length: 12 }, (_, i) => { const a = aggregateRange(orders, y, i + 1, i + 1); return { bucketKey: `${i + 1}`, bucketLabel: `${i + 1}월`, value: valueOf(a, metric), orderCount: a.orderCount, revenue: a.revenue, averageOrderValue: a.aov }; })
    }));
    const title = `${years.join('·')}년 월별 ${label} 비교`;
    const chartSpec = buildChartSpec({ id: `mkt_monthly_trend_${metric}`, title, subtitle: `월별 · ${label}`, metric, chartType: 'groupedBar', compact: false, series });
    const rows = years.map((y, idx) => { const tot = series[idx].points.reduce((s, p) => ({ r: s.r + (p.revenue ?? 0), c: s.c + (p.orderCount ?? 0) }), { r: 0, c: 0 }); const agg: Agg = withAov({ revenue: tot.r, orderCount: tot.c, quantity: 0, aov: 0 }); return aggToRow(`${y}년 합계`, agg, metric); });
    return { plan, title, metricLabel: label, rows, available: series.some((s) => s.points.some((p) => p.value > 0)), unsupported: false, chartSpec, diff: diffOf(rows) };
  }

  // 연도 비교(동일 기간을 여러 해로) — 월/월범위/분기/반기
  if (plan.comparison?.type === 'yearOverYear') {
    const { years, period } = plan.comparison;
    const rows = years.map((y) => { const r = resolvePeriodToRange(period, y, nowMs); return aggToRow(r.label, aggregateRange(orders, r.year, r.startMonth, r.endMonth), metric); });
    const sample = resolvePeriodToRange(period, years[0], nowMs);
    const spanLabel = sample.startMonth === sample.endMonth ? `${sample.startMonth}월` : `${sample.startMonth}~${sample.endMonth}월`;
    const title = `${years.map((y) => `${y}년 ${spanLabel}`).join(' vs ')} ${label} 비교`;
    const chartSpec = buildChartSpec({ id: `mkt_yoy_${metric}`, title, subtitle: `${spanLabel} · ${label}`, metric, chartType: 'groupedBar', compact: rows.length <= 4,
      series: [{ key: metric, label, metric, points: rows.map((r) => ({ bucketKey: r.label, bucketLabel: r.label, value: r.value, orderCount: r.orderCount, revenue: r.revenue, averageOrderValue: r.aov })) }] });
    return { plan, title, metricLabel: label, rows, available: rows.some((r) => r.value > 0), unsupported: false, chartSpec, diff: diffOf(rows) };
  }

  // 단일 기간 값
  if (plan.period) {
    const ctxYear = nowMs ? new Date(nowMs).getFullYear() : 0;
    const r = resolvePeriodToRange(plan.period, ctxYear, nowMs);
    const row = aggToRow(r.label, aggregateRange(orders, r.year, r.startMonth, r.endMonth), metric);
    const title = `${r.label} ${label}`;
    const chartSpec = buildChartSpec({ id: `mkt_single_${metric}`, title, subtitle: label, metric, chartType: 'groupedBar', compact: true,
      series: [{ key: metric, label, metric, points: [{ bucketKey: r.label, bucketLabel: r.label, value: row.value, orderCount: row.orderCount, revenue: row.revenue, averageOrderValue: row.aov }] }] });
    return { plan, title, metricLabel: label, rows: [row], available: row.value > 0, unsupported: false, chartSpec };
  }

  // broad(저신뢰) → executor가 처리하지 않음(호출부가 기존 broad scope로 위임)
  return { plan, title: '', metricLabel: label, rows: [], available: false, unsupported: false,
    chartSpec: buildChartSpec({ id: 'mkt_broad', title: '', subtitle: '', metric, chartType: 'table', compact: true, series: [] }) };
}

function diffOf(rows: MarketingAnalysisRow[]): MarketingAnalysisResult['diff'] | undefined {
  if (rows.length < 2) return undefined;
  const a = rows[0].value; const b = rows[rows.length - 1].value;
  const absolute = b - a; const percent = a > 0 ? Math.round((absolute / a) * 1000) / 10 : 0;
  return { absolute, percent, direction: absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat' };
}

// ── 오케스트레이터: 질문 → compile → execute → narrative → artifact ──────────────
export function buildMarketingAnalysisResponse(input: { message: string; orders: unknown[]; nowMs?: number }): {
  handled: boolean; artifact?: MarketingChatChartArtifact; reply: string; suppressChart: boolean; plan: MarketingAnalysisPlan;
} | null {
  const nowMs = input.nowMs ?? Date.now();
  const plan = compileMarketingAnalysisQuery(input.message, { nowMs });

  // 저신뢰 broad는 컴파일러가 처리하지 않음 → null 반환(기존 broad scope 분석으로 위임)
  if (plan.intent !== 'unsupported' && (plan.confidence === 'low' || (!plan.comparison && !plan.period))) {
    return null;
  }

  const result = executeMarketingAnalysisPlan(plan, input.orders, nowMs);
  const { reply, bullets, caveats } = buildMarketingAnalysisNarrative(result);

  if (plan.intent === 'unsupported') {
    return { handled: true, reply, suppressChart: true, plan }; // 차트 없음(엉뚱한 그래프 금지)
  }

  const artifact: MarketingChatChartArtifact = {
    type: 'marketing_chart_spec', source: 'marketingScopeInsightEngine', intent: `analysis_${plan.intent}`,
    plan: { metric: plan.metric, comparison: plan.comparison?.type, aggregation: plan.aggregation, answerScope: plan.answerScope },
    request: result.chartSpec.request, chartSpec: result.chartSpec,
    narrative: { title: result.title, summary: result.title, bullets, evidence: [], warnings: caveats },
    evidence: [], createdAt: new Date(nowMs).toISOString()
  };
  return { handled: true, artifact, reply, suppressChart: plan.chart.suppressed, plan };
}
