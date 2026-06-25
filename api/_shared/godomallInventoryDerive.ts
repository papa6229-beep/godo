// Inventory derived v0 — Products(REAL READ) 데이터에서 재고 스냅샷 파생
//
// 설계 의도: 고도몰의 별도 재고(Inventory) API를 새로 연결하지 않는다.
// Goods_Search.php로 받은 StandardProduct(확정 매핑) 안의 재고 관련 필드만 사용해
// 재고 스냅샷 중간 구조를 파생한다. 임의 endpoint·Write API는 만들지 않는다.
//
// 출력은 mockProxyData의 inventory 중간 구조(Record<string,string>)와 호환되도록
// 문자열 값으로 내보내며, 프론트 buildOperationsSnapshot/normalizeInventoryItem
// 파이프라인을 그대로 재사용한다. (DerivedInventoryItem은 type 별칭 →
// 서버 Record<string,unknown> 파이프라인 할당 호환)

import type { StandardProduct } from './godomallMapper.js';

// 안전재고 기본값 — Goods_Search 응답에는 상품별 안전재고 필드가 없으므로
// 단일 기준값을 사용한다. 하드코딩하되 추후 설정 가능하도록 상수로 분리한다.
export const DEFAULT_SAFETY_STOCK = 3;

export type InventoryStatus = 'ok' | 'warning' | 'danger';

// 재고 상태 계산 (단일 기준 — 프론트 normalizeInventoryItem과 동일 규칙)
//   soldOut === true                         -> danger
//   stockEnabled === true && stock <= 0       -> danger
//   stockEnabled === true && stock <= safety  -> warning
//   그 외                                      -> ok
// stockEnabled === false(무제한 재고)면 stock 값과 무관하게 품절로 보지 않는다.
export const computeInventoryStatus = (
  stock: number,
  stockEnabled: boolean,
  soldOut: boolean,
  safetyStock: number = DEFAULT_SAFETY_STOCK
): InventoryStatus => {
  if (soldOut) return 'danger';
  if (stockEnabled && stock <= 0) return 'danger';
  if (stockEnabled && stock <= safetyStock) return 'warning';
  return 'ok';
};

// 재고 스냅샷 중간 구조 (문자열 값 — mock inventory 구조와 호환)
export type DerivedInventoryItem = {
  productId: string;
  productCode: string;
  productName: string;
  optionName: string;
  stock: string;
  safetyStock: string;
  stockEnabled: string;   // 'y' | 'n'
  soldOut: string;        // 'y' | 'n'
  displayPc: string;      // 'y' | 'n'
  displayMobile: string;  // 'y' | 'n'
  sellPc: string;         // 'y' | 'n'
  sellMobile: string;     // 'y' | 'n'
  status: InventoryStatus;
};

const yn = (b: boolean): string => (b ? 'y' : 'n');

// StandardProduct[] -> DerivedInventoryItem[] (재고 파생)
export const deriveInventoryFromProducts = (
  products: StandardProduct[],
  safetyStock: number = DEFAULT_SAFETY_STOCK
): DerivedInventoryItem[] => {
  return products.map((p) => ({
    productId: p.productId,
    productCode: p.productCode,
    productName: p.productName,
    optionName: p.optionName || '단품',
    stock: String(p.stock),
    safetyStock: String(safetyStock),
    stockEnabled: yn(p.stockEnabled),
    soldOut: yn(p.soldOut),
    displayPc: yn(p.displayPc),
    displayMobile: yn(p.displayMobile),
    sellPc: yn(p.sellPc),
    sellMobile: yn(p.sellMobile),
    status: computeInventoryStatus(p.stock, p.stockEnabled, p.soldOut, safetyStock)
  }));
};
