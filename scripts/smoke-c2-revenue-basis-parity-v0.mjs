#!/usr/bin/env node
/*
 * scripts/smoke-c2-revenue-basis-parity-v0.mjs
 * RC-1 C-2 실패 재현(RED) — 매출 명명/기준 계약.
 *
 * 목적: 분석 채팅(analyticsQueryEngine)의 "매출"이 대시보드 운영매출(유효주문 결제금액)과
 *   다른 값을 내는 실제 결함을, 실제 두 모듈을 같은 소형 fixture에 돌려 값으로 고정한다.
 *
 * 이 파일은 GREEN 전까지 '의도된 실패(RED)'다. 출력은 두 구획으로 나뉜다:
 *   [BASE]  현재도 통과해야 하는 기준선(불변). 여기서 FAIL이 나면 회귀다.
 *   [RED]   계약이 요구하는 목표. 현재는 미충족(실패)이며 GREEN에서 충족되어야 한다.
 * 종료코드: BASE fail>0 → 즉시 회귀(치명), 또는 RED 미충족>0 → RED 상태로 exit 1.
 *
 * 계약(사장 승인):
 *   - 기본 "매출" = 유효주문 결제금액(취소·미결제 제외) = operationalRevenue(netOrderRevenue 기준) = 39,500
 *   - 현행 analytics "매출" = 전체 라인합(취소+미결제 포함) = 50,000  → 12,000(취소5,000+미결제7,000) 부풀림
 *   - 상품매출(유효·라인·배송비 제외) = 38,000 은 별도 지표로 유지
 *   - 환불은 현재 어떤 지표에도 정상 반영되지 않는다(환불 미반영 한계 유지). '순매출'을 실제값처럼 쓰지 않는다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'c2-red-'));
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'analyticsQueryEngine.ts'),
    path.join(REPO, 'src', 'services', 'revenueMetricContract.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const A = await import(pathToFileURL(path.join(tmp, 'analyticsQueryEngine.js')).href);
const R = await import(pathToFileURL(path.join(tmp, 'revenueMetricContract.js')).href);

// ── 소형 fixture (AnalyticsOrder = revenueMetricContract MetricOrderLike 겸용) ──
const mkOrder = (orderNo, paid, canceled, line, totalAmount, deliveryFee = 0, claimAmount = 0) => ({
  orderNo, orderDate: '2025-06-10', totalAmount, productRevenueByLines: line, deliveryFee,
  paid, canceled, paymentMethodCode: 'card', orderChannel: 'shop',
  claim: claimAmount ? { hasClaim: true, claimTypes: ['refund'], claimAmount } : undefined,
  lines: [{ goodsNo: 'G1', goodsName: '샘플', quantity: 1, lineRevenue: line, categoryCode: '001' }]
});
const F = [
  mkOrder('O1', true,  false, 10000, 11500, 2500, 0),    // 유효 + 할인1,000 + 배송비2,500 → settle 11,500
  mkOrder('O2', true,  false, 20000, 20000, 0,    0),    // 유효(단순)
  mkOrder('O3', true,  true,  5000,  5000,  0,    0),    // 취소
  mkOrder('O4', false, false, 7000,  7000,  0,    0),    // 미결제
  mkOrder('O5', true,  false, 8000,  8000,  0,    3000), // 유효 + 환불(클레임)3,000
];
const ds = { orders: F, source: { dataKind: 'synthetic' } };

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}`); c ? baseP++ : baseF++; };
const red  = (n, c, cur) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? '' : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };

console.log('=== C-2 매출 기준 정합성 (RED) ===');

// ── [BASE] 현재도 참이고 GREEN 후에도 참이어야 하는 기준선 ──
const NET = R.computeNetOrderRevenue(F);       // 유효주문 결제금액 = Σ totalAmount(유효)
const GROSS = R.computeGrossProductRevenue(F); // 전체 라인합(=주문발생금액 basis)
const productValidLine = F.filter((o) => R.isValidOrder(o)).reduce((s, o) => s + o.lines.reduce((a, l) => a + l.lineRevenue, 0), 0);
const excludedLine = F.filter((o) => !R.isValidOrder(o)).reduce((s, o) => s + o.lines.reduce((a, l) => a + l.lineRevenue, 0), 0);
base('1. 유효주문 결제금액(netOrderRevenue) = 39,500', NET === 39500);
base('2. 전체 라인합(grossProductRevenue) = 50,000', GROSS === 50000);
// 12,000은 '취소+미결제 주문의 라인합'이다(라인 기준 분해). GROSS−NET(=10,500)와는 다르다.
base('3. 취소+미결제 주문 라인합 = 12,000 = 취소(5,000) + 미결제(7,000)', excludedLine === 12000 && excludedLine === 5000 + 7000);
base('4. 전체 라인합 분해: 50,000 = 유효 라인(38,000) + 취소·미결제 라인(12,000)', GROSS === productValidLine + excludedLine);
base('5. 상품매출(유효·라인·배송비 제외) = 38,000, 유효주문 결제금액(39,500)과 별개', productValidLine === 38000 && productValidLine !== NET);
// 유효주문 결제금액이 유효 라인보다 배송비−할인만큼 크다 → 순차이(현행 50,000 vs 계약 39,500)=10,500
base('6. 유효결제 − 유효라인 = +1,500 (배송비 2,500 − 할인 1,000)', NET - productValidLine === 1500);
base('7. 할인 반영 잠금: O1 유효결제금액 11,500 (할인 −1,000·배송비 +2,500 반영)', R.computeNetOrderRevenue([F[0]]) === 11500);
base('8. 환불 미반영 잠금: O5는 유효결제금액에 전액 8,000 계상(3,000 미차감)', R.computeNetOrderRevenue([F[4]]) === 8000);
base('9. 현행 라인기준 매출(50,000) − 계약 유효결제(39,500) = 10,500 (취소·미결제 라인 12,000 − 유효 배송비·할인 순증 1,500)', GROSS - NET === 10500 && excludedLine - (NET - productValidLine) === 10500);

// ── 현행 analytics 값 재현(참고 출력) ──
const rev = A.runAnalyticsQuery(ds, { metric: 'revenue' });
const revTotal = rev.summary.total;
const aov = A.runAnalyticsQuery(ds, { metric: 'averageOrderValue' });
const aovVal = aov.rows[0]?.value;
console.log(`  · 현행 analytics "매출" 총합 = ${revTotal} (재현)`);
console.log(`  · 현행 analytics 객단가 = ${aovVal} (재현)`);

// ── [RED] 계약 목표: 현재 실패, GREEN에서 충족 ──
red('A. analytics "매출" 총합 = 유효주문 결제금액 39,500 (취소·미결제 제외)', revTotal === 39500, revTotal);
red('B. analytics 객단가 = 유효결제 39,500 ÷ 유효주문수 3 = 13,167', aovVal === Math.round(39500 / 3), aovVal);
const revLabel = A.getAnalyticsMetric('revenue')?.labelKo;
red('C. "매출" 라벨이 유효주문 결제금액/운영매출로 명확(맨숫자 "매출" 금지)', !!revLabel && revLabel !== '매출' && /유효주문 결제금액|운영매출/.test(revLabel), JSON.stringify(revLabel));
const netLabel = A.getAnalyticsMetric('netRevenue')?.labelKo;
red('D. netRevenue 라벨에 "순매출" 미사용(환불 원천 부재 — 실제값처럼 금지)', !!netLabel && !/순매출/.test(netLabel), JSON.stringify(netLabel));

console.log(`\n--- 요약 ---`);
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (기준선 — fail>0이면 회귀)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (계약 목표 — GREEN 전이므로 unmet>0 정상)`);

rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 기준선 회귀 발생 — 치명'); process.exit(2); }
if (redUnmet > 0) { console.log('\n● RED 상태(의도된 실패) — GREEN 구현에서 위 [RED] 항목이 MET 되어야 한다.'); process.exit(1); }
console.log('\n✓ 전부 충족 — GREEN 도달'); process.exit(0);
