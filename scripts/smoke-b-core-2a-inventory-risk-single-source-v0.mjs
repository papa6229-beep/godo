#!/usr/bin/env node
/*
 * scripts/smoke-b-core-2a-inventory-risk-single-source-v0.mjs
 * B-core-2a — **재고위험 판정 단일화** 검사.
 *
 * 목적: 같은 상품의 재고위험 여부가 A 세계와 B 세계에서 다르게 나오지 않는다.
 *       판정 정본은 `src/services/inventoryRiskContract.ts` 하나다.
 *
 * fixture 는 B-core-2 공통 fixture(`scripts/fixtures/b-core-2-ab-fixture.mjs`)를 재사용한다.
 * 새 fixture 를 복제하지 않는다.
 *
 * 이 검사는 RED → GREEN 으로 커밋을 나눠 증거를 남긴다.
 *   RED  (구현 전): 아래 [2]·[3]·[4] 가 실패한다.
 *   GREEN(구현 후): 전부 통과한다.
 */
import { readFileSync } from 'node:fs';
import { loadProductModules, projectA, projectB } from './fixtures/b-core-2-modules.mjs';
import { RAW_ORDERS, RAW_GOODS } from './fixtures/b-core-2-ab-fixture.mjs';

let pass = 0, fail = 0;
const ok = (n, c, extra) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${extra ? `  ${extra}` : ''}`); c ? pass++ : fail++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const is = (n, actual, expected) => ok(n, eq(actual, expected), eq(actual, expected) ? '' : `기대=${JSON.stringify(expected)} 실제=${JSON.stringify(actual)}`);
const read = (p) => readFileSync(p, 'utf8');

console.log('=== B-core-2a 재고위험 판정 단일화 smoke ===');

const { mods, dispose } = await loadProductModules();
try {
  const IR = mods.inventoryRisk;
  const RAW = mods.orderNormalize.normalizeOrderData(RAW_ORDERS);
  const A = projectA(mods, RAW, RAW_GOODS);
  const B = projectB(mods, RAW, RAW_GOODS);

  // ── 1. 기존 계약 하위호환 (깨지면 안 됨) ──────────────────────────────────
  console.log('\n[1] 기존 계약 하위호환');
  is('1-1. DEFAULT_SAFETY_STOCK 정본 = 5', IR.DEFAULT_SAFETY_STOCK, 5);
  is('1-2. classifyStockRisk(10, 5) = ok', IR.classifyStockRisk(10, 5).level, 'ok');
  is('1-3. classifyStockRisk(5, 5) = low_stock (경계 포함)', IR.classifyStockRisk(5, 5).level, 'low_stock');
  is('1-4. classifyStockRisk(0, 5) = out_of_stock', IR.classifyStockRisk(0, 5).level, 'out_of_stock');
  is('1-5. classifyStockRisk("abc", 5) = unknown', IR.classifyStockRisk('abc', 5).level, 'unknown');
  is('1-6. safetyStock 누락 → 전역 기본값 5', IR.classifyStockRisk(4).resolvedSafetyStock, 5);
  is('1-7. safetyStock 0 은 유효값', IR.classifyStockRisk(0, 0).level, 'out_of_stock');
  is('1-8. summarizeStockRisk 기존 시그니처 유지',
    IR.summarizeStockRisk([{ stock: 0 }, { stock: 3 }, { stock: 99 }, { stock: null }]),
    { outOfStock: 1, lowStock: 1, ok: 1, unknown: 1, risky: 2, attention: 3 });

  // ── 2. 판매상태를 반영하는 단일 판정 함수 ─────────────────────────────────
  console.log('\n[2] 판매상태(soldOut·stockEnabled)를 반영하는 단일 판정');
  ok('2-0. classifyStockRiskWithSaleState 존재', typeof IR.classifyStockRiskWithSaleState === 'function');
  const C = IR.classifyStockRiskWithSaleState ?? (() => ({ level: '(미구현)', basis: '(미구현)' }));
  is('2-1. soldOut=true 는 재고 숫자와 무관하게 품절', C({ stock: 100, soldOut: true }).level, 'out_of_stock');
  is('2-2. soldOut=true 의 판정 근거는 판매상태', C({ stock: 100, soldOut: true }).basis, 'sold_out_flag');
  is('2-3. stockEnabled=false 는 재고 0 이어도 정상(무제한)', C({ stock: 0, stockEnabled: false }).level, 'ok');
  is('2-4. stockEnabled=false 의 판정 근거는 무제한 재고', C({ stock: 0, stockEnabled: false }).basis, 'unlimited_stock');
  is('2-5. soldOut 이 stockEnabled=false 보다 우선', C({ stock: 0, soldOut: true, stockEnabled: false }).level, 'out_of_stock');
  is('2-6. 신호 없음(CSV/JSON) → 기존 재고 숫자 계약 그대로', C({ stock: 4 }).level, IR.classifyStockRisk(4).level);
  is('2-7. 신호 없음 판정 근거는 재고 숫자', C({ stock: 4 }).basis, 'stock_number');
  is('2-8. 문자열 신호도 해석("y"/"n")', [C({ stock: 100, soldOut: 'y' }).level, C({ stock: 0, stockEnabled: 'n' }).level], ['out_of_stock', 'ok']);
  is('2-9. 비수치 재고 + 신호 없음 → unknown(정상으로 숨기지 않음)', C({ stock: 'abc' }).level, 'unknown');
  is('2-10. stockEnabled=true + 비수치 재고 → unknown', C({ stock: undefined, stockEnabled: true }).level, 'unknown');

  // ── 3. A 세계가 계약 결과를 그대로 쓴다 ───────────────────────────────────
  console.log('\n[3] A 세계(StandardInventoryItem)가 계약 결과를 그대로 반영');
  const byCase = Object.fromEntries(RAW_GOODS.map((g, i) => [g.__case, A.inventory[i]]));
  is('3-1. P1 정상재고 → ok', byCase['P1 정상재고'].status, 'ok');
  is('3-2. P2 재고3(안전재고 5 이하) → warning', byCase['P2 안전재고 경계(3)'].status, 'warning');
  is('3-3. P3 재고4 → warning (정본 안전재고 5 기준)', byCase['P3 안전재고 경계(4)'].status, 'warning');
  is('3-4. P4 재고0 → danger', byCase['P4 품절(재고0)'].status, 'danger');
  is('3-5. P5 품절표시 → danger', byCase['P5 품절표시'].status, 'danger');
  is('3-6. P6 무제한재고(재고0) → ok', byCase['P6 무제한재고'].status, 'ok');
  is('3-7. P5 riskFlags 에 sold_out 보존', byCase['P5 품절표시'].riskFlags.includes('sold_out'), true);
  is('3-8. P4 riskFlags 에 out_of_stock 보존', byCase['P4 품절(재고0)'].riskFlags.includes('out_of_stock'), true);
  is('3-9. P3 riskFlags 에 low_stock·below_safety_stock 보존',
    ['low_stock', 'below_safety_stock'].every((f) => byCase['P3 안전재고 경계(4)'].riskFlags.includes(f)), true);
  is('3-10. P6 riskFlags 비어 있음', byCase['P6 무제한재고'].riskFlags, []);

  // 비수치 재고는 정상으로 숨기지 않는다 — CSV/JSON 업로드 경로 직접 투입
  const nanSnap = mods.dataNormalizer.buildOperationsSnapshot(
    'inventory',
    [{ productName: '해석불가 재고', optionName: '단품', stock: '알수없음', safetyStock: '5' }],
    { id: 't', sourceType: 'csv', importedAt: '', orders: [], inquiries: [], reviews: [], inventory: [], sales: [] }
  );
  is('3-11. 비수치 재고 → status unknown', nanSnap.inventory[0].status, 'unknown');
  is('3-12. 비수치 재고 → riskFlags 에 stock_unknown', nanSnap.inventory[0].riskFlags.includes('stock_unknown'), true);

  // ── 4. A/B parity ─────────────────────────────────────────────────────────
  console.log('\n[4] A/B 재고위험 parity');
  const toRisky = (lv) => lv === 'out_of_stock' || lv === 'low_stock';
  const aRisky = A.inventory.map((i) => i.status !== 'ok');
  const bRisky = B.products.map((p) => toRisky(C({ stock: p.stock, soldOut: p.soldOut, stockEnabled: p.stockEnabled }).level));
  ok('4-1. 상품별 위험 여부 일치', eq(aRisky, bRisky), eq(aRisky, bRisky) ? '' : `A=${JSON.stringify(aRisky)} B=${JSON.stringify(bRisky)}`);
  ok('4-2. 재고위험 건수 일치', aRisky.filter(Boolean).length === bRisky.filter(Boolean).length,
    `A=${aRisky.filter(Boolean).length} B=${bRisky.filter(Boolean).length}`);
  is('4-3. 관측된 위험 상품(사건 라벨)',
    RAW_GOODS.filter((_, i) => aRisky[i]).map((g) => g.__case),
    ['P2 안전재고 경계(3)', 'P3 안전재고 경계(4)', 'P4 품절(재고0)', 'P5 품절표시']);

  // ── 5. 우회·중복 정의가 남지 않음 ─────────────────────────────────────────
  console.log('\n[5] 중복 정의·직접 임계 비교 부재');
  ok('5-1. api 계층에 자체 기본 안전재고 상수 없음',
    mods.inventoryDerive.DEFAULT_SAFETY_STOCK === undefined,
    mods.inventoryDerive.DEFAULT_SAFETY_STOCK === undefined ? '' : `남아있음: ${mods.inventoryDerive.DEFAULT_SAFETY_STOCK}`);
  ok('5-2. api 계층에 자체 재고 판정 함수 없음', typeof mods.inventoryDerive.computeInventoryStatus !== 'function');
  const derived = mods.inventoryDerive.deriveInventoryFromProducts(mods.mapper.mapGoodsToProducts(RAW_GOODS));
  ok('5-3. api 파생 재고는 근거 없는 안전재고를 만들어내지 않음',
    derived.every((d) => d.safetyStock === ''), `첫 항목 safetyStock=${JSON.stringify(derived[0]?.safetyStock)}`);
  ok('5-4. api 파생 재고는 판매상태 신호를 그대로 싣는다',
    derived.every((d) => 'stockEnabled' in d && 'soldOut' in d));

  const DN = read('src/utils/dataNormalizer.ts');
  const AE = read('src/engine/nativeAgentRuntime/agentExecutor.ts');
  // 확인 범위: 이 두 파일 본문의 재고 임계 직접 비교.
  //   `stock <= safetyStock` · `item.stock <= item.safetyStock` · `stock <= 0` 형태를 모두 잡는다.
  const directCompare = /\bstock\s*[<>]=?\s*(?:\w+\.)*(safetyStock|0)\b/i;
  ok('5-5. dataNormalizer 에 재고 임계 직접 비교 없음', !directCompare.test(DN),
    (DN.match(directCompare) || [''])[0]);
  ok('5-6. agentExecutor 에 재고 임계 직접 비교 없음', !directCompare.test(AE),
    (AE.match(directCompare) || [''])[0]);
  ok('5-7. dataNormalizer 가 계약을 import 한다', /inventoryRiskContract/.test(DN));
  ok('5-8. agentExecutor 가 계약을 import 한다', /inventoryRiskContract/.test(AE));
  ok('5-9. agentExecutor 가 unknown 을 발주 대상으로 취급하지 않는다',
    /unknown/.test(AE) && /classifyStockRisk/.test(AE));

  // ── 6. Local migration 6 — 미사용 고도몰 상품 매퍼 제거 ────────────────────
  //   호출자 0건이던 legacy 중간구조 매퍼가 근거 없는 safetyStock 기본값 '5' 를
  //   만들어 내고 있었다. 활성 경로(mapGoodsToProducts → deriveInventoryFromProducts)는
  //   그대로 두고 死코드만 없앤다.
  console.log('\n[6] 미사용 고도몰 상품 매퍼 제거');
  // 삭제 사유는 주석으로 보존한다(헌법 §6) — 판정은 **코드 줄만** 본다.
  //   재도입(선언·호출)은 코드 줄에 나타나므로 이 방식으로도 잡힌다.
  const MAPPER_RAW = read('api/_shared/godomallMapper.ts');
  const MAPPER = MAPPER_RAW.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const LEGACY_NAMES = ['ProductIntermediate', 'InventoryIntermediate', 'mapGoodsList', 'mapGoodsToInventory'];
  const leftInSource = LEGACY_NAMES.filter((n) => new RegExp(`\\b${n}\\b`).test(MAPPER));
  ok('6-1. 제품 매퍼에 legacy 중간구조 4종이 남아 있지 않다',
    leftInSource.length === 0, leftInSource.length ? `잔존: ${leftInSource.join(', ')}` : '');
  const leftExported = LEGACY_NAMES.filter((n) => mods.mapper[n] !== undefined);
  ok('6-2. legacy 매퍼가 런타임 export 로도 남아 있지 않다',
    leftExported.length === 0, leftExported.length ? `잔존 export: ${leftExported.join(', ')}` : '');
  ok('6-3. 활성 상품 매퍼는 유지된다(mapGoodsToProducts)',
    typeof mods.mapper.mapGoodsToProducts === 'function' && /export const mapGoodsToProducts/.test(MAPPER));
  ok('6-4. 활성 경로 mapGoodsToProducts → deriveInventoryFromProducts 가 동작한다',
    (() => {
      const items = mods.inventoryDerive.deriveInventoryFromProducts(mods.mapper.mapGoodsToProducts(RAW_GOODS));
      return items.length === RAW_GOODS.length && items.every((i) => 'stock' in i && 'safetyStock' in i);
    })());
  ok('6-5. 실제 상품 매퍼가 safetyStock:\'5\' 를 만들어내지 않는다',
    mods.mapper.mapGoodsToProducts(RAW_GOODS).every((p) => p.safetyStock === undefined)
    && !/'safetyStock', 'minStock', 'soldOutLimit'\], '5'/.test(MAPPER)
    && !/safetyStock:\s*'5'/.test(MAPPER));
} finally {
  dispose();
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
