// ────────────────────────────────────────────────────────────────────────────
// Analytics Query Types — 부서 공통 질의 스키마 (Department Analytics Query Layer v0)
//
// 목적: 상품/마케팅/CS/총괄 채팅이 자연어 질문을 "같은 구조(AnalyticsQuery)"로 이해하고,
//   같은 executor를 타게 만드는 공통 계약. v0의 실제 parser/executor 구현은 product 중심.
//   marketing/cs/hq 및 일부 dimension은 타입만 열어두고(reserved) 다음 작업에서 연결한다.
//
// 원칙:
//   - 숫자는 코드가 계산, LLM은 해석/문장화만.
//   - 사용자가 지정한 기간을 넓히지 않는다("월별"이라고 12개월로 확장 금지).
//   - 처리 못 하는 team/dimension/metric은 executor가 null(not handled) 반환 → 기존 fallback.
// ────────────────────────────────────────────────────────────────────────────

export type AnalyticsTeam = 'product' | 'marketing' | 'cs' | 'hq';

export type AnalyticsMetric =
  | 'revenue'
  | 'orderCount'
  | 'averageOrderValue'
  | 'quantity'
  | 'stock'
  | 'reviewCount'
  | 'inquiryCount'
  | 'rating'
  | 'claimCount';

export type AnalyticsDimension =
  | 'time'
  | 'product'
  | 'category'
  | 'coupon'        // reserved (마케팅 연결 예정)
  | 'firstRepeat'   // reserved
  | 'memberGroup'   // reserved
  | 'channel'       // reserved
  | 'review'        // reserved (CS 연결 예정)
  | 'inquiry'       // reserved
  | 'customer';     // reserved

export type AnalyticsAggregation =
  | 'sum'
  | 'average'
  | 'ratio'
  | 'rank'
  | 'trend'
  | 'share'
  | 'compare'
  | 'summarize';

export type AnalyticsComparison =
  | 'none'
  | 'yearOverYear'
  | 'monthOverMonth'
  | 'periodOverPeriod'
  | 'monthlyTrend'
  | 'segmentCompare';

export interface AnalyticsPeriod {
  type:
    | 'singleDay'
    | 'dayRange'
    | 'singleMonth'
    | 'monthRange'
    | 'quarter'
    | 'halfYear'
    | 'year'
    | 'relative'
    | 'all';
  year?: number;
  years?: number[];
  month?: number;
  startMonth?: number;
  endMonth?: number;
  quarter?: 1 | 2 | 3 | 4;
  half?: 1 | 2;
  startDate?: string; // 'YYYY-MM-DD'
  endDate?: string;   // 'YYYY-MM-DD'
  relativeKey?: 'thisMonth' | 'lastMonth' | 'recentMonths' | 'thisYear' | 'lastYear';
  recentCount?: number;
}

export interface AnalyticsQuery {
  originalQuestion: string;
  team: AnalyticsTeam;
  metric: AnalyticsMetric;
  dimension: AnalyticsDimension;
  aggregation: AnalyticsAggregation;
  comparison: AnalyticsComparison;
  period: AnalyticsPeriod;
  topN?: number;
  sort?: 'asc' | 'desc';
  chartRequested: boolean;
  chartSuppressed: boolean;
  tableRequested: boolean;
  confidence: 'high' | 'medium' | 'low';
  unsupportedReason?: string;
}

// ── executor 결과 ──
export interface AnalyticsQueryRow {
  label: string;
  key?: string;
  value: number;
  secondaryValue?: number;
  revenue?: number;
  orderCount?: number;
  quantity?: number;
  averageOrderValue?: number;
  share?: number;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsQueryResult {
  query: AnalyticsQuery;
  rows: AnalyticsQueryRow[];
  periodLabel: string;
  summaryText: string;
  chartSpec?: unknown; // v0 경량 스펙(렌더 미연결). 마케팅 연결 시 MarketingChartSpec로 어댑트.
  warnings: string[];
  unsupported: boolean;
  unsupportedReason?: string;
}

export const ANALYTICS_METRIC_LABEL: Record<AnalyticsMetric, string> = {
  revenue: '상품매출',
  orderCount: '주문수',
  averageOrderValue: '객단가',
  quantity: '판매수량',
  stock: '재고',
  reviewCount: '리뷰수',
  inquiryCount: '문의수',
  rating: '평점',
  claimCount: '클레임수'
};
