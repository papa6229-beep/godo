// 카탈로그(카테고리/브랜드) taxonomy ↔ 상품/매출 바인딩 (Catalog Taxonomy Binding v0)
//
// 목적: category_search/brand_search 결과(GodomallCategory/GodomallBrand)를 lookup으로 만들어
//   상품(StandardProduct)·매출 라인(RevenueOrderLine)의 코드(cateCd/brandCd)를 사람이 읽는 라벨로
//   해석한다. 라벨이 없으면 코드를 유지하고 unresolved/missing을 명확히 표시한다.
//
// 원칙: 기존 타입/응답을 바꾸지 않는다. summarizeRevenue/RevenueOrder를 변경하지 않고, 별도
//   derived helper로만 분해를 제공한다(필요 시 호출). 순수 함수(부수효과 없음).

import type { GodomallCategory, GodomallBrand } from './godomallCatalog.js';
import type { RevenueOrder } from './godomallRevenue.js';
import type { StandardProduct } from './godomallMapper.js';

export type GodomallCatalogLookup = {
  categoriesByCode: Record<string, GodomallCategory>;
  brandsByCode: Record<string, GodomallBrand>;
};

export type CatalogLabelResolution = {
  code?: string;
  label?: string;
  resolved: boolean;
  source: 'category_search' | 'brand_search' | 'fallback' | 'missing';
};

export type ProductCatalogLabels = {
  category?: CatalogLabelResolution;
  brand?: CatalogLabelResolution;
};

// 코드 없음/placeholder 판정 (mapLine이 채우는 'uncategorized'/'unknown_product'도 코드 없음으로 본다)
const isEmptyCode = (c: unknown): boolean => {
  if (c === undefined || c === null) return true;
  const s = String(c).trim();
  return s === '' || s === 'uncategorized' || s === 'unknown_product';
};

export function buildCatalogLookup(
  categories: GodomallCategory[],
  brands: GodomallBrand[]
): GodomallCatalogLookup {
  const categoriesByCode: Record<string, GodomallCategory> = {};
  for (const c of categories || []) {
    if (c && c.cateCd) categoriesByCode[String(c.cateCd).trim()] = c;
  }
  const brandsByCode: Record<string, GodomallBrand> = {};
  for (const b of brands || []) {
    if (b && b.brandCd) brandsByCode[String(b.brandCd).trim()] = b;
  }
  return { categoriesByCode, brandsByCode };
}

export function resolveCategoryLabel(code: unknown, lookup: GodomallCatalogLookup): CatalogLabelResolution {
  if (isEmptyCode(code)) return { resolved: false, source: 'missing' };
  const c = String(code).trim();
  const hit = lookup.categoriesByCode[c];
  if (hit && hit.cateNm) return { code: c, label: hit.cateNm, resolved: true, source: 'category_search' };
  return { code: c, label: c, resolved: false, source: 'fallback' }; // taxonomy에 없음 → 코드 유지
}

export function resolveBrandLabel(code: unknown, lookup: GodomallCatalogLookup): CatalogLabelResolution {
  if (isEmptyCode(code)) return { resolved: false, source: 'missing' };
  const c = String(code).trim();
  const hit = lookup.brandsByCode[c];
  if (hit && hit.brandNm) return { code: c, label: hit.brandNm, resolved: true, source: 'brand_search' };
  return { code: c, label: c, resolved: false, source: 'fallback' };
}

// 대표 카테고리 코드: categoryCode 우선, 없으면 allCategoryCode의 "마지막 depth" 토큰.
export function pickPrimaryCategoryCode(categoryCode?: unknown, allCategoryCode?: unknown): string | undefined {
  if (!isEmptyCode(categoryCode)) return String(categoryCode).trim();
  if (!isEmptyCode(allCategoryCode)) {
    const parts = String(allCategoryCode)
      .split(/[\^|>/,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return undefined;
}

// 상품 1건에 category/brand 라벨 부착(원본 product 미변경, 라벨 객체만 반환).
export function attachProductCatalogLabels(product: StandardProduct, lookup: GodomallCatalogLookup): ProductCatalogLabels {
  const catCode = pickPrimaryCategoryCode(product.categoryCode, product.allCategoryCode);
  return {
    category: resolveCategoryLabel(catCode, lookup),
    brand: resolveBrandLabel(product.brandCode, lookup)
  };
}

// productId(goodsNo) → brandCd 맵 (브랜드 매출 분해용 — RevenueOrderLine은 brand 미보유이므로 상품에서 역참조)
export function buildBrandByProductId(products: StandardProduct[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of products || []) {
    if (p && p.productId && p.brandCode && !isEmptyCode(p.brandCode)) map[String(p.productId).trim()] = String(p.brandCode).trim();
  }
  return map;
}

// ── 매출 카탈로그 분해 (별도 derived — summarizeRevenue 미변경) ───────────────
export type CatalogBreakdownItem = {
  code: string;
  label: string;
  resolved: boolean;
  revenue: number;
  orderCount: number;
  lineCount: number;
  units: number;
};
export type RevenueCatalogBreakdown = {
  byCategory: CatalogBreakdownItem[];
  byBrand: CatalogBreakdownItem[];
  unresolved: { categoryCodes: string[]; brandCodes: string[] };
};

type Acc = { code: string; label: string; resolved: boolean; revenue: number; orders: Set<string>; lineCount: number; units: number };
const finalize = (m: Map<string, Acc>): CatalogBreakdownItem[] =>
  [...m.values()]
    .map((a) => ({ code: a.code, label: a.label, resolved: a.resolved, revenue: a.revenue, orderCount: a.orders.size, lineCount: a.lineCount, units: a.units }))
    .sort((x, y) => y.revenue - x.revenue);

export function deriveRevenueCatalogBreakdown(
  orders: RevenueOrder[],
  lookup: GodomallCatalogLookup,
  brandByProductId: Record<string, string> = {}
): RevenueCatalogBreakdown {
  const catMap = new Map<string, Acc>();
  const brandMap = new Map<string, Acc>();
  const unresolvedCat = new Set<string>();
  const unresolvedBrand = new Set<string>();

  for (const o of orders || []) {
    for (const line of o.lines || []) {
      const rev = line.lineRevenue || 0;
      const qty = line.quantity || 0;
      // 카테고리
      const catCode = pickPrimaryCategoryCode(line.categoryCode, line.allCategoryCode);
      if (catCode) {
        const r = resolveCategoryLabel(catCode, lookup);
        const acc = catMap.get(catCode) || { code: catCode, label: r.label || catCode, resolved: r.resolved, revenue: 0, orders: new Set(), lineCount: 0, units: 0 };
        acc.revenue += rev;
        acc.units += qty;
        acc.lineCount += 1;
        acc.orders.add(o.orderNo);
        catMap.set(catCode, acc);
        if (!r.resolved) unresolvedCat.add(catCode);
      }
      // 브랜드 (라인에 brand 없음 → productId로 역참조)
      const bCode = brandByProductId[String(line.goodsNo).trim()];
      if (bCode && !isEmptyCode(bCode)) {
        const r = resolveBrandLabel(bCode, lookup);
        const acc = brandMap.get(bCode) || { code: bCode, label: r.label || bCode, resolved: r.resolved, revenue: 0, orders: new Set(), lineCount: 0, units: 0 };
        acc.revenue += rev;
        acc.units += qty;
        acc.lineCount += 1;
        acc.orders.add(o.orderNo);
        brandMap.set(bCode, acc);
        if (!r.resolved) unresolvedBrand.add(bCode);
      }
    }
  }
  return {
    byCategory: finalize(catMap),
    byBrand: finalize(brandMap),
    unresolved: { categoryCodes: [...unresolvedCat], brandCodes: [...unresolvedBrand] }
  };
}

// ── 카탈로그 taxonomy facts (상품 기준 해석률) ───────────────────────────────
export type CatalogTaxonomyFacts = {
  categoryCount: number;
  brandCount: number;
  productCategoryResolutionRate: number; // 0..1
  productBrandResolutionRate: number; // 0..1 (상품에 brandCode 있는 경우 한정)
  unresolvedCategoryCodes: string[];
  unresolvedBrandCodes: string[];
};

export function deriveCatalogTaxonomyFacts(products: StandardProduct[], lookup: GodomallCatalogLookup): CatalogTaxonomyFacts {
  const categoryCount = Object.keys(lookup.categoriesByCode).length;
  const brandCount = Object.keys(lookup.brandsByCode).length;
  let catTotal = 0;
  let catResolved = 0;
  let brandTotal = 0;
  let brandResolved = 0;
  const unresolvedCat = new Set<string>();
  const unresolvedBrand = new Set<string>();

  for (const p of products || []) {
    const catCode = pickPrimaryCategoryCode(p.categoryCode, p.allCategoryCode);
    if (catCode) {
      catTotal += 1;
      const r = resolveCategoryLabel(catCode, lookup);
      if (r.resolved) catResolved += 1;
      else unresolvedCat.add(catCode);
    }
    if (!isEmptyCode(p.brandCode)) {
      brandTotal += 1;
      const r = resolveBrandLabel(p.brandCode, lookup);
      if (r.resolved) brandResolved += 1;
      else unresolvedBrand.add(String(p.brandCode).trim());
    }
  }
  return {
    categoryCount,
    brandCount,
    productCategoryResolutionRate: catTotal ? catResolved / catTotal : 0,
    productBrandResolutionRate: brandTotal ? brandResolved / brandTotal : 0,
    unresolvedCategoryCodes: [...unresolvedCat],
    unresolvedBrandCodes: [...unresolvedBrand]
  };
}
