// ────────────────────────────────────────────────────────────────────────────
// Department Data Source of Truth — 전 부서 공통 운영 snapshot (단일 source)
//
// 모든 부서 대시보드(상품/마케팅/CS/총괄)가 같은 RevenueResult universe로부터 이 builder를 호출해
// "대표 운영 KPI"를 동일하게 읽는다. 부서마다 독립 계산하지 않는다.
//   - 대표 운영 매출/주문/객단가: revenueMetricContract의 net(유효 주문) 기준.
//   - 상품 라인 매출(gross)은 부서 전용 분석값으로 함께 담되 대표값과 분리.
// 데이터가 synthetic/demo면 그대로 명시(metadata) — 실데이터처럼 꾸미지 않는다.
// ────────────────────────────────────────────────────────────────────────────

import type { RevenueResult, RevenueOrderLite } from './departmentDataService';
import {
  computeNetOrderRevenue,
  computeGrossProductRevenue,
  countAllOrders,
  countValidOrders,
  computeAverageOrderValue,
  isValidOrder
} from './revenueMetricContract';
import { summarizeStockRisk } from './inventoryRiskContract';
import { summarizeInquiryStatus, isUnresolved } from './inquiryStatusContract';
import { screenStateFromRevenue } from './revenueScreenState';

export type DepartmentSourceMode = 'real' | 'synthetic' | 'mixed' | 'unavailable';

export interface DepartmentSourceOfTruthSnapshot {
  generatedAtMs: number;
  sourceMode: DepartmentSourceMode;
  periodLabel: string;

  orderUniverse: {
    totalOrders: number;
    validOrders: number;
    cancelledOrders: number;
    unpaidOrders: number;
    returnedOrders: number;
  };
  revenueUniverse: {
    grossProductRevenue: number;
    netOrderRevenue: number;
    shippingRevenue: number;
    refundedRevenue: number;
    operationalRevenue: number;
  };
  productUniverse: {
    totalQuantitySold: number;
    productCount: number;
    // C-3: 재고 위험 상태별 분리. riskyStockCount = out_of_stock + low_stock.
    riskyStockCount: number;
    outOfStockCount: number;
    lowStockCount: number;
    unknownStockCount: number;   // 재고 데이터 이상(정상 오판 방지)
    attentionCount: number;      // risky + unknown (관리자 확인 대상 전체)
  };
  customerUniverse: {
    totalCustomers: number;
    repeatCustomers: number;
    highRiskCustomers: number;
  };
  csUniverse: {
    totalInquiries: number;
    unresolvedInquiries: number;   // C-4: 미처리(answered 제외 전부, unknown 포함)
    resolvedInquiries: number;
    unknownInquiries: number;      // C-4: 상태 미확인(정상 오판 방지·미처리에 포함)
    totalReviews: number;
    autoCandidates: number;
  };
  metadata: {
    includesSynthetic: boolean;
    realOrderCount: number;
    syntheticOrderCount: number;
    basisDescription: string;
  };

  // ── 대표 운영 KPI(편의 접근자 — 모든 부서 상단에서 같은 값) ──
  operationalRevenue: number;
  operationalOrderCount: number;
  operationalAOV: number;
  // 부서 전용 분석값(대표값 아님)
  productLineRevenue: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
// C-4: 문의 미처리/미확인 판정은 공통 계약(inquiryStatusContract)을 재사용한다(원시 문자열 비교 금지).

interface BuildOptions {
  nowMs?: number;
  productCount?: number;
  periodLabel?: string;
}

export function buildDepartmentSourceOfTruthSnapshot(
  revenue: RevenueResult | null | undefined,
  opts: BuildOptions = {}
): DepartmentSourceOfTruthSnapshot | null {
  if (!revenue || !Array.isArray(revenue.orders)) return null;
  const orders: RevenueOrderLite[] = revenue.orders;
  const summary = revenue.summary;
  const aux = revenue.universeAux;

  // ── 대표 운영 매출/주문 (revenueMetricContract net 기준) — 모든 부서 공통 ──
  const operationalRevenue = computeNetOrderRevenue(orders);
  const operationalOrderCount = countValidOrders(orders);
  const operationalAOV = computeAverageOrderValue(operationalRevenue, operationalOrderCount);
  const productLineRevenue = computeGrossProductRevenue(orders);

  // 주문 universe
  const totalOrders = countAllOrders(orders);
  const cancelledOrders = orders.filter((o) => o.canceled).length;
  const unpaidOrders = orders.filter((o) => o.unpaid || (!o.paid && !o.canceled)).length;
  const returnedOrders = orders.filter((o) => o.claim?.claimTypes?.some((t) => /refund|return|cancel|환불|반품/i.test(t))).length;

  // 매출 universe
  const shippingRevenue = summary ? num(summary.deliveryFeeTotal) : orders.reduce((s, o) => s + num(o.deliveryFee), 0);
  const refundedRevenue = orders.reduce((s, o) => s + (o.claim?.claimAmount && o.claim.claimTypes?.some((t) => /refund|return|환불|반품/i.test(t)) ? num(o.claim.claimAmount) : 0), 0);

  // 상품 universe
  const totalQuantitySold = summary ? num(summary.syntheticTotalNetSoldQuantity) : 0;
  const productCount = opts.productCount ?? revenue.stockImpact.length;
  // C-3: 재고 위험 단계는 공통 계약(inventoryRiskContract)으로 판정. 상품별 safetyStock 우선, 재고 이상은 unknown 분리.
  const stockRisk = summarizeStockRisk(revenue.stockImpact.map((s) => ({ stock: s.syntheticProjectedStock, safetyStock: s.safetyStock })));
  const riskyStockCount = stockRisk.risky;

  // 고객 universe (safe, PII 없음)
  const customers = aux?.customers ?? [];
  const totalCustomers = customers.length;
  const repeatCustomers = customers.filter((c) => num(c.orderCount) > 1).length;
  const highRiskCustomers = customers.filter((c) => num(c.claimCount) > 0).length;

  // CS universe (universeAux 동일 source — CS 대시보드와 같은 universe/기간 'all')
  const inquiries = aux?.inquiries ?? [];
  const reviews = aux?.reviews ?? [];
  const totalInquiries = inquiries.length;
  // C-4: 공통 계약으로 미처리(=answered 제외 전부, unknown 포함)·미확인 집계.
  const inqSummary = summarizeInquiryStatus(inquiries.map((q) => q.status));
  const unresolvedInquiries = inqSummary.unresolved;
  const resolvedInquiries = inqSummary.answered;
  const unknownInquiries = inqSummary.unknown;
  const totalReviews = reviews.length;
  const autoCandidates = reviews.length + inquiries.filter((q) => isUnresolved(q.status) && /delivery|배송/i.test(q.topic || '')).length;

  // source mode
  const syntheticOrderCount = summary ? num(summary.syntheticOrderCount) : orders.filter((o) => o.sourceType === 'synthetic_test').length;
  const realOrderCount = summary ? num(summary.realOrderCount) : totalOrders - syntheticOrderCount;
  // DATA-SOURCE-SERVER-01(GREEN F.1): 출처는 summary 숫자로 추측하지 않는다.
  //   명시적 시험 fixture 는 realOrderCount 에 잡히고 syntheticOrderCount=0 이라
  //   숫자만 보면 'real' 이 된다. 공통 화면 판정(kind)을 권위로 쓴다.
  const screenState = screenStateFromRevenue(revenue);
  let sourceMode: DepartmentSourceMode = 'unavailable';
  if (screenState.kind === 'fixture') {
    sourceMode = 'synthetic'; // 시험 데이터 계열 — 실데이터로 표현하지 않는다(계약 확장 없이 기존 4종 유지)
  } else if (totalOrders > 0 && screenState.kind !== 'unavailable') {
    if (syntheticOrderCount > 0 && realOrderCount > 0) sourceMode = 'mixed';
    else if (syntheticOrderCount > 0) sourceMode = 'synthetic';
    else sourceMode = 'real';
  }

  return {
    generatedAtMs: opts.nowMs ?? 0,
    sourceMode,
    periodLabel: opts.periodLabel ?? '전체 기간',
    orderUniverse: { totalOrders, validOrders: operationalOrderCount, cancelledOrders, unpaidOrders, returnedOrders },
    revenueUniverse: { grossProductRevenue: productLineRevenue, netOrderRevenue: operationalRevenue, shippingRevenue, refundedRevenue, operationalRevenue },
    productUniverse: { totalQuantitySold, productCount, riskyStockCount, outOfStockCount: stockRisk.outOfStock, lowStockCount: stockRisk.lowStock, unknownStockCount: stockRisk.unknown, attentionCount: stockRisk.attention },
    customerUniverse: { totalCustomers, repeatCustomers, highRiskCustomers },
    csUniverse: { totalInquiries, unresolvedInquiries, resolvedInquiries, unknownInquiries, totalReviews, autoCandidates },
    metadata: {
      includesSynthetic: syntheticOrderCount > 0,
      realOrderCount,
      syntheticOrderCount,
      basisDescription: '대표 운영 매출/주문 = 유효 주문(결제완료·미취소) 기준(netOrderRevenue/orderCountValid). 상품 라인 매출(gross)은 부서 전용 분석값. ' +
        (screenState.kind === 'fixture'
          ? '시험 데이터(기능시험 fixture) — 실데이터 아님.'
          : syntheticOrderCount > 0 ? 'synthetic/demo 데이터 포함(실데이터 아님).' : '')
    },
    operationalRevenue,
    operationalOrderCount,
    operationalAOV,
    productLineRevenue
  };
}

// 디버그/감사용 — isValidOrder 재노출(부서가 동일 판정을 쓰도록).
export { isValidOrder };
