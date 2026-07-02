// ────────────────────────────────────────────────────────────────────────────
// Marketing Time×Metric General Executor (Stage 1)
//
// AnalyticsQuery(dimension=time, metric∈{revenue,orderCount,averageOrderValue,quantity},
//   aggregation∈{trend,argmax,argmin})를 실행한다.
//
// 숫자는 기존 marketingAnalysisExecutor(canonical net · weighted AOV)를 재사용한다(계산 이중화·LLM 금지).
//   - trend: 월별 추이(단일/다연도) 차트 + 최고/최저 요약.
//   - argmax/argmin: 월별 시리즈에서 극값 달을 찾아 "가장 높/낮았던 달"을 먼저 답변 + 월별 차트.
// ────────────────────────────────────────────────────────────────────────────

import { executeMarketingAnalysisPlan } from './marketingAnalysisExecutor';
import { METRIC_LABEL, type MarketingAnalysisPlan, type MarketingAnalysisMetric } from './marketingAnalysisQueryCompiler';
import type { MarketingChatChartArtifact } from './marketingChatChartSpec';
import type { AnalyticsQuery } from './analyticsQueryTypes';

export interface TimeMetricResult { handled: boolean; artifact?: MarketingChatChartArtifact; reply: string; suppressChart: boolean; }

const TIME_METRICS: MarketingAnalysisMetric[] = ['revenue', 'orderCount', 'averageOrderValue', 'quantity'];
export const isTimeMetric = (m: string): m is MarketingAnalysisMetric => (TIME_METRICS as string[]).includes(m);

const fmtMetric = (v: number, metric: MarketingAnalysisMetric): string =>
  metric === 'orderCount' ? `${Math.round(v).toLocaleString('ko-KR')}건`
  : metric === 'quantity' ? `${Math.round(v).toLocaleString('ko-KR')}개`
  : `${Math.round(v).toLocaleString('ko-KR')}원`; // revenue / averageOrderValue

function inferYears(query: AnalyticsQuery, orders: unknown[]): number[] {
  if (query.period.years && query.period.years.length) return [...query.period.years].sort((a, b) => a - b);
  if (query.period.year != null) return [query.period.year];
  const ys = [...new Set(orders.map((o) => Number(String((o as { orderDate?: unknown }).orderDate ?? '').slice(0, 4))).filter((y) => y >= 2000 && y <= 2100))].sort((a, b) => a - b);
  return ys.length ? [ys[ys.length - 1]] : []; // 연도 미지정 → 데이터의 최신 연도
}

function resolveMonthSpan(query: AnalyticsQuery): { startMonth: number; endMonth: number } {
  const p = query.period;
  if (p.type === 'monthRange' && p.startMonth != null && p.endMonth != null) return { startMonth: Math.min(p.startMonth, p.endMonth), endMonth: Math.max(p.startMonth, p.endMonth) };
  if (p.type === 'quarter' && p.quarter != null) { const s = p.quarter * 3 - 2; return { startMonth: s, endMonth: s + 2 }; }
  if (p.type === 'halfYear' && p.half != null) return p.half === 1 ? { startMonth: 1, endMonth: 6 } : { startMonth: 7, endMonth: 12 };
  if (p.type === 'singleMonth' && p.month != null) return { startMonth: p.month, endMonth: p.month };
  return { startMonth: 1, endMonth: 12 };
}

export function executeMarketingTimeMetric(query: AnalyticsQuery, orders: unknown[], nowMs: number): TimeMetricResult | null {
  if (!isTimeMetric(query.metric)) return null;
  const metric = query.metric;
  const years = inferYears(query, orders);
  if (!years.length) return null;
  const { startMonth, endMonth } = resolveMonthSpan(query);

  // 기존 net executor 재사용: monthlyTrend(월범위 보존) → 월별 값(가중 AOV 포함).
  const plan: MarketingAnalysisPlan = {
    intent: 'trend', metric, aggregation: 'trend', dimension: 'time',
    comparison: { type: 'monthlyTrend', years, startMonth, endMonth },
    chart: { requested: query.chartRequested, suppressed: query.chartSuppressed, type: query.chartSuppressed ? 'none' : 'groupedBars' },
    answerScope: 'narrow', confidence: 'high', originalQuestion: query.originalQuestion
  };
  const result = executeMarketingAnalysisPlan(plan, orders, nowMs);
  if (!result.available) return null; // 요청 기간 데이터 없음 → 호출부가 좁은 안내(broad 덤프 금지)

  // 월 bucketKey를 2자리로 패딩("1"→"01") — 렌더러의 사전식 정렬이 1,10,11,12,2…로 어긋나지 않게(월 순서 보존).
  const padKey = (k: string): string => (/^\d+$/.test(k) ? k.padStart(2, '0') : k);
  const chartSpec = { ...result.chartSpec, series: result.chartSpec.series.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p, bucketKey: padKey(p.bucketKey) })) })) };

  const label = METRIC_LABEL[metric];
  const artifact: MarketingChatChartArtifact = {
    type: 'marketing_chart_spec', source: 'marketingScopeInsightEngine', intent: `time_${query.aggregation}`,
    plan: { metric, aggregation: query.aggregation, dimension: 'time', answerScope: 'narrow' },
    request: chartSpec.request, chartSpec,
    narrative: { title: result.title, summary: result.title, bullets: [], evidence: [], warnings: [] },
    evidence: [], createdAt: new Date(nowMs).toISOString()
  };

  // 극값/최고·최저는 "주문이 있는 달"만 대상으로 한다(데이터 없는 0월이 최저로 뽑히지 않게).
  const active = (pts: { value: number; orderCount?: number; bucketLabel: string }[]) => {
    const a = pts.filter((p) => (p.orderCount ?? 0) > 0);
    return a.length ? a : pts;
  };

  if (query.aggregation === 'trend') {
    const lines = result.chartSpec.series.map((s) => {
      const pool = active(s.points);
      const hi = pool.reduce((a, b) => (b.value > a.value ? b : a));
      const lo = pool.reduce((a, b) => (b.value < a.value ? b : a));
      return `${s.label}: 최고 ${hi.bucketLabel}(${fmtMetric(hi.value, metric)}), 최저 ${lo.bucketLabel}(${fmtMetric(lo.value, metric)}).`;
    });
    artifact.narrative.bullets = lines;
    return { handled: true, artifact: query.chartSuppressed ? undefined : artifact, reply: [`${result.title}입니다.`, ...lines].join('\n'), suppressChart: query.chartSuppressed };
  }

  // argmax / argmin — 첫(단일) 연도 시리즈에서 극값 달(주문 있는 달 대상). 질문 포커스(최고/최저 달)를 먼저 답변.
  const s0 = result.chartSpec.series[0];
  const pool = active(s0.points);
  const extreme = query.aggregation === 'argmin' ? pool.reduce((a, b) => (b.value < a.value ? b : a)) : pool.reduce((a, b) => (b.value > a.value ? b : a));
  const dirWord = query.aggregation === 'argmin' ? '가장 낮았던' : '가장 높았던';
  const ranked = [...pool].sort((a, b) => (query.aggregation === 'argmin' ? a.value - b.value : b.value - a.value)).slice(0, 3)
    .map((p, i) => `${i + 1}. ${p.bucketLabel} ${fmtMetric(p.value, metric)}`);
  artifact.narrative.bullets = ranked;
  const reply = [`${s0.label} ${label}이(가) ${dirWord} 달은 ${extreme.bucketLabel}(${fmtMetric(extreme.value, metric)})입니다.`, ...ranked].join('\n');
  return { handled: true, artifact: query.chartSuppressed ? undefined : artifact, reply, suppressChart: query.chartSuppressed };
}
