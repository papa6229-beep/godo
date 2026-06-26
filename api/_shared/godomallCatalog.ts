// 고도몰5 카탈로그 분류축(카테고리/브랜드) 매퍼 + 정규화 (Catalog Taxonomy READ v0)
//
// 출처: docs/godomall5_openAPI_spec_v1.0_20250616 §3.2(Category_Search), §3.3(Brand_Search)
//   - Category_Search Request: cateCd(선택). Response: cateCd/cateNm/cateDisplayFl/cateDisplayMobileFl.
//   - Brand_Search: PDF 텍스트 추출이 §3.2와 레이아웃 bleed되어 필드 불확실(brandCd/brandNm 추정) →
//     실제 응답을 기준으로 확정한다. 그래서 normalize는 "정확 필드 + 일반 접미사 fallback"으로 견고하게 한다.
//
// 보안: 정규화만 담당(raw XML/키 미반환). 카탈로그는 PII none.

import { asArray, toStringValue } from './godomallOrderNormalize.js';

const toBoolYn = (v: unknown): boolean => {
  const s = toStringValue(v).toLowerCase();
  return s === 'y' || s === '1' || s === 'true';
};

// 정확 키 → 후보 키 → 접미사(대소문자 무시) 순으로 첫 비빈 문자열 반환.
const pick = (rec: Record<string, unknown>, exact: string, candidates: string[], suffixes: string[]): string => {
  if (toStringValue(rec[exact])) return toStringValue(rec[exact]);
  for (const c of candidates) {
    if (toStringValue(rec[c])) return toStringValue(rec[c]);
  }
  const keys = Object.keys(rec);
  for (const suf of suffixes) {
    const hit = keys.find((k) => k.toLowerCase().endsWith(suf.toLowerCase()) && toStringValue(rec[k]));
    if (hit) return toStringValue(rec[hit]);
  }
  return '';
};

const asRecords = (raw: unknown): Record<string, unknown>[] =>
  asArray<unknown>(raw).filter(
    (v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  );

// ── 카테고리 ─────────────────────────────────────────────────────────────────
export type GodomallCategory = {
  cateCd: string;
  cateNm?: string;
  displayPc?: boolean; // cateDisplayFl
  displayMobile?: boolean; // cateDisplayMobileFl
  raw?: Record<string, unknown>;
};

export const CATEGORY_LIST_KEYS = ['category_data', 'categoryData', 'cate_data', 'category', 'cate', 'item', 'list', 'row', 'data'];

export function normalizeCategories(raw: unknown): GodomallCategory[] {
  const out: GodomallCategory[] = [];
  for (const rec of asRecords(raw)) {
    const cateCd = pick(rec, 'cateCd', ['cateCode', 'code'], ['cateCd', 'No', 'Cd']);
    const cateNm = pick(rec, 'cateNm', ['cateName', 'name'], ['cateNm', 'Nm', 'Name']);
    if (!cateCd && !cateNm) continue; // 빈 응답/래퍼 guard
    const node: GodomallCategory = { cateCd };
    if (cateNm) node.cateNm = cateNm;
    if (toStringValue(rec['cateDisplayFl'])) node.displayPc = toBoolYn(rec['cateDisplayFl']);
    if (toStringValue(rec['cateDisplayMobileFl'])) node.displayMobile = toBoolYn(rec['cateDisplayMobileFl']);
    out.push(node);
  }
  return out;
}

// ── 브랜드 ───────────────────────────────────────────────────────────────────
export type GodomallBrand = {
  brandCd: string;
  brandNm?: string;
  raw?: Record<string, unknown>;
};

export const BRAND_LIST_KEYS = ['brand_data', 'brandData', 'brand', 'maker_data', 'maker', 'item', 'list', 'row', 'data'];

export function normalizeBrands(raw: unknown): GodomallBrand[] {
  const out: GodomallBrand[] = [];
  for (const rec of asRecords(raw)) {
    // 브랜드 코드: brandCd 우선, 없으면 일반 *Cd/*No (Category 필드명이 섞여도 견고)
    const brandCd = pick(rec, 'brandCd', ['brandCode', 'makerCd', 'code', 'cateCd'], ['brandCd', 'Cd', 'No']);
    const brandNm = pick(rec, 'brandNm', ['brandName', 'makerNm', 'name', 'cateNm'], ['brandNm', 'Nm', 'Name']);
    if (!brandCd && !brandNm) continue; // 빈 응답/래퍼 guard
    const node: GodomallBrand = { brandCd };
    if (brandNm) node.brandNm = brandNm;
    out.push(node);
  }
  return out;
}

export type CatalogKind = 'category' | 'brand';
export type GodomallCatalogResult = {
  kind: CatalogKind;
  total: number;
  items: GodomallCategory[] | GodomallBrand[];
  source: 'real' | 'mock';
};

// mock fallback (라이브 미설정/실패 시, 반드시 source:'mock'으로 표시) — 구조 데모용 최소 샘플.
export function getMockCategories(): GodomallCategory[] {
  return [{ cateCd: 'SYN-CATE-01', cateNm: '(mock) 테스트 카테고리', displayPc: true, displayMobile: true }];
}
export function getMockBrands(): GodomallBrand[] {
  return [{ brandCd: 'SYN-BRAND-01', brandNm: '(mock) 테스트 브랜드' }];
}
