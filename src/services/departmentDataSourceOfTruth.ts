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
import { screenStateFromRevenue, resolveRealOrdersDisplay, type RealOrdersDisplay } from './revenueScreenState';
import { classifyClaimEvent, type ClaimEventKind, type ReturnStage } from './claimEventContract';

export type DepartmentSourceMode = 'real' | 'synthetic' | 'mixed' | 'unavailable';

export interface DepartmentSourceOfTruthSnapshot {
  generatedAtMs: number;
  sourceMode: DepartmentSourceMode;
  periodLabel: string;

  orderUniverse: {
    totalOrders: number;
    validOrders: number;
    // D-1.2: cancelledOrders = 원본 사건이 "취소"인 주문(발송 전 중단)만. 반품/환불 호환 태그 제외.
    cancelledOrders: number;
    unpaidOrders: number;
    // D-1.2: 반품 "접수" 건수(사건이 return 인 주문). 취소·환불을 섞지 않는다(옛 returnedOrders 대체).
    returnReceivedOrders: number;
  };
  revenueUniverse: {
    grossProductRevenue: number;
    netOrderRevenue: number;
    shippingRevenue: number;
    // D-1.2: 실제 환불 "완료" 금액만(refundStatus=completed). 요청/대기/미확인은 분리(아래).
    completedRefundRevenue: number;
    // D-1.2: 요청/예상 환불금액 합(refundPrice/claimAmount) — 완료금액이 아님. 완료와 혼동 금지.
    requestedRefundAmount: number;
    // D-1.2: 환불 대기(pending) 금액. 미확인(unknown)은 0 단정하지 않고 별도 카운트로 보존.
    pendingRefundRevenue: number;
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
  // D-1.2: 취소·반품·환불 사건 분류 요약(공통 분류기 claimEventContract 기준). 정본(데이터가 결정).
  //   CS팀장 커스텀은 "표시할 지표 선택"만 가능하며 이 정본 사건·상태는 변경 불가.
  claimUniverse: {
    cancelOrders: number;          // 취소(발송 전 중단)
    returnReceivedOrders: number;  // 반품 접수
    exchangeOrders: number;        // 교환
    refundOnlyOrders: number;      // 반품 없이 환불만(부분 환불 등)
    unknownClaimOrders: number;    // 확인 필요(근거 부족/충돌)
    completedRefundCount: number;  // 실제 환불 완료 건수
    pendingRefundCount: number;    // 환불 대기 건수
    unknownRefundCount: number;    // 환불 완료 여부 미확인 건수(0 단정 금지)
    completedRefundAmount: number; // 실제 환불 완료금액
    requestedRefundAmount: number; // 요청/예상 환불금액(완료 아님)
    returnStageBreakdown: Record<ReturnStage, number>; // 반품 단계(RAW b1~b4 증명분)
  };
  metadata: {
    includesSynthetic: boolean;
    realOrderCount: number;
    syntheticOrderCount: number;
    // D-1: 실제 주문 하위 상태(연결 안 됨 ≠ 실제 0건). realOrderCount 단독으로는 조합3/4가 구별 안 되므로 보존.
    realOrders: RealOrdersDisplay;
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
  const unpaidOrders = orders.filter((o) => o.unpaid || (!o.paid && !o.canceled)).length;

  // ── D-1.2: 취소·반품·환불 사건 분류(공통 분류기) — 문자열 정규식 제각각 판정 종식 ──
  //   취소↔반품↔환불을 서로 다른 사건으로 단일 분류하고, 요청금액과 실제 완료금액을 분리한다.
  const claimEvents = orders.map((o) => (o.claim?.hasClaim
    ? classifyClaimEvent(o.claim, { paid: o.paid, shipped: o.shipped })
    : null));
  const zeroStages: Record<ReturnStage, number> = { received: 0, in_transit: 0, on_hold: 0, collected: 0, unknown: 0 };
  const returnStageBreakdown: Record<ReturnStage, number> = { ...zeroStages };
  const claimCount = (k: ClaimEventKind): number => claimEvents.filter((e) => e?.eventKind === k).length;
  const cancelledOrders = claimCount('cancel');            // 취소만(발송 전 중단)
  const returnReceivedOrders = claimCount('return');       // 반품 접수만(취소·환불 미포함)
  const exchangeOrders = claimCount('exchange');
  const refundOnlyOrders = claimCount('refund_only');
  const unknownClaimOrders = claimCount('unknown');
  let completedRefundAmount = 0, requestedRefundAmount = 0, pendingRefundRevenue = 0;
  let completedRefundCount = 0, pendingRefundCount = 0, unknownRefundCount = 0;
  for (const e of claimEvents) {
    if (!e) continue;
    requestedRefundAmount += e.requestedRefundAmount;
    if (e.eventKind === 'return' && e.returnStage) returnStageBreakdown[e.returnStage] += 1;
    if (e.refundStatus === 'completed') { completedRefundAmount += e.completedRefundAmount; completedRefundCount += 1; }
    else if (e.refundStatus === 'pending') { pendingRefundRevenue += e.requestedRefundAmount; pendingRefundCount += 1; }
    else if (e.refundStatus === 'unknown') { unknownRefundCount += 1; }
  }

  // 매출 universe
  const shippingRevenue = summary ? num(summary.deliveryFeeTotal) : orders.reduce((s, o) => s + num(o.deliveryFee), 0);
  // D-1.2: 완료 근거가 있는 환불만 완료금액으로 집계(요청/대기/미확인은 분리 — 위 분류기 기준).
  const completedRefundRevenue = completedRefundAmount;

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
  //   판정 권위는 공통 화면 상태(kind)다. 주문 건수(totalOrders>0)를 전제로 두면
  //   **실제 성공 0건**(계약상 '실제 데이터 0건')이 unavailable 로 잘못 남는다.
  const screenState = screenStateFromRevenue(revenue);
  let sourceMode: DepartmentSourceMode;
  switch (screenState.kind) {
    case 'actual':
      sourceMode = 'real'; // 주문이 0건이어도 실제 데이터 0건이다
      break;
    case 'fixture':
      sourceMode = 'synthetic'; // 시험 데이터 계열 — 실데이터로 표현하지 않는다(기존 4종 유지)
      break;
    case 'simulation':
      sourceMode = realOrderCount > 0 ? 'mixed' : 'synthetic';
      break;
    default:
      sourceMode = 'unavailable';
  }

  return {
    generatedAtMs: opts.nowMs ?? 0,
    sourceMode,
    periodLabel: opts.periodLabel ?? '전체 기간',
    orderUniverse: { totalOrders, validOrders: operationalOrderCount, cancelledOrders, unpaidOrders, returnReceivedOrders },
    revenueUniverse: { grossProductRevenue: productLineRevenue, netOrderRevenue: operationalRevenue, shippingRevenue, completedRefundRevenue, requestedRefundAmount, pendingRefundRevenue, operationalRevenue },
    productUniverse: { totalQuantitySold, productCount, riskyStockCount, outOfStockCount: stockRisk.outOfStock, lowStockCount: stockRisk.lowStock, unknownStockCount: stockRisk.unknown, attentionCount: stockRisk.attention },
    customerUniverse: { totalCustomers, repeatCustomers, highRiskCustomers },
    csUniverse: { totalInquiries, unresolvedInquiries, resolvedInquiries, unknownInquiries, totalReviews, autoCandidates },
    claimUniverse: {
      cancelOrders: cancelledOrders, returnReceivedOrders, exchangeOrders, refundOnlyOrders, unknownClaimOrders,
      completedRefundCount, pendingRefundCount, unknownRefundCount,
      completedRefundAmount, requestedRefundAmount, returnStageBreakdown
    },
    metadata: {
      includesSynthetic: syntheticOrderCount > 0,
      realOrderCount,
      syntheticOrderCount,
      // D-1: 조합3(연결 실패)과 조합4(실제 성공 0건)를 구별 보존. sourceMode 만으로 실제 연결 상태 추측 금지.
      realOrders: resolveRealOrdersDisplay(revenue?.realOrdersStatus, realOrderCount),
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
