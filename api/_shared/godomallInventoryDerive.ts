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
//
// ── B-core-2a: 이 계층은 재고위험을 **판정하지 않는다** ──────────────────────
// 이전에는 여기서 자체 기본 안전재고(3)를 만들어 싣고 status 까지 계산했다. 두 문제가 있었다.
//   1) Goods_Search 응답에는 상품별 안전재고 필드가 없다(아래 주석대로). 근거 없는 '3' 을 실으면
//      하류 계약(resolveSafetyStock)이 그것을 **유효한 상품별 값**으로 받아들여
//      정본 기본값(inventoryRiskContract.DEFAULT_SAFETY_STOCK)이 적용될 여지를 없앤다.
//   2) status 는 어느 소비자도 읽지 않는 dead output 이었다(normalizeInventoryItem 은 재계산).
//      그런데 판정 규칙만 한 벌 더 존재해 같은 상품이 화면마다 다르게 보이는 원인이 됐다.
// 그래서 이 계층은 **신호만 전달**한다: stock · stockEnabled · soldOut.
// 판정은 src/services/inventoryRiskContract.ts 한 곳에서만 한다.
// (api 번들이 브라우저 계층을 import 하지 않도록, 계약을 끌어오는 대신 판정을 걷어냈다.)

import type { StandardProduct } from './godomallMapper.js';

// 재고 스냅샷 중간 구조 (문자열 값 — mock inventory 구조와 호환)
export type DerivedInventoryItem = {
  productId: string;
  productCode: string;
  productName: string;
  optionName: string;
  stock: string;
  /** 상류에 근거가 없으면 빈 문자열. 기본값을 만들어내지 않는다(계약이 전역 기본값을 적용). */
  safetyStock: string;
  stockEnabled: string;   // 'y' | 'n'
  soldOut: string;        // 'y' | 'n'
  displayPc: string;      // 'y' | 'n'
  displayMobile: string;  // 'y' | 'n'
  sellPc: string;         // 'y' | 'n'
  sellMobile: string;     // 'y' | 'n'
};

const yn = (b: boolean): string => (b ? 'y' : 'n');

// StandardProduct[] -> DerivedInventoryItem[] (재고 파생)
export const deriveInventoryFromProducts = (
  products: StandardProduct[],
  /** 상류(고도몰 설정 등)에서 상품별 안전재고를 알게 되면 그때 넘긴다. 기본은 "근거 없음". */
  safetyStock?: number
): DerivedInventoryItem[] => {
  const safety = safetyStock === undefined ? '' : String(safetyStock);
  return products.map((p) => ({
    productId: p.productId,
    productCode: p.productCode,
    productName: p.productName,
    optionName: p.optionName || '단품',
    stock: String(p.stock),
    safetyStock: safety,
    stockEnabled: yn(p.stockEnabled),
    soldOut: yn(p.soldOut),
    displayPc: yn(p.displayPc),
    displayMobile: yn(p.displayMobile),
    sellPc: yn(p.sellPc),
    sellMobile: yn(p.sellMobile)
  }));
};
