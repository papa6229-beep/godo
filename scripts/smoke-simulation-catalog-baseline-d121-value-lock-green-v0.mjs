#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-d121-value-lock-green-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 D-1.2.1 B-2 — 계산 의미·기준값 값-잠금(S29 대체용)
 *
 * S29 를 "파일명 커밋 감시"에서 "계산 의미·기준값 회귀검사"로 대체하기 위한 의미 가드.
 * 작고 손으로 계산 가능한 RAW 고도몰 fixture 를 **실제 제품 파이프라인**에 태운다:
 *   RAW → mapOrdersToRevenue → summarizeRevenue → RevenueOrderLite → buildDepartmentSourceOfTruthSnapshot
 * 그 산출값을 손계산 기대값과 비교한다(계산식을 검사에 복사하지 않는다). 이전에 무보호였던
 * deliveryFeeTotal/shippingRevenue·gross(productRevenueByLines)·canceledOrderCount·완료/대기/미확인
 * 환불 등을 값으로 잠근다.
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
console.log('=== D-1.2.1 B-2 — 계산 의미·기준값 값-잠금(실제 파이프라인) ===');

// ── 컴파일: api(mapOrdersToRevenue/summarizeRevenue) + src(DS+분류기) ──────────
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const outApi = mkdtempSync(path.join(cacheRoot, 'd121vl-api-'));
const outApiUnix = outApi.replace(/\\/g, '/');
const cfg = path.join(outApi, 'tsconfig.json');
writeFileSync(cfg, JSON.stringify({ compilerOptions: { target: 'ES2023', lib: ['ES2023'], module: 'NodeNext', moduleResolution: 'NodeNext', types: ['node'], strict: false, strictNullChecks: true, skipLibCheck: true, esModuleInterop: true, outDir: outApiUnix, rootDir: `${REPO}/api`, noEmit: false, noEmitOnError: false }, include: [`${REPO}/api/_shared/**/*.ts`] }));
writeFileSync(path.join(outApi, 'package.json'), JSON.stringify({ type: 'module' }));
try { execFileSync(process.execPath, [TSC, '-p', cfg, '--pretty', 'false'], { cwd: REPO, stdio: 'pipe' }); } catch {}
const REV = await import(pathToFileURL(path.join(outApi, '_shared', 'godomallRevenue.js')).href);
const outSrc = mkdtempSync(path.join(os.tmpdir(), 'd121vl-src-'));
execFileSync(process.execPath, [TSC,
  path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'), path.join(REPO, 'src', 'services', 'revenueMetricContract.ts'),
  path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'), path.join(REPO, 'src', 'services', 'inquiryStatusContract.ts'),
  path.join(REPO, 'src', 'services', 'revenueScreenState.ts'), path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts'),
  path.join(REPO, 'src', 'services', 'claimEventContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) { const p = path.join(outSrc, f); writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`))); }
const DS = await import(pathToFileURL(path.join(outSrc, 'departmentDataSourceOfTruth.js')).href);

// ── RAW 고도몰 fixture (작고 손검산 가능·익명) ────────────────────────────────
const DT = '2026-07-01 10:00:00', ZERO = '0000-00-00 00:00:00';
const line = (goodsNo, price, cnt, st) => ({ goodsNo: String(goodsNo), goodsCd: 'C' + goodsNo, goodsNm: '상품' + goodsNo, goodsPrice: String(price), goodsCnt: String(cnt), orderStatus: st });
const raw = [
  // O1 정상 유효(결제·배송) — line 5000×2=10000, 배송 2000, settle 12000
  { orderNo: 'O1', orderStatus: 'd2', settlePrice: '12000', totalDeliveryCharge: '2000', totalGoodsPrice: '10000', paymentDt: DT, invoiceDt: DT, deliveryCompleteDt: DT, orderGoodsData: [line(1, 5000, 2, 'd2')] },
  // O2 미결제(o1) — line 6000×1, 배송 2500, settle 8000
  { orderNo: 'O2', orderStatus: 'o1', settlePrice: '8000', totalDeliveryCharge: '2500', totalGoodsPrice: '6000', paymentDt: ZERO, orderGoodsData: [line(2, 6000, 1, 'o1')] },
  // O3 취소(c4)+처리완료y(r3 없음) — 결제됨·cancelDt · refundPrice 6000 · line 7000×1
  { orderNo: 'O3', orderStatus: 'c4', settlePrice: '7000', totalDeliveryCharge: '1000', totalGoodsPrice: '7000', paymentDt: DT, cancelDt: DT, orderGoodsData: [{ ...line(3, 7000, 1, 'c4'), claimData: { handleMode: 'c', handleCompleteFl: 'y', refundPrice: '6000', handleDt: DT } }] },
  // O4 반품(b4 회수완료)+처리완료y(r3 없음) — 결제·배송·cancelDt · refundPrice 8000 · line 9000×1
  { orderNo: 'O4', orderStatus: 'b4', settlePrice: '9000', totalDeliveryCharge: '0', totalGoodsPrice: '9000', paymentDt: DT, invoiceDt: DT, deliveryCompleteDt: DT, cancelDt: DT, orderGoodsData: [{ ...line(4, 9000, 1, 'b4'), claimData: { handleMode: 'b', handleCompleteFl: 'y', refundPrice: '8000', handleDt: DT } }] },
  // O5 환불완료(r3) — 결제·cancelDt · refundPrice 5000 · line 5000×1
  { orderNo: 'O5', orderStatus: 'r3', settlePrice: '5000', totalDeliveryCharge: '500', totalGoodsPrice: '5000', paymentDt: DT, invoiceDt: DT, cancelDt: DT, orderGoodsData: [{ ...line(5, 5000, 1, 'r3'), claimData: { handleMode: 'r', handleCompleteFl: 'y', refundPrice: '5000', handleDt: DT } }] }
];
// 손검산:
//   deliveryFeeTotal=2000+2500+1000+0+500=6000 · totalAmount(settle)=12000+8000+7000+9000+5000=41000
//   gross(Σ line goodsPrice×cnt)=10000+6000+7000+9000+5000=37000
//   paid(paymentDt유효&&≠o1)=O1,O3,O4,O5=4 · unpaid=O2=1 · canceled(cancelDt)=O3,O4,O5=3
//   valid(paid&&!canceled)=O1=1 · net(유효 settle)=12000
//   eventKind: O3 cancel · O4 return · O5 refund_only
//   완료환불(r3만)=O5 5000 · 대기(반품 b4)=O4 8000 · 미확인(취소 처리완료·비r3)=O3 6000 · 요청합=19000

const products = REV.buildProductIndex([]);
const orders = REV.mapOrdersToRevenue(raw, products, 'synthetic_test');
const summary = REV.summarizeRevenue(orders);
const toLite = (o) => ({ orderNo: String(o.orderNo), sourceType: o.sourceType, deliveryFee: o.deliveryFee, totalAmount: o.totalAmount, productRevenueByLines: o.productRevenueByLines, paid: o.state.paid, unpaid: o.state.unpaid, confirmed: o.state.confirmed, canceled: o.state.canceled, shipped: o.state.shipped, delivered: o.state.delivered, lines: (o.lines || []).map((l) => ({ lineRevenue: l.lineRevenue, quantity: l.quantity })), claim: o.claimSummary ? { ...o.claimSummary } : undefined });
const snap = DS.buildDepartmentSourceOfTruthSnapshot({ count: orders.length, source: 'godomall', live: false, realOrdersStatus: 'success', syntheticStatus: 'success', summary, stockImpact: [], orders: orders.map(toLite) });
const ru = snap.revenueUniverse, ou = snap.orderUniverse, cuv = snap.claimUniverse;

console.log('');
console.log('  --- 보호 범위 값-잠금(손계산 vs 제품) ---');
// 매출 계산식(summarizeRevenue / mapLine)
T('V1. totalAmount(전체 주문금액)=41000', summary.totalAmount === 41000, `got=${summary.totalAmount}`);
T('V2. productRevenueByLines(gross, mapLine)=37000', summary.productRevenueByLines === 37000, `got=${summary.productRevenueByLines}`);
T('V3. deliveryFeeTotal=6000 · shippingRevenue=6000(동일)', summary.deliveryFeeTotal === 6000 && ru.shippingRevenue === 6000, `fee=${summary.deliveryFeeTotal} ship=${ru.shippingRevenue}`);
T('V4. gross(DS grossProductRevenue)=37000', ru.grossProductRevenue === 37000, `got=${ru.grossProductRevenue}`);
// 주문 수 계산식
T('V5. summary paid=4 · unpaid=1 · canceled=3', summary.paidOrderCount === 4 && summary.unpaidOrderCount === 1 && summary.canceledOrderCount === 3, `paid=${summary.paidOrderCount} unpaid=${summary.unpaidOrderCount} canceled=${summary.canceledOrderCount}`);
T('V6. DS totalOrders=5 · validOrders=1 · unpaidOrders=1', ou.totalOrders === 5 && ou.validOrders === 1 && ou.unpaidOrders === 1, `total=${ou.totalOrders} valid=${ou.validOrders} unpaid=${ou.unpaidOrders}`);
T('V7. net(operationalRevenue, 유효 주문)=12000', snap.operationalRevenue === 12000 && ru.netOrderRevenue === 12000, `net=${snap.operationalRevenue}`);
// 클레임 분류(취소·반품 분리)
T('V8. cancelledOrders(취소만)=1 · returnReceivedOrders(반품만)=1 · refundOnly=1 · exchange=0 · unknown=0', ou.cancelledOrders === 1 && ou.returnReceivedOrders === 1 && cuv.refundOnlyOrders === 1 && cuv.exchangeOrders === 0 && cuv.unknownClaimOrders === 0, `c=${ou.cancelledOrders} r=${ou.returnReceivedOrders} f=${cuv.refundOnlyOrders}`);
// 환불 완료/대기/미확인 구별 (D-1.2.1 핵심)
T('V9. completedRefundRevenue=5000 (r3만) · O3 취소·O4 반품은 완료 아님', ru.completedRefundRevenue === 5000 && cuv.completedRefundCount === 1, `completed=${ru.completedRefundRevenue} cnt=${cuv.completedRefundCount}`);
T('V10. pendingRefundRevenue=8000(반품 b4) · unknownRefundRevenue=6000(취소 처리완료·비환불완료)', ru.pendingRefundRevenue === 8000 && cuv.unknownRefundRevenue === 6000, `pending=${ru.pendingRefundRevenue} unknown=${cuv.unknownRefundRevenue}`);
T('V11. requestedRefundAmount=19000 = completed5000+pending8000+unknown6000(금액 소실 없음)', ru.requestedRefundAmount === 19000 && (ru.completedRefundRevenue + ru.pendingRefundRevenue + cuv.unknownRefundRevenue) === 19000, `req=${ru.requestedRefundAmount}`);
// 원본 보존(바이트 수준): rawClaim/handleCompleteFl 보존, 완료 오단정 없음
T('V12. RAW 보존: O3 claim handleCompleteFl=y 보존 · refundStatus 미완료(완료 오단정 0)', orders[2].claimSummary.handleCompleteFl === 'y' && cuv.unknownRefundCount === 1, `completeFl=${orders[2].claimSummary.handleCompleteFl} unknownCnt=${cuv.unknownRefundCount}`);

console.log('');
console.log(`--- ${pass} pass / ${fail} fail ---`);
rmSync(outApi, { recursive: true, force: true }); rmSync(outSrc, { recursive: true, force: true });
if (fail > 0) { console.log('\n✗ 계산 의미·기준값 회귀(값 검사 실패)'); process.exit(1); }
console.log('\n✓ D-1.2.1 B-2 값-잠금 — 매출·주문·배송·클레임 계산 의미 불변(S29 의미 가드).');
