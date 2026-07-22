// ────────────────────────────────────────────────────────────────────────────
// Line Axis Aggregation — 라인 축(상품/카테고리/브랜드) 집계 공용 규칙
//
// 배경(RC-1): 주문 라인을 순회하며 집계할 때 주문 기반 지표까지 라인마다 증가시켜
//   상품/카테고리 축의 주문수·객단가·쿠폰사용률이 부풀려졌다.
//   planner와 scopeInsight가 각자 고쳐 복붙하면 같은 문제가 다시 갈라지므로,
//   **두 소비자가 같이 쓰는 최소 공용 규칙**을 여기 둔다. 범용 엔진이 아니다.
//
// 계약(docs/CONTRACT_DRAFT_RC1_METRICS.md C-1 / C-5)
//   · 라인 합산      : revenue, lineRevenue, quantity, firstRevenue, repeatRevenue
//   · 주문 중복 제거 : orderCount, couponOrders, rewardOrders, firstOrders, repeatOrders
//                     (집계칸 단위로 같은 주문은 한 번만)
//   · 카테고리       : RevenueOrderLine.categoryCode만 사용. 현재 productIndex 재조인 금지
//                     (재조인하면 상품 카테고리 변경 시 과거 매출이 소급 재분류된다)
// ────────────────────────────────────────────────────────────────────────────

import { firstPurchaseTristate } from './firstPurchaseContract';

/**
 * 주문 1건이 가진 주문 단위 속성. 라인마다 다시 평가하지 않는다.
 * first는 3상태다 — isFirstPurchase가 optional이라 firstSaleFl이 없는 실주문은 undefined다.
 *   true=첫구매 / false=재구매 / undefined=미분류(둘 다 아님)
 */
export type OrderScopedFlags = { coupon: boolean; reward: boolean; first: boolean | undefined };

/**
 * isFirstPurchase 원시값 → 3상태. 판정은 firstPurchaseContract 한 곳에만 둔다(C-8).
 * 여기서 다시 구현하지 않는다.
 */
export const resolveFirstPurchase = firstPurchaseTristate;

/** 주문 중복 제거 대상 카운터. 소비자마다 보유 필드가 달라 전부 optional로 둔다. */
export type OrderScopedCounters = {
  orderCount: number;
  couponOrders?: number;
  rewardOrders?: number;
  firstOrders?: number;
  repeatOrders?: number;
};

/**
 * 주문 식별 키. orderNo가 비어 있는 주문이 여러 건일 때 하나로 합쳐지지 않도록
 * 주문 순번 기반 대체 키를 쓴다(빈 문자열 공유 금지).
 */
export const resolveOrderKey = (orderNo: unknown, fallbackIndex: number): string => {
  const raw = orderNo === undefined || orderNo === null ? '' : String(orderNo).trim();
  // 실제 주문번호와 대체키는 서로 다른 namespace를 쓴다(주문번호가 'idx:3'인 경우와 충돌 방지).
  return raw ? `ord:${raw}` : `idx:${fallbackIndex}`;
};

/**
 * 집계칸 레지스트리 키. 문자열 이어붙이기는 ["a b","c"]와 ["a","b c"]가 충돌하므로 쓰지 않는다.
 * A-2처럼 카테고리·상품을 한 실행에서 함께 집계할 때를 대비해 축 종류를 반드시 포함한다.
 */
export const cellRegistryKey = (axisKind: string, axisKey: string, bucketKey = ''): string =>
  JSON.stringify([axisKind, axisKey, bucketKey]);

/** 집계칸별 "이미 센 주문" 레지스트리 조회(없으면 생성). */
export const seenOrdersFor = (registry: Map<string, Set<string>>, cellKey: string): Set<string> => {
  const hit = registry.get(cellKey);
  if (hit) return hit;
  const created = new Set<string>();
  registry.set(cellKey, created);
  return created;
};

/**
 * 주문 기반 카운터를 집계칸당 한 번만 증가시킨다.
 * @returns 이번 호출에서 실제로 증가했으면 true(같은 칸에서 이미 센 주문이면 false)
 */
export const countOrderOnce = (
  acc: OrderScopedCounters,
  seenOrders: Set<string>,
  orderKey: string,
  flags: OrderScopedFlags
): boolean => {
  if (seenOrders.has(orderKey)) return false;
  seenOrders.add(orderKey);
  acc.orderCount += 1;
  if (flags.coupon && acc.couponOrders !== undefined) acc.couponOrders += 1;
  if (flags.reward && acc.rewardOrders !== undefined) acc.rewardOrders += 1;
  // first는 3상태다. undefined(미분류)는 첫구매도 재구매도 아니며 orderCount에만 포함된다.
  if (flags.first === true) {
    if (acc.firstOrders !== undefined) acc.firstOrders += 1;
  } else if (flags.first === false) {
    if (acc.repeatOrders !== undefined) acc.repeatOrders += 1;
  }
  return true;
};

/** C-1: 분석 카테고리는 주문 라인의 categoryCode만 쓴다. 없으면 uncategorized로 확정. */
export const lineCategoryKey = (line: Record<string, unknown> | undefined): string => {
  const raw = line?.categoryCode;
  const s = raw === undefined || raw === null ? '' : String(raw).trim();
  return s || 'uncategorized';
};

/** 카테고리 키 → 화면 라벨. 키는 uncategorized로 통일하고 표시만 한글로 한다. */
export const categoryLabelOf = (key: string): string =>
  (key === 'uncategorized' ? '미분류' : `카테고리 ${key}`);
