#!/usr/bin/env node
/*
 * scripts/smoke-b-core-2-ab-data-world-parity-v0.mjs
 * B-core-2 — A/B 데이터 세계 **parity 기준선(특성화 검사)**.
 *
 * 이 검사가 하는 일 / 하지 않는 일
 *   O 하나의 공통 raw fixture 를 A 투영·B 투영으로 파생해 **제품 생산 함수를 실제 실행**한다.
 *   O 기존 공통 계약(revenueMetricContract / inventoryRiskContract / dataSourceProvenanceContract)
 *     으로 양쪽을 계산한다. 계산식을 검사 안에 복제하지 않는다.
 *   O 지금 **일치하는 축**은 일치를 요구한다(회귀 방지).
 *   O 지금 **불일치하는 축**은 관측된 실제 값을 그대로 고정한다(특성화). 값이 바뀌면 이 검사가 깨진다
 *     → 다음 canonical snapshot provider 작업이 기준선을 **의식적으로** 갱신하게 만든다.
 *   X 불일치를 "의도된 차이"로 분류해 덮지 않는다. 불일치 축은 아래 DIVERGENCE 표에 사유와 함께 남는다.
 *   X 이 검사는 parity 를 증명하지 않는다. parity 달성 여부는 `node scripts/audit-b-core-2-ab-parity.mjs`
 *     (현재 exit 1 = RED) 가 판정한다.
 *
 * 근거 문서: docs/governance/evidence/B-CORE-2_AB_PARITY_AUDIT.md
 */
import { loadProductModules, projectA, projectB } from './fixtures/b-core-2-modules.mjs';
import { RAW_ORDERS, RAW_GOODS, REAL_SOURCE_TAG, SYNTHETIC_SOURCE_TAG, PROVENANCE_CASES } from './fixtures/b-core-2-ab-fixture.mjs';

let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${extra ? `  ${extra}` : ''}`);
  c ? pass++ : fail++;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const same = (n, a, b, extra) => ok(n, eq(a, b), extra ?? (eq(a, b) ? '' : `A=${JSON.stringify(a)} B=${JSON.stringify(b)}`));
const pinned = (n, actual, expected) =>
  ok(n, eq(actual, expected), eq(actual, expected) ? `(기준선 ${JSON.stringify(expected)})` : `기대=${JSON.stringify(expected)} 실제=${JSON.stringify(actual)}`);

console.log('=== B-core-2 A/B 데이터 세계 parity 기준선 smoke ===');

const { mods, dispose } = await loadProductModules();
try {
  const RAW = mods.orderNormalize.normalizeOrderData(RAW_ORDERS);
  const A = projectA(mods, RAW, RAW_GOODS);
  const B = projectB(mods, RAW, RAW_GOODS, REAL_SOURCE_TAG);
  const Bsyn = projectB(mods, RAW, RAW_GOODS, SYNTHETIC_SOURCE_TAG);
  const RM = mods.revenueMetric, IR = mods.inventoryRisk, PV = mods.provenance;

  // ── 0. fixture 건전성 — 두 투영이 같은 원본에서 나왔는지 ────────────────────
  console.log('\n[0] 공통 fixture 원본 건전성');
  ok('0-1. 주문 raw 가 유효 가드를 통과(유령 주문 없음)', RAW.length === RAW_ORDERS.length, `${RAW.length}/${RAW_ORDERS.length}건`);
  same('0-2. A·B 투영의 주문 건수가 같다', A.orders.length, B.lite.length);
  same('0-3. A·B 투영의 주문번호 목록이 같다', A.orders.map((o) => o.orderNo), B.lite.map((o) => o.orderNo));
  same('0-4. A·B 투영의 상품 건수가 같다', A.inventory.length, B.products.length);
  ok('0-5. fixture 에 개인정보가 없다(마스킹 경계 통과)',
    A.orders.every((o) => /^시\*+$|\*/.test(o.customerNameMasked)) || A.orders.every((o) => o.customerNameMasked.includes('*')),
    A.orders[0]?.customerNameMasked);

  // ── 1. 반드시 같아야 하고 **지금도 같은** 축 (회귀 방지) ────────────────────
  console.log('\n[1] PARITY — 지금 일치하며 앞으로도 일치해야 하는 축');
  same('1-1. 전체 주문 수', RM.countAllOrders(A.orders), RM.countAllOrders(B.lite));
  same('1-2. B 내부 일관성: 중첩 state ↔ 평탄 Lite 의 유효 주문 판정',
    B.orders.map((o) => RM.isValidOrder(o)), B.lite.map((o) => RM.isValidOrder(o)));
  same('1-3. 출처 판정 — 실제 경로는 양쪽 모두 actual',
    PV.classifyResource({ sourceType: A.sourceType, records: A.orders }).kind,
    PV.classifyResource({ sourceType: B.lite[0].sourceType, records: B.lite }).kind);
  pinned('1-4. 출처 판정 — 합성 경로는 simulation(실제로 둔갑 금지)',
    PV.classifyResource({ sourceType: Bsyn.lite[0].sourceType, records: Bsyn.lite }).kind, 'simulation');
  for (const c of PROVENANCE_CASES) {
    pinned(`1-5. 출처 판정 · ${c.label}`, PV.classifyResource(c.input).kind, c.expected);
  }

  // 1-6~1-9: B-core-2a 에서 DIVERGENCE → PARITY 로 **이동한 축**.
  //   이전 기준선(A 3건 / B 4건, 상수 3 vs 5, P3·P5·P6 갈림)은 이제 성립하지 않는다.
  //   근거: api 계층이 근거 없는 안전재고 '3' 과 독립 판정을 만들어내던 것을 걷어냈고,
  //        계약이 soldOut·stockEnabled 신호를 받게 되어 양쪽이 같은 계약에 같은 신호를 넣는다.
  //   상세: docs/governance/evidence/B-CORE-2_AB_PARITY_AUDIT.md §11
  const toRisky = (lv) => lv === 'out_of_stock' || lv === 'low_stock';
  const riskOf = (p) => IR.classifyStockRiskWithSaleState({ stock: p.stock, soldOut: p.soldOut, stockEnabled: p.stockEnabled });
  const aRisky = A.inventory.map((i) => i.status !== 'ok');
  const bRisky = B.products.map((p) => toRisky(riskOf(p).level));
  same('1-6. 재고위험 — 상품별 위험 여부', aRisky, bRisky);
  same('1-7. 재고위험 — 건수', aRisky.filter(Boolean).length, bRisky.filter(Boolean).length);
  pinned('1-8. 기본 안전재고 정본이 하나(api 계층은 보유하지 않음)',
    [mods.inventoryDerive.DEFAULT_SAFETY_STOCK, IR.DEFAULT_SAFETY_STOCK], [undefined, 5]);
  pinned('1-9. api 계층에 독립 재고 판정 함수 없음', typeof mods.inventoryDerive.computeInventoryStatus, 'undefined');
  pinned('1-10. 위험 상품(사건 라벨) — 양쪽 동일',
    RAW_GOODS.filter((_, i) => aRisky[i]).map((g) => g.__case),
    ['P2 안전재고 경계(3)', 'P3 안전재고 경계(4)', 'P4 품절(재고0)', 'P5 품절표시']);

  // ── 2. DIVERGENCE — 지금 다른 축. 실측값을 고정한다. ────────────────────────
  //  사유 분류(감사 문서 §4 와 동일):
  //    [구조]   A 투영에 해당 사실을 담을 필드 자체가 없다 → provider 가 필드를 실어야 해소
  //    [계산]   같은 이름의 값을 두 생산자가 다르게 계산한다 → 정의를 하나로 모아야 해소
  //    [입력]   계약은 옳으나 투입 입력이 부족하다 → provider 가 입력을 보강해야 해소
  console.log('\n[2] DIVERGENCE — 지금 불일치. 다음 provider 가 해소할 축(실측 기준선 고정)');

  // 2-1 [구조] StandardOrder 에는 totalAmount/paid/canceled/lines 가 없다.
  //    isValidOrder 의 최종 폴백(num(totalAmount)>0)까지 0 이 되어 전 주문이 '유효 아님'이 된다.
  pinned('2-1 [구조] A 투영의 유효 주문 수(계약 적용 시)', RM.countValidOrders(A.orders), 0);
  pinned('2-2 [기준] B 투영의 유효 주문 수', RM.countValidOrders(B.lite), 5);
  pinned('2-3 [구조] A 투영의 상품 라인 매출(lines 부재)', RM.computeGrossProductRevenue(A.orders), 0);
  pinned('2-4 [기준] B 투영의 상품 라인 매출', RM.computeGrossProductRevenue(B.lite), 416000);
  pinned('2-5 [구조] A 투영의 배송비 합계(deliveryFee 부재)',
    A.orders.reduce((s, o) => s + (Number(o.deliveryFee) || 0), 0), 0);
  pinned('2-6 [기준] B 투영의 배송비 합계', B.lite.reduce((s, o) => s + o.deliveryFee, 0), 5500);
  pinned('2-7 [구조] A 투영의 운영매출', RM.computeOperationalRevenue(A.orders), 0);
  pinned('2-8 [기준] B 투영의 운영매출', RM.computeOperationalRevenue(B.lite), 210500);
  pinned('2-9 [구조] A 투영에 취소 주문 표현 없음(canceled=true 건수)',
    A.orders.filter((o) => o.canceled === true).length, 0);
  pinned('2-10 [기준] B 투영의 취소 주문 건수', B.lite.filter((o) => o.canceled).length, 2);

  // 2-11 [계산] 결제완료 판정이 두 생산자에서 다르다.
  //    A: interpretOrderRecord — hasPaymentDate(paymentDt) || isPaidStatus(orderStatus)  (OR)
  //    B: deriveOrderState     — isValidDate(paymentDt) && orderStatus !== 'o1'          (AND)
  const aPaid = A.orders.map((o) => o.paymentStatus === '결제완료');
  const bPaid = B.lite.map((o) => o.paid === true);
  const paidDiff = RAW_ORDERS.map((r, i) => (aPaid[i] === bPaid[i] ? null : r.__case)).filter(Boolean);
  pinned('2-11 [계산] 결제완료 판정이 갈리는 주문(사건 라벨)', paidDiff,
    ['C9 경계 paymentDt+o1', 'C10 경계 배송중+결제일시없음']);
  pinned('2-12 [계산] A 결제완료 건수', aPaid.filter(Boolean).length, 9);
  pinned('2-13 [계산] B 결제완료 건수', bPaid.filter(Boolean).length, 7);

  // ── 2-재고: B-core-2a 에서 전부 해소됨 → [1] PARITY 로 이동(1-6~1-10). ─────
  //   재고 신호만 넣으면 계약이 재고 숫자로만 판정한다는 사실은 남겨 둔다
  //   (판매상태를 실어 주는 책임이 소비자에게 있음을 잊지 않기 위해).
  pinned('2-14 [주의] 판매상태를 빼면 계약은 재고 숫자로만 판정한다',
    [IR.classifyStockRisk(B.products[4].stock).level, IR.classifyStockRiskWithSaleState({ stock: B.products[4].stock, soldOut: B.products[4].soldOut }).level],
    ['ok', 'out_of_stock']);

  // ── 3. RED 재현이 보존돼 있는지 ────────────────────────────────────────────
  console.log('\n[3] RED 재현 보존');
  const { existsSync } = await import('node:fs');
  ok('3-1. audit-b-core-2-ab-parity.mjs 존재(정식 게이트 밖 RED 재현)',
    existsSync('scripts/audit-b-core-2-ab-parity.mjs'));
  const manifest = JSON.parse((await import('node:fs')).readFileSync('scripts/regression-manifest.json', 'utf8'));
  ok('3-2. RED 재현은 정식 manifest 에 없다(main 게이트 미파손)',
    !manifest.include.includes('audit-b-core-2-ab-parity.mjs') &&
    !(manifest.exclude ?? []).some((x) => x.file === 'audit-b-core-2-ab-parity.mjs'));
  ok('3-3. 이 검사는 정식 manifest 에 등록돼 있다',
    manifest.include.includes('smoke-b-core-2-ab-data-world-parity-v0.mjs'));
} finally {
  dispose();
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
