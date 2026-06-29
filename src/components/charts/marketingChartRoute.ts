// 마케팅 chartSpec → 렌더 라우팅 판정(순수 함수). 대시보드와 smoke가 공유해 회귀를 막는다.
import type { MarketingChartSpec } from '../../services/marketingChatChartSpec';

export type MarketingChartRoute = 'combo' | 'groupedVertical' | 'line' | 'groupedBar' | 'rankedBar' | 'table' | 'unsupported';

const isMonthlyBucket = (b: string): boolean => /^\d{4}-\d{2}$/.test(b) || /^(0?[1-9]|1[0-2])$/.test(b) || /^\d{4}-Q[1-4]$/.test(b);

// Q1: 단일 기간 월별 매출 → combo(막대+꺾은선). Q2: 다년/다중 series 월 비교 → vertical grouped bar.
export function resolveMarketingChartRoute(cs: MarketingChartSpec): MarketingChartRoute {
  if (!cs.available || cs.chartType === 'unsupported') return 'unsupported';
  if (cs.series.length === 0) return 'unsupported';

  const buckets = new Set<string>();
  for (const s of cs.series) for (const p of s.points) buckets.add(p.bucketKey);
  const monthlyish = [...buckets].length > 0 && [...buckets].every(isMonthlyBucket);

  // combo: line + 매출 + 단일 series + 6~24개 시점(월/분기형)
  if (cs.chartType === 'line' && /revenue/i.test(cs.primaryMetric) && cs.series.length === 1) {
    const n = cs.series[0].points.length;
    if (n >= 6 && n <= 24 && monthlyish) return 'combo';
  }
  // grouped vertical: groupedBar/stackedBar + 2개 이상 series + 3개 이상 구간(월 비교)
  if ((cs.chartType === 'groupedBar' || cs.chartType === 'stackedBar') && cs.series.length >= 2 && buckets.size >= 3) return 'groupedVertical';

  // 기존 경로 유지(렌더러 마커 보존)
  if (cs.chartType === 'line') return 'line';
  if (cs.chartType === 'groupedBar' || cs.chartType === 'stackedBar') return 'groupedBar';
  if (cs.chartType === 'rankedBar' || cs.chartType === 'donut') return 'rankedBar';
  if (cs.chartType === 'table') return 'table';
  return 'unsupported';
}
