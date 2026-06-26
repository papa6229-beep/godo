// 고도몰 Order_Search raw 응답 정규화 유틸 (Raw Order Normalize)
//
// 목적: Order_Search.php raw 응답의 "단일 객체 / 배열 / 빈값" 흔들림과
//       "숫자가 문자열로 내려오는" 흔들림을 안전하게 흡수한다.
//
// 기존 관계:
//   - godomallRevenue.ts 에 이미 `isValidDate`(export) / `normalizeLines`(export) 가 있다.
//     그 둘은 RevenueOrder 변환 경로의 공개 API이므로 "건드리지 않는다"(하위호환 보존).
//   - 본 모듈은 raw-order 경로(godomallOrderTypes / syntheticGodomallOrders)에서 쓰는
//     "제네릭" 버전을 제공한다. 의미는 동일하되 시그니처가 제네릭이라 타입 보존에 유리하다.
//   - 신규 코드는 본 모듈을, RevenueOrder 변환은 기존 함수를 쓰면 된다(중복 최소·충돌 없음).

// 단일 객체 / 배열 / null / undefined → 항상 배열로.
// (빈 객체도 유효 원소로 본다 — 호출측이 필요 시 필터링)
export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// 고도몰 날짜 유효성: 빈값 / '0000-00-00 00:00:00' / 0 류는 무효.
// (godomallRevenue.isValidDate 와 동일 규칙 — raw 경로용 제네릭 노출)
export function isValidGodoDate(value: unknown): boolean {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (!s) return false;
  if (/^0000[-/.]?0?0/.test(s)) return false;
  return /[1-9]/.test(s);
}

// 임의 값 → number. 통화/쉼표/문자가 섞여도 숫자만 추출. 실패 시 fallback.
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const n = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

// 임의 값 → 정수.
export function toInt(value: unknown, fallback = 0): number {
  const n = parseInt(String(value ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

// 임의 값 → trim된 문자열. null/undefined는 fallback.
export function toStringValue(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  const s = String(value).trim();
  return s.length > 0 ? s : fallback;
}

// ── Order_Search 0건 응답 가드 (Empty Response Guard) ────────────────────────
// 배경: extractList(태그명 비의존 추출)는 0건 응답에서 generic 래퍼({code,msg,lastOrder}
// 또는 빈 {})를 "주문 1건"으로 오인할 수 있다(phantom). 아래 가드로 "의미 있는 주문"만 남긴다.

// 주문 후보로 인정하는 최소 키 — 하나 이상 유효해야 실제 주문으로 본다.
const MEANINGFUL_ORDER_KEYS = [
  'orderNo',
  'orderGoodsData',
  'orderGoodsNm',
  'settlePrice',
  'totalGoodsPrice',
  'orderStatus'
] as const;

// 값 존재 판정: 빈문자열/빈배열/빈객체/null/undefined는 "없음"으로 본다.
const hasValue = (v: unknown): boolean => {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0;
  return Boolean(v);
};

// 단일 order_data 객체가 "의미 있는 주문"인지 판정.
// 객체가 아니거나(문자열/배열/null), 후보 키가 모두 비어 있으면 false.
export function isMeaningfulGodoOrderData(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return MEANINGFUL_ORDER_KEYS.some((k) => hasValue(rec[k]));
}

// order_data(단일/배열/빈값/메타-only 래퍼) → "의미 있는 주문" 배열로 정규화.
//   missing / null / '' / {} / 메타-only({code,msg,lastOrder}) → []
//   { orderNo ... } → [그 객체]
//   [{ orderNo }, {}] → [{ orderNo }]  (빈 후보 제거)
// 입력은 raw order_data 값이거나, 이미 extractList로 추출된 배열 모두 허용.
export function normalizeOrderData(value: unknown): Record<string, unknown>[] {
  return asArray<unknown>(value).filter(isMeaningfulGodoOrderData) as Record<string, unknown>[];
}
