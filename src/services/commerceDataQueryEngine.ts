// ────────────────────────────────────────────────────────────────────────────
// Commerce Data Query Engine — 원시연산 조립 계산기(질문별 답변기 아님)
//
// LLM은 자연어 → QueryPlan(원시연산 조립 지시서)만 만든다(숫자 계산 금지).
// 이 Executor는 QueryPlan의 원시연산을 "일반" 실행한다:
//   read · filter · groupBy(임의 축) · seriesBy(임의 축) · aggregate · compute · sort · rank · compare · share · trend · extremes · chartShape
// 새 질문마다 코드가 늘면 실패다. 새 질문은 QueryPlan만 달라져야 한다.
// 숫자는 전부 이 코드가 계산한다. Data Catalog 밖(허용 축·지표 아닌 것)은 unsupported.
// ────────────────────────────────────────────────────────────────────────────

import { isValidOrder } from './revenueMetricContract';
import { categoryDisplayName, formatSharePercent } from './productCategoryDisplay';
import { understandCommerceQuery } from './marketingAnalyticsQueryCompilerLlm';
import type { AnalyticsTeam } from './analyticsQueryTypes';
import { AXIS_LABEL, METRIC_LABEL, METRIC_SOURCE, type Axis, type Metric, type QueryPlan } from './commerceQueryPlan';
import type { MarketingChatChartArtifact, MarketingChartSpec, MarketingChartType } from './marketingChatChartSpec';
import { classifyFirstPurchase, FIRST_PURCHASE_LABEL } from './firstPurchaseContract';

// ── 느슨한 데이터 형태(RevenueOrderLite / universeAux 호환) ──────────────────────
interface OrderLike {
  orderNo?: string; orderDate?: string; totalAmount?: number; paid?: boolean; canceled?: boolean;
  state?: { paid?: boolean; canceled?: boolean };
  memberGroupName?: string; orderChannel?: string; isFirstPurchase?: boolean;
  discountSummary?: { hasCoupon?: boolean };
  lines?: { goodsNo?: string; goodsName?: string; quantity?: number; lineRevenue?: number; categoryCode?: string }[];
}
interface LineLike { goodsNo?: string; goodsName?: string; quantity?: number; lineRevenue?: number; categoryCode?: string }
interface ReviewLike { goodsNo?: string; categoryCode?: string; rating?: number; createdAt?: string; }
interface InquiryLike { goodsNo?: string; categoryCode?: string; createdAt?: string; }
export interface CommerceDataset { orders: OrderLike[]; reviews?: ReviewLike[]; inquiries?: InquiryLike[]; }
export interface CommerceQueryResult { handled: boolean; reply: string; artifact?: MarketingChatChartArtifact; suppressChart: boolean; }

// ── 포맷 ──────────────────────────────────────────────────────────────────────
const num = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
const cnt = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}건`;
const qtyStr = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}개`;
const pad2 = (n: number): string => String(n).padStart(2, '0');
const lastDay = (y: number, m: number): number => new Date(y, m, 0).getDate();
const fmtMetric = (v: number, m: Metric): string =>
  m === 'orderCount' || m === 'inquiryCount' || m === 'reviewCount' ? cnt(v)
    : m === 'quantity' ? qtyStr(v)
    : m === 'averageRating' ? `${(Math.round(v * 100) / 100).toFixed(2)}점`
    : m === 'share' ? formatSharePercent(v)
    : won(v);
const chartUnit = (m: Metric, share: boolean): MarketingChartSpec['unit'] =>
  share || m === 'share' ? 'percent'
    : m === 'orderCount' || m === 'quantity' || m === 'inquiryCount' || m === 'reviewCount' || m === 'averageRating' ? 'count'
    : 'krw';

// ── 기간(read·filter) ─────────────────────────────────────────────────────────
interface Range { years: number[]; months?: number[]; start?: string; end?: string; label: string }
const dateSlice = (s?: string): string => String(s ?? '').slice(0, 10);
const yearOf = (s?: string): number => Number(String(s ?? '').slice(0, 4));
const monthOf = (s?: string): number => Number(String(s ?? '').slice(5, 7));
function datasetYears(orders: OrderLike[]): number[] {
  return [...new Set(orders.map((o) => yearOf(o.orderDate)).filter((y) => y >= 2000 && y <= 2100))].sort((a, b) => a - b);
}
function resolveRange(plan: QueryPlan, orders: OrderLike[]): Range {
  const f = plan.filters || {};
  const years = f.years && f.years.length ? [...f.years].sort((a, b) => a - b) : datasetYears(orders);
  const months = f.months && f.months.length ? [...f.months].sort((a, b) => a - b) : undefined;
  let label: string;
  if (f.start && f.end) label = `${f.start}~${f.end}`;
  else if (months && months.length) label = `${years.join('·')}년 ${months[0] === months[months.length - 1] ? `${months[0]}월` : `${months[0]}~${months[months.length - 1]}월`}`;
  else if (f.years && f.years.length) label = `${years.join('·')}년`;
  else label = '전체 기간';
  // start/end 명시가 없으면 years/months로 경계 도출(단일해·단일월 등 정확 보존).
  let start = f.start, end = f.end;
  if (!start && !end && years.length === 1) {
    const y = years[0];
    const sm = months && months.length ? months[0] : 1;
    const em = months && months.length ? months[months.length - 1] : 12;
    start = `${y}-${pad2(sm)}-01`; end = `${y}-${pad2(em)}-${pad2(lastDay(y, em))}`;
  }
  return { years, months, start, end, label };
}
const inRange = (dateStr: string | undefined, r: Range): boolean => {
  const d = dateSlice(dateStr);
  if (!d) return false;
  if (r.years.length && !r.years.includes(yearOf(dateStr))) return false;
  if (r.months && r.months.length && !r.months.includes(monthOf(dateStr))) return false;
  if (r.start && d < r.start) return false;
  if (r.end && d > r.end) return false;
  return true;
};
function passOrderFilters(o: OrderLike, plan: QueryPlan): boolean {
  const f = plan.filters; if (!f) return true;
  if (f.couponUsed === true && !o.discountSummary?.hasCoupon) return false;
  if (f.couponUsed === false && o.discountSummary?.hasCoupon) return false;
  // C-8: 정확히 일치하는 상태만 통과. repeat 필터에 미분류(unknown)를 넣지 않는다.
  //   (구 구현은 `isFirstPurchase === true`만 배제해 undefined 주문이 재구매로 새어 들어갔다)
  if (f.customerType === 'first' && classifyFirstPurchase(o.isFirstPurchase) !== 'first') return false;
  if (f.customerType === 'repeat' && classifyFirstPurchase(o.isFirstPurchase) !== 'repeat') return false;
  if (f.memberGroup && String(o.memberGroupName ?? '') !== f.memberGroup) return false;
  if (f.channel && String(o.orderChannel ?? '') !== f.channel) return false;
  if (f.category && !(o.lines ?? []).some((l) => l.categoryCode === f.category)) return false;
  if (f.goodsNo && !(o.lines ?? []).some((l) => l.goodsNo === f.goodsNo)) return false;
  return true;
}

// ── 원시연산: grain 결정 + 축 키 추출 ────────────────────────────────────────────
type Grain = 'order' | 'line' | 'inquiry' | 'review';
const LINE_AXES = new Set<Axis>(['product', 'category']);
function resolveGrain(plan: QueryPlan): Grain {
  const src = METRIC_SOURCE[plan.metric];
  if (src === 'inquiries') return 'inquiry';
  if (src === 'reviews') return 'review';
  if ((plan.groupBy && LINE_AXES.has(plan.groupBy)) || (plan.seriesBy && LINE_AXES.has(plan.seriesBy))) return 'line';
  return 'order';
}
type KL = { key: string; label: string };
const productNameMap = (orders: OrderLike[]): Map<string, string> => {
  const m = new Map<string, string>();
  for (const o of orders) for (const l of o.lines ?? []) { const k = String(l.goodsNo ?? ''); if (k && !m.has(k)) m.set(k, String(l.goodsName || l.goodsNo || k)); }
  return m;
};
// 축 키를 어떤 소스 엔티티에서든 추출(가능하면). null이면 그 축은 이 grain에서 추출 불가.
function axisKey(axis: Axis | undefined, ctx: { order?: OrderLike; line?: LineLike; inquiry?: InquiryLike; review?: ReviewLike; date?: string; names?: Map<string, string>; monthFull?: boolean }): KL | null {
  if (!axis) return { key: 'all', label: '전체' };
  const nameOf = (g?: string): string => (g && ctx.names?.get(String(g))) || String(g ?? '(이름없음)');
  const d = ctx.date;
  switch (axis) {
    case 'year': { const y = yearOf(d); return y ? { key: String(y), label: `${y}년` } : null; }
    // month: 연도로 series를 나누면 MM(정렬 정렬), 그 외 다연도는 YYYY-MM으로 구분(12월이 합쳐지지 않게).
    case 'month': { const m = monthOf(d); if (!m) return null; const y = yearOf(d); return ctx.monthFull ? { key: `${y}-${pad2(m)}`, label: `${y}년 ${m}월` } : { key: pad2(m), label: `${m}월` }; }
    case 'product': case 'inquiryProduct': {
      const g = ctx.line?.goodsNo ?? ctx.inquiry?.goodsNo ?? ctx.review?.goodsNo;
      return g != null ? { key: String(g), label: nameOf(String(g)) } : null;
    }
    case 'category': {
      const c = ctx.line?.categoryCode ?? ctx.inquiry?.categoryCode ?? ctx.review?.categoryCode;
      return c != null ? { key: String(c), label: categoryDisplayName(String(c)) } : null;
    }
    case 'couponUsed': { if (!ctx.order) return null; const u = !!ctx.order.discountSummary?.hasCoupon; return { key: u ? 'used' : 'unused', label: u ? '쿠폰 사용' : '쿠폰 미사용' }; }
    case 'memberGroup': { if (!ctx.order) return null; const g = String(ctx.order.memberGroupName ?? '미분류'); return { key: g, label: g }; }
    case 'channel': { if (!ctx.order) return null; const g = String(ctx.order.orderChannel ?? '미상'); return { key: g, label: g }; }
    // C-8: 3상태. groupBy·seriesBy 어느 위치에서 호출되든 같은 판정을 쓴다.
    //   미분류는 정상적인 고객 유형이 아니라 '첫구매 여부가 없는 주문'이다.
    case 'customerType': {
      if (!ctx.order) return null;
      const cls = classifyFirstPurchase(ctx.order.isFirstPurchase);
      return { key: cls, label: cls === 'first' ? '신규(첫구매)' : FIRST_PURCHASE_LABEL[cls] };
    }
    case 'reviewRating': { const r = ctx.review?.rating; return r != null ? { key: String(r), label: `${r}점` } : null; }
  }
  return null;
}

// ── 원시연산: groupBy × seriesBy → 표(table) ─────────────────────────────────────
interface Acc { rev: number; qty: number; orders: Set<string>; n: number; ratingSum: number }
const newAcc = (): Acc => ({ rev: 0, qty: 0, orders: new Set(), n: 0, ratingSum: 0 });
const metricValue = (a: Acc, m: Metric): number => {
  switch (m) {
    case 'revenue': case 'share': return a.rev;
    case 'orderCount': return a.orders.size;
    case 'quantity': return a.qty;
    case 'averageOrderValue': return a.orders.size > 0 ? Math.round(a.rev / a.orders.size) : 0;
    case 'inquiryCount': case 'reviewCount': return a.n;
    case 'averageRating': return a.n > 0 ? a.ratingSum / a.n : 0;
  }
};
interface Group { key: string; label: string; cells: Map<string, Acc>; total: Acc; secondary?: number }
interface Table { groups: Group[]; series: KL[] }

function tabulate(plan: QueryPlan, dataset: CommerceDataset, range: Range, names: Map<string, string>): Table {
  const grain = resolveGrain(plan);
  // 다연도를 연도 series로 나누지 않으면 월을 YYYY-MM으로 구분(연도 간 같은 달이 합쳐지지 않게).
  const monthFull = range.years.length > 1 && plan.seriesBy !== 'year';
  const groups = new Map<string, Group>();
  const seriesMap = new Map<string, string>(); // key → label
  const bump = (gk: KL, sk: KL, mut: (a: Acc) => void): void => {
    let g = groups.get(gk.key);
    if (!g) { g = { key: gk.key, label: gk.label, cells: new Map(), total: newAcc() }; groups.set(gk.key, g); }
    let c = g.cells.get(sk.key);
    if (!c) { c = newAcc(); g.cells.set(sk.key, c); }
    if (!seriesMap.has(sk.key)) seriesMap.set(sk.key, sk.label);
    mut(c); mut(g.total);
  };

  if (grain === 'order' || grain === 'line') {
    for (const o of dataset.orders) {
      if (!isValidOrder(o) || !inRange(o.orderDate, range) || !passOrderFilters(o, plan)) continue;
      if (grain === 'line') {
        for (const l of o.lines ?? []) {
          if (plan.filters?.category && l.categoryCode !== plan.filters.category) continue;
          if (plan.filters?.goodsNo && l.goodsNo !== plan.filters.goodsNo) continue;
          const gk = axisKey(plan.groupBy, { order: o, line: l, date: o.orderDate, names, monthFull });
          const sk = axisKey(plan.seriesBy, { order: o, line: l, date: o.orderDate, names, monthFull });
          if (!gk || !sk) continue;
          bump(gk, sk, (a) => { a.rev += num(l.lineRevenue); a.qty += num(l.quantity); if (o.orderNo) a.orders.add(o.orderNo); });
        }
      } else {
        const gk = axisKey(plan.groupBy, { order: o, date: o.orderDate, names, monthFull });
        const sk = axisKey(plan.seriesBy, { order: o, date: o.orderDate, names, monthFull });
        if (!gk || !sk) continue;
        let qty = 0; for (const l of o.lines ?? []) qty += num(l.quantity);
        bump(gk, sk, (a) => { a.rev += num(o.totalAmount); a.qty += qty; if (o.orderNo) a.orders.add(o.orderNo); });
      }
    }
  } else if (grain === 'inquiry') {
    for (const iq of dataset.inquiries ?? []) {
      if (!inRange(iq.createdAt, range)) continue;
      if (plan.filters?.category && iq.categoryCode !== plan.filters.category) continue;
      if (plan.filters?.goodsNo && iq.goodsNo !== plan.filters.goodsNo) continue;
      const gk = axisKey(plan.groupBy, { inquiry: iq, date: iq.createdAt, names, monthFull });
      const sk = axisKey(plan.seriesBy, { inquiry: iq, date: iq.createdAt, names, monthFull });
      if (!gk || !sk) continue;
      bump(gk, sk, (a) => { a.n += 1; });
    }
  } else {
    for (const rv of dataset.reviews ?? []) {
      if (!inRange(rv.createdAt, range)) continue;
      if (plan.filters?.category && rv.categoryCode !== plan.filters.category) continue;
      if (plan.filters?.goodsNo && rv.goodsNo !== plan.filters.goodsNo) continue;
      const gk = axisKey(plan.groupBy, { review: rv, date: rv.createdAt, names, monthFull });
      const sk = axisKey(plan.seriesBy, { review: rv, date: rv.createdAt, names, monthFull });
      if (!gk || !sk) continue;
      bump(gk, sk, (a) => { a.n += 1; a.ratingSum += num(rv.rating); });
    }
  }

  const series: KL[] = [...seriesMap.entries()].map(([key, label]) => ({ key, label }));
  // series 정렬: year/월 등 숫자면 오름차순, 아니면 등장순 유지.
  series.sort((a, b) => (/^\d+$/.test(a.key) && /^\d+$/.test(b.key) ? Number(a.key) - Number(b.key) : 0));
  return { groups: [...groups.values()], series };
}

// join(보조 지표): groupBy가 상품/문의상품이면 goodsNo로 다른 소스 지표를 붙인다.
function computeSecondaryByProduct(plan: QueryPlan, dataset: CommerceDataset, range: Range): Map<string, number> {
  const m = new Map<string, number>();
  const metric = plan.secondaryMetric!;
  const src = METRIC_SOURCE[metric];
  const accs = new Map<string, Acc>();
  const get = (k: string): Acc => { let a = accs.get(k); if (!a) { a = newAcc(); accs.set(k, a); } return a; };
  if (src === 'orders') {
    for (const o of dataset.orders) { if (!isValidOrder(o) || !inRange(o.orderDate, range) || !passOrderFilters(o, plan)) continue; for (const l of o.lines ?? []) { const k = String(l.goodsNo ?? ''); if (!k) continue; const a = get(k); a.rev += num(l.lineRevenue); a.qty += num(l.quantity); if (o.orderNo) a.orders.add(o.orderNo); } }
  } else if (src === 'inquiries') {
    for (const iq of dataset.inquiries ?? []) { if (!inRange(iq.createdAt, range)) continue; const k = String(iq.goodsNo ?? ''); if (!k) continue; get(k).n += 1; }
  } else {
    for (const rv of dataset.reviews ?? []) { if (!inRange(rv.createdAt, range)) continue; const k = String(rv.goodsNo ?? ''); if (!k) continue; const a = get(k); a.n += 1; a.ratingSum += num(rv.rating); }
  }
  for (const [k, a] of accs) m.set(k, metricValue(a, metric));
  return m;
}

// ── 정렬/차트 ────────────────────────────────────────────────────────────────
interface Row { key: string; label: string; value: number; acc: Acc; secondary?: number; secondaryLabel?: string }
const rowsSingleSeries = (t: Table, metric: Metric): Row[] =>
  t.groups.map((g) => { const acc = g.total; return { key: g.key, label: g.label, value: metricValue(acc, metric), acc, secondary: g.secondary }; });
const sortNumericKey = (rows: Row[]): Row[] => [...rows].sort((a, b) => (/^\d+$/.test(a.key) && /^\d+$/.test(b.key) ? Number(a.key) - Number(b.key) : a.key.localeCompare(b.key)));
const activeRows = (rows: Row[]): Row[] => { const a = rows.filter((r) => r.acc.orders.size > 0 || r.acc.n > 0 || r.value !== 0); return a.length ? a : rows; };

function rankedBarSpec(rows: Row[], metric: Metric, title: string, subtitle: string, share: boolean, chartType: MarketingChartType = 'rankedBar'): MarketingChartSpec {
  return {
    id: `cdq_${metric}_${chartType}`, title, subtitle, chartType, primaryMetric: share ? 'share' : metric,
    series: rows.map((r) => ({ key: r.key, label: r.label, metric: metric as unknown as MarketingChartSpec['series'][number]['metric'], points: [{ bucketKey: r.key, bucketLabel: r.label, value: r.value, orderCount: r.acc.orders.size, revenue: r.acc.rev, quantity: r.acc.qty, averageOrderValue: metricValue(r.acc, 'averageOrderValue'), secondaryLabel: r.secondaryLabel }] })),
    xAxisLabel: '항목', yAxisLabel: share ? '비중' : METRIC_LABEL[metric], unit: chartUnit(metric, share), source: 'temporal_crosstab',
    request: { timeBucket: 'month', dimensions: [], metrics: [metric] as unknown as MarketingChartSpec['request']['metrics'] },
    available: rows.length > 0, evidence: [], warnings: []
  };
}
function comboTimeSpec(rows: Row[], metric: Metric, title: string, subtitle: string): MarketingChartSpec {
  const t = sortNumericKey(rows);
  return {
    id: `cdq_time_${metric}`, title, subtitle, chartType: 'line', primaryMetric: metric,
    series: [{ key: metric, label: METRIC_LABEL[metric], metric: metric as unknown as MarketingChartSpec['series'][number]['metric'], points: t.map((r) => ({ bucketKey: /^\d{4}-\d{2}$/.test(r.key) ? r.key : pad2(Number(r.key) || 0), bucketLabel: r.label, value: r.value, orderCount: r.acc.orders.size, revenue: r.acc.rev, quantity: r.acc.qty, averageOrderValue: metricValue(r.acc, 'averageOrderValue') })) }],
    xAxisLabel: '기간', yAxisLabel: METRIC_LABEL[metric], unit: chartUnit(metric, false), source: 'temporal_crosstab',
    request: { timeBucket: 'month', dimensions: [], metrics: [metric] as unknown as MarketingChartSpec['request']['metrics'] },
    available: rows.length > 0, evidence: [], warnings: []
  };
}
// seriesBy(다중 series) → grouped vertical(연도/세그먼트별 색). buckets = groupBy 축.
function groupedSpec(t: Table, plan: QueryPlan, title: string, subtitle: string): MarketingChartSpec {
  const metric = plan.metric;
  const buckets = sortNumericKey(t.groups.map((g) => ({ key: g.key, label: g.label, value: 0, acc: newAcc() })));
  return {
    id: `cdq_grouped_${metric}`, title, subtitle, chartType: 'groupedBar', primaryMetric: metric,
    series: t.series.map((s) => ({
      key: s.key, label: s.label, metric: metric as unknown as MarketingChartSpec['series'][number]['metric'],
      points: buckets.map((b) => { const g = t.groups.find((x) => x.key === b.key)!; const acc = g.cells.get(s.key) ?? newAcc(); return { bucketKey: b.key, bucketLabel: b.label, value: metricValue(acc, metric), orderCount: acc.orders.size, revenue: acc.rev, quantity: acc.qty, averageOrderValue: metricValue(acc, 'averageOrderValue') }; })
    })),
    xAxisLabel: plan.groupBy ? AXIS_LABEL[plan.groupBy] : '구간', yAxisLabel: METRIC_LABEL[metric], unit: chartUnit(metric, false), source: 'temporal_crosstab',
    request: { timeBucket: 'month', dimensions: [], metrics: [metric] as unknown as MarketingChartSpec['request']['metrics'] },
    available: t.groups.length > 0 && t.series.length > 0, evidence: [], warnings: []
  };
}
function artifactOf(cs: MarketingChartSpec, reply: string, bullets: string[], nowMs: number, warnings: string[] = []): MarketingChatChartArtifact {
  return {
    type: 'marketing_chart_spec', source: 'marketingScopeInsightEngine', intent: 'commerce_data_query',
    plan: {}, request: cs.request, chartSpec: { ...cs, warnings: [...(cs.warnings ?? []), ...warnings] },
    narrative: { title: cs.title, summary: reply.split('\n')[0] || cs.title, bullets, evidence: [], warnings },
    evidence: [], createdAt: new Date(nowMs).toISOString()
  };
}

// C-8: customerType 축에 미분류가 있을 때의 공용 안내.
//   operation(rank/share/trend/extremes…)이나 축 위치(groupBy/seriesBy)에 따라 달라지면 안 되므로
//   판정과 문구를 한 곳에 둔다. 판단은 표시 라벨이 아니라 key === 'unknown' 존재로 한다.
//   memberGroup 등 다른 축의 '미분류' 라벨은 이 경고를 발생시키지 않는다.
export const CUSTOMER_TYPE_UNKNOWN_NOTE =
  '미분류는 고객 유형이 아니라 첫구매 여부 정보가 없는 주문이며, 전체 실적에는 포함됩니다.';

// ── 전 팀 공용 진입점: 이해(LLM→QueryPlan) → 실행. 열린 질문이면 null(호출부가 열린 경로). ──
export async function answerCommerceQuestion(
  message: string, dataset: CommerceDataset,
  opts?: { callLlm?: (prompt: string) => Promise<string>; nowMs?: number; team?: AnalyticsTeam }
): Promise<CommerceQueryResult | null> {
  if (!dataset.orders || !dataset.orders.length) return null;
  const plan = await understandCommerceQuery(message, { callLlm: opts?.callLlm, nowMs: opts?.nowMs, team: opts?.team });
  if (!plan) return null;
  return executeCommerceQueryPlan(plan, dataset, { nowMs: opts?.nowMs });
}

// ── Executor: QueryPlan 원시연산 실행 ─────────────────────────────────────────────
export function executeCommerceQueryPlan(plan: QueryPlan, dataset: CommerceDataset, opts?: { nowMs?: number }): CommerceQueryResult | null {
  const nowMs = opts?.nowMs ?? Date.now();
  const orders = dataset.orders || [];
  if (!orders.length) return null;
  if (plan.unsupportedReason) {
    return { handled: true, reply: `${plan.unsupportedReason}\n대신 매출·주문수·객단가·판매수량·문의수·리뷰/평점을 기간·상품·카테고리·쿠폰·회원그룹·채널·신규/재구매 기준으로 조회·비교할 수 있습니다.`, suppressChart: true };
  }
  const src = METRIC_SOURCE[plan.metric];
  if (src === 'inquiries' && !(dataset.inquiries && dataset.inquiries.length)) return { handled: true, reply: '문의 데이터가 아직 연결되어 있지 않습니다.', suppressChart: true };
  if (src === 'reviews' && !(dataset.reviews && dataset.reviews.length)) return { handled: true, reply: '리뷰 데이터가 아직 연결되어 있지 않습니다.', suppressChart: true };

  const range = resolveRange(plan, orders);
  const names = productNameMap(orders);
  const metric = plan.metric;
  const label = METRIC_LABEL[metric];
  const filterNote = (() => {
    const f = plan.filters; if (!f) return '';
    const bits: string[] = [];
    if (f.couponUsed === true) bits.push('쿠폰 사용'); if (f.couponUsed === false) bits.push('쿠폰 미사용');
    if (f.customerType) bits.push(f.customerType === 'first' ? '신규' : '재구매');
    if (f.memberGroup) bits.push(f.memberGroup); if (f.channel) bits.push(f.channel);
    return bits.length ? ` (${bits.join('·')})` : '';
  })();
  const scope = `${range.label}${filterNote}`;
  const chartOn = !plan.chartSuppressed;

  const table = tabulate(plan, dataset, range, names);
  if (!table.groups.length) return { handled: true, reply: `${scope} 기준 해당하는 데이터가 없습니다.`, suppressChart: true };

  // C-8: 미분류 안내 단일 판정 — groupBy·seriesBy 어느 위치든, operation과 무관하게 동일하게 적용한다.
  const hasCustomerTypeUnknown =
    (plan.groupBy === 'customerType' && table.groups.some((g) => g.key === 'unknown'))
    || (plan.seriesBy === 'customerType' && table.series.some((s) => s.key === 'unknown'));
  const axisWarnings: string[] = hasCustomerTypeUnknown ? [CUSTOMER_TYPE_UNKNOWN_NOTE] : [];
  /** 응답 본문 끝에 공용 안내를 한 번만 붙인다(중복 방지). */
  const withNote = (r: string): string => (hasCustomerTypeUnknown ? `${r}\n\n※ ${CUSTOMER_TYPE_UNKNOWN_NOTE}` : r);

  // ── seriesBy 있으면 grouped 비교(연도/세그먼트별 색). trend/compare 등 모두 여기로. ──
  if (plan.seriesBy && table.series.length >= 2) {
    const rows = sortNumericKey(table.groups.map((g) => ({ key: g.key, label: g.label, value: 0, acc: g.total })));
    // 각 series 총계 요약(간결).
    const seriesTotals = table.series.map((s) => {
      const acc = newAcc();
      for (const g of table.groups) { const c = g.cells.get(s.key); if (c) { acc.rev += c.rev; acc.qty += c.qty; acc.n += c.n; acc.ratingSum += c.ratingSum; for (const on of c.orders) acc.orders.add(on); } }
      return { s, value: metricValue(acc, metric) };
    });
    const bullets = seriesTotals.map((x) => `${x.s.label}: ${fmtMetric(x.value, metric)}`);
    const gLabel = plan.groupBy ? AXIS_LABEL[plan.groupBy] : '구간';
    const reply = [`${scope} ${gLabel}별 ${label}을(를) ${table.series.map((s) => s.label).join(' vs ')}로 비교했습니다.`, ...bullets].join('\n');
    const cs = groupedSpec(table, plan, `${scope} ${label} 비교`, `${gLabel}별 · ${table.series.map((s) => s.label).join(' vs ')}`);
    void rows;
    return { handled: true, reply: withNote(reply), artifact: chartOn ? artifactOf(cs, withNote(reply), bullets, nowMs, axisWarnings) : undefined, suppressChart: !!plan.chartSuppressed };
  }

  const rows = rowsSingleSeries(table, metric);

  // ── summarize / 그룹 없음 → 하나의 수 ──
  if (plan.operation === 'summarize' || !plan.groupBy) {
    const a = table.groups.reduce((acc, g) => { acc.rev += g.total.rev; acc.qty += g.total.qty; acc.n += g.total.n; acc.ratingSum += g.total.ratingSum; for (const on of g.total.orders) acc.orders.add(on); return acc; }, newAcc());
    const v = metricValue(a, metric);
    const detail = src === 'orders'
      ? ` (매출 ${won(a.rev)} · 주문 ${cnt(a.orders.size)} · 판매 ${qtyStr(a.qty)} · 객단가 ${won(metricValue(a, 'averageOrderValue'))})`
      : src === 'reviews' ? ` (리뷰 ${cnt(a.n)} · 평균 ${fmtMetric(metricValue(a, 'averageRating'), 'averageRating')})` : ` (문의 ${cnt(a.n)})`;
    return { handled: true, reply: withNote(`${scope} ${label}: ${fmtMetric(v, metric)}${detail}.`), suppressChart: true };
  }

  // ── extremes: 최고 + 최저 2개 ──
  if (plan.operation === 'extremes') {
    const act = activeRows(rows);
    const hi = act.reduce((a, b) => (b.value > a.value ? b : a));
    const lo = act.reduce((a, b) => (b.value < a.value ? b : a));
    const reply = [`${scope} ${label} 최고·최저입니다.`, `최고: ${hi.label} ${fmtMetric(hi.value, metric)}`, `최저: ${lo.label} ${fmtMetric(lo.value, metric)}`, `차이: ${fmtMetric(hi.value - lo.value, metric)}`].join('\n');
    const cs = rankedBarSpec([hi, lo], metric, `${scope} ${label} 최고·최저`, '최고 vs 최저', false);
    return { handled: true, reply: withNote(reply), artifact: chartOn ? artifactOf(cs, withNote(reply), reply.split('\n').slice(1), nowMs, axisWarnings) : undefined, suppressChart: !!plan.chartSuppressed };
  }

  // ── argmax / argmin ──
  if (plan.operation === 'argmax' || plan.operation === 'argmin') {
    const act = activeRows(rows);
    const min = plan.operation === 'argmin';
    const ext = act.reduce((a, b) => (min ? (b.value < a.value ? b : a) : (b.value > a.value ? b : a)));
    const top = [...act].sort((a, b) => (min ? a.value - b.value : b.value - a.value)).slice(0, 3);
    const bullets = top.map((r, i) => `${i + 1}. ${r.label} ${fmtMetric(r.value, metric)}`);
    const reply = [`${scope} ${label}이(가) 가장 ${min ? '낮았던' : '높았던'} 것은 ${ext.label}(${fmtMetric(ext.value, metric)})입니다.`, ...bullets].join('\n');
    const isTime = plan.groupBy === 'month';
    const cs = isTime ? comboTimeSpec(rows, metric, `${scope} ${label} 추이`, `월별 · ${label}`) : rankedBarSpec(top, metric, `${scope} ${label} ${min ? '최저' : '최고'}`, label, false);
    return { handled: true, reply: withNote(reply), artifact: chartOn ? artifactOf(cs, withNote(reply), bullets, nowMs, axisWarnings) : undefined, suppressChart: !!plan.chartSuppressed };
  }

  // ── trend: 단일 series 추이(세로 combo) ──
  if (plan.operation === 'trend') {
    const t = sortNumericKey(rows);
    const act = activeRows(t);
    const hi = act.reduce((a, b) => (b.value > a.value ? b : a));
    const lo = act.reduce((a, b) => (b.value < a.value ? b : a));
    const reply = `${scope} ${label} 추이입니다. 최고 ${hi.label}(${fmtMetric(hi.value, metric)}), 최저 ${lo.label}(${fmtMetric(lo.value, metric)}).`;
    const cs = comboTimeSpec(t, metric, `${scope} ${label} 추이`, `${plan.groupBy ? AXIS_LABEL[plan.groupBy] : '기간'}별 · ${label}`);
    return { handled: true, reply: withNote(reply), artifact: chartOn ? artifactOf(cs, withNote(reply), [], nowMs, axisWarnings) : undefined, suppressChart: !!plan.chartSuppressed };
  }

  // C-7 계약: 분모·분자·정렬·본문 원값/단위가 모두 **basisMetric 하나**를 따른다.
  //   · metric === 'share'(지표로서의 share)는 하위호환을 위해 revenue로 정규화한다.
  //     (Metric과 Operation 양쪽에 share가 존재하므로 기준을 명시한다)
  //   · 평균 지표(객단가·평균평점)는 평균의 합을 분모로 쓰는 것이 의미가 없어 계산을 거부한다.
  //   · 동률은 매출을 숨은 보조 정렬로 쓰지 않고 key로 결정적으로 정렬한다.
  if (plan.operation === 'share') {
    const basisMetric: Metric = metric === 'share' ? 'revenue' : metric;
    const SHARE_BASIS_ALLOWED: Metric[] = ['revenue', 'quantity', 'orderCount', 'inquiryCount', 'reviewCount'];
    if (!SHARE_BASIS_ALLOWED.includes(basisMetric)) {
      const reply = `${METRIC_LABEL[basisMetric]}은(는) 평균값이라 비중(점유율)을 계산할 수 없습니다. `
        + `평균끼리 더한 값을 분모로 쓰면 의미가 없기 때문입니다. `
        + `매출·판매수량·주문수·문의수·리뷰수 기준으로 다시 질문해 주세요.`;
      return { handled: true, reply, suppressChart: true };
    }
    const basisOf = (r: Row): number => metricValue(r.acc, basisMetric);
    const total = rows.reduce((s, r) => s + basisOf(r), 0);
    const withShare = rows
      .map((r) => ({ ...r, basis: basisOf(r), value: total > 0 ? basisOf(r) / total : 0 }))
      .sort((a, b) => (b.basis - a.basis) || a.key.localeCompare(b.key));
    const bullets = withShare.map((r) => `${r.label}: ${fmtMetric(r.basis, basisMetric)} (${formatSharePercent(r.value)})`);
    const reply = [`${scope} ${plan.groupBy ? AXIS_LABEL[plan.groupBy] : ''} ${METRIC_LABEL[basisMetric]} 비중입니다.`, ...bullets].join('\n');
    const shareRows: Row[] = withShare.map((r) => ({ key: r.key, label: r.label, value: Math.round(r.value * 1000) / 10, acc: r.acc }));
    const cs = rankedBarSpec(shareRows, 'share', `${scope} ${METRIC_LABEL[basisMetric]} 비중`, '비중(%)', true);
    return { handled: true, reply: withNote(reply), artifact: chartOn ? artifactOf(cs, withNote(reply), bullets, nowMs, axisWarnings) : undefined, suppressChart: !!plan.chartSuppressed };
  }

  // ── rank(+join 보조 지표): 순위 ──
  {
    let ranked = [...rows];
    // join: 보조 지표(예: 문의수 상위 → 그 중 매출순). groupBy가 상품/문의상품일 때 goodsNo로 붙임.
    const joinable = plan.secondaryMetric && (plan.groupBy === 'product' || plan.groupBy === 'inquiryProduct');
    if (joinable) {
      const sec = computeSecondaryByProduct(plan, dataset, range);
      ranked = ranked.map((r) => ({ ...r, secondary: sec.get(r.key) ?? 0 }));
      // 1차 지표(예: 문의수)로 범위를 좁힌 뒤, 보조 지표(예: 매출)로 나열.
      const pool = [...ranked].sort((a, b) => b.value - a.value).slice(0, plan.topN && plan.topN > 0 ? plan.topN : 10);
      ranked = pool.sort((a, b) => (b.secondary ?? 0) - (a.secondary ?? 0));
    } else {
      // 동률일 때 입력 배열 순서에 좌우되지 않도록 key로 결정적 tie-break를 둔다.
      ranked.sort((a, b) => (plan.sort === 'asc' ? a.value - b.value : b.value - a.value) || a.key.localeCompare(b.key));
      const topN = plan.topN && plan.topN > 0 ? plan.topN : (plan.groupBy === 'product' ? 5 : ranked.length);
      ranked = ranked.slice(0, Math.max(topN, 1));
    }
    const total = rows.reduce((s, r) => s + r.acc.rev, 0);
    const secLabel = plan.secondaryMetric ? METRIC_LABEL[plan.secondaryMetric] : '';
    const bullets = ranked.map((r, i) => {
      const base = `${i + 1}위 ${r.label}: ${fmtMetric(r.value, metric)}`;
      if (joinable) return `${base} · ${secLabel} ${fmtMetric(r.secondary ?? 0, plan.secondaryMetric!)}`;
      const extra = plan.groupBy === 'product' ? ` (판매 ${qtyStr(r.acc.qty)})` : '';
      const shr = total > 0 && metric === 'revenue' ? ` · 비중 ${formatSharePercent(r.acc.rev / total)}` : '';
      return `${base}${extra}${shr}`;
    });
    const head = joinable ? `${scope} ${label} 상위 항목을 ${secLabel} 순으로 정렬했습니다.` : `${scope} ${label} ${plan.sort === 'asc' ? '하위' : '상위'} 순위입니다.`;
    // C-8 안내는 rank 전용이 아니라 공용 withNote가 담당한다(중복 방지).
    const reply = [head, ...bullets].join('\n');
    // join이면 보조 지표(매출) 막대가 더 유의미 → 보조 지표로 차트.
    // join: 막대는 보조 지표(매출)지만, 1차 지표(문의수)를 데이터라벨로 각 막대에 노출.
    const chartRows: Row[] = joinable
      ? ranked.map((r) => ({ key: r.key, label: r.label, value: r.secondary ?? 0, acc: r.acc, secondaryLabel: `${label} ${fmtMetric(r.value, metric)}` }))
      : ranked;
    const chartMetric = joinable ? plan.secondaryMetric! : metric;
    const cs = rankedBarSpec(chartRows, chartMetric, `${scope} ${joinable ? secLabel : label} 순위`, joinable ? `${label} 상위 중 ${secLabel}` : label, false);
    return { handled: true, reply: withNote(reply), artifact: chartOn ? artifactOf(cs, withNote(reply), bullets, nowMs, axisWarnings) : undefined, suppressChart: !!plan.chartSuppressed };
  }
}
