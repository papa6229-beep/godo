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

// 공통 기본 안전재고 — 단일 상수(여러 파일에 숫자 복사 금지).
export const DEFAULT_SAFETY_STOCK = 5;

export interface StockRiskResult {
  level: StockRiskLevel;
  stock: number | null;               // 해석 불가면 null
  resolvedSafetyStock: number;
  safetyStockSource: SafetyStockSource;
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

/** 재고 위험 단계 판정. 근거(level·stock·resolvedSafetyStock·safetyStockSource) 포함. */
export function classifyStockRisk(stockRaw: unknown, safetyStockRaw?: unknown): StockRiskResult {
  const { value: resolvedSafetyStock, source: safetyStockSource } = resolveSafetyStock(safetyStockRaw);
  const stock = toFiniteNumber(stockRaw);
  if (stock === null) {
    return { level: 'unknown', stock: null, resolvedSafetyStock, safetyStockSource };
  }
  const level: StockRiskLevel = stock <= 0 ? 'out_of_stock' : stock <= resolvedSafetyStock ? 'low_stock' : 'ok';
  return { level, stock, resolvedSafetyStock, safetyStockSource };
}

/** 재고 아이템 목록 → 상태별 집계. risky=out+low, attention=risky+unknown. */
export function summarizeStockRisk(items: { stock: unknown; safetyStock?: unknown }[]): StockRiskSummary {
  let outOfStock = 0, lowStock = 0, ok = 0, unknown = 0;
  for (const it of items) {
    const { level } = classifyStockRisk(it.stock, it.safetyStock);
    if (level === 'out_of_stock') outOfStock += 1;
    else if (level === 'low_stock') lowStock += 1;
    else if (level === 'ok') ok += 1;
    else unknown += 1;
  }
  const risky = outOfStock + lowStock;
  return { outOfStock, lowStock, ok, unknown, risky, attention: risky + unknown };
}
