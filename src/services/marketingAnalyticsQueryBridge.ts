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

import type { MarketingChatChartArtifact, MarketingChartSpec, MarketingChartType } from './marketingChatChartSpec';
import { parseAnalyticsQuery } from './analyticsQueryParser';
import { analyticsQueryToMarketingPlan } from './analyticsQueryToMarketingPlan';
import { buildMarketingAnalysisResponseFromPlan } from './marketingAnalysisExecutor';
import { executeAnalyticsQuery } from './analyticsQueryExecutor';
import type { AnalyticsQuery, AnalyticsQueryResult } from './analyticsQueryTypes';
import { formatSharePercent } from './productCategoryDisplay';

export interface MarketingBridgeResult {
  handled: boolean;
  artifact?: MarketingChatChartArtifact;
  reply: string;
  suppressChart: boolean;
  source: 'analytics_query_bridge';
}

const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;

// AnalyticsQueryResult(product executor) → MarketingChartSpec. product rank/category share 전용.
function toMarketingChartSpec(res: AnalyticsQueryResult, chartType: MarketingChartType): MarketingChartSpec {
  const metric = res.query.metric === 'quantity' ? 'quantity' : 'revenue';
  const unit: MarketingChartSpec['unit'] = metric === 'quantity' ? 'count' : 'krw';
  return {
    id: `mkt_bridge_${res.query.dimension}_${res.query.aggregation}`,
    title: `${res.periodLabel} ${res.query.dimension === 'category' ? '카테고리 매출 비중' : '상품 매출 순위'}`,
    subtitle: res.query.dimension === 'category' ? '매출 비중' : '상품 라인매출 기준',
    chartType,
    primaryMetric: metric,
    // ★ RankedBarChart 관례: "항목당 1 series"(막대 = series 단위). raw code/goodsNo는 key에만, label은 표시명.
    series: res.rows.map((r) => ({
      key: r.key ?? r.label,
      label: r.label,
      metric,
      points: [{
        bucketKey: r.key ?? r.label, bucketLabel: r.label,
        value: metric === 'quantity' ? (r.quantity ?? r.value) : (r.revenue ?? r.value),
        orderCount: r.orderCount, revenue: r.revenue, averageOrderValue: r.averageOrderValue,
        ...(r.share != null ? { notes: [`비중 ${formatSharePercent(r.share)}`] } : {})
      }]
    })),
    xAxisLabel: res.query.dimension === 'category' ? '카테고리' : '상품',
    yAxisLabel: metric === 'quantity' ? '판매수량' : '상품매출',
    unit, source: 'temporal_crosstab',
    request: { timeBucket: 'month', dimensions: [], metrics: [metric] as unknown as MarketingChartSpec['request']['metrics'] },
    available: res.rows.length > 0, evidence: [], warnings: []
  };
}

function artifactFrom(res: AnalyticsQueryResult, chartType: MarketingChartType, reply: string, bullets: string[], nowMs: number): MarketingChatChartArtifact {
  const chartSpec = toMarketingChartSpec(res, chartType);
  return {
    type: 'marketing_chart_spec', source: 'marketingScopeInsightEngine', intent: `bridge_${res.query.dimension}_${res.query.aggregation}`,
    plan: { dimension: res.query.dimension, aggregation: res.query.aggregation, metric: res.query.metric, answerScope: 'narrow' },
    request: chartSpec.request, chartSpec,
    narrative: { title: chartSpec.title, summary: reply.split('\n')[0] || chartSpec.title, bullets, evidence: [], warnings: [] },
    evidence: [], createdAt: new Date(nowMs).toISOString()
  };
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

  // ── Stage (b-1): unsupported(외부 미연결 데이터) — fake 없이 안내 + 내부 대체 분석 제안 ──
  if (query.unsupportedReason) {
    const reply = `${query.unsupportedReason}\n대신 기간별 매출·주문수·객단가, 상품/카테고리 순위·비중은 분석할 수 있습니다. 원하시는 기간과 지표를 알려주세요.`;
    return { handled: true, reply, suppressChart: true, source: 'analytics_query_bridge' };
  }

  // ── Stage (b-2): product rank / category share → product executor 재사용(상품 라인매출 gross) ──
  const isProductRank = query.dimension === 'product' && query.aggregation === 'rank';
  const isCategoryShare = query.dimension === 'category' && query.aggregation === 'share';
  if ((isProductRank || isCategoryShare) && query.confidence === 'high') {
    if (isProductRank) {
      // 표시 개수: "가장/1위"(topN=1)나 미지정이면 후보군까지 top5, 명시 상위 N(>1)이면 N. 두 기준(매출/수량) 1위 판별용으로 전체 조회.
      const displayN = (query.topN != null && query.topN > 1) ? query.topN : 5;
      const res = executeAnalyticsQuery({ ...query, team: 'product', topN: Math.max(displayN, 8) } as AnalyticsQuery, { orders: input.orders as never[] }, { nowMs });
      if (!res || res.unsupported || res.rows.length === 0) return null;
      const full = res.rows;
      const topRev = [...full].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))[0];
      const topQty = [...full].sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0))[0];
      const shown = full.slice(0, displayN);
      const bullets = shown.map((r, i) => `${i + 1}위 ${r.label}: 매출 ${won(r.revenue ?? 0)} (판매 ${r.quantity ?? 0}개${r.share != null ? `, 비중 ${formatSharePercent(r.share)}` : ''})`);
      const lines = [
        `${res.periodLabel} 기준 상품 순위입니다(상품 라인매출 gross 기준 · 대표 운영 KPI(net)와 다를 수 있음).`,
        `매출 기준 1위: ${topRev?.label}(${won(topRev?.revenue ?? 0)}, 판매 ${topRev?.quantity ?? 0}개).`
      ];
      if (topQty && topRev && topQty.label !== topRev.label) lines.push(`판매수량 기준 1위: ${topQty.label}(${topQty.quantity ?? 0}개).`);
      const reply = [...lines, ...bullets].join('\n');
      const shownRes: AnalyticsQueryResult = { ...res, rows: shown };
      // 능동 차트 기본 ON — "그래프 없이/텍스트로만"이면 artifact 생성 안 함.
      return { handled: true, artifact: query.chartSuppressed ? undefined : artifactFrom(shownRes, 'rankedBar', reply, bullets, nowMs), reply, suppressChart: query.chartSuppressed, source: 'analytics_query_bridge' };
    }
    // category share (productCategoryDisplay 표시명 · raw code 미노출)
    const res = executeAnalyticsQuery({ ...query, team: 'product' } as AnalyticsQuery, { orders: input.orders as never[] }, { nowMs });
    if (!res || res.unsupported || res.rows.length === 0) return null; // 범위 밖/미처리 → 기존 경로
    const bullets = res.rows.map((r) => `${r.label}: 매출 ${won(r.revenue ?? 0)}${r.share != null ? ` (${formatSharePercent(r.share)})` : ''}`);
    const top = res.rows[0];
    const reply = [`${res.periodLabel} 카테고리별 매출 비중입니다.`, top ? `1위 ${top.label}(${formatSharePercent(top.share ?? 0)}).` : '', ...bullets].filter(Boolean).join('\n');
    // 비중은 항목당 1 series의 rankedBar로 렌더(현재 렌더러상 donut도 rankedBar fallback). 능동 차트 기본 ON, 억제 시 미생성.
    return { handled: true, artifact: query.chartSuppressed ? undefined : artifactFrom(res, 'rankedBar', reply, bullets, nowMs), reply, suppressChart: query.chartSuppressed, source: 'analytics_query_bridge' };
  }

  // 그 외는 기존 마케팅 경로로 위임.
  return null;
}
