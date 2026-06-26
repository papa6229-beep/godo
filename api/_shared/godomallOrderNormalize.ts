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
