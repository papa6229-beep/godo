// ────────────────────────────────────────────────────────────────────────────
// Inventory Risk Contract — 부서 공통 재고 위험 단계 단일 정의(Single Source of Truth)
//
// 배경(RC-1 C-3): 같은 재고(syntheticProjectedStock)를 상품/CS/캘린더/스냅샷 네 화면이
//   각자 다른 하드코딩 임계값(≤5, ≤20, ≤40)으로 판단해 같은 상품이 화면마다 다른 위험
//   상태·건수로 나왔다. 또 재고가 없는(NaN/누락) 상품을 정상으로 오판할 위험이 있었다.
//
// 계약(사장 확정):
//   out_of_stock : stock <= 0
//   low_stock    : 0 < stock <= resolvedSafetyStock
//   ok           : stock > resolvedSafetyStock
//   unknown      : stock 누락·NaN·해석 불가 (ok/low_stock으로 뭉개지 않는다)
//   resolvedSafetyStock: 유효한 상품별 safetyStock 우선 / 누락·NaN·음수·잘못된 값 → DEFAULT_SAFETY_STOCK / 0은 유효
//   riskyStockCount = out_of_stock + low_stock, unknownStockCount 분리, attentionCount = risky + unknown
//
// 원칙: 임계값·기본값 숫자를 소비자마다 복붙하지 않는다. 이 파일의 상수/함수만 참조한다.
//   판매속도·재고 소진 예상일·동적 safetyStock 추천은 이번 범위 밖.
// ────────────────────────────────────────────────────────────────────────────

export type StockRiskLevel = 'out_of_stock' | 'low_stock' | 'ok' | 'unknown';
export type SafetyStockSource = 'product' | 'global_default';

/**
 * B-core-2a: 판정이 **무엇을 근거로** 내려졌는지.
 *   sold_out_flag   판매상태가 품절 — 재고 숫자와 무관
 *   unlimited_stock 재고관리 안 함(무제한) — 숫자 0이어도 품절 아님
 *   stock_number    재고 숫자 대 안전재고
 */
export type StockRiskBasis = 'sold_out_flag' | 'unlimited_stock' | 'stock_number';

// 공통 기본 안전재고 — 단일 상수(여러 파일에 숫자 복사 금지).
export const DEFAULT_SAFETY_STOCK = 5;

export interface StockRiskResult {
  level: StockRiskLevel;
  stock: number | null;               // 해석 불가면 null
  resolvedSafetyStock: number;
  safetyStockSource: SafetyStockSource;
  /** 판정 근거. 기존 classifyStockRisk 는 항상 'stock_number'. */
  basis: StockRiskBasis;
}

export interface StockRiskSummary {
  outOfStock: number;
  lowStock: number;
  ok: number;
  unknown: number;
  risky: number;      // out_of_stock + low_stock
  attention: number;  // risky + unknown (관리자 확인 대상 전체)
}

// 유효 수치 판정: number 또는 숫자 문자열만 통과. 누락/공백/NaN/비수치 → null.
const toFiniteNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * 상품별 safetyStock 확정. 유효(0 이상 유한 수치)면 그 값(source=product),
 * 누락·NaN·음수·잘못된 값이면 DEFAULT_SAFETY_STOCK(source=global_default). 0은 유효.
 */
export function resolveSafetyStock(raw: unknown): { value: number; source: SafetyStockSource } {
  const n = toFiniteNumber(raw);
  if (n === null || n < 0) return { value: DEFAULT_SAFETY_STOCK, source: 'global_default' };
  return { value: n, source: 'product' };
}

/** 재고 위험 단계 판정. 근거(level·stock·resolvedSafetyStock·safetyStockSource·basis) 포함. */
export function classifyStockRisk(stockRaw: unknown, safetyStockRaw?: unknown): StockRiskResult {
  const { value: resolvedSafetyStock, source: safetyStockSource } = resolveSafetyStock(safetyStockRaw);
  const stock = toFiniteNumber(stockRaw);
  if (stock === null) {
    return { level: 'unknown', stock: null, resolvedSafetyStock, safetyStockSource, basis: 'stock_number' };
  }
  const level: StockRiskLevel = stock <= 0 ? 'out_of_stock' : stock <= resolvedSafetyStock ? 'low_stock' : 'ok';
  return { level, stock, resolvedSafetyStock, safetyStockSource, basis: 'stock_number' };
}

// ── B-core-2a: 판매상태까지 포함한 단일 판정 ────────────────────────────────
// 배경: 고도몰 상품에는 재고 숫자 말고도 판매상태 신호가 있다.
//   soldOut=true       → 재고가 아무리 많아도 팔 수 없다(품절)
//   stockEnabled=false → 재고관리를 하지 않는 상품(무제한). 숫자 0 은 "재고 없음"이 아니다
// 이 신호를 계약이 받지 못하던 동안 A 세계(dataNormalizer·godomallInventoryDerive)가
// 각자 판정 분기를 따로 갖고 있었고, 같은 상품이 화면마다 다른 위험 상태로 나왔다.
// **우선순위를 여기 한 곳에만 둔다.** 소비자는 분기를 복사하지 않는다.

/** 'y'/'n'/'true'/'1' 등 문자열·boolean 을 3상태로 해석. 미지정(신호 없음)은 undefined. */
const toTriState = (v: unknown): boolean | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (s === '') return undefined;
  if (s === 'y' || s === 'yes' || s === 'true' || s === '1') return true;
  if (s === 'n' || s === 'no' || s === 'false' || s === '0') return false;
  return undefined; // 해석 불가 신호는 없는 것으로 본다(추측 금지)
};

export interface StockRiskInput {
  stock: unknown;
  safetyStock?: unknown;
  /** 판매상태 품절 표시. 신호가 없으면 생략(추측하지 않는다). */
  soldOut?: unknown;
  /** 재고관리 사용 여부. false = 무제한 재고. 신호가 없으면 생략. */
  stockEnabled?: unknown;
}

/**
 * 재고 위험 단계 판정 — **판매상태 포함 정본**.
 *
 * 우선순위(이 순서를 다른 곳에 복제하지 않는다):
 *   1. soldOut === true            → out_of_stock  (재고 숫자 무관)
 *   2. stockEnabled === false      → ok            (무제한 재고 — 숫자 0 이어도 품절 아님)
 *   3. 그 외(신호 없음 포함)        → classifyStockRisk(stock, safetyStock)
 *
 * 신호가 전혀 없는 입력(CSV/JSON 업로드 등)은 3번으로 떨어져 **기존 계약과 완전히 동일**하다.
 * 재고가 비수치·누락이면 3번이 unknown 을 돌려준다 — 정상으로 숨기지 않는다.
 */
export function classifyStockRiskWithSaleState(input: StockRiskInput): StockRiskResult {
  const { value: resolvedSafetyStock, source: safetyStockSource } = resolveSafetyStock(input.safetyStock);
  const stock = toFiniteNumber(input.stock);
  const soldOut = toTriState(input.soldOut);
  const stockEnabled = toTriState(input.stockEnabled);

  if (soldOut === true) {
    return { level: 'out_of_stock', stock, resolvedSafetyStock, safetyStockSource, basis: 'sold_out_flag' };
  }
  if (stockEnabled === false) {
    return { level: 'ok', stock, resolvedSafetyStock, safetyStockSource, basis: 'unlimited_stock' };
  }
  return classifyStockRisk(input.stock, input.safetyStock);
}

/**
 * 재고 아이템 목록 → 상태별 집계. risky=out+low, attention=risky+unknown.
 * `soldOut`·`stockEnabled` 를 함께 주면 판매상태까지 반영한다(생략 시 기존 동작 그대로).
 */
export function summarizeStockRisk(items: StockRiskInput[]): StockRiskSummary {
  let outOfStock = 0, lowStock = 0, ok = 0, unknown = 0;
  for (const it of items) {
    const { level } = classifyStockRiskWithSaleState(it);
    if (level === 'out_of_stock') outOfStock += 1;
    else if (level === 'low_stock') lowStock += 1;
    else if (level === 'ok') ok += 1;
    else unknown += 1;
  }
  const risky = outOfStock + lowStock;
  return { outOfStock, lowStock, ok, unknown, risky, attention: risky + unknown };
}
