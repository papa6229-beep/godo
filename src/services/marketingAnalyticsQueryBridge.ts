// ────────────────────────────────────────────────────────────────────────────
// Marketing Analytics Query Bridge v0
//
// 마케팅팀 채팅에서 기존 marketingScopeInsightEngine/compiler 앞단에 얹는 공통 계층 진입.
//   질문 → parseAnalyticsQuery(team='marketing') → (지원 조합만) 처리 → MarketingChatChartArtifact.
//   지원 못 하면 null → 호출부가 기존 마케팅 경로로 fallback(narrow intercept, wrong data 금지).
//
// v0 인터셉트 범위:
//   Stage (a) 시간축 비교: 다연도 + 월범위 + "월별"(monthlyTrend). 기존 executor 재사용(계산 이중화 없음).
//   Stage (b) product rank / category share / unsupported.  ← 다음 커밋에서 추가.
// ────────────────────────────────────────────────────────────────────────────

import type { MarketingChatChartArtifact } from './marketingChatChartSpec';
import { parseAnalyticsQuery } from './analyticsQueryParser';
import { analyticsQueryToMarketingPlan } from './analyticsQueryToMarketingPlan';
import { buildMarketingAnalysisResponseFromPlan } from './marketingAnalysisExecutor';

export interface MarketingBridgeResult {
  handled: boolean;
  artifact?: MarketingChatChartArtifact;
  reply: string;
  suppressChart: boolean;
  source: 'analytics_query_bridge';
}

export function runMarketingAnalyticsQueryBridge(input: {
  message: string; orders: unknown[]; products?: unknown[]; nowMs?: number;
}): MarketingBridgeResult | null {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.message || !input.orders || !input.orders.length) return null;

  const query = parseAnalyticsQuery(input.message, { team: 'marketing', nowMs });

  // ── Stage (a): 시간축 비교(월범위 월별) → 기존 marketing executor 재사용 ──
  const plan = analyticsQueryToMarketingPlan(query);
  if (plan) {
    const resp = buildMarketingAnalysisResponseFromPlan(plan, input.orders, nowMs);
    return { handled: resp.handled, artifact: resp.artifact, reply: resp.reply, suppressChart: resp.suppressChart, source: 'analytics_query_bridge' };
  }

  // 그 외는 기존 마케팅 경로로 위임.
  return null;
}
