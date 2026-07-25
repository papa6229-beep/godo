#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-d12-claim-semantics-red-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 D-1.2 — 취소·반품·환불 의미 계약 (RED → GREEN 해소 확인)
 *
 * ⚠️ 이 파일은 D-1.2 RED 진단(커밋 ba8a67b)이었다. D-1.2 GREEN A 로 결함이 해소되어,
 *    각 [RED] 확정 업무 기준이 이제 MET 임을 확인한다(exit 0). 원본 RED 결함 재현 증거는
 *    git ba8a67b 와 docs/DIAG_SIMCATALOG_D12_CLAIM_SEMANTICS_2026-07-25.md 에 보존된다.
 *    상세 GREEN 회귀는 smoke-...-d12-claim-semantics-green-v0.mjs 참조.
 *
 * 확정 업무 기준: 취소≠반품 · 반품접수≠환불완료 · claimAmount(요청)≠실제 완료금액 ·
 *   미결제 취소=환불없음 · 동일 사건 중복집계 0.
 * [FACT] = 관찰 · [RED ] = 확정 업무 기준(이제 MET).
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
console.log('=== SIMULATION-CATALOG-BASELINE-01 D-1.2 — 취소·반품·환불 (RED→GREEN 해소 확인) ===');

const outSrc = mkdtempSync(path.join(os.tmpdir(), 'd12rg-src-'));
execFileSync(process.execPath, [TSC,
  path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
  path.join(REPO, 'src', 'services', 'revenueMetricContract.ts'),
  path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'),
  path.join(REPO, 'src', 'services', 'inquiryStatusContract.ts'),
  path.join(REPO, 'src', 'services', 'revenueScreenState.ts'),
  path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts'),
  path.join(REPO, 'src', 'services', 'claimEventContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'],
  { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(outSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const DS = await import(pathToFileURL(path.join(outSrc, 'departmentDataSourceOfTruth.js')).href);
const CE = await import(pathToFileURL(path.join(outSrc, 'claimEventContract.js')).href);

const mk = (o) => ({ orderNo: o.n, sourceType: 'synthetic_test', deliveryFee: 0, totalAmount: o.amt ?? 10000,
  productRevenueByLines: o.amt ?? 10000, paid: o.paid ?? true, unpaid: o.unpaid ?? false, confirmed: false,
  canceled: o.canceled ?? false, shipped: o.shipped ?? false, delivered: false,
  lines: [{ lineRevenue: o.amt ?? 10000, quantity: 1 }], ...(o.claim ? { claim: o.claim } : {}) });
const claim = (types, extra) => ({ hasClaim: true, claimTypes: types, ...extra });
const build = (orders) => DS.buildDepartmentSourceOfTruthSnapshot({ count: orders.length, source: 'godomall',
  live: false, realOrdersStatus: 'success', syntheticStatus: 'success', stockImpact: [], orders, summary: null });

const sCancel = build([mk({ n: 'X', canceled: true, claim: claim(['cancel'], { handleModes: ['c'], rawStatuses: ['c4'], handleCompleteFl: 'y', requestedRefundAmount: 5000 }) })]);
const sReturn = build([mk({ n: 'B', shipped: true, claim: claim(['return', 'cancel'], { handleModes: ['b'], rawStatuses: ['b4'], requestedRefundAmount: 8000 }) })]);
const sRefundOnly = build([mk({ n: 'F', claim: claim(['refund', 'cancel'], { handleModes: ['r'], rawStatuses: ['r3'], handleCompleteFl: 'y', requestedRefundAmount: 10000 }) })]);
// D-1.2.1: 결제 취소 + 명시 환불완료(r3) → 완료 환불금액 표현 가능(handleCompleteFl=y 단독은 불충분).
const sCancelRefunded = build([mk({ n: 'XR', canceled: true, claim: claim(['cancel'], { handleModes: ['c'], rawStatuses: ['c4', 'r3'], requestedRefundAmount: 5000 }) })]);

console.log('');
console.log('  --- [FACT] 해소 후 실제 동작(관찰) ---');
F('F1. 취소 단건은 반품 접수 건수(returnReceivedOrders)에 잡히지 않는다', sReturn.orderUniverse.returnReceivedOrders === 1 && sCancel.orderUniverse.returnReceivedOrders === 0, `취소 return=${sCancel.orderUniverse.returnReceivedOrders} 반품 return=${sReturn.orderUniverse.returnReceivedOrders}`);
F('F2. 반품+cancel 호환태그는 반품 1건으로만(취소 0) 단일 집계', sReturn.orderUniverse.cancelledOrders === 0 && sReturn.orderUniverse.returnReceivedOrders === 1, `cancel=${sReturn.orderUniverse.cancelledOrders} return=${sReturn.orderUniverse.returnReceivedOrders}`);
F('F3. 반품 접수만으로 완료 환불금액이 생기지 않는다(대기로 분리)', sReturn.revenueUniverse.completedRefundRevenue === 0 && sReturn.revenueUniverse.pendingRefundRevenue === 8000, `completed=${sReturn.revenueUniverse.completedRefundRevenue} pending=${sReturn.revenueUniverse.pendingRefundRevenue}`);
F('F4. 요청금액과 완료금액이 분리된다(요청 보존·완료는 근거 있을 때만)', sRefundOnly.revenueUniverse.requestedRefundAmount === 10000 && sRefundOnly.revenueUniverse.completedRefundRevenue === 10000, `req=${sRefundOnly.revenueUniverse.requestedRefundAmount} done=${sRefundOnly.revenueUniverse.completedRefundRevenue}`);
F('F5. 미결제 취소는 refundStatus none(환불 없음)', CE.classifyClaimEvent({ hasClaim: true, claimTypes: ['cancel'], handleModes: ['c'] }, { paid: false }).refundStatus === 'none', 'none');

console.log('');
console.log('  --- [RED] 확정 업무 기준 (이제 MET) ---');
R('R1. 취소는 반품 건수에 미포함', sCancel.orderUniverse.returnReceivedOrders === 0, `취소 return=${sCancel.orderUniverse.returnReceivedOrders}`);
R('R2. 동일 취소/반품 사건 중복 집계 0', (sReturn.orderUniverse.cancelledOrders + sReturn.orderUniverse.returnReceivedOrders) === 1, `합=${sReturn.orderUniverse.cancelledOrders + sReturn.orderUniverse.returnReceivedOrders}`);
R('R3. 반품 접수 → 완료 환불금액 0(대기 분리)', sReturn.revenueUniverse.completedRefundRevenue === 0, `completed=${sReturn.revenueUniverse.completedRefundRevenue}`);
R('R4. refundedRevenue 는 실제 완료금액만(요청 추측 금지)', sRefundOnly.revenueUniverse.completedRefundRevenue === 10000 && typeof sRefundOnly.revenueUniverse.completedRefundRevenue === 'number', `completed=${sRefundOnly.revenueUniverse.completedRefundRevenue}`);
R('R5. 환불 대기와 완료를 구별(pending/ completed 분리)', typeof sReturn.revenueUniverse.pendingRefundRevenue === 'number' && sReturn.claimUniverse.pendingRefundCount === 1, `pendingCount=${sReturn.claimUniverse.pendingRefundCount}`);
R('R6. 반품 접수 건수를 완료와 분리해 셀 수 있다', sReturn.orderUniverse.returnReceivedOrders === 1, `returnReceived=${sReturn.orderUniverse.returnReceivedOrders}`);
R('R7. 반품 처리 단계 구별(RAW b1~b4 증명분)', sReturn.claimUniverse.returnStageBreakdown.collected === 1, `collected=${sReturn.claimUniverse.returnStageBreakdown.collected}`);
R('R8. 결제 취소의 실제 환불 완료금액은 명시 근거(r3) 있을 때 표현·handleCompleteFl=y 단독은 미확정',
  sCancelRefunded.revenueUniverse.completedRefundRevenue === 5000 && sCancel.claimUniverse.unknownRefundRevenue === 5000,
  `r3취소 completed=${sCancelRefunded.revenueUniverse.completedRefundRevenue} · y만 unknown=${sCancel.claimUniverse.unknownRefundRevenue}`);

console.log('');
console.log(`[FACT] ${fact} pass / ${factf} fail   [RED ] ${red} met / ${redx} unmet`);
rmSync(outSrc, { recursive: true, force: true });
if (factf > 0) { console.log('\n✗ 관찰 불일치'); process.exit(1); }
if (redx > 0) { console.log(`\n✗ ${redx}건 미충족`); process.exit(1); }
console.log('\n✓ D-1.2 RED 결함 해소 확인 — 취소·반품·환불 단일 분류·요청/완료 분리(GREEN A).');
