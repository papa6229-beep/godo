// ────────────────────────────────────────────────────────────────────────────
// Commerce Query Plan — 원시연산 조립 지시서 + Data Catalog(허용 축·지표)
//
// LLM은 이 QueryPlan만 만든다(숫자 계산 금지). Executor는 이 Plan의 원시연산을 일반 실행한다.
// 질문별 코드가 아니라, groupBy/seriesBy(임의 축) × metric × operation 조합으로 무한 질문을 표현한다.
// ────────────────────────────────────────────────────────────────────────────

// 허용 축(Data Catalog). 등록된 안전한 축만 groupBy/seriesBy로 허용.
export type Axis = 'year' | 'month' | 'product' | 'category' | 'couponUsed' | 'memberGroup' | 'channel' | 'customerType' | 'reviewRating' | 'inquiryProduct';
// 허용 지표.
export type Metric = 'revenue' | 'orderCount' | 'quantity' | 'averageOrderValue' | 'share' | 'inquiryCount' | 'reviewCount' | 'averageRating';
export type Operation = 'summarize' | 'trend' | 'rank' | 'compare' | 'share' | 'extremes' | 'argmax' | 'argmin';
export type ChartShape = 'groupedBar' | 'bar' | 'line' | 'donut' | 'none';

export interface PlanFilters {
  years?: number[]; months?: number[]; start?: string; end?: string;
  couponUsed?: boolean; customerType?: 'first' | 'repeat'; memberGroup?: string; channel?: string; category?: string; goodsNo?: string;
}
export interface QueryPlan {
  metric: Metric;
  secondaryMetric?: Metric;   // join/보조(예: 문의 많은 상품 중 "매출")
  groupBy?: Axis;             // 1차 묶기(없으면 전체 요약)
  seriesBy?: Axis;            // series 분할(예: 연도별 grouped 비교)
  operation: Operation;
  filters?: PlanFilters;
  sort?: 'asc' | 'desc';
  topN?: number;
  chartShape?: ChartShape;
  chartRequested?: boolean;
  chartSuppressed?: boolean;
  unsupportedReason?: string;
  originalQuestion?: string;
}

export const AXES: Axis[] = ['year', 'month', 'product', 'category', 'couponUsed', 'memberGroup', 'channel', 'customerType', 'reviewRating', 'inquiryProduct'];
export const METRICS: Metric[] = ['revenue', 'orderCount', 'quantity', 'averageOrderValue', 'share', 'inquiryCount', 'reviewCount', 'averageRating'];
export const OPERATIONS: Operation[] = ['summarize', 'trend', 'rank', 'compare', 'share', 'extremes', 'argmax', 'argmin'];

// 지표가 필요로 하는 소스(join 판정 + Data Catalog 검증).
export const METRIC_SOURCE: Record<Metric, 'orders' | 'inquiries' | 'reviews'> = {
  revenue: 'orders', orderCount: 'orders', quantity: 'orders', averageOrderValue: 'orders', share: 'orders',
  inquiryCount: 'inquiries', reviewCount: 'reviews', averageRating: 'reviews'
};
// 축이 사는 소스(키 추출 가능한 소스). product/category/year/month는 여러 소스에서 추출 가능.
export const AXIS_LABEL: Record<Axis, string> = {
  year: '연도', month: '월', product: '상품', category: '카테고리', couponUsed: '쿠폰사용',
  memberGroup: '회원그룹', channel: '채널', customerType: '신규/재구매', reviewRating: '평점', inquiryProduct: '문의상품'
};
export const METRIC_LABEL: Record<Metric, string> = {
  revenue: '매출', orderCount: '주문수', quantity: '판매수량', averageOrderValue: '객단가', share: '비중',
  inquiryCount: '문의수', reviewCount: '리뷰수', averageRating: '평균평점'
};

// 미연결(외부) 지표 — Data Catalog 밖. 계산 금지, unsupported.
export const UNSUPPORTED_METRICS = ['roas', 'adcost', 'ad_cost', 'visitors', 'visitor', 'impressions', 'clicks', 'conversionrate', 'conversion', 'cartaddrate', 'cart'];
