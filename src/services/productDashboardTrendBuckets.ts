// 상품팀 대시보드 매출추이 버킷 생성 (pure helper) — Trend Chart Fix v0
//
// 원칙(작업지시서 §4~7):
//   1) 선택 기간(start~end)으로 먼저 필터 → 그 안의 데이터만 단위(month/week/day)로 버킷팅.
//   2) 버킷은 선택 기간을 "연속"으로 채운다(데이터 없는 구간도 0으로 생성) → x축이 끊기지 않음.
//   3) 기간 밖 데이터는 절대 섞지 않는다.
//   4) 막대/꺾은선은 같은 버킷 리스트를 공유(이 함수 결과 하나).
//   5) 라벨 축약은 "표시"만 줄인다(버킷 자체는 유지) — labelStepFor.
//
// import-free(자체 타입) → 컴포넌트/스모크 양쪽에서 재사용.

export type TrendGranularity = 'month' | 'week' | 'day';

export interface TrendOrderInput {
  orderDate: string; // 'YYYY-MM-DD...' (앞 10자리 사용)
  deliveryFee: number;
  totalAmount: number;
  lines: { lineRevenue: number; categoryCode: string }[];
}

export interface TrendBucket {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  deliveryFee: number;
  totalAmount: number;
}

// ── 로컬 날짜 유틸 (UTC 파싱 시프트 방지: 부분 문자열로 직접 구성) ──
const ymd = (s: string): string => (s || '').slice(0, 10);
const toLocal = (s: string): Date => {
  const d = ymd(s);
  return new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
};
const fmt = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const md = (d: Date): string => `${d.getMonth() + 1}/${d.getDate()}`;
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / 86400000);

// 선택 기간을 단위별 "연속" 버킷 스켈레톤으로 생성(빈 버킷 포함). week는 start 기준 7일 윈도우.
const enumerateBuckets = (start: string, end: string, gran: TrendGranularity): { key: string; label: string }[] => {
  if (!ymd(start) || !ymd(end) || ymd(start) > ymd(end)) return [];
  const out: { key: string; label: string }[] = [];
  if (gran === 'month') {
    let y = Number(start.slice(0, 4));
    let m = Number(start.slice(5, 7));
    const ey = Number(end.slice(0, 4));
    const em = Number(end.slice(5, 7));
    while (y < ey || (y === ey && m <= em)) {
      out.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${m}월` });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }
  if (gran === 'day') {
    const s = toLocal(start);
    const e = toLocal(end);
    for (let d = s; d.getTime() <= e.getTime(); d = addDays(d, 1)) {
      out.push({ key: fmt(d), label: md(d) });
    }
    return out;
  }
  // week: start 기준 7일 윈도우 (7/2~7/8, 7/9~7/15 ...). 마지막 윈도우는 end로 클램프.
  const s = toLocal(start);
  const e = toLocal(end);
  for (let ws = s; ws.getTime() <= e.getTime(); ws = addDays(ws, 7)) {
    const weRaw = addDays(ws, 6);
    const we = weRaw.getTime() > e.getTime() ? e : weRaw;
    out.push({ key: fmt(ws), label: `${md(ws)}~${md(we)}` });
  }
  return out;
};

// 주문 날짜 → 버킷 key (start 기준). 범위 밖이면 null.
const bucketKeyOf = (orderDate: string, start: string, end: string, gran: TrendGranularity): string | null => {
  const d = ymd(orderDate);
  if (!d || d < ymd(start) || d > ymd(end)) return null;
  if (gran === 'month') return d.slice(0, 7);
  if (gran === 'day') return d;
  const w = Math.floor(diffDays(toLocal(d), toLocal(start)) / 7);
  return fmt(addDays(toLocal(start), w * 7));
};

// 선택 기간 + 단위로 연속 버킷 생성 후 주문을 채운다(category 필터는 매출 합산에만 적용).
export function buildTrendBuckets(
  orders: TrendOrderInput[],
  opts: { start: string; end: string; granularity: TrendGranularity; category?: string }
): TrendBucket[] {
  const { start, end, granularity, category = 'all' } = opts;
  const skeleton = enumerateBuckets(start, end, granularity);
  if (skeleton.length === 0) return [];
  const map = new Map<string, TrendBucket>();
  for (const b of skeleton) map.set(b.key, { ...b, revenue: 0, orders: 0, deliveryFee: 0, totalAmount: 0 });

  for (const o of orders) {
    const key = bucketKeyOf(o.orderDate, start, end, granularity);
    if (key === null) continue; // 기간 밖 제외
    const b = map.get(key);
    if (!b) continue; // 스켈레톤에 없는 key(이론상 없음) 방어
    b.orders += 1;
    b.deliveryFee += o.deliveryFee || 0;
    b.totalAmount += o.totalAmount || 0;
    for (const l of o.lines) {
      if (category === 'all' || l.categoryCode === category) b.revenue += l.lineRevenue || 0;
    }
  }
  // skeleton 순서(시간순) 유지
  return skeleton.map((b) => map.get(b.key)!);
}

// x축 라벨 표시 간격(버킷은 유지, 라벨만 축약). 작업지시서 §6 정책.
export function labelStepFor(granularity: TrendGranularity, n: number): number {
  if (n <= 1) return 1;
  if (granularity === 'month') return n <= 18 ? 1 : Math.ceil(n / 12);
  if (granularity === 'week') return n <= 20 ? 1 : Math.ceil(n / 16);
  // day
  return n <= 14 ? 1 : Math.max(2, Math.ceil(n / 15));
}
