// ────────────────────────────────────────────────────────────────────────────
// Commerce Data Query Engine v0 — "오픈북" 단일 조회·계산 엔진
//
// 철학: 데이터는 주문·고객·상품(실/가상 동일 스펙)의 목록이다. 질문이 오면
//   1) 읽고 2) 조건으로 거르고 3) 원하는 축으로 묶고 4) 더하기/세기/나누기/비중/최고·최저/비교 하고
//   5) 없으면 없다고 답한다. 그게 전부다.
//
// 숫자는 전부 이 코드가 계산한다(LLM은 "무엇을 읽고 계산할지"만 정하고 결과를 설명만).
// 질문에 없는 축(카테고리/고객/쿠폰 등)을 임의로 덧붙이지 않는다. broad 종합덤프 없음.
//
// 지원(v0):
//   dimension: time(월) · product · category · coupon · firstRepeat · memberGroup · channel · none
//   metric:    revenue(net) · orderCount · averageOrderValue · quantity
//   operation: summarize · trend · argmax · argmin · extremes · rank · share · compare(yearOverYear)
//   filters:   period + coupon/firstRepeat/memberGroup/channel/category/goods
// ────────────────────────────────────────────────────────────────────────────

import { isValidOrder } from './revenueMetricContract';
import { categoryDisplayName, formatSharePercent } from './productCategoryDisplay';
import { understandCommerceQuery } from './marketingAnalyticsQueryCompilerLlm';
import type { AnalyticsQuery, AnalyticsMetric, AnalyticsTeam } from './analyticsQueryTypes';
import type { MarketingChatChartArtifact, MarketingChartSpec, MarketingChartType } from './marketingChatChartSpec';

// 느슨한 주문 형태(RevenueOrderLite 및 universe 호환).
interface OrderLike {
  orderNo?: string; orderDate?: string; totalAmount?: number; paid?: boolean; canceled?: boolean;
  state?: { paid?: boolean; canceled?: boolean };
  memberGroupName?: string; orderChannel?: string; isFirstPurchase?: boolean;
  discountSummary?: { hasCoupon?: boolean };
  lines?: { goodsNo?: string; goodsName?: string; quantity?: number; lineRevenue?: number; categoryCode?: string }[];
}
export interface CommerceDataset { orders: OrderLike[]; }
export interface CommerceQueryResult { handled: boolean; reply: string; artifact?: MarketingChatChartArtifact; suppressChart: boolean; }

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
const cnt = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}건`;
const qtyStr = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}개`;
const pad2 = (n: number): string => String(n).padStart(2, '0');
const lastDay = (y: number, m: number): number => new Date(y, m, 0).getDate();

const METRIC_LABEL: Record<AnalyticsMetric, string> = {
  revenue: '매출', orderCount: '주문수', averageOrderValue: '객단가', quantity: '판매수량',
  stock: '재고', reviewCount: '리뷰수', inquiryCount: '문의수', rating: '평점', claimCount: '클레임수'
};
const fmtVal = (v: number, metric: AnalyticsMetric): string =>
  metric === 'orderCount' ? cnt(v) : metric === 'quantity' ? qtyStr(v) : won(v); // revenue/AOV → 원

// ── 기간 → {start,end,label,years} ──────────────────────────────────────────
interface Range { start?: string; end?: string; label: string; years: number[]; months?: number[] }
const monthsBetween = (s: number, e: number): number[] => { const out: number[] = []; for (let m = Math.min(s, e); m <= Math.max(s, e); m++) out.push(m); return out; };
function orderYear(o: OrderLike): number { return Number(String(o.orderDate ?? '').slice(0, 4)); }
function datasetYears(orders: OrderLike[]): number[] {
  return [...new Set(orders.map(orderYear).filter((y) => y >= 2000 && y <= 2100))].sort((a, b) => a - b);
}
function resolvePeriod(q: AnalyticsQuery, orders: OrderLike[], nowMs: number): Range {
  const p = q.period;
  const yrs = p.years && p.years.length ? [...p.years].sort((a, b) => a - b) : (p.year != null ? [p.year] : []);
  const yLabel = (y: number, sm: number, em: number): string => (sm === em ? `${y}년 ${sm}월` : sm === 1 && em === 12 ? `${y}년` : `${y}년 ${sm}~${em}월`);
  const mk = (y: number, sm: number, em: number): Range => ({ start: `${y}-${pad2(sm)}-01`, end: `${y}-${pad2(em)}-${pad2(lastDay(y, em))}`, label: yLabel(y, sm, em), years: [y] });
  switch (p.type) {
    case 'dayRange': if (p.startDate && p.endDate) return { start: p.startDate, end: p.endDate, label: `${p.startDate}~${p.endDate}`, years: yrs.length ? yrs : datasetYears(orders) }; break;
    case 'singleMonth': if (yrs[0] != null && p.month != null) return mk(yrs[0], p.month, p.month); break;
    case 'monthRange': if (p.startMonth != null && p.endMonth != null) {
      if (yrs.length >= 2) { const sm = Math.min(p.startMonth, p.endMonth), em = Math.max(p.startMonth, p.endMonth); return { label: `${yrs.join('·')}년 ${sm}~${em}월`, years: yrs, months: monthsBetween(sm, em) }; }
      if (yrs[0] != null) return mk(yrs[0], Math.min(p.startMonth, p.endMonth), Math.max(p.startMonth, p.endMonth));
    } break;
    case 'quarter': if (yrs[0] != null && p.quarter != null) { const s = p.quarter * 3 - 2; return { ...mk(yrs[0], s, s + 2), label: `${yrs[0]}년 ${p.quarter}분기` }; } break;
    case 'halfYear': if (yrs[0] != null && p.half != null) return { ...mk(yrs[0], p.half === 1 ? 1 : 7, p.half === 1 ? 6 : 12), label: `${yrs[0]}년 ${p.half === 1 ? '상반기' : '하반기'}` }; break;
    case 'year': if (yrs[0] != null) { if (yrs.length >= 2) return { label: `${yrs.join('·')}년`, years: yrs }; return mk(yrs[0], 1, 12); } break;
    case 'relative': {
      const d = new Date(nowMs); const y = d.getFullYear(); const m = d.getMonth() + 1;
      if (p.relativeKey === 'thisMonth') return mk(y, m, m);
      if (p.relativeKey === 'lastMonth') { const lm = m === 1 ? 12 : m - 1; const ly = m === 1 ? y - 1 : y; return mk(ly, lm, lm); }
      if (p.relativeKey === 'thisYear') return mk(y, 1, 12);
      if (p.relativeKey === 'lastYear') return mk(y - 1, 1, 12);
      break;
    }
  }
  return { label: '전체 기간', years: datasetYears(orders) }; // all
}

function inRange(o: OrderLike, r: Range): boolean {
  if (r.years.length && !r.years.includes(orderYear(o))) return false;
  if (r.months && !r.months.includes(Number(String(o.orderDate ?? '').slice(5, 7)))) return false;
  const d = String(o.orderDate ?? '').slice(0, 10);
  if (r.start && d < r.start) return false;
  if (r.end && d > r.end) return false;
  return true;
}
function passFilters(o: OrderLike, q: AnalyticsQuery): boolean {
  const f = q.filters; if (!f) return true;
  if (f.coupon === 'used' && !o.discountSummary?.hasCoupon) return false;
  if (f.coupon === 'unused' && o.discountSummary?.hasCoupon) return false;
  if (f.firstRepeat === 'first' && o.isFirstPurchase !== true) return false;
  if (f.firstRepeat === 'repeat' && o.isFirstPurchase === true) return false;
  if (f.memberGroup && String(o.memberGroupName ?? '') !== f.memberGroup) return false;
  if (f.channel && String(o.orderChannel ?? '') !== f.channel) return false;
  if (f.categoryCode && !(o.lines ?? []).some((l) => l.categoryCode === f.categoryCode)) return false;
  if (f.goodsNo && !(o.lines ?? []).some((l) => l.goodsNo === f.goodsNo)) return false;
  return true;
}

// ── 묶기 + 집계 ──────────────────────────────────────────────────────────────
export interface Row { key: string; label: string; value: number; revenue: number; orderCount: number; quantity: number; aov: number; share?: number }
type Dim = AnalyticsQuery['dimension'];
const isLineDim = (d: Dim): boolean => d === 'product' || d === 'category';

// 주문 단위 그룹(time/coupon/firstRepeat/memberGroup/channel): net 매출·유효주문.
function groupOrderDim(orders: OrderLike[], d: Dim, catFilter?: string): Map<string, { label: string; rev: number; oc: number; qty: number }> {
  const m = new Map<string, { label: string; rev: number; oc: number; qty: number }>();
  for (const o of orders) {
    if (!isValidOrder(o)) continue;
    let key = 'all', label = '전체';
    if (d === 'time') { const ym = String(o.orderDate ?? '').slice(0, 7); key = ym; label = `${Number(ym.slice(5, 7))}월`; }
    else if (d === 'coupon') { const u = !!o.discountSummary?.hasCoupon; key = u ? 'used' : 'unused'; label = u ? '쿠폰 사용' : '쿠폰 미사용'; }
    else if (d === 'firstRepeat') { const fr = o.isFirstPurchase === true; key = fr ? 'first' : 'repeat'; label = fr ? '첫구매' : '재구매'; }
    else if (d === 'memberGroup') { key = String(o.memberGroupName ?? '미분류'); label = key; }
    else if (d === 'channel') { key = String(o.orderChannel ?? '미상'); label = key; }
    const g = m.get(key) || { label, rev: 0, oc: 0, qty: 0 };
    g.rev += num(o.totalAmount); g.oc += 1;
    for (const l of o.lines ?? []) { if (catFilter && l.categoryCode !== catFilter) continue; g.qty += num(l.quantity); }
    m.set(key, g);
  }
  return m;
}
// 라인 단위 그룹(product/category): gross 라인매출.
function groupLineDim(orders: OrderLike[], d: Dim): Map<string, { label: string; rev: number; qty: number; orderSet: Set<string> }> {
  const m = new Map<string, { label: string; rev: number; qty: number; orderSet: Set<string> }>();
  for (const o of orders) {
    for (const l of o.lines ?? []) {
      const key = d === 'category' ? String(l.categoryCode ?? 'uncategorized') : String(l.goodsNo ?? l.goodsName ?? '');
      if (!key) continue;
      const label = d === 'category' ? categoryDisplayName(String(l.categoryCode ?? 'uncategorized')) : String(l.goodsName || l.goodsNo || '(이름없음)');
      const g = m.get(key) || { label, rev: 0, qty: 0, orderSet: new Set<string>() };
      g.rev += num(l.lineRevenue); g.qty += num(l.quantity); if (o.orderNo) g.orderSet.add(o.orderNo);
      m.set(key, g);
    }
  }
  return m;
}

const valueOf = (rev: number, oc: number, qty: number, metric: AnalyticsMetric): number =>
  metric === 'revenue' ? rev : metric === 'orderCount' ? oc : metric === 'quantity' ? qty : (oc > 0 ? Math.round(rev / oc) : 0);

function buildRows(orders: OrderLike[], q: AnalyticsQuery): Row[] {
  const metric = q.metric;
  if (isLineDim(q.dimension)) {
    const m = groupLineDim(orders, q.dimension);
    return [...m.entries()].map(([key, g]) => {
      const oc = g.orderSet.size;
      return { key, label: g.label, value: metric === 'quantity' ? g.qty : g.rev, revenue: g.rev, orderCount: oc, quantity: g.qty, aov: oc > 0 ? Math.round(g.rev / oc) : 0 };
    });
  }
  const m = groupOrderDim(orders, q.dimension, q.filters?.categoryCode);
  return [...m.entries()].map(([key, g]) => ({ key, label: g.label, value: valueOf(g.rev, g.oc, g.qty, metric), revenue: g.rev, orderCount: g.oc, quantity: g.qty, aov: g.oc > 0 ? Math.round(g.rev / g.oc) : 0 }));
}

// 활성(주문 있는) 행만 — 데이터 없는 0버킷이 최고/최저로 뽑히지 않게.
const activeRows = (rows: Row[]): Row[] => { const a = rows.filter((r) => r.orderCount > 0 || r.value !== 0); return a.length ? a : rows; };
const sortByTime = (rows: Row[]): Row[] => [...rows].sort((a, b) => a.key.localeCompare(b.key));

// ── 차트 ────────────────────────────────────────────────────────────────────
function chartSpec(rows: Row[], q: AnalyticsQuery, chartType: MarketingChartType, title: string, subtitle: string): MarketingChartSpec {
  const metric = q.metric;
  const unit: MarketingChartSpec['unit'] = q.aggregation === 'share' ? 'percent' : (metric === 'orderCount' || metric === 'quantity' ? 'count' : 'krw');
  const timeSingleSeries = q.dimension === 'time' && (chartType === 'line');
  if (timeSingleSeries) {
    // 시간 추이: 단일 series × 월 points(세로 combo 렌더). bucketKey 2자리 패딩(정렬).
    return {
      id: `cdq_time_${metric}`, title, subtitle, chartType, primaryMetric: metric,
      series: [{ key: metric, label: METRIC_LABEL[metric], metric, points: sortByTime(rows).map((r) => ({ bucketKey: /^\d{4}-\d{2}$/.test(r.key) ? r.key : pad2(Number(r.key) || 0), bucketLabel: r.label, value: r.value, orderCount: r.orderCount, revenue: r.revenue, quantity: r.quantity, averageOrderValue: r.aov })) }],
      xAxisLabel: '기간', yAxisLabel: METRIC_LABEL[metric], unit, source: 'temporal_crosstab',
      request: { timeBucket: 'month', dimensions: [], metrics: [metric] as unknown as MarketingChartSpec['request']['metrics'] },
      available: rows.length > 0, evidence: [], warnings: []
    };
  }
  // 항목당 1 series(rankedBar 관례) — extremes/rank/share/product/category.
  return {
    id: `cdq_${q.dimension}_${q.aggregation}`, title, subtitle, chartType, primaryMetric: q.aggregation === 'share' ? 'share' : metric,
    series: rows.map((r) => ({ key: r.key, label: r.label, metric, points: [{ bucketKey: r.key, bucketLabel: r.label, value: q.aggregation === 'share' ? Math.round((r.share ?? 0) * 1000) / 10 : r.value, orderCount: r.orderCount, revenue: r.revenue, quantity: r.quantity, averageOrderValue: r.aov }] })),
    xAxisLabel: q.dimension, yAxisLabel: q.aggregation === 'share' ? '비중' : METRIC_LABEL[metric], unit, source: 'temporal_crosstab',
    request: { timeBucket: 'month', dimensions: [], metrics: [metric] as unknown as MarketingChartSpec['request']['metrics'] },
    available: rows.length > 0, evidence: [], warnings: []
  };
}
function artifactOf(cs: MarketingChartSpec, reply: string, bullets: string[], nowMs: number): MarketingChatChartArtifact {
  return {
    type: 'marketing_chart_spec', source: 'marketingScopeInsightEngine', intent: 'commerce_data_query',
    plan: {}, request: cs.request, chartSpec: cs,
    narrative: { title: cs.title, summary: reply.split('\n')[0] || cs.title, bullets, evidence: [], warnings: [] },
    evidence: [], createdAt: new Date(nowMs).toISOString()
  };
}

// ── 전 팀 공용 진입점: 이해(LLM/deterministic) → 실행. 열린 질문이면 null(→ 호출부가 기존 경로). ──
export async function answerCommerceQuestion(
  message: string, dataset: CommerceDataset,
  opts?: { callLlm?: (prompt: string) => Promise<string>; nowMs?: number; team?: AnalyticsTeam }
): Promise<CommerceQueryResult | null> {
  if (!dataset.orders || !dataset.orders.length) return null;
  const q = await understandCommerceQuery(message, { callLlm: opts?.callLlm, nowMs: opts?.nowMs, team: opts?.team });
  if (!q) return null; // 데이터 조회·계산 질문이 아님(왜/전략 등) → 기존 열린 경로
  return executeCommerceDataQuery(q, dataset, { nowMs: opts?.nowMs });
}

// ── 실행 진입점 ────────────────────────────────────────────────────────────────
export function executeCommerceDataQuery(query: AnalyticsQuery, dataset: CommerceDataset, opts?: { nowMs?: number }): CommerceQueryResult | null {
  const nowMs = opts?.nowMs ?? Date.now();
  const all = dataset.orders || [];
  if (!all.length) return null;
  if (query.unsupportedReason) {
    return { handled: true, reply: `${query.unsupportedReason}\n대신 매출·주문수·객단가·판매수량을 기간/상품/카테고리/쿠폰/회원그룹/채널 기준으로 조회·비교할 수 있습니다.`, suppressChart: true };
  }

  const range = resolvePeriod(query, all, nowMs);
  const scoped = all.filter((o) => inRange(o, range) && passFilters(o, query));
  const metric = query.metric;
  const label = METRIC_LABEL[metric];
  const filterNote = (() => {
    const f = query.filters; if (!f) return '';
    const bits: string[] = [];
    if (f.coupon) bits.push(f.coupon === 'used' ? '쿠폰 사용' : '쿠폰 미사용');
    if (f.firstRepeat) bits.push(f.firstRepeat === 'first' ? '첫구매' : '재구매');
    if (f.memberGroup) bits.push(f.memberGroup); if (f.channel) bits.push(f.channel);
    return bits.length ? ` (${bits.join('·')})` : '';
  })();
  const scopeLabel = `${range.label}${filterNote}`;

  if (!scoped.filter(isValidOrder).length && !isLineDim(query.dimension)) {
    return { handled: true, reply: `${scopeLabel} 기준 해당하는 주문 데이터가 없습니다.`, suppressChart: true };
  }

  let rows = buildRows(scoped, query);
  // 여러 해를 통틀어 시간축을 물으면 "12월"이 어느 해인지 모호 → 라벨에 연도 표기.
  if (query.dimension === 'time' && range.years.length > 1) {
    rows = rows.map((r) => (/^\d{4}-\d{2}$/.test(r.key) ? { ...r, label: `${r.key.slice(0, 4)}년 ${Number(r.key.slice(5, 7))}월` } : r));
  }
  if (!rows.length) return { handled: true, reply: `${scopeLabel} 기준 데이터가 없습니다.`, suppressChart: true };

  const op = query.aggregation;
  const chartOn = !query.chartSuppressed;

  // ── summarize: 지표 하나로 요약(차원 없음/단일) ──
  if (op === 'summarize' || op === 'sum' || (query.dimension === 'time' && op !== 'trend' && op !== 'argmax' && op !== 'argmin' && op !== 'extremes' && op !== 'compare')) {
    let rev = 0, oc = 0, qty = 0;
    for (const o of scoped) { if (!isValidOrder(o)) continue; rev += num(o.totalAmount); oc += 1; for (const l of o.lines ?? []) qty += num(l.quantity); }
    const v = valueOf(rev, oc, qty, metric);
    const reply = `${scopeLabel} ${label}: ${fmtVal(v, metric)} (매출 ${won(rev)} · 주문 ${cnt(oc)} · 판매 ${qtyStr(qty)} · 객단가 ${won(oc > 0 ? rev / oc : 0)}).`;
    return { handled: true, reply, suppressChart: true };
  }

  // ── extremes: 최고 + 최저 딱 2개 비교 ──
  if (op === 'extremes') {
    const act = activeRows(rows);
    const hi = act.reduce((a, b) => (b.value > a.value ? b : a));
    const lo = act.reduce((a, b) => (b.value < a.value ? b : a));
    const two = [hi, lo];
    const diff = hi.value - lo.value;
    const reply = [
      `${scopeLabel} ${label} 최고·최저 비교입니다.`,
      `최고: ${hi.label} ${fmtVal(hi.value, metric)}`,
      `최저: ${lo.label} ${fmtVal(lo.value, metric)}`,
      `차이: ${fmtVal(diff, metric)}`
    ].join('\n');
    const cs = chartSpec(two, query, 'rankedBar', `${scopeLabel} ${label} 최고·최저`, '최고 vs 최저');
    return { handled: true, reply, artifact: chartOn ? artifactOf(cs, reply, reply.split('\n').slice(1), nowMs) : undefined, suppressChart: query.chartSuppressed };
  }

  // ── argmax / argmin: 극값 1개(+ 상위 3) ──
  if (op === 'argmax' || op === 'argmin') {
    const act = activeRows(rows);
    const ext = op === 'argmin' ? act.reduce((a, b) => (b.value < a.value ? b : a)) : act.reduce((a, b) => (b.value > a.value ? b : a));
    const top = [...act].sort((a, b) => (op === 'argmin' ? a.value - b.value : b.value - a.value)).slice(0, 3);
    const dir = op === 'argmin' ? '가장 낮았던' : '가장 높았던';
    const bullets = top.map((r, i) => `${i + 1}. ${r.label} ${fmtVal(r.value, metric)}`);
    const reply = [`${scopeLabel} ${label}이(가) ${dir} 것은 ${ext.label}(${fmtVal(ext.value, metric)})입니다.`, ...bullets].join('\n');
    // 시간축이면 세로 추이(combo)로 전체 맥락 + 극값. 그 외는 rankedBar.
    const isTime = query.dimension === 'time';
    const cs = isTime
      ? chartSpec(sortByTime(rows), query, 'line', `${scopeLabel} ${label} 추이`, `월별 · ${label}`)
      : chartSpec(top, query, 'rankedBar', `${scopeLabel} ${label} ${op === 'argmin' ? '최저' : '최고'}`, label);
    return { handled: true, reply, artifact: chartOn ? artifactOf(cs, reply, bullets, nowMs) : undefined, suppressChart: query.chartSuppressed };
  }

  // ── trend: 시간 추이(세로 combo) ──
  if (op === 'trend') {
    const t = sortByTime(rows);
    const act = activeRows(t);
    const hi = act.reduce((a, b) => (b.value > a.value ? b : a));
    const lo = act.reduce((a, b) => (b.value < a.value ? b : a));
    const reply = `${scopeLabel} ${label} 추이입니다. 최고 ${hi.label}(${fmtVal(hi.value, metric)}), 최저 ${lo.label}(${fmtVal(lo.value, metric)}).`;
    const cs = chartSpec(t, query, 'line', `${scopeLabel} ${label} 추이`, `월별 · ${label}`);
    return { handled: true, reply, artifact: chartOn ? artifactOf(cs, reply, [], nowMs) : undefined, suppressChart: query.chartSuppressed };
  }

  // ── share: 비중 ──
  if (op === 'share') {
    const total = rows.reduce((s, r) => s + r.revenue, 0);
    const withShare = rows.map((r) => ({ ...r, share: total > 0 ? r.revenue / total : 0 })).sort((a, b) => b.revenue - a.revenue);
    const bullets = withShare.map((r) => `${r.label}: ${won(r.revenue)} (${formatSharePercent(r.share ?? 0)})`);
    const reply = [`${scopeLabel} ${query.dimension === 'category' ? '카테고리' : ''} 매출 비중입니다.`, ...bullets].join('\n');
    const cs = chartSpec(withShare, query, 'rankedBar', `${scopeLabel} 비중`, '매출 비중(%)');
    return { handled: true, reply, artifact: chartOn ? artifactOf(cs, reply, bullets, nowMs) : undefined, suppressChart: query.chartSuppressed };
  }

  // ── compare: 연도 비교(yearOverYear) — 같은 기간 여러 해 ──
  if (op === 'compare' && query.comparison === 'yearOverYear' && range.years.length >= 2) {
    const per = range.years.map((y) => {
      let rev = 0, oc = 0, qty = 0;
      for (const o of scoped) { if (orderYear(o) !== y || !isValidOrder(o)) continue; rev += num(o.totalAmount); oc += 1; for (const l of o.lines ?? []) qty += num(l.quantity); }
      return { key: String(y), label: `${y}년`, value: valueOf(rev, oc, qty, metric), revenue: rev, orderCount: oc, quantity: qty, aov: oc > 0 ? Math.round(rev / oc) : 0 } as Row;
    });
    const bullets = per.map((r) => `${r.label}: ${fmtVal(r.value, metric)}`);
    const reply = [`${scopeLabel} ${label} 연도 비교입니다.`, ...bullets].join('\n');
    const cs = chartSpec(per, query, 'rankedBar', `${scopeLabel} ${label} 연도 비교`, label);
    return { handled: true, reply, artifact: chartOn ? artifactOf(cs, reply, bullets, nowMs) : undefined, suppressChart: query.chartSuppressed };
  }

  // ── rank(기본): 순위 ──
  {
    const sorted = [...rows].sort((a, b) => (query.sort === 'asc' ? a.value - b.value : b.value - a.value));
    const topN = query.topN && query.topN > 0 ? query.topN : (query.dimension === 'product' ? 5 : rows.length);
    const shown = sorted.slice(0, Math.max(topN, 1));
    const total = rows.reduce((s, r) => s + r.revenue, 0);
    const bullets = shown.map((r, i) => `${i + 1}위 ${r.label}: ${fmtVal(r.value, metric)}${query.dimension === 'product' ? ` (판매 ${qtyStr(r.quantity)})` : ''}${total > 0 ? ` · 비중 ${formatSharePercent(r.revenue / total)}` : ''}`);
    const reply = [`${scopeLabel} ${label} ${query.sort === 'asc' ? '하위' : '상위'} 순위입니다.`, ...bullets].join('\n');
    const cs = chartSpec(shown, query, 'rankedBar', `${scopeLabel} ${label} 순위`, query.dimension === 'product' ? '상품 라인매출 기준' : label);
    return { handled: true, reply, artifact: chartOn ? artifactOf(cs, reply, bullets, nowMs) : undefined, suppressChart: query.chartSuppressed };
  }
}
