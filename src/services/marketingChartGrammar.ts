// ────────────────────────────────────────────────────────────────────────────
// Marketing Chart Grammar v0 — AnalysisPlan/metric/dimension을 보고 적절한 chart type을 선택.
//
// 핵심 원칙:
//   "객단가·주문수·매출처럼 독립 값을 비교하는 차트는 도넛/파이가 아니라 막대 비교가 기본이다.
//    도넛/파이는 구성비(share)와 비중 전용이다."
//
// 계산/숫자는 executor 담당. 이 파일은 "어떤 그래프로 보여줄지"만 결정한다.
// ────────────────────────────────────────────────────────────────────────────

import type { MarketingChartType } from './marketingChatChartSpec';
import type { MarketingAnalysisMetric } from './marketingAnalysisQueryCompiler';

export interface ChartGrammarInput {
  intent: 'compare' | 'summarize' | 'rank' | 'trend' | 'explain' | 'unsupported';
  metric: MarketingAnalysisMetric;
  comparisonType?: 'yearOverYear' | 'monthlyTrend' | 'segmentCompare';
  rowCount: number;
  suppressed: boolean;
  requestedTable?: boolean;
  isShare?: boolean;     // 구성비/비중/share 질문일 때만 true → donut 허용
}

/**
 * chart type 선택 문법.
 *   - donut/pie는 isShare(구성비/비중)일 때만. 객단가/주문수/매출 비교는 절대 donut 아님.
 *   - 월별/다중 series 추이 → groupedBar(렌더 단계에서 groupedVertical/line으로 라우팅).
 *   - 5개 이상 ranking → rankedBar. 2~4개 독립 값 비교 → groupedBar(compact).
 */
export function selectMarketingChartType(input: ChartGrammarInput): MarketingChartType {
  if (input.suppressed || input.intent === 'unsupported') return 'unsupported';
  if (input.requestedTable) return 'table';
  // 구성비/비중만 donut. (AOV/주문수/매출 비교는 여기 들어오지 않음)
  if (input.isShare && input.metric !== 'averageOrderValue') return 'donut';
  // 월별 추이(다중 series) → groupedBar(렌더가 groupedVertical로 라우팅)
  if (input.comparisonType === 'monthlyTrend') return 'groupedBar';
  // 5개 이상 ranking → rankedBar(horizontal)
  if (input.rowCount >= 5) return 'rankedBar';
  // 2~4개 독립 값 비교(단일월/월범위/연도/세그먼트) → compact groupedBar
  return 'groupedBar';
}

// ── metric label / unit grammar (§7) — 제목/범례/툴팁/축이 metric과 일치하도록 ──────
export const MARKETING_METRIC_GRAMMAR: Record<MarketingAnalysisMetric, { label: string; unit: 'krw' | 'count'; valueFormat: 'currency' | 'integer' }> = {
  revenue: { label: '매출', unit: 'krw', valueFormat: 'currency' },
  orderCount: { label: '주문수', unit: 'count', valueFormat: 'integer' },
  averageOrderValue: { label: '객단가', unit: 'krw', valueFormat: 'currency' },
  quantity: { label: '판매수량', unit: 'count', valueFormat: 'integer' }
};
