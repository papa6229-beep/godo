#!/usr/bin/env node
/*
 * scripts/smoke-order-search-empty-guard.mjs
 *
 * Order_Search 0건 응답 가드(Empty Response Guard)의 동작 매트릭스 스모크.
 * 아래 로직은 api/_shared/godomallOrderNormalize.ts 의 isMeaningfulGodoOrderData /
 * normalizeOrderData 와 "동일"하다(Node 즉시 실행용 미러). 실제 모듈은 tsc로 타입검증되며,
 * 배포 audit route의 emptyGuard 요약으로 실데이터 검증된다.
 *
 * 실행: node scripts/smoke-order-search-empty-guard.mjs  (실패 시 exit 1)
 */

// ── 미러 로직 (godomallOrderNormalize.ts 와 동일) ────────────────────────────
const asArray = (value) => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};
const MEANINGFUL_ORDER_KEYS = ['orderNo', 'orderGoodsData', 'orderGoodsNm', 'settlePrice', 'totalGoodsPrice', 'orderStatus'];
const hasValue = (v) => {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return Boolean(v);
};
const isMeaningfulGodoOrderData = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return MEANINGFUL_ORDER_KEYS.some((k) => hasValue(value[k]));
};
const normalizeOrderData = (value) => asArray(value).filter(isMeaningfulGodoOrderData);

// ── 테스트 매트릭스 ──────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const check = (name, actual, expected) => {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${actual}, want ${expected})`);
  if (ok) pass++;
  else fail++;
};

console.log('=== normalizeOrderData() 0건 가드 매트릭스 ===');
check('order_data missing(undefined) → 0', normalizeOrderData(undefined).length, 0);
check('order_data null → 0', normalizeOrderData(null).length, 0);
check('order_data empty string → 0', normalizeOrderData('').length, 0);
check('order_data {} → 0', normalizeOrderData({}).length, 0);
check('meta-only {code,msg,lastOrder} → 0', normalizeOrderData({ code: '200', msg: 'ok', lastOrder: 'false' }).length, 0);
check('{ orderNo } → 1', normalizeOrderData({ orderNo: '2506...0001' }).length, 1);
check('{ orderGoodsNm } → 1', normalizeOrderData({ orderGoodsNm: '크림' }).length, 1);
check('{ settlePrice } → 1', normalizeOrderData({ settlePrice: '29800' }).length, 1);
check('{ orderStatus:"o1" } → 1', normalizeOrderData({ orderStatus: 'o1' }).length, 1);
check('[{ orderNo }, {}] → 1', normalizeOrderData([{ orderNo: 'A' }, {}]).length, 1);
check('[{ orderNo }, { orderNo }] → 2', normalizeOrderData([{ orderNo: 'A' }, { orderNo: 'B' }]).length, 2);
check('[{}, "", null] → 0', normalizeOrderData([{}, '', null]).length, 0);

console.log('\n=== isMeaningfulGodoOrderData() 단일 판정 ===');
check('{} → false(0)', isMeaningfulGodoOrderData({}) ? 1 : 0, 0);
check('{orderNo} → true(1)', isMeaningfulGodoOrderData({ orderNo: 'A' }) ? 1 : 0, 1);
check('empty string → false(0)', isMeaningfulGodoOrderData('') ? 1 : 0, 0);
check('array → false(0)', isMeaningfulGodoOrderData([{ orderNo: 'A' }]) ? 1 : 0, 0);
check('{orderNo:""} 빈값 → false(0)', isMeaningfulGodoOrderData({ orderNo: '' }) ? 1 : 0, 0);
check('{orderGoodsData:[]} 빈배열 → false(0)', isMeaningfulGodoOrderData({ orderGoodsData: [] }) ? 1 : 0, 0);
check('{orderGoodsData:[{}]} 비빈배열 → true(1)', isMeaningfulGodoOrderData({ orderGoodsData: [{}] }) ? 1 : 0, 1);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
