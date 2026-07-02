// ────────────────────────────────────────────────────────────────────────────
// Analytics Query Executor v0 — AnalyticsQuery를 상품팀 데이터로 실행 (Department Analytics Query Layer v0)
//
// v0 실행 범위: team='product'의 product(rank) / category(share) / time(trend) / summarize.
// 처리 못 하는 team/dimension/metric/다연도 비교는 반드시 null(not handled) 반환 → 호출부가 기존 fallback.
//   → "자신 없으면 답하지 말고 기존 경로로." wrong data 반환 금지(작업지시서 보정 2).
//
// 계산은 productSalesAggregation(상품 라인매출 gross 기준)로 한다. 대시보드와 동일 계산 경로.
// 숫자 생성은 코드만(LLM 금지).
// ────────────────────────────────────────────────────────────────────────────

import type { RevenueOrderLite } from './departmentDataService';
import {
  type AnalyticsQuery,
  type AnalyticsQueryResult,
  type AnalyticsQueryRow,
  type AnalyticsPeriod,
  ANALYTICS_METRIC_LABEL
} from './analyticsQueryTypes';
import {
  aggregateProductRanking,
  aggregateProductCategoryShare,
  filterProductOrdersByPeriod,
  buildProductSalesTrend
} from './productSalesAggregation';

export interface AnalyticsDataset {
  orders: RevenueOrderLite[];
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const lastDay = (y: number, m: number): number => new Date(y, m, 0).getDate();
const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;

const datasetYears = (orders: RevenueOrderLite[]): number[] =>
  [...new Set(orders.map((o) => Number((o.orderDate || '').slice(0, 4))).filter((y) => y >= 2000 && y <= 2100))].sort((a, b) => a - b);

const datasetRange = (orders: RevenueOrderLite[]): { min: string; max: string } | null => {
  let min = '', max = '';
  for (const o of orders) { const d = (o.orderDate || '').slice(0, 10); if (d.length < 10) continue; if (!min || d < min) min = d; if (!max || d > max) max = d; }
  return min && max ? { min, max } : null;
};

const ymAddMonths = (ym: string, delta: number): string => {
  const y = Number(ym.slice(0, 4)); const m0 = Number(ym.slice(5, 7)) - 1 + delta;
  const ny = y + Math.floor(m0 / 12); const nm = ((m0 % 12) + 12) % 12;
  return `${ny}-${pad2(nm + 1)}`;
};

interface ResolvedRange { start: string; end: string; label: string }

// 기간 → 구체 날짜 범위(YYYY-MM-DD). 해석 불가(연도 없는 월+데이터 없음 등)면 null → not handled.
function resolvePeriod(period: AnalyticsPeriod, orders: RevenueOrderLite[], nowMs: number): ResolvedRange | null {
  const yearsPresent = datasetYears(orders);
  const pickYear = (y?: number): number | null => (y ?? (yearsPresent.length ? yearsPresent[yearsPresent.length - 1] : null));
  const mLabel = (y: number, s: number, e: number): string => (s === e ? `${y}년 ${s}월` : s === 1 && e === 12 ? `${y}년` : `${y}년 ${s}~${e}월`);

  switch (period.type) {
    case 'dayRange':
      if (period.startDate && period.endDate) return { start: period.startDate, end: period.endDate, label: `${period.startDate} ~ ${period.endDate}` };
      return null;
    case 'singleMonth': {
      const y = pickYear(period.year); if (y == null || period.month == null) return null;
      return { start: `${y}-${pad2(period.month)}-01`, end: `${y}-${pad2(period.month)}-${pad2(lastDay(y, period.month))}`, label: mLabel(y, period.month, period.month) };
    }
    case 'monthRange': {
      const y = pickYear(period.year); if (y == null || period.startMonth == null || period.endMonth == null) return null;
      return { start: `${y}-${pad2(period.startMonth)}-01`, end: `${y}-${pad2(period.endMonth)}-${pad2(lastDay(y, period.endMonth))}`, label: mLabel(y, period.startMonth, period.endMonth) };
    }
    case 'quarter': {
      const y = pickYear(period.year); if (y == null || period.quarter == null) return null;
      const s = period.quarter * 3 - 2; const e = s + 2;
      return { start: `${y}-${pad2(s)}-01`, end: `${y}-${pad2(e)}-${pad2(lastDay(y, e))}`, label: `${y}년 ${period.quarter}분기` };
    }
    case 'halfYear': {
      const y = pickYear(period.year); if (y == null || period.half == null) return null;
      const s = period.half === 1 ? 1 : 7; const e = period.half === 1 ? 6 : 12;
      return { start: `${y}-${pad2(s)}-01`, end: `${y}-${pad2(e)}-${pad2(lastDay(y, e))}`, label: `${y}년 ${period.half === 1 ? '상반기' : '하반기'}` };
    }
    case 'year': {
      const y = pickYear(period.year); if (y == null) return null;
      return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}년` };
    }
    case 'relative': {
      const range = datasetRange(orders);
      if (period.relativeKey === 'recentMonths' && range && period.recentCount) {
        const maxYm = range.max.slice(0, 7); const startYm = ymAddMonths(maxYm, -(period.recentCount - 1));
        return { start: `${startYm}-01`, end: range.max, label: `최근 ${period.recentCount}개월(${startYm} ~ ${maxYm})` };
      }
      const d = new Date(nowMs); const y = d.getFullYear(); const m = d.getMonth() + 1;
      if (period.relativeKey === 'thisMonth') return { start: `${y}-${pad2(m)}-01`, end: `${y}-${pad2(m)}-${pad2(lastDay(y, m))}`, label: `${y}년 ${m}월` };
      if (period.relativeKey === 'lastMonth') { const lm = m === 1 ? 12 : m - 1; const ly = m === 1 ? y - 1 : y; return { start: `${ly}-${pad2(lm)}-01`, end: `${ly}-${pad2(lm)}-${pad2(lastDay(ly, lm))}`, label: `${ly}년 ${lm}월` }; }
      if (period.relativeKey === 'thisYear') return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}년` };
      if (period.relativeKey === 'lastYear') return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31`, label: `${y - 1}년` };
      return null;
    }
    case 'all':
    default: {
      const range = datasetRange(orders);
      if (!range) return null;
      return { start: range.min, end: range.max, label: '전체 기간' };
    }
  }
}

const notHandled = (): null => null;

// team='product'만 v0 실행. 그 외/reserved dimension/미지원 metric/다연도 비교는 null(fallback).
export function executeAnalyticsQuery(query: AnalyticsQuery, dataset: AnalyticsDataset, opts?: { nowMs?: number }): AnalyticsQueryResult | null {
  const nowMs = opts?.nowMs ?? Date.now();
  const orders = dataset.orders || [];

  // 지원 불가(외부 데이터) — fake 없이 안내(내부 계산 아님).
  if (query.unsupportedReason) {
    return { query, rows: [], periodLabel: '', summaryText: query.unsupportedReason, warnings: [], unsupported: true, unsupportedReason: query.unsupportedReason };
  }

  if (query.team !== 'product') return notHandled();
  if (!orders.length) return notHandled();

  // v0 미지원 metric/차원/다연도 비교 → fallback
  const supportedMetric = query.metric === 'revenue' || query.metric === 'quantity' || query.metric === 'orderCount';
  const supportedDim = query.dimension === 'product' || query.dimension === 'category' || query.dimension === 'time';
  if (!supportedMetric || !supportedDim) return notHandled();
  if ((query.period.years?.length ?? 0) >= 2) return notHandled(); // 다연도 비교는 마케팅 연결 작업으로

  const range = resolvePeriod(query.period, orders, nowMs);
  if (!range) return notHandled();
  const scoped = filterProductOrdersByPeriod(orders, { start: range.start, end: range.end, source: 'all' });
  // 요청 기간에 주문이 하나도 없으면(보유 밖/빈 구간) 0 데이터로 오해시키지 말고 fallback으로.
  if (!scoped.length) return notHandled();
  const metricLabel = ANALYTICS_METRIC_LABEL[query.metric];

  // ── product + rank ──
  if (query.dimension === 'product' && query.aggregation === 'rank') {
    const agg = Array.from(aggregateProductRanking(scoped, 'all').values());
    const byQty = query.metric === 'quantity';
    const sorted = agg.sort((a, b) => (byQty ? a.quantity - b.quantity : a.revenue - b.revenue) * (query.sort === 'asc' ? 1 : -1));
    const topN = query.topN ?? 8;
    const totalRev = agg.reduce((s, x) => s + x.revenue, 0);
    const rows: AnalyticsQueryRow[] = sorted.slice(0, topN).map((x) => ({
      label: x.name || '(이름 없음)', key: x.goodsNo, value: byQty ? x.quantity : x.revenue,
      revenue: x.revenue, quantity: x.quantity, share: totalRev > 0 ? x.revenue / totalRev : 0
    }));
    const top = rows[0];
    const summaryText = top
      ? `${range.label} 기준 상품 ${metricLabel} 1위는 ${top.label}(${byQty ? `${top.quantity ?? 0}개` : won(top.revenue ?? 0)})입니다.`
      : `${range.label} 기준 집계할 상품 데이터가 없습니다.`;
    return { query, rows, periodLabel: range.label, summaryText, chartSpec: { kind: 'rankedBars', metric: query.metric, title: `${range.label} 상품 ${metricLabel} 순위` }, warnings: [], unsupported: false };
  }

  // ── category + share ──
  if (query.dimension === 'category' && (query.aggregation === 'share' || query.aggregation === 'rank' || query.aggregation === 'summarize')) {
    const share = aggregateProductCategoryShare(scoped);
    const rows: AnalyticsQueryRow[] = share.items.map((c) => ({ label: c.code, key: c.code, value: c.revenue, revenue: c.revenue, share: c.pct }));
    const top = rows[0];
    const summaryText = top
      ? `${range.label} 기준 카테고리 매출 1위는 ${top.label}(${won(top.revenue ?? 0)}, ${((top.share ?? 0) * 100).toFixed(1)}%)입니다.`
      : `${range.label} 기준 카테고리 데이터가 없습니다.`;
    return { query, rows, periodLabel: range.label, summaryText, chartSpec: { kind: 'share', title: `${range.label} 카테고리 비중` }, warnings: [], unsupported: false };
  }

  // ── time + trend ──
  if (query.dimension === 'time' && query.aggregation === 'trend') {
    const gran: 'month' | 'day' = (query.period.type === 'dayRange' || query.period.type === 'singleMonth') ? 'day' : 'month';
    const buckets = buildProductSalesTrend(scoped, { start: range.start, end: range.end, granularity: gran, category: 'all' });
    const rows: AnalyticsQueryRow[] = buckets.map((b) => ({ label: b.label, key: b.key, value: b.revenue, revenue: b.revenue, orderCount: b.orders }));
    const top = [...buckets].sort((a, b) => b.revenue - a.revenue)[0];
    const summaryText = top ? `${range.label} ${gran === 'day' ? '일별' : '월별'} 매출 추이 · 최고 ${top.label}(${won(top.revenue)}).` : `${range.label} 추이 데이터가 없습니다.`;
    return { query, rows, periodLabel: range.label, summaryText, chartSpec: { kind: 'trend', granularity: gran, title: `${range.label} 매출 추이` }, warnings: [], unsupported: false };
  }

  // ── summarize (기간 합계) ──
  if (query.aggregation === 'summarize' || query.aggregation === 'sum' || query.dimension === 'time') {
    let revenue = 0, quantity = 0;
    for (const o of scoped) for (const l of o.lines) { revenue += l.lineRevenue; quantity += l.quantity; }
    const orderCount = scoped.length;
    const value = query.metric === 'quantity' ? quantity : query.metric === 'orderCount' ? orderCount : revenue;
    const rows: AnalyticsQueryRow[] = [{ label: range.label, value, revenue, quantity, orderCount }];
    const summaryText = `${range.label} 상품매출 ${won(revenue)} · 주문 ${orderCount}건 · 판매수량 ${quantity}개.`;
    return { query, rows, periodLabel: range.label, summaryText, chartSpec: { kind: 'summary', title: range.label }, warnings: [], unsupported: false };
  }

  return notHandled();
}
