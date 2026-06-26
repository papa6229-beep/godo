// Analytics Query Engine v0 — 마케팅·상품·CS 공통 지표 엔진 (pure, 데이터셋 주입형)
//
// 원칙:
//   - 숫자는 엔진이 계산한다. AI는 결과만 설명한다(AI가 지표를 지어내지 않음).
//   - 입력은 자연어가 아니라 구조화된 QuerySpec.
//   - 기간 필터 먼저 → groupBy → metric 계산. 기간 밖 데이터 제외.
//   - 지금 데이터로 계산 가능한 지표(supported/derived)와 추가 데이터 필요(requires_external_data)를 구분.
//   - PII(이름/전화/주소/이메일/계좌)는 결과에 절대 포함하지 않는다. 고객 식별은 가명 memberKey만.
//
// 데이터셋은 호출자가 주입한다(프론트는 orders만, smoke/서버는 customers/reviews/inquiries 포함 가능).

// ── 입력 데이터셋 타입(self-contained) ──────────────────────────────────────
export interface AnalyticsOrderLine {
  goodsNo: string;
  goodsName?: string;
  quantity: number;
  lineRevenue: number;
  categoryCode?: string;
  categoryLabel?: string;
  brandCode?: string;
}
export interface AnalyticsOrder {
  orderNo: string;
  orderDate: string; // 'YYYY-MM-DD...'
  totalAmount: number;
  productRevenueByLines: number;
  deliveryFee?: number;
  paid?: boolean;
  canceled?: boolean;
  memberKey?: string;
  paymentMethodCode?: string;
  orderChannel?: string;
  claim?: { hasClaim: boolean; claimTypes: string[]; claimAmount?: number };
  lines: AnalyticsOrderLine[];
}
export interface AnalyticsCustomer {
  memberKey: string;
  segment: string;
  orderCount: number;
  totalPaidAmount: number;
}
export interface AnalyticsReview {
  memberKey?: string;
  goodsNo?: string;
  categoryCode?: string;
  brandCode?: string;
  rating: number;
  sentiment: string; // positive|neutral|negative
  topic: string;
}
export interface AnalyticsInquiry {
  memberKey?: string;
  goodsNo?: string;
  categoryCode?: string;
  brandCode?: string;
  topic: string;
  status: string; // unanswered|answered|needs_human
  urgency: string;
}
export interface AnalyticsCatalog {
  categoriesByCode?: Record<string, { cateNm?: string }>;
  brandsByCode?: Record<string, { brandNm?: string }>;
}
export interface AnalyticsDataset {
  orders: AnalyticsOrder[];
  customers?: AnalyticsCustomer[];
  reviews?: AnalyticsReview[];
  inquiries?: AnalyticsInquiry[];
  catalog?: AnalyticsCatalog;
  source?: { dataKind: 'real' | 'synthetic' | 'mixed'; syntheticSource?: 'commerce_universe_v1' | 'godoRaw' | 'legacy' };
}

// ── Metric / GroupBy / QuerySpec ─────────────────────────────────────────────
export type AnalyticsMetric =
  | 'revenue' | 'netRevenue' | 'orderCount' | 'unitCount' | 'averageOrderValue' | 'salesGrowthRate' | 'revenueShare' | 'periodComparison'
  | 'customerCount' | 'newCustomerCount' | 'returningCustomerCount' | 'repurchaseRate' | 'purchaseFrequency' | 'averagePurchaseInterval'
  | 'vipCandidateCount' | 'dormantRiskCustomerCount' | 'discountSensitiveCustomerCount' | 'highRefundRiskCustomerCount'
  | 'customerSegmentRevenue' | 'ltvProxy' | 'cohortRetention'
  | 'productRevenue' | 'productUnitCount' | 'productOrderCount' | 'categoryRevenue' | 'brandRevenue' | 'categoryAov' | 'brandAov'
  | 'topProducts' | 'lowPerformingProducts' | 'repurchaseCandidateProducts' | 'refundRiskProducts' | 'csRiskProducts' | 'reviewRiskProducts'
  | 'paymentMethodRevenue' | 'paymentMethodOrderCount' | 'orderChannelRevenue' | 'orderChannelOrderCount'
  | 'claimRate' | 'cancelRate' | 'refundRate' | 'returnRate' | 'exchangeRate' | 'claimAmount' | 'claimReasonBreakdown'
  | 'reviewCount' | 'reviewAverageRating' | 'reviewSentimentShare' | 'reviewTopicBreakdown'
  | 'inquiryCount' | 'inquiryTopicBreakdown' | 'unansweredInquiryCount' | 'urgentInquiryCount' | 'csIssueTopProducts'
  | 'campaignRevenueComparison' | 'campaignAovComparison' | 'campaignRepurchaseComparison'
  | 'signupPurchaseConversionRate' | 'trafficPurchaseConversionRate' | 'adRoas' | 'couponUsageRate';

export type AnalyticsGroupBy =
  | 'month' | 'week' | 'day' | 'category' | 'brand' | 'product' | 'paymentMethod' | 'orderChannel'
  | 'customerSegment' | 'memberKey' | 'reviewTopic' | 'reviewSentiment' | 'inquiryTopic' | 'claimType' | 'claimReason' | 'campaign' | 'cohortMonth';

export type MetricSupportLevel = 'supported' | 'derived' | 'synthetic_only' | 'requires_external_data' | 'not_supported_yet';

export type AnalyticsRequiredData =
  | 'orders' | 'orderLines' | 'customers' | 'reviews' | 'inquiries' | 'claims' | 'catalog'
  | 'inventory' | 'campaignCalendar' | 'signupEvents' | 'trafficEvents' | 'adSpend' | 'costOfGoods';

export type AnalyticsChart = 'bar' | 'line' | 'bar_line' | 'donut' | 'table' | 'scorecard';

export type AnalyticsMetricDefinition = {
  key: AnalyticsMetric;
  labelKo: string;
  description: string;
  domain: 'sales' | 'customer' | 'product' | 'category' | 'brand' | 'payment' | 'channel' | 'review' | 'cs' | 'campaign' | 'inventory' | 'cohort';
  supportLevel: MetricSupportLevel;
  requiredData: AnalyticsRequiredData[];
  defaultGroupBy?: AnalyticsGroupBy;
  recommendedChart?: AnalyticsChart;
};

export type AnalyticsQuerySpec = {
  metric: AnalyticsMetric;
  groupBy?: AnalyticsGroupBy;
  startDate?: string;
  endDate?: string;
  compareTo?: { startDate: string; endDate: string; label?: string };
  filters?: {
    categoryCode?: string; brandCode?: string; productId?: string; goodsNo?: string;
    paymentMethodCode?: string; orderChannel?: string; customerSegment?: string;
    reviewTopic?: string; inquiryTopic?: string; campaignId?: string;
  };
};

export type AnalyticsRow = {
  key: string; label: string; value: number; valueLabel?: string;
  orderCount?: number; unitCount?: number; revenue?: number; customerCount?: number;
  previousValue?: number; changeAmount?: number; changeRate?: number;
  meta?: Record<string, unknown>;
};

export type AnalyticsQueryResult = {
  ok: boolean;
  metric: AnalyticsMetric;
  metricLabelKo: string;
  groupBy?: AnalyticsGroupBy;
  startDate?: string;
  endDate?: string;
  rows: AnalyticsRow[];
  summary: { total?: number; average?: number; maxLabel?: string; minLabel?: string; rowCount: number };
  chartHint?: { type: AnalyticsChart; xKey?: string; yKey?: string };
  supportLevel: MetricSupportLevel;
  requiredData?: string[];
  warnings?: string[];
  source: { dataKind: 'real' | 'synthetic' | 'mixed'; syntheticSource?: 'commerce_universe_v1' | 'godoRaw' | 'legacy' };
};

// ── Metric Registry (broad) ──────────────────────────────────────────────────
const def = (
  key: AnalyticsMetric, labelKo: string, domain: AnalyticsMetricDefinition['domain'],
  supportLevel: MetricSupportLevel, requiredData: AnalyticsRequiredData[],
  recommendedChart: AnalyticsChart, defaultGroupBy?: AnalyticsGroupBy, description = ''
): AnalyticsMetricDefinition => ({ key, labelKo, description, domain, supportLevel, requiredData, recommendedChart, defaultGroupBy });

export const ANALYTICS_METRIC_REGISTRY: AnalyticsMetricDefinition[] = [
  // sales
  def('revenue', '매출', 'sales', 'supported', ['orders', 'orderLines'], 'bar_line', 'month'),
  def('netRevenue', '순매출(라인매출-클레임)', 'sales', 'derived', ['orders', 'claims'], 'bar_line', 'month'),
  def('orderCount', '주문 수', 'sales', 'supported', ['orders'], 'bar', 'month'),
  def('unitCount', '판매 수량', 'sales', 'supported', ['orderLines'], 'bar', 'month'),
  def('averageOrderValue', '평균 객단가', 'sales', 'supported', ['orders'], 'bar_line', 'month'),
  def('salesGrowthRate', '매출 성장률(전월 대비)', 'sales', 'derived', ['orders'], 'line', 'month'),
  def('revenueShare', '매출 점유율', 'sales', 'derived', ['orders', 'orderLines'], 'donut', 'category'),
  def('periodComparison', '기간 비교', 'sales', 'derived', ['orders'], 'bar', 'month'),
  // customer
  def('customerCount', '구매 고객 수', 'customer', 'derived', ['orders'], 'scorecard', 'memberKey'),
  def('newCustomerCount', '신규 구매 고객 수', 'customer', 'synthetic_only', ['customers'], 'scorecard'),
  def('returningCustomerCount', '재구매 고객 수', 'customer', 'derived', ['orders'], 'scorecard'),
  def('repurchaseRate', '재구매율', 'customer', 'derived', ['orders'], 'scorecard'),
  def('purchaseFrequency', '평균 구매 횟수', 'customer', 'derived', ['orders'], 'scorecard'),
  def('averagePurchaseInterval', '평균 구매 주기(일)', 'customer', 'derived', ['orders'], 'scorecard'),
  def('vipCandidateCount', 'VIP 후보 고객 수', 'customer', 'synthetic_only', ['customers'], 'scorecard'),
  def('dormantRiskCustomerCount', '이탈 위험 고객 수', 'customer', 'synthetic_only', ['customers'], 'scorecard'),
  def('discountSensitiveCustomerCount', '할인 민감 고객 수', 'customer', 'synthetic_only', ['customers'], 'scorecard'),
  def('highRefundRiskCustomerCount', '환불 위험 고객 수', 'customer', 'synthetic_only', ['customers'], 'scorecard'),
  def('customerSegmentRevenue', '고객 세그먼트별 매출', 'customer', 'synthetic_only', ['orders', 'customers'], 'bar', 'customerSegment'),
  def('ltvProxy', 'LTV proxy(고객당 누적매출)', 'customer', 'synthetic_only', ['customers'], 'scorecard'),
  def('cohortRetention', '코호트 재구매율', 'cohort', 'not_supported_yet', ['orders'], 'table', 'cohortMonth'),
  // product/category/brand
  def('productRevenue', '상품별 매출', 'product', 'supported', ['orderLines'], 'bar', 'product'),
  def('productUnitCount', '상품별 판매수량', 'product', 'supported', ['orderLines'], 'bar', 'product'),
  def('productOrderCount', '상품별 주문 수', 'product', 'supported', ['orderLines'], 'bar', 'product'),
  def('categoryRevenue', '카테고리별 매출', 'category', 'supported', ['orderLines', 'catalog'], 'donut', 'category'),
  def('brandRevenue', '브랜드별 매출', 'brand', 'supported', ['orderLines', 'catalog'], 'bar', 'brand'),
  def('categoryAov', '카테고리별 객단가', 'category', 'derived', ['orders', 'orderLines'], 'bar', 'category'),
  def('brandAov', '브랜드별 객단가', 'brand', 'derived', ['orders', 'orderLines'], 'bar', 'brand'),
  def('topProducts', '상품 매출 순위', 'product', 'supported', ['orderLines'], 'bar', 'product'),
  def('lowPerformingProducts', '저성과 상품', 'product', 'derived', ['orderLines'], 'bar', 'product'),
  def('repurchaseCandidateProducts', '재구매 유망 상품', 'product', 'derived', ['orders'], 'bar', 'product'),
  def('refundRiskProducts', '환불 위험 상품', 'product', 'derived', ['orders', 'claims'], 'bar', 'product'),
  def('csRiskProducts', 'CS 이슈 많은 상품', 'cs', 'synthetic_only', ['inquiries'], 'bar', 'product'),
  def('reviewRiskProducts', '저평점 상품', 'review', 'synthetic_only', ['reviews'], 'bar', 'product'),
  // payment/channel
  def('paymentMethodRevenue', '결제수단별 매출', 'payment', 'supported', ['orders'], 'donut', 'paymentMethod'),
  def('paymentMethodOrderCount', '결제수단별 주문 수', 'payment', 'supported', ['orders'], 'bar', 'paymentMethod'),
  def('orderChannelRevenue', '주문채널별 매출', 'channel', 'supported', ['orders'], 'donut', 'orderChannel'),
  def('orderChannelOrderCount', '주문채널별 주문 수', 'channel', 'supported', ['orders'], 'bar', 'orderChannel'),
  // claims
  def('claimRate', '전체 클레임율', 'sales', 'derived', ['orders', 'claims'], 'scorecard'),
  def('cancelRate', '취소율', 'sales', 'derived', ['orders', 'claims'], 'scorecard'),
  def('refundRate', '환불률', 'sales', 'derived', ['orders', 'claims'], 'scorecard'),
  def('returnRate', '반품률', 'sales', 'derived', ['orders', 'claims'], 'scorecard'),
  def('exchangeRate', '교환율', 'sales', 'derived', ['orders', 'claims'], 'scorecard'),
  def('claimAmount', '클레임 금액', 'sales', 'derived', ['orders', 'claims'], 'scorecard'),
  def('claimReasonBreakdown', '클레임 사유별 비중', 'sales', 'requires_external_data', ['claims'], 'donut', 'claimReason'),
  // review
  def('reviewCount', '리뷰 수', 'review', 'synthetic_only', ['reviews'], 'scorecard'),
  def('reviewAverageRating', '평균 리뷰 평점', 'review', 'synthetic_only', ['reviews'], 'scorecard'),
  def('reviewSentimentShare', '리뷰 감정 비율', 'review', 'synthetic_only', ['reviews'], 'donut', 'reviewSentiment'),
  def('reviewTopicBreakdown', '리뷰 주제별 비중', 'review', 'synthetic_only', ['reviews'], 'bar', 'reviewTopic'),
  // cs/inquiry
  def('inquiryCount', '문의 수', 'cs', 'synthetic_only', ['inquiries'], 'scorecard'),
  def('inquiryTopicBreakdown', '문의 주제별 비중', 'cs', 'synthetic_only', ['inquiries'], 'bar', 'inquiryTopic'),
  def('unansweredInquiryCount', '미답변 문의 수', 'cs', 'synthetic_only', ['inquiries'], 'scorecard'),
  def('urgentInquiryCount', '긴급 문의 수', 'cs', 'synthetic_only', ['inquiries'], 'scorecard'),
  def('csIssueTopProducts', 'CS 이슈 많은 상품', 'cs', 'synthetic_only', ['inquiries'], 'bar', 'product'),
  // campaign / conversion (external)
  def('campaignRevenueComparison', '이벤트 vs 비이벤트 매출', 'campaign', 'requires_external_data', ['campaignCalendar', 'orders'], 'bar'),
  def('campaignAovComparison', '이벤트 vs 비이벤트 객단가', 'campaign', 'requires_external_data', ['campaignCalendar', 'orders'], 'bar'),
  def('campaignRepurchaseComparison', '이벤트 vs 비이벤트 재구매율', 'campaign', 'requires_external_data', ['campaignCalendar', 'orders'], 'bar'),
  def('signupPurchaseConversionRate', '신규가입자 구매전환율', 'campaign', 'requires_external_data', ['signupEvents', 'orders'], 'scorecard'),
  def('trafficPurchaseConversionRate', '방문자 구매전환율', 'campaign', 'requires_external_data', ['trafficEvents', 'orders'], 'scorecard'),
  def('adRoas', 'ROAS', 'campaign', 'requires_external_data', ['adSpend', 'orders'], 'scorecard'),
  def('couponUsageRate', '쿠폰 사용률', 'campaign', 'requires_external_data', ['orders'], 'scorecard')
];
const REG_MAP: Record<string, AnalyticsMetricDefinition> = Object.fromEntries(ANALYTICS_METRIC_REGISTRY.map((m) => [m.key, m]));

export function listAnalyticsMetrics(): AnalyticsMetricDefinition[] { return ANALYTICS_METRIC_REGISTRY; }
export function getAnalyticsMetric(key: string): AnalyticsMetricDefinition | undefined { return REG_MAP[key]; }

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const ymd = (s: string): string => (s || '').slice(0, 10);
const inPeriod = (date: string, start?: string, end?: string): boolean => {
  const d = ymd(date);
  if (start && d < ymd(start)) return false;
  if (end && d > ymd(end)) return false;
  return true;
};
const weekKey = (d: string): string => {
  const x = ymd(d);
  const dt = new Date(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, Number(x.slice(8, 10)));
  const off = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - off);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const round = (n: number, p = 4): number => Number(n.toFixed(p));
const orderInFilters = (o: AnalyticsOrder, f?: AnalyticsQuerySpec['filters']): boolean => {
  if (!f) return true;
  if (f.paymentMethodCode && o.paymentMethodCode !== f.paymentMethodCode) return false;
  if (f.orderChannel && o.orderChannel !== f.orderChannel) return false;
  return true;
};
// 주문의 매출/수량(카테고리/브랜드/상품 필터 적용 가능)
const orderRevenue = (o: AnalyticsOrder, f?: AnalyticsQuerySpec['filters']): number => {
  if (!f || (!f.categoryCode && !f.brandCode && !f.goodsNo && !f.productId)) return o.productRevenueByLines || 0;
  let s = 0;
  for (const l of o.lines) if (lineInFilters(l, f)) s += l.lineRevenue || 0;
  return s;
};
const orderUnits = (o: AnalyticsOrder, f?: AnalyticsQuerySpec['filters']): number => {
  let s = 0;
  for (const l of o.lines) if (lineInFilters(l, f)) s += l.quantity || 0;
  return s;
};
const lineInFilters = (l: AnalyticsOrderLine, f?: AnalyticsQuerySpec['filters']): boolean => {
  if (!f) return true;
  if (f.categoryCode && l.categoryCode !== f.categoryCode) return false;
  if (f.brandCode && l.brandCode !== f.brandCode) return false;
  if ((f.goodsNo || f.productId) && l.goodsNo !== (f.goodsNo || f.productId)) return false;
  return true;
};

type Agg = { revenue: number; orders: Set<string>; units: number; count: number };
const newAgg = (): Agg => ({ revenue: 0, orders: new Set(), units: 0, count: 0 });

// ── 결과 빌더 ────────────────────────────────────────────────────────────────
const extResult = (spec: AnalyticsQuerySpec, ds: AnalyticsDataset, reg: AnalyticsMetricDefinition, warning: string): AnalyticsQueryResult => ({
  ok: false, metric: spec.metric, metricLabelKo: reg.labelKo, groupBy: spec.groupBy, startDate: spec.startDate, endDate: spec.endDate,
  rows: [], summary: { rowCount: 0 }, chartHint: { type: reg.recommendedChart || 'table' },
  supportLevel: reg.supportLevel, requiredData: reg.requiredData,
  warnings: [warning], source: ds.source || { dataKind: 'synthetic' }
});
const okResult = (
  spec: AnalyticsQuerySpec, ds: AnalyticsDataset, reg: AnalyticsMetricDefinition, rows: AnalyticsRow[],
  opts: { groupBy?: AnalyticsGroupBy; total?: number; average?: number; warnings?: string[]; support?: MetricSupportLevel } = {}
): AnalyticsQueryResult => {
  const sorted = rows;
  const max = sorted.reduce((m, r) => (r.value > (m?.value ?? -Infinity) ? r : m), undefined as AnalyticsRow | undefined);
  const min = sorted.reduce((m, r) => (r.value < (m?.value ?? Infinity) ? r : m), undefined as AnalyticsRow | undefined);
  return {
    ok: true, metric: spec.metric, metricLabelKo: reg.labelKo, groupBy: opts.groupBy ?? spec.groupBy,
    startDate: spec.startDate, endDate: spec.endDate, rows: sorted,
    summary: { total: opts.total, average: opts.average, maxLabel: max?.label, minLabel: min?.label, rowCount: sorted.length },
    chartHint: { type: reg.recommendedChart || 'table' },
    supportLevel: opts.support ?? reg.supportLevel, requiredData: reg.requiredData,
    warnings: opts.warnings, source: ds.source || { dataKind: 'synthetic' }
  };
};

// 라벨 해석
const catLabel = (code: string, ds: AnalyticsDataset): string => ds.catalog?.categoriesByCode?.[code]?.cateNm || code;
const brandLabel = (code: string, ds: AnalyticsDataset): string => ds.catalog?.brandsByCode?.[code]?.brandNm || code;

// 주문 단위 groupBy 집계 (month/week/day/payment/channel/segment)
const groupOrders = (
  orders: AnalyticsOrder[], groupBy: AnalyticsGroupBy, ds: AnalyticsDataset, f?: AnalyticsQuerySpec['filters']
): Map<string, Agg> => {
  const segByMember = new Map<string, string>();
  if (groupBy === 'customerSegment') for (const c of ds.customers || []) segByMember.set(c.memberKey, c.segment);
  const m = new Map<string, Agg>();
  for (const o of orders) {
    if (!orderInFilters(o, f)) continue;
    let key: string | undefined;
    if (groupBy === 'month') key = ymd(o.orderDate).slice(0, 7);
    else if (groupBy === 'day') key = ymd(o.orderDate);
    else if (groupBy === 'week') key = weekKey(o.orderDate);
    else if (groupBy === 'paymentMethod') key = o.paymentMethodCode || '(미상)';
    else if (groupBy === 'orderChannel') key = o.orderChannel || '(미상)';
    else if (groupBy === 'customerSegment') key = o.memberKey ? segByMember.get(o.memberKey) || '(미상)' : '(비회원)';
    if (key === undefined) continue;
    const a = m.get(key) || newAgg();
    a.revenue += orderRevenue(o, f);
    a.orders.add(o.orderNo);
    a.units += orderUnits(o, f);
    a.count += 1;
    m.set(key, a);
  }
  return m;
};
// 라인 단위 groupBy 집계 (category/brand/product)
const groupLines = (orders: AnalyticsOrder[], groupBy: AnalyticsGroupBy, f?: AnalyticsQuerySpec['filters']): Map<string, Agg & { name?: string }> => {
  const m = new Map<string, Agg & { name?: string }>();
  for (const o of orders) {
    if (!orderInFilters(o, f)) continue;
    for (const l of o.lines) {
      if (!lineInFilters(l, f)) continue;
      let key: string | undefined;
      let name: string | undefined;
      if (groupBy === 'category') key = l.categoryCode || 'uncategorized';
      else if (groupBy === 'brand') key = l.brandCode || '(브랜드없음)';
      else if (groupBy === 'product') { key = l.goodsNo; name = l.goodsName; }
      if (key === undefined) continue;
      const a = m.get(key) || { ...newAgg(), name };
      a.revenue += l.lineRevenue || 0;
      a.units += l.quantity || 0;
      a.orders.add(o.orderNo);
      if (name && !a.name) a.name = name;
      m.set(key, a);
    }
  }
  return m;
};

const aggToRows = (
  m: Map<string, Agg & { name?: string }>, valueKind: 'revenue' | 'orderCount' | 'units' | 'aov', ds: AnalyticsDataset, groupBy: AnalyticsGroupBy
): AnalyticsRow[] => {
  const rows: AnalyticsRow[] = [];
  for (const [key, a] of m) {
    const oc = a.orders.size;
    const value = valueKind === 'revenue' ? a.revenue : valueKind === 'orderCount' ? oc : valueKind === 'units' ? a.units : oc ? Math.round(a.revenue / oc) : 0;
    let label = key;
    if (groupBy === 'category') label = catLabel(key, ds);
    else if (groupBy === 'brand') label = brandLabel(key, ds);
    else if (groupBy === 'product') label = a.name || key;
    rows.push({ key, label, value, revenue: a.revenue, orderCount: oc, unitCount: a.units });
  }
  const dateLike = groupBy === 'month' || groupBy === 'week' || groupBy === 'day';
  rows.sort((x, y) => (dateLike ? x.key.localeCompare(y.key) : y.value - x.value));
  return rows;
};

// ── 메인 실행기 ──────────────────────────────────────────────────────────────
export function runAnalyticsQuery(dataset: AnalyticsDataset, spec: AnalyticsQuerySpec): AnalyticsQueryResult {
  const reg = REG_MAP[spec.metric];
  if (!reg) {
    return { ok: false, metric: spec.metric, metricLabelKo: spec.metric, rows: [], summary: { rowCount: 0 }, supportLevel: 'not_supported_yet', source: dataset.source || { dataKind: 'synthetic' }, warnings: [`Unknown metric: ${spec.metric}`] };
  }
  // 외부 데이터 필요 지표
  if (reg.supportLevel === 'requires_external_data') {
    return extResult(spec, dataset, reg, `이 지표는 추가 데이터가 필요합니다: ${reg.requiredData.join(', ')}. 연결되면 계산 가능합니다.`);
  }
  // 기간 필터
  const orders = dataset.orders.filter((o) => inPeriod(o.orderDate, spec.startDate, spec.endDate) && orderInFilters(o, spec.filters));
  const reviews = dataset.reviews || [];
  const inquiries = dataset.inquiries || [];
  const customers = dataset.customers || [];

  const noData = (need: string): AnalyticsQueryResult =>
    extResult(spec, dataset, reg, `현재 데이터셋에 ${need}이(가) 없어 계산할 수 없습니다.`);

  const total = (rows: AnalyticsRow[]): number => rows.reduce((s, r) => s + r.value, 0);

  switch (spec.metric) {
    // ── 매출/주문 그룹 집계 ──
    case 'revenue': case 'orderCount': case 'unitCount': case 'averageOrderValue':
    case 'revenueShare':
    case 'paymentMethodRevenue': case 'paymentMethodOrderCount':
    case 'orderChannelRevenue': case 'orderChannelOrderCount':
    case 'categoryRevenue': case 'brandRevenue': case 'categoryAov': case 'brandAov':
    case 'productRevenue': case 'productUnitCount': case 'productOrderCount':
    case 'topProducts': case 'lowPerformingProducts':
    case 'customerSegmentRevenue': {
      if (orders.length === 0) return noData('주문 데이터');
      const gb: AnalyticsGroupBy =
        spec.groupBy ||
        (spec.metric.startsWith('payment') ? 'paymentMethod'
          : spec.metric.startsWith('orderChannel') ? 'orderChannel'
          : spec.metric.startsWith('category') ? 'category'
          : spec.metric.startsWith('brand') ? 'brand'
          : spec.metric.startsWith('product') || spec.metric === 'topProducts' || spec.metric === 'lowPerformingProducts' ? 'product'
          : spec.metric === 'customerSegmentRevenue' ? 'customerSegment'
          : reg.defaultGroupBy || 'month');
      const valueKind: 'revenue' | 'orderCount' | 'units' | 'aov' =
        spec.metric === 'orderCount' || spec.metric.endsWith('OrderCount') ? 'orderCount'
          : spec.metric === 'unitCount' || spec.metric === 'productUnitCount' ? 'units'
          : spec.metric === 'averageOrderValue' || spec.metric.endsWith('Aov') ? 'aov'
          : 'revenue';
      const lineLevel = gb === 'category' || gb === 'brand' || gb === 'product';
      const m = lineLevel ? groupLines(orders, gb, spec.filters) : groupOrders(orders, gb, dataset, spec.filters);
      let rows = aggToRows(m, valueKind, dataset, gb);
      if (spec.metric === 'topProducts') rows = rows.slice(0, 10);
      if (spec.metric === 'lowPerformingProducts') rows = [...rows].sort((a, b) => a.value - b.value).slice(0, 10);
      // revenueShare → pct
      if (spec.metric === 'revenueShare') {
        const t = total(rows) || 1;
        rows = rows.map((r) => ({ ...r, valueLabel: `${round((r.value / t) * 100, 1)}%`, meta: { share: round(r.value / t) } }));
      }
      const tot = total(rows);
      const support: MetricSupportLevel = spec.metric === 'customerSegmentRevenue' ? 'synthetic_only' : reg.supportLevel;
      if (spec.metric === 'customerSegmentRevenue' && customers.length === 0) return noData('고객(customers) 데이터');
      return okResult(spec, dataset, reg, rows, { groupBy: gb, total: valueKind === 'revenue' ? tot : undefined, average: rows.length ? round(tot / rows.length, 0) : 0, support });
    }

    case 'netRevenue': {
      if (orders.length === 0) return noData('주문 데이터');
      const gb = spec.groupBy || 'month';
      const m = groupOrders(orders, gb, dataset, spec.filters);
      const claimByKey = new Map<string, number>();
      for (const o of orders) {
        const amt = o.claim?.claimAmount || 0;
        if (!amt) continue;
        const k = gb === 'month' ? ymd(o.orderDate).slice(0, 7) : gb === 'day' ? ymd(o.orderDate) : weekKey(o.orderDate);
        claimByKey.set(k, (claimByKey.get(k) || 0) + amt);
      }
      const rows: AnalyticsRow[] = aggToRows(m, 'revenue', dataset, gb).map((r) => {
        const net = r.value - (claimByKey.get(r.key) || 0);
        return { ...r, value: net, meta: { gross: r.value, claim: claimByKey.get(r.key) || 0 } };
      });
      return okResult(spec, dataset, reg, rows, { groupBy: gb, total: total(rows), warnings: ['순매출은 claimSummary.claimAmount 차감 기준 — 환불 금액 정합성은 v0 근사값.'] });
    }

    case 'salesGrowthRate': {
      if (orders.length === 0) return noData('주문 데이터');
      const m = groupOrders(orders, 'month', dataset, spec.filters);
      const base = aggToRows(m, 'revenue', dataset, 'month');
      let prev: number | null = null;
      const rows = base.map((r) => {
        const rate = prev !== null && prev > 0 ? round(((r.value - prev) / prev) * 100, 1) : 0;
        const out: AnalyticsRow = { key: r.key, label: r.key, value: rate, valueLabel: `${rate}%`, revenue: r.value, previousValue: prev ?? undefined, changeRate: prev ? round((r.value - (prev || 0)) / (prev || 1), 4) : undefined };
        prev = r.value;
        return out;
      });
      return okResult(spec, dataset, reg, rows, { groupBy: 'month' });
    }

    case 'periodComparison': {
      if (!spec.compareTo) return extResult(spec, dataset, reg, 'periodComparison은 compareTo 기간이 필요합니다.');
      const cur = orders;
      const cmp = dataset.orders.filter((o) => inPeriod(o.orderDate, spec.compareTo!.startDate, spec.compareTo!.endDate) && orderInFilters(o, spec.filters));
      const sum = (arr: AnalyticsOrder[]) => arr.reduce((s, o) => s + orderRevenue(o, spec.filters), 0);
      const a = sum(cur); const b = sum(cmp);
      const rows: AnalyticsRow[] = [
        { key: 'current', label: `${spec.startDate || '시작'}~${spec.endDate || '끝'}`, value: a, revenue: a, orderCount: cur.length },
        { key: 'compare', label: spec.compareTo.label || `${spec.compareTo.startDate}~${spec.compareTo.endDate}`, value: b, revenue: b, orderCount: cmp.length, previousValue: a, changeAmount: a - b, changeRate: b ? round((a - b) / b, 4) : undefined }
      ];
      return okResult(spec, dataset, reg, rows, { groupBy: 'month', total: a });
    }

    // ── 클레임율 ──
    case 'claimRate': case 'cancelRate': case 'refundRate': case 'returnRate': case 'exchangeRate': {
      if (orders.length === 0) return noData('주문 데이터');
      const tot = orders.length;
      const hit = orders.filter((o) => {
        if (spec.metric === 'claimRate') return o.claim?.hasClaim;
        const t = spec.metric.replace('Rate', '');
        return o.claim?.claimTypes?.includes(t);
      }).length;
      const rate = round(hit / tot, 4);
      return okResult(spec, dataset, reg, [{ key: spec.metric, label: reg.labelKo, value: rate, valueLabel: `${round(rate * 100, 1)}%`, orderCount: hit, meta: { hit, total: tot } }], { total: rate });
    }
    case 'claimAmount': {
      if (orders.length === 0) return noData('주문 데이터');
      const amt = orders.reduce((s, o) => s + (o.claim?.claimAmount || 0), 0);
      return okResult(spec, dataset, reg, [{ key: 'claimAmount', label: '클레임 금액', value: amt, valueLabel: `${amt.toLocaleString()}원` }], { total: amt });
    }

    // ── 고객 ──
    case 'customerCount': case 'returningCustomerCount': case 'repurchaseRate': case 'purchaseFrequency': case 'averagePurchaseInterval': {
      if (orders.length === 0) return noData('주문 데이터');
      const byMember = new Map<string, string[]>(); // memberKey → orderDates
      let guests = 0;
      for (const o of orders) {
        if (!o.memberKey) { guests += 1; continue; }
        const arr = byMember.get(o.memberKey) || [];
        arr.push(ymd(o.orderDate));
        byMember.set(o.memberKey, arr);
      }
      const buyers = byMember.size;
      const repeat = [...byMember.values()].filter((d) => d.length >= 2).length;
      if (spec.metric === 'customerCount') return okResult(spec, dataset, reg, [{ key: 'customers', label: '구매 고객 수(가명)', value: buyers, meta: { guestOrders: guests } }], { total: buyers, warnings: guests ? [`비회원/식별불가 주문 ${guests}건은 고객 수에서 제외.`] : undefined });
      if (spec.metric === 'returningCustomerCount') return okResult(spec, dataset, reg, [{ key: 'returning', label: '재구매 고객 수', value: repeat }], { total: repeat });
      if (spec.metric === 'repurchaseRate') { const r = buyers ? round(repeat / buyers, 4) : 0; return okResult(spec, dataset, reg, [{ key: 'repurchaseRate', label: '재구매율', value: r, valueLabel: `${round(r * 100, 1)}%`, meta: { repeat, buyers } }], { total: r }); }
      if (spec.metric === 'purchaseFrequency') { const ordCnt = orders.filter((o) => o.memberKey).length; const f = buyers ? round(ordCnt / buyers, 2) : 0; return okResult(spec, dataset, reg, [{ key: 'purchaseFrequency', label: '평균 구매 횟수', value: f }], { total: f }); }
      // averagePurchaseInterval
      const intervals: number[] = [];
      for (const d of byMember.values()) {
        if (d.length < 2) continue;
        const sorted = [...d].sort();
        for (let i = 1; i < sorted.length; i++) {
          const t0 = new Date(sorted[i - 1]).getTime(); const t1 = new Date(sorted[i]).getTime();
          intervals.push(Math.abs(t1 - t0) / 86400000);
        }
      }
      const avg = intervals.length ? round(intervals.reduce((s, x) => s + x, 0) / intervals.length, 1) : 0;
      return okResult(spec, dataset, reg, [{ key: 'avgInterval', label: '평균 구매 주기(일)', value: avg }], { total: avg, warnings: intervals.length ? undefined : ['재구매 고객이 없어 구매 주기를 계산할 수 없습니다.'] });
    }
    case 'newCustomerCount': case 'vipCandidateCount': case 'dormantRiskCustomerCount': case 'discountSensitiveCustomerCount': case 'highRefundRiskCustomerCount': case 'ltvProxy': {
      if (customers.length === 0) return noData('고객(customers) 데이터');
      if (spec.metric === 'newCustomerCount') { const v = customers.filter((c) => c.orderCount <= 1).length; return okResult(spec, dataset, reg, [{ key: 'new', label: '신규 구매 고객 수', value: v }], { total: v }); }
      if (spec.metric === 'ltvProxy') { const v = customers.length ? round(customers.reduce((s, c) => s + (c.totalPaidAmount || 0), 0) / customers.length, 0) : 0; return okResult(spec, dataset, reg, [{ key: 'ltvProxy', label: 'LTV proxy(고객당 누적매출)', value: v, valueLabel: `${v.toLocaleString()}원` }], { total: v, warnings: ['정교한 LTV가 아니라 현재 보유 주문 기반 proxy.'] }); }
      const seg = spec.metric === 'vipCandidateCount' ? 'vip_candidate' : spec.metric === 'dormantRiskCustomerCount' ? 'dormant_risk' : spec.metric === 'discountSensitiveCustomerCount' ? 'discount_sensitive' : 'high_refund_risk';
      const v = customers.filter((c) => c.segment === seg).length;
      return okResult(spec, dataset, reg, [{ key: seg, label: reg.labelKo, value: v }], { total: v });
    }

    // ── 상품 위험/유망 ──
    case 'refundRiskProducts': {
      if (orders.length === 0) return noData('주문 데이터');
      const m = new Map<string, { name?: string; count: number }>();
      for (const o of orders) {
        if (!o.claim?.claimTypes?.some((t) => t === 'refund' || t === 'return')) continue;
        for (const l of o.lines) { const c = m.get(l.goodsNo) || { name: l.goodsName, count: 0 }; c.count += 1; m.set(l.goodsNo, c); }
      }
      const rows = [...m.entries()].map(([k, v]) => ({ key: k, label: v.name || k, value: v.count })).sort((a, b) => b.value - a.value).slice(0, 10);
      return okResult(spec, dataset, reg, rows, { groupBy: 'product', warnings: rows.length ? undefined : ['환불/반품 클레임 상품이 없습니다.'] });
    }
    case 'repurchaseCandidateProducts': {
      if (orders.length === 0) return noData('주문 데이터');
      const m = new Map<string, { name?: string; buyers: Set<string> }>();
      for (const o of orders) { if (!o.memberKey) continue; for (const l of o.lines) { const c = m.get(l.goodsNo) || { name: l.goodsName, buyers: new Set() }; c.buyers.add(o.memberKey); m.set(l.goodsNo, c); } }
      const rows = [...m.entries()].map(([k, v]) => ({ key: k, label: v.name || k, value: v.buyers.size, customerCount: v.buyers.size })).sort((a, b) => b.value - a.value).slice(0, 10);
      return okResult(spec, dataset, reg, rows, { groupBy: 'product' });
    }

    // ── 리뷰 ──
    case 'reviewCount': case 'reviewAverageRating': case 'reviewSentimentShare': case 'reviewTopicBreakdown': case 'reviewRiskProducts': {
      if (reviews.length === 0) return noData('리뷰(reviews) 데이터');
      if (spec.metric === 'reviewCount') return okResult(spec, dataset, reg, [{ key: 'reviewCount', label: '리뷰 수', value: reviews.length }], { total: reviews.length });
      if (spec.metric === 'reviewAverageRating') { const avg = round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length, 2); return okResult(spec, dataset, reg, [{ key: 'avgRating', label: '평균 리뷰 평점', value: avg }], { total: avg }); }
      if (spec.metric === 'reviewSentimentShare') { const m = new Map<string, number>(); for (const r of reviews) m.set(r.sentiment, (m.get(r.sentiment) || 0) + 1); const rows = [...m.entries()].map(([k, v]) => ({ key: k, label: k, value: v, valueLabel: `${round((v / reviews.length) * 100, 1)}%` })).sort((a, b) => b.value - a.value); return okResult(spec, dataset, reg, rows, { groupBy: 'reviewSentiment', total: reviews.length }); }
      if (spec.metric === 'reviewTopicBreakdown') { const m = new Map<string, number>(); for (const r of reviews) m.set(r.topic, (m.get(r.topic) || 0) + 1); const rows = [...m.entries()].map(([k, v]) => ({ key: k, label: k, value: v })).sort((a, b) => b.value - a.value); return okResult(spec, dataset, reg, rows, { groupBy: 'reviewTopic', total: reviews.length }); }
      // reviewRiskProducts: 상품별 평균 평점 낮은 순
      const m = new Map<string, { sum: number; n: number }>();
      for (const r of reviews) { if (!r.goodsNo) continue; const c = m.get(r.goodsNo) || { sum: 0, n: 0 }; c.sum += r.rating; c.n += 1; m.set(r.goodsNo, c); }
      const rows = [...m.entries()].map(([k, v]) => ({ key: k, label: k, value: round(v.sum / v.n, 2), meta: { reviewCount: v.n } })).sort((a, b) => a.value - b.value).slice(0, 10);
      return okResult(spec, dataset, reg, rows, { groupBy: 'product' });
    }

    // ── 문의/CS ──
    case 'inquiryCount': case 'inquiryTopicBreakdown': case 'unansweredInquiryCount': case 'urgentInquiryCount': case 'csIssueTopProducts': case 'csRiskProducts': {
      if (inquiries.length === 0) return noData('문의(inquiries) 데이터');
      if (spec.metric === 'inquiryCount') return okResult(spec, dataset, reg, [{ key: 'inquiryCount', label: '문의 수', value: inquiries.length }], { total: inquiries.length });
      if (spec.metric === 'unansweredInquiryCount') { const v = inquiries.filter((q) => q.status === 'unanswered').length; return okResult(spec, dataset, reg, [{ key: 'unanswered', label: '미답변 문의 수', value: v }], { total: v }); }
      if (spec.metric === 'urgentInquiryCount') { const v = inquiries.filter((q) => q.urgency === 'high').length; return okResult(spec, dataset, reg, [{ key: 'urgent', label: '긴급 문의 수', value: v }], { total: v }); }
      if (spec.metric === 'inquiryTopicBreakdown') { const m = new Map<string, number>(); for (const q of inquiries) m.set(q.topic, (m.get(q.topic) || 0) + 1); const rows = [...m.entries()].map(([k, v]) => ({ key: k, label: k, value: v })).sort((a, b) => b.value - a.value); return okResult(spec, dataset, reg, rows, { groupBy: 'inquiryTopic', total: inquiries.length }); }
      // csIssueTopProducts / csRiskProducts: 상품별 문의 수
      const m = new Map<string, number>();
      for (const q of inquiries) { if (!q.goodsNo) continue; m.set(q.goodsNo, (m.get(q.goodsNo) || 0) + 1); }
      const rows = [...m.entries()].map(([k, v]) => ({ key: k, label: k, value: v })).sort((a, b) => b.value - a.value).slice(0, 10);
      return okResult(spec, dataset, reg, rows, { groupBy: 'product' });
    }

    default:
      return extResult(spec, dataset, reg, `metric '${spec.metric}'는 v0에서 아직 계산 구현되지 않았습니다(registry 정의됨).`);
  }
}
