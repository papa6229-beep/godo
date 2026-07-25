#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-d12-claim-semantics-green-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 D-1.2 GREEN A — 클레임 원본 보존·명백한 오분류 교정
 *
 * 공통 분류기 claimEventContract + DS(claimUniverse) + 원본 근거 보존을 잠근다.
 *   취소≠반품, 반품접수≠환불완료, 요청금액≠실제 완료금액, 동일 사건 중복집계 0.
 *   운영 순매출 공식·기준값 6종 불변(net 88,116,982 등).
 * fixture 는 손검산 가능·익명. 실제 2년치는 resolveOrdersRevenue 로 직접 산출(check 11·12).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd().replace(/\\/g, '/');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
let pass = 0, fail = 0;
const T = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${d ? `  — ${d}` : ''}`); ok ? pass++ : fail++; };
console.log('=== SIMULATION-CATALOG-BASELINE-01 D-1.2 GREEN A — 클레임 원본 보존·오분류 교정 ===');

// ── 컴파일: src(분류기+DS) + api(실제 2년치) ─────────────────────────────────
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const outApi = mkdtempSync(path.join(cacheRoot, 'd12g-api-'));
const outApiUnix = outApi.replace(/\\/g, '/');
const cfg = path.join(outApi, 'tsconfig.json');
writeFileSync(cfg, JSON.stringify({ compilerOptions: { target: 'ES2023', lib: ['ES2023'], module: 'NodeNext', moduleResolution: 'NodeNext', types: ['node'], strict: false, strictNullChecks: true, skipLibCheck: true, esModuleInterop: true, outDir: outApiUnix, rootDir: `${REPO}/api`, noEmit: false, noEmitOnError: false }, include: [`${REPO}/api/_shared/**/*.ts`] }));
writeFileSync(path.join(outApi, 'package.json'), JSON.stringify({ type: 'module' }));
try { execFileSync(process.execPath, [TSC, '-p', cfg, '--pretty', 'false'], { cwd: REPO, stdio: 'pipe' }); } catch {}
const RES = await import(pathToFileURL(path.join(outApi, '_shared', 'godomallResource.js')).href);

const outSrc = mkdtempSync(path.join(os.tmpdir(), 'd12g-src-'));
execFileSync(process.execPath, [TSC,
  path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
  path.join(REPO, 'src', 'services', 'revenueMetricContract.ts'),
  path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'),
  path.join(REPO, 'src', 'services', 'inquiryStatusContract.ts'),
  path.join(REPO, 'src', 'services', 'revenueScreenState.ts'),
  path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts'),
  path.join(REPO, 'src', 'services', 'claimEventContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(outSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const DS = await import(pathToFileURL(path.join(outSrc, 'departmentDataSourceOfTruth.js')).href);
const CE = await import(pathToFileURL(path.join(outSrc, 'claimEventContract.js')).href);

// ── fixture helper ────────────────────────────────────────────────────────────
const mk = (o) => ({ orderNo: o.n, sourceType: 'synthetic_test', deliveryFee: 0, totalAmount: o.amt ?? 10000,
  productRevenueByLines: o.amt ?? 10000, paid: o.paid ?? true, unpaid: o.unpaid ?? false, confirmed: false,
  canceled: o.canceled ?? false, shipped: o.shipped ?? false, delivered: false,
  lines: [{ lineRevenue: o.amt ?? 10000, quantity: 1 }], ...(o.claim ? { claim: o.claim } : {}) });
const build = (orders) => DS.buildDepartmentSourceOfTruthSnapshot({ count: orders.length, source: 'godomall',
  live: false, realOrdersStatus: 'success', syntheticStatus: 'success', stockImpact: [], orders, summary: null });
const cu = (snap) => snap.claimUniverse;

console.log('');
console.log('  --- fixture 단위 (RED→GREEN 1~10) ---');

// 1. 순수 취소 → 취소 1, 반품 0
const s1 = build([mk({ n: 'C1', canceled: true, claim: { hasClaim: true, claimTypes: ['cancel'], handleModes: ['c'], rawStatuses: ['c4'], handleCompleteFl: 'y', requestedRefundAmount: 5000 } })]);
T('1. 순수 취소 → 취소 1 · 반품 접수 0', s1.orderUniverse.cancelledOrders === 1 && s1.orderUniverse.returnReceivedOrders === 0, `cancel=${s1.orderUniverse.cancelledOrders} return=${s1.orderUniverse.returnReceivedOrders}`);

// 2. 반품 + 과거 cancel 호환 태그 → 취소 0, 반품 접수 1
const s2 = build([mk({ n: 'R2', canceled: true, shipped: true, claim: { hasClaim: true, claimTypes: ['return', 'cancel'], handleModes: ['b'], rawStatuses: ['b4'], requestedRefundAmount: 8000 } })]);
T('2. 반품+cancel 호환태그 → 취소 0 · 반품 접수 1', s2.orderUniverse.cancelledOrders === 0 && s2.orderUniverse.returnReceivedOrders === 1, `cancel=${s2.orderUniverse.cancelledOrders} return=${s2.orderUniverse.returnReceivedOrders}`);

// 3. refund_only + cancel 태그 → 취소 0, 반품 0
const s3 = build([mk({ n: 'F3', canceled: true, claim: { hasClaim: true, claimTypes: ['refund', 'cancel'], handleModes: ['r'], rawStatuses: ['r3'], handleCompleteFl: 'y', requestedRefundAmount: 10000 } })]);
T('3. refund_only+cancel 태그 → 취소 0 · 반품 0 · refundOnly 1', s3.orderUniverse.cancelledOrders === 0 && s3.orderUniverse.returnReceivedOrders === 0 && cu(s3).refundOnlyOrders === 1, `cancel=${s3.orderUniverse.cancelledOrders} return=${s3.orderUniverse.returnReceivedOrders} refundOnly=${cu(s3).refundOnlyOrders}`);

// 4. 반품 요청·환불 대기 → 완료 환불금액 미집계
const s4 = build([mk({ n: 'RP4', shipped: true, claim: { hasClaim: true, claimTypes: ['return'], handleModes: ['b'], rawStatuses: ['b1'], requestedRefundAmount: 5000 } })]);
T('4. 반품 요청·환불 대기 → 완료 환불금액 0 · 대기 5000', s4.revenueUniverse.completedRefundRevenue === 0 && s4.revenueUniverse.pendingRefundRevenue === 5000, `completed=${s4.revenueUniverse.completedRefundRevenue} pending=${s4.revenueUniverse.pendingRefundRevenue}`);

// 5. 명시적 환불 완료 → 실제 완료금액만 집계
const s5 = build([mk({ n: 'RC5', claim: { hasClaim: true, claimTypes: ['refund'], handleModes: ['r'], rawStatuses: ['r3'], handleCompleteFl: 'y', handleDt: '2026-07-01 10:00:00', requestedRefundAmount: 10000 } })]);
T('5. 명시적 환불 완료 → 완료금액 10000 · 완료건 1', s5.revenueUniverse.completedRefundRevenue === 10000 && cu(s5).completedRefundCount === 1, `completed=${s5.revenueUniverse.completedRefundRevenue} cnt=${cu(s5).completedRefundCount}`);

// 6. 미결제 취소 → refundStatus none
const ev6 = CE.classifyClaimEvent({ hasClaim: true, claimTypes: ['cancel'], handleModes: ['c'], rawStatuses: ['c4'], requestedRefundAmount: 6000 }, { paid: false });
const s6 = build([mk({ n: 'U6', paid: false, unpaid: true, canceled: true, claim: { hasClaim: true, claimTypes: ['cancel'], handleModes: ['c'], rawStatuses: ['c4'], requestedRefundAmount: 6000 } })]);
T('6. 미결제 취소 → refundStatus none · 완료/대기 0', ev6.refundStatus === 'none' && s6.revenueUniverse.completedRefundRevenue === 0 && cu(s6).pendingRefundCount === 0, `refundStatus=${ev6.refundStatus} completed=${s6.revenueUniverse.completedRefundRevenue} pending=${cu(s6).pendingRefundCount}`);

// 7. 부분 환불 완료 → 부분 금액만 집계
const s7 = build([mk({ n: 'PR7', amt: 20000, claim: { hasClaim: true, claimTypes: ['refund'], handleModes: ['r'], rawStatuses: ['r3'], handleCompleteFl: 'y', requestedRefundAmount: 3000 } })]);
T('7. 부분 환불 완료 → 완료금액 3000(부분)만', s7.revenueUniverse.completedRefundRevenue === 3000, `completed=${s7.revenueUniverse.completedRefundRevenue}`);

// 8. 충돌·근거 부족 → unknown, 임의 집계 0
const s8 = build([mk({ n: 'X8', claim: { hasClaim: true, claimTypes: ['weird'], handleModes: ['x'], rawStatuses: ['zz'], requestedRefundAmount: 9000 } })]);
T('8. 근거 부족 → unknown 1 · 취소/반품/환불완료 임의집계 0', cu(s8).unknownClaimOrders === 1 && s8.orderUniverse.cancelledOrders === 0 && s8.orderUniverse.returnReceivedOrders === 0 && s8.revenueUniverse.completedRefundRevenue === 0 && cu(s8).unknownRefundCount === 1, `unknownClaim=${cu(s8).unknownClaimOrders} unknownRefund=${cu(s8).unknownRefundCount}`);

// 9. RAW 상태·금액 보존(분류기 무변형). D-1.2.1 교체: handleDt 를 refundedAt 으로 쓰지 않는다.
const rawClaim = { hasClaim: true, claimTypes: ['refund', 'cancel'], handleModes: ['r'], handleCompleteFl: 'y', handleDt: '2026-07-02 09:00:00', rawStatuses: ['r3'], requestedRefundAmount: 7000 };
const snapshotBefore = JSON.stringify(rawClaim);
const ev9 = CE.classifyClaimEvent(rawClaim, { paid: true });
T('9. RAW 보존: 입력 claim 무변형 · handleDt≠refundedAt(D-1.2.1) · r3근거로 완료 7000', JSON.stringify(rawClaim) === snapshotBefore && ev9.refundedAt === undefined && ev9.requestedRefundAmount === 7000 && ev9.completedRefundAmount === 7000, `refundedAt=${ev9.refundedAt ?? '없음'} requested=${ev9.requestedRefundAmount} completed=${ev9.completedRefundAmount}`);
// 9b. refundedAt 은 확인된 환불완료 시각 필드(refundCompletedAt)가 있을 때만 채워진다.
const ev9b = CE.classifyClaimEvent({ ...rawClaim, refundCompletedAt: '2026-07-03 12:00:00' }, { paid: true });
T('9b. refundCompletedAt(확인된 환불완료시각) 있을 때만 refundedAt 기록', ev9b.refundedAt === '2026-07-03 12:00:00', `refundedAt=${ev9b.refundedAt}`);

// 10. 동일 사건의 취소·반품 중복 집계 0 (반품 1건은 취소로도 세지 않음)
T('10. 동일 반품 사건 취소·반품 중복 0(취소0+반품1=1)', (s2.orderUniverse.cancelledOrders + s2.orderUniverse.returnReceivedOrders) === 1, `cancel+return=${s2.orderUniverse.cancelledOrders + s2.orderUniverse.returnReceivedOrders}`);

console.log('');
console.log('  --- 실제 2년치 (RED→GREEN 11~12·14) ---');
const rf = globalThis.fetch;
process.env.GODOMALL_API_MODE = 'real'; process.env.GODOMALL_PARTNER_KEY = 'k'; process.env.GODOMALL_USER_KEY = 'k'; process.env.GODOMALL_REAL_BASE_URL = 'http://127.0.0.1:9';
globalThis.fetch = async () => { throw new Error('down'); };
let cC; try { cC = await RES.resolveOrdersRevenue({ includeSynthetic: true }); } finally { globalThis.fetch = rf; }
const toLite = (o) => ({ orderNo: String(o.orderNo), sourceType: o.sourceType, deliveryFee: o.deliveryFee, totalAmount: o.totalAmount, productRevenueByLines: o.productRevenueByLines, paid: o.state.paid, unpaid: o.state.unpaid, confirmed: o.state.confirmed, canceled: o.state.canceled, shipped: o.state.shipped, delivered: o.state.delivered, lines: (o.lines || []).map((l) => ({ lineRevenue: l.lineRevenue, quantity: l.quantity })), claim: o.claimSummary ? { ...o.claimSummary } : undefined });
const rev = { count: cC.count, source: cC.source, live: cC.live, realOrdersStatus: cC.realOrdersStatus, syntheticStatus: cC.syntheticStatus, summary: cC.summary, stockImpact: cC.stockImpact, orders: cC.orders.map(toLite) };
const snap = DS.buildDepartmentSourceOfTruthSnapshot(rev);

// 11. 잘못된 반품 81건·완료 환불 3,051,446원 표현 해소 (D-1.2.1 갱신: 완료는 r3 근거만=1,685,274)
T('11. 반품 81→20 · 완료환불=1,685,274(r3만) · 미확정 2,525,945 보존 · 반품 대기 1,366,172',
  snap.orderUniverse.returnReceivedOrders === 20 && snap.revenueUniverse.completedRefundRevenue === 1685274 && snap.claimUniverse.unknownRefundRevenue === 2525945 && snap.revenueUniverse.pendingRefundRevenue === 1366172,
  `return=${snap.orderUniverse.returnReceivedOrders} completed=${snap.revenueUniverse.completedRefundRevenue} unknown=${snap.claimUniverse.unknownRefundRevenue} pending=${snap.revenueUniverse.pendingRefundRevenue}`);
T('11b. 취소 81→37(순수취소) · 이중집계 0(취소37+반품20+환불24+교환12+unknown0=93=claim보유)',
  snap.orderUniverse.cancelledOrders === 37 && (cu(snap).cancelOrders + cu(snap).returnReceivedOrders + cu(snap).refundOnlyOrders + cu(snap).exchangeOrders + cu(snap).unknownClaimOrders) === 93,
  `cancel=${snap.orderUniverse.cancelledOrders} 합=${cu(snap).cancelOrders + cu(snap).returnReceivedOrders + cu(snap).refundOnlyOrders + cu(snap).exchangeOrders + cu(snap).unknownClaimOrders}`);

// 12. 기준값 6종 불변
T('12. 기준값 6종 불변: net 88,116,982 · total 98,363,022 · 주문 1315 · 유효 1182 · 상품 13 · 위험 4',
  snap.operationalRevenue === 88116982 && snap.revenueUniverse.netOrderRevenue === 88116982 && cC.summary.totalAmount === 98363022 && snap.orderUniverse.totalOrders === 1315 && snap.orderUniverse.validOrders === 1182 && snap.productUniverse.productCount === 13 && snap.productUniverse.riskyStockCount === 4,
  `net=${snap.operationalRevenue} total=${cC.summary.totalAmount} orders=${snap.orderUniverse.totalOrders} valid=${snap.orderUniverse.validOrders} prod=${snap.productUniverse.productCount} risk=${snap.productUniverse.riskyStockCount}`);

// 14. 출처(실제/시험/연결 안 됨) 계약 무회귀
const failRev = { count: 0, source: 'godomall', live: false, realOrdersStatus: 'unavailable', syntheticStatus: 'unavailable', summary: null, stockImpact: [], orders: [] };
const snapFail = DS.buildDepartmentSourceOfTruthSnapshot(failRev);
T('14. 출처 계약 무회귀: 시험 sourceMode=synthetic · 연결 안 됨=unavailable', snap.sourceMode === 'synthetic' && snapFail.sourceMode === 'unavailable', `synthetic=${snap.sourceMode} fail=${snapFail.sourceMode}`);

console.log('');
console.log('  --- 무회귀 (RED→GREEN 13) ---');
// 13. 입력자료·원본 상태 무변형 (스냅샷 조립이 입력 orders/claim 을 변형하지 않음)
const inp = [mk({ n: 'K1', claim: { hasClaim: true, claimTypes: ['return', 'cancel'], handleModes: ['b'], rawStatuses: ['b4'], handleCompleteFl: 'y', requestedRefundAmount: 4000 } })];
const before = JSON.stringify(inp);
build(inp);
T('13. 입력 orders/claim 원본 무변형(RAW claimTypes·handleCompleteFl 보존)', JSON.stringify(inp) === before, inp[0].claim.claimTypes.join('/') + ' · completeFl=' + inp[0].claim.handleCompleteFl);

console.log('');
console.log(`--- ${pass} pass / ${fail} fail ---`);
rmSync(outApi, { recursive: true, force: true }); rmSync(outSrc, { recursive: true, force: true });
if (fail > 0) { console.log('\n✗ D-1.2 GREEN A 미충족'); process.exit(1); }
console.log('\n✓ D-1.2 GREEN A — 취소·반품·환불 단일 분류·원본 보존·완료금액 분리, 기준값 6종 불변.');
