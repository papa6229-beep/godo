#!/usr/bin/env node
/*
 * scripts/audit-b-core-2-ab-parity.mjs
 * B-core-2 — A/B 데이터 세계 parity **RED 재현**.
 *
 * 성격: 실패하는 것이 정상인 재현 스크립트다(작업지시 §8 경우 B).
 *   - 정식 manifest(`scripts/regression-manifest.json`)에 넣지 않는다 → main 게이트를 깨뜨리지 않는다.
 *   - 파일명이 `smoke-*.mjs` 가 아니므로 회귀 러너가 자동 수집하지도 않는다.
 *   - 다음 canonical snapshot provider 작업이 **이 스크립트를 그대로** 통과 기준으로 쓴다.
 *
 * 실행: node scripts/audit-b-core-2-ab-parity.mjs
 * 종료코드: 불일치 1건 이상 → 1 (현재 기대 상태) / 전부 일치 → 0 (provider 완료 신호)
 *
 * 방법: 하나의 공통 raw fixture 를 A 투영·B 투영으로 파생하고,
 *   **기존 공통 계약**(revenueMetricContract / inventoryRiskContract / dataSourceProvenanceContract)
 *   으로 양쪽을 계산해 "반드시 같아야 하는 값"만 비교한다. 계산식을 검사 안에 복제하지 않는다.
 */
import { loadProductModules, projectA, projectB } from './fixtures/b-core-2-modules.mjs';
import { RAW_ORDERS, RAW_GOODS, REAL_SOURCE_TAG, SYNTHETIC_SOURCE_TAG, PROVENANCE_CASES } from './fixtures/b-core-2-ab-fixture.mjs';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rows = [];
const record = (axis, aVal, bVal, note) => {
  const same = eq(aVal, bVal);
  rows.push({ axis, aVal, bVal, same, note });
  return same;
};

console.log('=== B-core-2 A/B 데이터 세계 parity 재현 (RED 예상) ===\n');

const { mods, dispose } = await loadProductModules();
try {
  const RAW = mods.orderNormalize.normalizeOrderData(RAW_ORDERS);
  console.log(`공통 fixture: 주문 raw ${RAW_ORDERS.length}건 → 유효 가드 통과 ${RAW.length}건 · 상품 raw ${RAW_GOODS.length}건\n`);

  const A = projectA(mods, RAW, RAW_GOODS);
  const B = projectB(mods, RAW, RAW_GOODS, REAL_SOURCE_TAG);
  const Bsyn = projectB(mods, RAW, RAW_GOODS, SYNTHETIC_SOURCE_TAG);

  const RM = mods.revenueMetric;
  const IR = mods.inventoryRisk;
  const PV = mods.provenance;

  // ── 1. 유효 주문 식별 결과 ────────────────────────────────────────────────
  // 같은 계약(isValidOrder)에 A 투영·B 투영을 그대로 넣는다.
  const aValidFlags = A.orders.map((o) => RM.isValidOrder(o));
  const bValidFlags = B.lite.map((o) => RM.isValidOrder(o));
  const bNestedFlags = B.orders.map((o) => RM.isValidOrder(o));
  record('유효 주문 식별(주문별)', aValidFlags, bValidFlags,
    'A=StandardOrder / B=RevenueOrderLite 를 같은 isValidOrder 에 투입');
  record('B 내부 일관성(중첩 state ↔ 평탄)', bNestedFlags, bValidFlags,
    'RevenueOrder(state{}) 와 RevenueOrderLite(평탄) 는 같아야 한다');

  // ── 2. 유효 주문 수 ───────────────────────────────────────────────────────
  record('유효 주문 수', RM.countValidOrders(A.orders), RM.countValidOrders(B.lite));
  record('전체 주문 수', RM.countAllOrders(A.orders), RM.countAllOrders(B.lite));

  // ── 3. 취소 판정 ──────────────────────────────────────────────────────────
  const aCanceled = A.orders.map((o) => o.canceled === true);
  const bCanceled = B.lite.map((o) => o.canceled === true);
  record('취소 주문 판정(주문별)', aCanceled, bCanceled,
    'StandardOrder 에 canceled 필드가 존재하는지 자체가 쟁점');

  // ── 4. 결제 판정 ──────────────────────────────────────────────────────────
  const aPaid = A.orders.map((o) => o.paymentStatus === '결제완료');
  const bPaid = B.lite.map((o) => o.paid === true);
  record('결제완료 판정(주문별)', aPaid, bPaid,
    'A=interpretOrderRecord.paid → 문자열 / B=deriveOrderState.paid');

  // ── 5. 상품 라인 매출 ─────────────────────────────────────────────────────
  record('상품 라인 매출(gross)', RM.computeGrossProductRevenue(A.orders), RM.computeGrossProductRevenue(B.lite));

  // ── 6. 배송비 합계 ────────────────────────────────────────────────────────
  const aDeliveryFee = A.orders.reduce((s, o) => s + (Number(o.deliveryFee) || 0), 0);
  const bDeliveryFee = B.lite.reduce((s, o) => s + o.deliveryFee, 0);
  record('배송비 합계', aDeliveryFee, bDeliveryFee, 'StandardOrder 에 deliveryFee 필드가 있는지 자체가 쟁점');

  // ── 7. 회사 공통 운영매출(유효 주문 결제금액) ─────────────────────────────
  record('운영매출(유효 주문 결제금액)', RM.computeOperationalRevenue(A.orders), RM.computeOperationalRevenue(B.lite));

  // ── 8. 재고위험 분류 ──────────────────────────────────────────────────────
  // A: normalizeInventoryItem 이 만든 status('ok'|'warning'|'danger')
  // B: 같은 상품의 재고·안전재고를 canonical classifyStockRisk 에 투입
  const toRisky = (lv) => lv === 'out_of_stock' || lv === 'low_stock';
  const aRisky = A.inventory.map((i) => i.status !== 'ok');
  const bRisky = B.products.map((p) => toRisky(IR.classifyStockRisk(p.stock, undefined).level));
  record('재고위험(상품별 risky 여부)', aRisky, bRisky,
    'A=dataNormalizer status / B=inventoryRiskContract.classifyStockRisk');
  record('재고위험 건수', aRisky.filter(Boolean).length, bRisky.filter(Boolean).length);
  record('기본 안전재고 상수', mods.inventoryDerive.DEFAULT_SAFETY_STOCK, IR.DEFAULT_SAFETY_STOCK,
    'godomallInventoryDerive.DEFAULT_SAFETY_STOCK ↔ inventoryRiskContract.DEFAULT_SAFETY_STOCK');

  // ── 9. 실제·시험·미연결 판정 ──────────────────────────────────────────────
  const aProv = PV.classifyResource({ sourceType: A.sourceType, records: A.orders }).kind;
  const bProv = PV.classifyResource({ sourceType: B.lite[0]?.sourceType ?? REAL_SOURCE_TAG, records: B.lite }).kind;
  record('출처 판정(실제 경로)', aProv, bProv, 'A snapshot.sourceType ↔ B order.sourceType');
  const bSynProv = PV.classifyResource({ sourceType: Bsyn.lite[0]?.sourceType ?? SYNTHETIC_SOURCE_TAG, records: Bsyn.lite }).kind;
  record('출처 판정(합성 경로는 simulation 이어야 함)', 'simulation', bSynProv, '합성 주문이 실제로 둔갑하지 않는지');
  for (const c of PROVENANCE_CASES) {
    record(`출처 판정 · ${c.label}`, c.expected, PV.classifyResource(c.input).kind, '계약이 네 상태를 구분하는지');
  }

  // ── 결과 출력 ─────────────────────────────────────────────────────────────
  console.log('\n--- 비교 결과 ---');
  const w = 42;
  for (const r of rows) {
    console.log(`${r.same ? '  일치  ' : '  불일치'} ${r.axis.padEnd(w)}`);
    if (!r.same) {
      console.log(`          A: ${JSON.stringify(r.aVal)}`);
      console.log(`          B: ${JSON.stringify(r.bVal)}`);
      if (r.note) console.log(`          ← ${r.note}`);
    }
  }
  const diverged = rows.filter((r) => !r.same);
  console.log(`\n=== ${rows.length - diverged.length}/${rows.length} 축 일치 · 불일치 ${diverged.length}축 ===`);
  if (diverged.length) {
    console.log('\n불일치 축 목록(다음 canonical snapshot provider 의 종료조건):');
    for (const r of diverged) console.log(`  - ${r.axis}`);
  }
  process.exitCode = diverged.length === 0 ? 0 : 1;
} finally {
  dispose();
}
