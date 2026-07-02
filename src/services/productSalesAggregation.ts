// ────────────────────────────────────────────────────────────────────────────
// Product Sales Aggregation — 순수 집계 서비스 (Department Analytics Query Layer v0)
//
// 목적: ProductTeamDashboard.tsx 안에 인라인으로 있던 기간/소스/카테고리 필터와
//   상품별 순위·카테고리 비중 집계를 "순수 함수"로 추출한다.
//   → 대시보드(보기)와 부서 채팅(제어)이 "같은 계산 경로"를 쓰게 하여
//     화면과 채팅이 동일 질문에 동일 값을 내도록 한다.
//
// 불변식(작업지시서 보정 1·5):
//   - 상품 랭킹/카테고리 비중은 상품팀 대시보드 aggregateProducts와 동일한
//     "상품 라인매출(lineRevenue, gross line revenue)" 기준을 유지한다.
//   - 이 값은 상품팀 전용 분석값이며 대표 KPI(canonical net 유효주문)로 승격하지 않는다.
//   - 계산식 변경 없음(순수 이동). 대시보드 수치는 1원도 바뀌면 안 된다.
//
// 추이(trend)는 이미 순수화된 productDashboardTrendBuckets.buildTrendBuckets를 재사용한다.
// ────────────────────────────────────────────────────────────────────────────

import type { RevenueOrderLite } from './departmentDataService';
import { buildTrendBuckets, type TrendBucket, type TrendGranularity } from './productDashboardTrendBuckets';

export type ProductSourceFilter = 'all' | 'real' | 'synthetic';

// orders → 상품별 집계 (매출/판매/복구/수량) — 대시보드 ProdAgg와 동일 형태.
export interface ProductAgg {
  goodsNo: string;
  name: string;
  category: string;
  revenue: number;   // 상품 라인매출(gross line revenue) 합. 대표 KPI 아님.
  quantity: number;
  sold: number;
  restored: number;
}

// ── 소스 필터 (대시보드 srcFilter와 동일) ──
export function filterOrdersBySource(orders: RevenueOrderLite[], src: ProductSourceFilter): RevenueOrderLite[] {
  if (src === 'all') return orders;
  const want = src === 'real' ? 'real_godomall' : 'synthetic_test';
  return orders.filter((o) => o.sourceType === want);
}

// ── 기간(YYYY-MM-DD 문자열 범위) + 소스 필터 (대시보드 ordersFiltered와 동일) ──
// start/end 미지정 시 해당 방향 제한 없음(전체). 문자열 사전식 비교(앞 10자리).
export function filterProductOrdersByPeriod(
  orders: RevenueOrderLite[],
  opts: { start?: string; end?: string; source?: ProductSourceFilter }
): RevenueOrderLite[] {
  const { start, end, source = 'all' } = opts;
  return orders.filter((o) => {
    if (source === 'real' && o.sourceType !== 'real_godomall') return false;
    if (source === 'synthetic' && o.sourceType !== 'synthetic_test') return false;
    const d10 = (o.orderDate || '').slice(0, 10);
    if (start && d10 < start) return false;
    if (end && d10 > end) return false;
    return true;
  });
}

// ── 카테고리 필터 (대시보드 relevantOrders와 동일) ──
export function filterOrdersByCategory(orders: RevenueOrderLite[], category: string): RevenueOrderLite[] {
  return category === 'all' ? orders : orders.filter((o) => o.lines.some((l) => l.categoryCode === category));
}

// ── 상품별 집계 (대시보드 aggregateProducts와 동일 계산: lineRevenue 기준 gross) ──
export function aggregateProductRanking(orders: RevenueOrderLite[], category: string = 'all'): Map<string, ProductAgg> {
  const m = new Map<string, ProductAgg>();
  for (const o of orders) {
    for (const l of o.lines) {
      if (category !== 'all' && l.categoryCode !== category) continue;
      const b =
        m.get(l.goodsNo) ||
        { goodsNo: l.goodsNo, name: l.goodsName, category: l.categoryCode, revenue: 0, quantity: 0, sold: 0, restored: 0 };
      b.revenue += l.lineRevenue;
      b.quantity += l.quantity;
      if (o.canceled) b.restored += l.quantity;
      else if (o.paid) b.sold += l.quantity;
      m.set(l.goodsNo, b);
    }
  }
  return m;
}

// ── 카테고리 비중 (대시보드 categoryData와 동일: ordersFiltered 전체 라인 합, lineRevenue 기준) ──
export interface CategoryShareItem { code: string; revenue: number; pct: number }
export interface CategoryShareResult { total: number; items: CategoryShareItem[] }

export function aggregateProductCategoryShare(orders: RevenueOrderLite[]): CategoryShareResult {
  const m = new Map<string, { code: string; revenue: number }>();
  let total = 0;
  for (const o of orders) {
    for (const l of o.lines) {
      const b = m.get(l.categoryCode) || { code: l.categoryCode, revenue: 0 };
      b.revenue += l.lineRevenue;
      total += l.lineRevenue;
      m.set(l.categoryCode, b);
    }
  }
  const arr = Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
  return { total, items: arr.map((x) => ({ ...x, pct: total > 0 ? x.revenue / total : 0 })) };
}

// ── 매출 추이 (buildTrendBuckets 재사용 wrapper) — 대시보드 trend와 동일 계산 경로 ──
export function buildProductSalesTrend(
  orders: RevenueOrderLite[],
  opts: { start: string; end: string; granularity: TrendGranularity; category?: string }
): TrendBucket[] {
  return buildTrendBuckets(orders, opts);
}
