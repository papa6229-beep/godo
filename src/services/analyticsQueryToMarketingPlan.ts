// ────────────────────────────────────────────────────────────────────────────
// AnalyticsQuery → MarketingAnalysisPlan Adapter (STUB) — 옵션 A (수렴 방향 표식)
//
// 목적(작업지시서 §8): 최종적으로 부서 채팅의 질문 해석은 "하나의 AnalyticsQuery 계층"으로 수렴한다.
//   마케팅은 현재 marketingAnalysisQueryCompiler(MarketingAnalysisPlan)를 쓰지만,
//   다음 작업에서 이 adapter를 통해 AnalyticsQuery → MarketingAnalysisPlan으로 연결한다.
//
// ⚠️ v0에서는 런타임에 연결하지 않는다(마케팅 동작 불변). 영구 이중 파서가 되지 않도록
//   "수렴 지점"을 코드로 남기는 스텁이다. 아래 매핑 표를 다음 작업에서 채운다.
//
// 매핑 계획(TODO, 다음 작업 Marketing Analytics Query Bridge v0):
//   AnalyticsQuery.metric      → MarketingAnalysisPlan.metric (revenue/orderCount/averageOrderValue/quantity)
//   AnalyticsQuery.period      → MarketingPeriod (singleMonth/monthRange/quarter/halfYear/year/relative)
//                                · monthRange는 "월별"과 함께 와도 보존(현재 마케팅 버그 1의 원인 차단)
//   AnalyticsQuery.comparison  → yearOverYear / monthlyTrend / segmentCompare
//   AnalyticsQuery.dimension   → time/coupon/firstRepeat/memberGroup/channel (+ product는 신규 rank 차원)
//   AnalyticsQuery.aggregation → sum/ratio/rank/trend
//   topN/sort                  → 마케팅 rank 실행기(신규) 입력
// ────────────────────────────────────────────────────────────────────────────

import type { AnalyticsQuery } from './analyticsQueryTypes';
import type { MarketingAnalysisPlan } from './marketingAnalysisQueryCompiler';

/**
 * v0: 미구현(수렴 방향 표식용). 항상 null을 반환하며, 호출부는 기존 마케팅 컴파일러 경로를 그대로 쓴다.
 * 다음 작업에서 위 매핑 표대로 구현해 마케팅 채팅을 AnalyticsQuery 계층으로 이관한다.
 */
export function analyticsQueryToMarketingPlan(_query: AnalyticsQuery): MarketingAnalysisPlan | null {
  // TODO(Marketing Analytics Query Bridge v0): AnalyticsQuery → MarketingAnalysisPlan 매핑 구현.
  void _query;
  return null;
}
