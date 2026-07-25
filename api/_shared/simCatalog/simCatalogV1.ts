// ────────────────────────────────────────────────────────────────────────────
// SIMULATION-CATALOG-BASELINE-01 (GREEN A) — 시험용 상품 기준선 v1 로더
//
// sim-catalog-v1 을 **가상 운영자료 생성 전용 정본**으로 로드한다.
//   · 스키마·무결성 검증 후 **깊은 동결**로 반환(소비자가 변형해도 정본 불변).
//   · 검증 실패(ID 중복·필수 누락·타입 오류·음수 가격·미지 필드·integrity 불일치) → **fail-closed(throw)**.
//     mock 4개·실상품 API 로 **절대 대체하지 않는다**(오류 근거 보존).
//   · 데이터는 정적 TS 모듈(simCatalogV1.data.ts)에서 import — CWD/파일시스템 읽기에 의존하지 않아
//     Vercel 번들에 확실히 포함된다.
//   · 새 판매몰 상품/inventory 가 들어와도 v1 을 자동 변경·혼합·덮어쓰기하지 않는다(향후 v2+승인).
// ────────────────────────────────────────────────────────────────────────────

import type { StandardProduct } from '../godomallMapper.js';
import {
  SIM_CATALOG_V1_RECORDS,
  SIM_CATALOG_V1_MANIFEST,
  type SimCatalogRawRecord,
  type SimCatalogManifest
} from './simCatalogV1.data.js';

export const SIM_CATALOG_V1_ID = SIM_CATALOG_V1_MANIFEST.catalogId;

const REQUIRED_STRING = ['productId', 'productCode', 'productName', 'categoryCode', 'allCategoryCode',
  'brandCode', 'makerName', 'originName', 'optionName', 'registeredAt', 'modifiedAt'] as const;
const REQUIRED_NUMBER = ['price', 'fixedPrice'] as const;
const REQUIRED_BOOL = ['sellPc', 'sellMobile', 'displayPc', 'displayMobile', 'soldOut', 'stockEnabled'] as const;
const ALLOWED_FIELDS = new Set<string>(SIM_CATALOG_V1_MANIFEST.fields);

// FNV-1a 32bit — data.ts 생성기와 **동일** 알고리즘(필드 순서 고정 canonical JSON).
const fnv1a32 = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return 'fnv1a32:' + (h >>> 0).toString(16).padStart(8, '0');
};
const canonicalize = (records: readonly unknown[], fields: readonly string[]): string =>
  JSON.stringify(records.map((rec) => {
    const r = rec as Record<string, unknown>;
    const o: Record<string, unknown> = {};
    for (const k of fields) o[k] = r[k];
    return o;
  }));

export interface SimCatalogValidation {
  ok: boolean;
  errors: string[];
}

/**
 * 스키마·무결성 검증(순수 함수). 소비자·테스트가 임의 입력을 검사할 수 있게 records/manifest 를 받는다.
 * fail-closed 규칙: 배열 아님·건수 불일치·미지 필드·필수 타입 오류·음수 가격·빈/중복 productId·integrity 불일치.
 */
export function validateSimCatalog(records: readonly unknown[], manifest: SimCatalogManifest): SimCatalogValidation {
  const errors: string[] = [];
  if (!Array.isArray(records)) return { ok: false, errors: ['records is not an array'] };
  if (records.length !== manifest.recordCount) {
    errors.push(`recordCount mismatch: ${records.length} != ${manifest.recordCount}`);
  }
  const seen = new Set<string>();
  records.forEach((rec, i) => {
    if (!rec || typeof rec !== 'object') { errors.push(`[${i}] not an object`); return; }
    const r = rec as Record<string, unknown>;
    for (const k of Object.keys(r)) if (!ALLOWED_FIELDS.has(k)) errors.push(`[${i}] unknown field: ${k}`);
    for (const k of REQUIRED_STRING) if (typeof r[k] !== 'string') errors.push(`[${i}] ${k} must be string`);
    for (const k of REQUIRED_NUMBER) {
      const v = r[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`[${i}] ${k} must be a finite number`);
      else if (v < 0) errors.push(`[${i}] ${k} must be >= 0 (negative price)`);
    }
    for (const k of REQUIRED_BOOL) if (typeof r[k] !== 'boolean') errors.push(`[${i}] ${k} must be boolean`);
    const id = r.productId;
    if (typeof id === 'string') {
      if (id.trim() === '') errors.push(`[${i}] productId empty`);
      else if (seen.has(id)) errors.push(`[${i}] duplicate productId: ${id}`);
      else seen.add(id);
    }
    if (typeof r.productName === 'string' && r.productName.trim() === '') errors.push(`[${i}] productName empty`);
  });
  const got = fnv1a32(canonicalize(records, manifest.fields));
  if (got !== manifest.integrity) errors.push(`integrity mismatch: ${got} != ${manifest.integrity}`);
  return { ok: errors.length === 0, errors };
}

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};

// StandardProduct 정규화. 실재고는 미포함(정책) → stock 0.
//   시뮬레이션은 실재고를 쓰지 않는다(가상 재고는 productId 해시로 별도 산출).
const toStandardProduct = (r: SimCatalogRawRecord): StandardProduct => ({
  productId: r.productId,
  productCode: r.productCode,
  productName: r.productName,
  price: r.price,
  fixedPrice: r.fixedPrice,
  stock: 0,
  stockEnabled: r.stockEnabled,
  soldOut: r.soldOut,
  displayPc: r.displayPc,
  displayMobile: r.displayMobile,
  sellPc: r.sellPc,
  sellMobile: r.sellMobile,
  categoryCode: r.categoryCode,
  allCategoryCode: r.allCategoryCode,
  brandCode: r.brandCode,
  registeredAt: r.registeredAt,
  modifiedAt: r.modifiedAt,
  makerName: r.makerName,
  originName: r.originName,
  optionName: r.optionName
});

let cached: readonly StandardProduct[] | null = null;

/**
 * 시험용 상품 기준선 v1 로드(가상 운영자료 생성 전용).
 *   검증 통과 → **깊은 동결**된 StandardProduct[] 반환(반복 호출 동일 참조·불변).
 *   검증 실패 → throw(fail-closed). mock/실상품으로 대체하지 않는다.
 * 소비자는 정본을 변형할 수 없다(frozen). 생성기에 넘길 땐 호출부에서 [...v] 사본을 쓴다.
 */
export function loadSimCatalogV1(): readonly StandardProduct[] {
  if (cached) return cached;
  const v = validateSimCatalog(SIM_CATALOG_V1_RECORDS, SIM_CATALOG_V1_MANIFEST);
  if (!v.ok) throw new Error(`sim-catalog-v1 invalid (fail-closed): ${v.errors.join('; ')}`);
  cached = deepFreeze(SIM_CATALOG_V1_RECORDS.map(toStandardProduct)) as readonly StandardProduct[];
  return cached;
}

export const getSimCatalogManifest = (): SimCatalogManifest => SIM_CATALOG_V1_MANIFEST;
