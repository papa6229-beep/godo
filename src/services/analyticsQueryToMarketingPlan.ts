// ────────────────────────────────────────────────────────────────────────────
// AnalyticsQuery → MarketingAnalysisPlan Adapter (Marketing Analytics Query Bridge v0)
//
// 목적(작업지시서 §8): 부서 채팅 질문 해석을 하나의 AnalyticsQuery 계층으로 수렴한다.
//   마케팅 시간축 비교는 기존 marketingAnalysisExecutor를 재사용하기 위해
//   AnalyticsQuery → MarketingAnalysisPlan으로 변환한다(계산 이중화 없음).
//
// v0(Stage a) 변환 범위: 다연도 "월별" 비교 + 월범위(startMonth/endMonth 보존).
//   → compiler가 revenue 월별을 broad로 흘려보내던 버그를 우회(compiler 규칙 미변경).
//   product rank / category share는 plan으로 표현하지 않고 bridge 전용 executor에서 처리(Stage b).
//
// 수렴 TODO: 궁극적으로 마케팅 채팅 전 질문을 AnalyticsQuery 기반으로 이관한다.
// ────────────────────────────────────────────────────────────────────────────

import type { AnalyticsQuery, AnalyticsMetric } from './analyticsQueryTypes';
import type { MarketingAnalysisPlan, MarketingAnalysisMetric } from './marketingAnalysisQueryCompiler';

const toMarketingMetric = (m: AnalyticsMetric): MarketingAnalysisMetric | null => {
  if (m === 'revenue' || m === 'orderCount' || m === 'averageOrderValue' || m === 'quantity') return m;
  return null; // stock/reviewCount/rating/inquiryCount/claimCount는 마케팅 시간축 plan 대상 아님
};

/**
 * Stage (a): 다연도 + "월별" + (월범위/단일월) → monthlyTrend plan(startMonth/endMonth 보존).
 * 그 외(전체 12개월 월별, 비월별 yearOverYear, 단일기간, 세그먼트 등)는 null 반환 →
 *   기존 marketingScopeInsightEngine/compiler 경로가 처리(narrow intercept).
 */
export function analyticsQueryToMarketingPlan(q: AnalyticsQuery): MarketingAnalysisPlan | null {
  const metric = toMarketingMetric(q.metric);
  if (!metric) return null;

  const years = q.period.years ?? [];
  if (q.comparison !== 'monthlyTrend' || years.length < 2) return null;

  // 월범위/단일월에서만 range를 추출(범위가 명시된 경우만 bridge가 개입).
  let startMonth = 1, endMonth = 12;
  if (q.period.type === 'monthRange' && q.period.startMonth != null && q.period.endMonth != null) {
    startMonth = q.period.startMonth; endMonth = q.period.endMonth;
  } else if (q.period.type === 'singleMonth' && q.period.month != null) {
    startMonth = q.period.month; endMonth = q.period.month;
  }
  // 전체 12개월 월별 비교는 기존 경로가 이미 처리 → bridge 미개입(범위 명시된 경우만 우회).
  if (startMonth === 1 && endMonth === 12) return null;

  const aggregation: MarketingAnalysisPlan['aggregation'] = 'trend';
  return {
    intent: 'trend',
    metric,
    aggregation,
    dimension: 'time',
    comparison: { type: 'monthlyTrend', years: [...years].sort((a, b) => a - b), startMonth: Math.min(startMonth, endMonth), endMonth: Math.max(startMonth, endMonth) },
    chart: { requested: q.chartRequested, suppressed: q.chartSuppressed, type: q.chartSuppressed ? 'none' : 'groupedBars' },
    answerScope: 'narrow',
    confidence: 'high',
    originalQuestion: q.originalQuestion
  };
}
