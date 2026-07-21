// ────────────────────────────────────────────────────────────────────────────
// First Purchase Contract — 첫구매/재구매 3상태 공용 계약 (RC-1 C-8)
//
// 배경: RevenueOrder.isFirstPurchase는 optional이다(firstSaleFl이 없으면 undefined).
//   `boolv(o.isFirstPurchase)` 패턴은 undefined를 false(재구매)로 뭉개 재구매를 부풀린다.
//   소비자마다 조건문을 복붙하면 같은 오류가 다시 갈라지므로 **판정을 여기 한 곳**에 둔다.
//
// 규칙
//   · canonical true  → 'first'
//   · canonical false → 'repeat'
//   · undefined 및 비정상 값 → 'unknown'
//   · 전체 주문수·매출에는 unknown도 포함한다
//   · first 필터는 'first'만, repeat 필터는 'repeat'만 포함한다(unknown 미포함)
//   · 그룹을 보여주는 축(customerType/firstRepeat)은 unknown을 '미분류'로 별도 표시한다
//   · 고정 KPI가 first/repeat 두 값만 허용하면 unknown을 조용히 버리지 말고
//     미분류 건수를 함께 제공해 비중 합계가 100% 미만인 이유를 알 수 있게 한다
// ────────────────────────────────────────────────────────────────────────────

export type FirstPurchaseClass = 'first' | 'repeat' | 'unknown';

/** 화면 표시 라벨. 키는 영문으로 통일하고 라벨만 한글로 쓴다. */
export const FIRST_PURCHASE_LABEL: Record<FirstPurchaseClass, string> = {
  first: '첫구매',
  repeat: '재구매',
  unknown: '미분류'
};

/**
 * 원시값 → 3상태. undefined·null·빈문자열·인식 불가 값은 전부 'unknown'이다.
 * 어댑터가 canonical boolean으로 정규화하기 전까지의 방어이기도 하다(C-4).
 */
export const classifyFirstPurchase = (value: unknown): FirstPurchaseClass => {
  if (value === true || value === 'true' || value === 'y' || value === 'Y' || value === 1) return 'first';
  if (value === false || value === 'false' || value === 'n' || value === 'N' || value === 0) return 'repeat';
  return 'unknown';
};

/** 편의 술어 — 필터에서 쓴다. unknown은 어느 쪽에도 포함되지 않는다. */
export const isFirstPurchaseOrder = (value: unknown): boolean => classifyFirstPurchase(value) === 'first';
export const isRepeatPurchaseOrder = (value: unknown): boolean => classifyFirstPurchase(value) === 'repeat';

/**
 * 3상태 boolean 표현. 기존 `boolean | undefined` 시그니처를 쓰는 곳을 위한 어댑터.
 * true=first / false=repeat / undefined=unknown.
 */
export const firstPurchaseTristate = (value: unknown): boolean | undefined => {
  const c = classifyFirstPurchase(value);
  return c === 'unknown' ? undefined : c === 'first';
};
