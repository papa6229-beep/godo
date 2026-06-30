// ────────────────────────────────────────────────────────────────────────────
// Revenue Metric Contract — 부서 공통 매출/주문 metric 단일 정의(Single Source of Truth)
//
// 배경: 상품관리팀(상품매출=전체 주문 라인합 gross)과 마케팅팀(총매출=유효 주문 순매출 net)이
//   서로 다른 기준으로 매출/주문수를 표시해 "같은 전체 매출처럼 보이는 KPI"가 달라 보였다.
//   이는 버그가 아니라 의도된 다른 관점이지만, 같은 이름의 KPI가 다른 계산식을 쓰면 신뢰를 잃는다.
//
// 원칙: "부서별 화면은 목적에 따라 다른 매출 관점을 가질 수 있지만,
//        같은 이름의 KPI가 서로 다른 계산식을 사용해서는 안 된다."
//
// 모든 부서 대시보드는 매출/주문 metric을 이 파일의 정의/헬퍼/라벨로부터 참조한다.
// (유효 주문 판정 isValidOrder는 marketingAnalysisFacts의 기존 isCounted와 동일 로직 — 숫자 불변)
// ────────────────────────────────────────────────────────────────────────────

export type RevenueMetricKind =
  | 'grossProductRevenue'
  | 'netOrderRevenue'
  | 'validOrderRevenue'
  | 'cancelledRevenue'
  | 'refundedRevenue'
  | 'orderCountAll'
  | 'orderCountValid'
  | 'averageOrderValue';

export interface MetricOrderLike {
  totalAmount?: unknown;
  paid?: unknown;
  canceled?: unknown;
  state?: { paid?: unknown; canceled?: unknown };
  lines?: { lineRevenue?: unknown }[];
}

// marketingAnalysisFacts의 num/bool과 동일 정의(숫자 일치 보장).
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 'y' || v === 1;

/**
 * 유효 주문 판정: 결제완료(paid) & 미취소(!canceled).
 * 입력 2종 수용: 중첩 state{paid,canceled}(universe) / 평탄 paid·canceled(RevenueOrderLite).
 * 상태 정보가 전혀 없으면 금액(totalAmount>0) 기준으로 폴백한다.
 * — marketingAnalysisFacts의 isCounted와 동일 로직.
 */
export const isValidOrder = (o: MetricOrderLike): boolean => {
  if (o.state && (o.state.paid !== undefined || o.state.canceled !== undefined)) {
    return bool(o.state.paid) && !bool(o.state.canceled);
  }
  if (o.paid !== undefined || o.canceled !== undefined) {
    return bool(o.paid) && !bool(o.canceled);
  }
  return num(o.totalAmount) > 0;
};

/** grossProductRevenue — 전체 주문(취소·미입금·가상 포함)의 상품 라인합. 배송비 제외. 상품흐름/재고 분석용. */
export const computeGrossProductRevenue = (orders: MetricOrderLike[]): number => {
  let sum = 0;
  for (const o of orders) for (const l of o.lines ?? []) sum += num(l.lineRevenue);
  return sum;
};

/** netOrderRevenue — 유효 주문(결제완료·미취소)의 주문 총액 합. 마케팅 성과/객단가 기본. */
export const computeNetOrderRevenue = (orders: MetricOrderLike[]): number => {
  let sum = 0;
  for (const o of orders) if (isValidOrder(o)) sum += num(o.totalAmount);
  return sum;
};

/** orderCountAll — 전체 주문 수(취소·미입금·가상 포함). */
export const countAllOrders = (orders: MetricOrderLike[]): number => orders.length;

/** orderCountValid — 유효 주문 수(결제완료·미취소). */
export const countValidOrders = (orders: MetricOrderLike[]): number => orders.filter(isValidOrder).length;

/**
 * averageOrderValue — 매출 ÷ 주문수. denominator를 호출부가 명시해야 한다.
 * 마케팅 객단가는 netOrderRevenue ÷ orderCountValid 기준.
 */
export const computeAverageOrderValue = (revenue: number, orderCount: number): number =>
  (orderCount > 0 ? Math.round(revenue / orderCount) : 0);

// 대시보드 표시용 라벨/설명/기준 — 같은 문구를 모든 부서가 공유한다.
export interface RevenueMetricLabel {
  label: string;
  basis: string;       // 짧은 보조 문구(KPI sub/badge)
  description: string;  // 긴 설명(tooltip/문서)
  includes: string;
  excludes: string;
}

export const REVENUE_METRIC_LABELS: Record<RevenueMetricKind, RevenueMetricLabel> = {
  grossProductRevenue: {
    label: '상품매출',
    basis: '라인합·배송비 제외 · 전체 주문(취소·가상 포함)',
    description: '전체 주문(취소·미입금·가상 포함)의 상품 라인 금액 합계. 배송비 제외. 상품 판매흐름/재고 영향 분석용 — 마케팅 "총매출(유효 주문 순매출)"과 기준이 다릅니다.',
    includes: '전체 주문(취소·미입금·가상 포함), 상품 라인 금액',
    excludes: '배송비'
  },
  netOrderRevenue: {
    label: '총매출',
    basis: '취소·반품 제외 유효 주문(결제완료·미취소) 기준',
    description: '결제완료·미취소 유효 주문의 주문 총액 합계. 마케팅 성과/객단가 분석의 기본값 — 상품관리 "상품매출(전체 주문 라인합)"과 기준이 다릅니다.',
    includes: '유효 주문(결제완료·미취소)의 주문 총액',
    excludes: '취소·반품·미입금 주문'
  },
  validOrderRevenue: {
    label: '유효 주문매출',
    basis: '결제완료·배송 등 유효 상태 주문',
    description: '유효 상태(결제완료·미취소) 주문만 포함한 매출. netOrderRevenue와 동일 기준.',
    includes: '유효 상태 주문',
    excludes: '취소·반품·미입금 주문'
  },
  cancelledRevenue: {
    label: '취소 매출',
    basis: '취소 주문 금액',
    description: '취소된 주문의 금액 합계(참고용).',
    includes: '취소 주문',
    excludes: '유효 주문'
  },
  refundedRevenue: {
    label: '환불 매출',
    basis: '환불 주문 금액',
    description: '환불 처리된 주문의 금액 합계(참고용).',
    includes: '환불 주문',
    excludes: '유효 주문'
  },
  orderCountAll: {
    label: '총 주문',
    basis: '전체 주문(취소·미입금·가상 포함)',
    description: '전체 주문 건수. 취소·미입금·가상 주문을 모두 포함 — 마케팅 "주문수(유효 주문)"와 기준이 다릅니다.',
    includes: '전체 주문',
    excludes: '없음'
  },
  orderCountValid: {
    label: '주문수',
    basis: '유효 주문(결제완료·미취소)',
    description: '결제완료·미취소 유효 주문 건수. 마케팅 객단가의 분모(denominator).',
    includes: '유효 주문',
    excludes: '취소·반품·미입금 주문'
  },
  averageOrderValue: {
    label: '객단가',
    basis: '유효 매출 ÷ 유효 주문수',
    description: '유효 주문 순매출(netOrderRevenue) ÷ 유효 주문수(orderCountValid). denominator=orderCountValid.',
    includes: '유효 주문',
    excludes: '취소·반품·미입금 주문'
  }
};
