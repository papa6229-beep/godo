#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-d12-claim-semantics-red-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 D-1.2 — 취소·반품·환불 의미 계약 (RED 진단)
 *
 * 제품 소스 수정 없음. 현재 제품 함수 buildDepartmentSourceOfTruthSnapshot 를 claim 변형
 * fixture 로 직접 실행하여, 확정 업무 기준(취소≠반품, 반품접수≠환불완료, claimAmount≠실제환불금액)에
 * 비추어 현재 의미의 결함을 진단한다.
 *
 * 확정 업무 기준(사장 지시 D-1.2):
 *   취소 = 발송 전 중단, 반품 건수에 미포함.
 *   반품 = 발송 후 반환. 접수 시점부터 "반품 접수 1건". 회수·입고·검수·환불 승인/거절은 별도 단계.
 *          반품 접수만으로 환불 완료 단정 금지.
 *   환불 = 실제 돈을 돌려준 금융 결과. 결제취소의 발송전 환불완료 포함. 반품은 검수후 환불완료만 포함.
 *          claim 요청금액을 실제 환불금액으로 추측 금지. 미결제취소·환불대기·환불거절 제외.
 *
 * [FACT] = 현재 제품의 실제 동작(불변 관찰). 이 RED 커밋에서는 "결함이 그대로 재현됨"을 PASS 로 고정.
 * [RED ] = 확정 업무 기준(desired). 현재 미충족이면 RED(unmet). GREEN 구현 시 MET 로 전환될 지점.
 *
 * ⚠️ 이 스모크는 GREEN 미구현 상태에서 의도적으로 RED(exit 1)다. 결함 진단 증거이며,
 *    c6548d1 지역 집계 검사(현재 잘못된 의미 재현)와 함께 보존된다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd().replace(/\\/g, '/');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
let fact = 0, factf = 0, red = 0, redx = 0;
const F = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} [FACT] ${n}${d ? `  — ${d}` : ''}`); ok ? fact++ : factf++; };
const R = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'RED '} [RED ] ${n}${d ? `  — ${d}` : ''}`); ok ? red++ : redx++; };
console.log('=== SIMULATION-CATALOG-BASELINE-01 D-1.2 — 취소·반품·환불 의미 계약 (RED 진단) ===');

// ── 컴파일 (departmentDataSourceOfTruth + 런타임 의존 계약) ────────────────────
const outSrc = mkdtempSync(path.join(os.tmpdir(), 'd12r-src-'));
execFileSync(process.execPath, [TSC,
  path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
  path.join(REPO, 'src', 'services', 'revenueMetricContract.ts'),
  path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'),
  path.join(REPO, 'src', 'services', 'inquiryStatusContract.ts'),
  path.join(REPO, 'src', 'services', 'revenueScreenState.ts'),
  path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'],
  { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(outSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const DS = await import(pathToFileURL(path.join(outSrc, 'departmentDataSourceOfTruth.js')).href);

// ── claim 변형 fixture (익명 시험값, 손검산) ──────────────────────────────────
const mk = (o) => ({ orderNo: o.n, sourceType: 'synthetic_test', deliveryFee: 0, totalAmount: o.amt ?? 10000,
  paid: o.paid ?? true, unpaid: o.unpaid ?? false, confirmed: false, canceled: o.canceled ?? false,
  lines: [{ lineRevenue: o.amt ?? 10000, quantity: 1 }], ...(o.claim ? { claim: o.claim } : {}) });
const claim = (types, amt) => ({ hasClaim: true, claimTypes: types, claimAmount: amt });
const build = (orders) => DS.buildDepartmentSourceOfTruthSnapshot({ count: orders.length, source: 'godomall',
  live: false, realOrdersStatus: 'success', syntheticStatus: 'success', stockImpact: [], orders, summary: null });

// 개별 사건 단건 스냅샷(중복·경계 진단용)
const sCancel  = build([mk({ n: 'X', canceled: true, claim: claim(['cancel'], 5000) })]);   // 결제 취소(발송전) + 환불금액 기재
const sReturn  = build([mk({ n: 'B', canceled: false, claim: claim(['return'], 8000) })]);   // 반품 접수(환불 완료 아님)
const sRefund  = build([mk({ n: 'R', canceled: false, claim: claim(['refund'], 10000) })]);  // 환불 claim
const sExch    = build([mk({ n: 'E', canceled: false, claim: claim(['exchange'], 3000) })]); // 교환

console.log('');
console.log('  --- [FACT] 현재 제품의 실제 의미(결함 재현·관찰) ---');
F('F1. 취소 claim 이 returnedOrders(반품 건수)에 집계된다(정규식에 cancel 포함)',
  sCancel.orderUniverse.returnedOrders === 1, `취소단건 returnedOrders=${sCancel.orderUniverse.returnedOrders}`);
F('F2. 동일 취소 1건이 cancelledOrders 와 returnedOrders 양쪽에 중복 집계된다',
  sCancel.orderUniverse.cancelledOrders === 1 && sCancel.orderUniverse.returnedOrders === 1,
  `cancelled=${sCancel.orderUniverse.cancelledOrders} returned=${sCancel.orderUniverse.returnedOrders}`);
F('F3. 반품 접수만으로 refundedRevenue(환불금액)가 발생한다(완료 여부 없이 claimAmount 합산)',
  sReturn.revenueUniverse.refundedRevenue === 8000, `반품접수 refundedRevenue=${sReturn.revenueUniverse.refundedRevenue}`);
F('F4. 환불 claim 의 claimAmount(요청/기재금액)가 그대로 refundedRevenue 로 합산된다',
  sRefund.revenueUniverse.refundedRevenue === 10000, `환불 refundedRevenue=${sRefund.revenueUniverse.refundedRevenue}`);
F('F5. 교환은 returnedOrders·refundedRevenue 어디에도 안 잡힌다(별도 취급 없음)',
  sExch.orderUniverse.returnedOrders === 0 && sExch.revenueUniverse.refundedRevenue === 0,
  `교환 returned=${sExch.orderUniverse.returnedOrders} refunded=${sExch.revenueUniverse.refundedRevenue}`);
// 환불 대기 vs 완료 구별 불가: 동일 refund claim 두 건이 "완료/대기" 무관하게 동일 합산
const sPendingVsDone = build([mk({ n: 'P', claim: claim(['refund'], 10000) }), mk({ n: 'D', claim: claim(['refund'], 10000) })]);
F('F6. 환불 "대기"와 "완료"를 구별할 입력이 없어, 완료 여부와 무관하게 동일 합산된다',
  sPendingVsDone.revenueUniverse.refundedRevenue === 20000, `두 refund(대기/완료 구별불가) 합=${sPendingVsDone.revenueUniverse.refundedRevenue}`);
// 88,116,982 독립성: claimAmount 를 바꿔도 operationalRevenue(유효주문 net) 불변
const base10 = [mk({ n: 'V1', canceled: false, amt: 10000 }), mk({ n: 'V2', canceled: false, amt: 5000, claim: claim(['refund'], 4000) })];
const base10b = [mk({ n: 'V1', canceled: false, amt: 10000 }), mk({ n: 'V2', canceled: false, amt: 5000, claim: claim(['refund'], 999999) })];
const opA = build(base10).operationalRevenue, opB = build(base10b).operationalRevenue;
F('F7. refundedRevenue/claimAmount 는 operationalRevenue(net, 88,116,982 계열)과 독립 — claimAmount 변경에도 net 불변',
  opA === 15000 && opB === 15000, `opA=${opA} opB=${opB} (claimAmount 4000→999999, net 불변)`);

console.log('');
console.log('  --- [RED] 확정 업무 기준 (현재 미충족 → RED) ---');
R('R1. 취소는 반품 건수에 포함되지 않아야 한다(취소 claim → returnedOrders 미포함)',
  sCancel.orderUniverse.returnedOrders === 0, `현재 취소단건 returnedOrders=${sCancel.orderUniverse.returnedOrders} (기대 0)`);
R('R2. 동일 취소 사건이 취소·반품 양쪽 건수에 중복 집계되지 않아야 한다',
  !(sCancel.orderUniverse.cancelledOrders === 1 && sCancel.orderUniverse.returnedOrders === 1),
  `현재 cancelled=1 & returned=1 중복`);
R('R3. 반품 접수만으로 환불 완료금액이 생기지 않아야 한다(반품접수 → refundedRevenue 0)',
  sReturn.revenueUniverse.refundedRevenue === 0, `현재 반품접수 refundedRevenue=${sReturn.revenueUniverse.refundedRevenue} (기대 0=미완료)`);
R('R4. refundedRevenue 는 실제 환불 완료금액만 합산해야 한다(요청 claimAmount 추측 금지)',
  // 완료금액 전용 필드가 없으므로 현재는 표현 불가 → 항상 RED
  typeof sRefund.revenueUniverse.completedRefundRevenue === 'number',
  `제안 필드 completedRefundRevenue 부재(현재 ${sRefund.revenueUniverse.completedRefundRevenue})`);
R('R5. 환불 대기와 환불 완료를 구별할 수 있어야 한다(완료 여부 입력·집계)',
  typeof sRefund.revenueUniverse.pendingRefundRevenue === 'number',
  `제안 필드 pendingRefundRevenue 부재(현재 ${sRefund.revenueUniverse.pendingRefundRevenue})`);
R('R6. 반품 접수 건수를 환불 완료와 분리해 셀 수 있어야 한다(반품 접수 1건 지표)',
  typeof sReturn.orderUniverse.returnReceivedOrders === 'number',
  `제안 필드 returnReceivedOrders 부재(현재 ${sReturn.orderUniverse.returnReceivedOrders})`);
R('R7. 반품 처리 단계(접수·회수·입고·검수·완료·거절)를 구별할 수 있어야 한다',
  !!sReturn.returnStageBreakdown,
  `제안 필드 returnStageBreakdown 부재(현재 ${sReturn.returnStageBreakdown})`);
R('R8. 결제 후 발송 전 취소의 실제 환불 완료금액을 표현할 수 있어야 한다',
  typeof sCancel.revenueUniverse.completedRefundRevenue === 'number',
  `제안 필드 completedRefundRevenue 부재(결제취소 환불완료 표현 불가)`);

console.log('');
console.log(`[FACT] ${fact} pass / ${factf} fail   [RED ] ${red} met / ${redx} unmet`);
rmSync(outSrc, { recursive: true, force: true });
if (factf > 0) { console.log('\n✗ 관찰 불일치(현재 동작이 예상과 다름 — 진단 재작성 필요)'); process.exit(1); }
if (redx > 0) { console.log(`\n✗ RED — 확정 업무 기준 ${redx}건 미충족(취소·반품·환불 의미 분리 미구현). GREEN 대기.`); process.exit(1); }
console.log('\n✓ (예상외) 전 기준 충족 — GREEN 도달');
