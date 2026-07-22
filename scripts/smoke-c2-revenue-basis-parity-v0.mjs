#!/usr/bin/env node
/*
 * scripts/smoke-c2-revenue-basis-parity-v0.mjs
 * RC-1 C-2 실패 재현(RED) — 매출 명명/기준 계약. 실제 모듈을 소형 fixture에 돌려 값으로 잠근다.
 *
 * 하위 계약(사장 승인):
 *   · 헤드라인·결제수단·채널·고객군·성장률·기간비교 = 유효주문 결제금액(취소·미결제 제외, Σ totalAmount)
 *   · 상품·카테고리·브랜드 = 유효주문의 상품 라인 매출(취소·미결제 제외, 배송비·주문할인 임의배분 금지)
 *   · 두 기준 모두 취소·미결제 제외. 유효결제 39,500 ≠ 상품매출 38,000 은 오류가 아니라 서로 다른 계약.
 *   · 환불 미반영. '순매출' 실제값처럼 금지.
 *
 * 출력 구획:  [BASE] 현재도·GREEN 후에도 참(불변). FAIL이면 회귀(치명, exit 2).
 *            [RED ] 계약 목표. GREEN 전 미충족(정상). unmet>0 → exit 1.
 * fixture 값: 유효 O1(결제11,500·라인10,000)+O2(20,000·20,000)+O5(8,000·8,000)=결제39,500/라인38,000
 *            취소 O3(라인5,000)·미결제 O4(라인7,000) → 라인합 50,000, 제외 라인 12,000.
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

// ── fixture ──
const mk = (orderNo, paid, canceled, line, totalAmount, opt) => ({
  orderNo, orderDate: '2025-06-10', totalAmount, productRevenueByLines: line, deliveryFee: opt.ship || 0,
  paid, canceled, paymentMethodCode: opt.pay, orderChannel: opt.ch, memberKey: opt.mem,
  claim: opt.claim ? { hasClaim: true, claimTypes: ['refund'], claimAmount: opt.claim } : undefined,
  lines: [{ goodsNo: opt.g, goodsName: opt.g, quantity: 1, lineRevenue: line, categoryCode: opt.cat, brandCode: opt.brand }]
});
const F = [
  mk('O1', true,  false, 10000, 11500, { ship: 2500, pay: 'card', ch: 'shop',  mem: 'M1', g: 'G1', cat: '001', brand: 'B1' }),
  mk('O2', true,  false, 20000, 20000, { pay: 'card', ch: 'naver', mem: 'M2', g: 'G2', cat: '002', brand: 'B2' }),
  mk('O3', true,  true,  5000,  5000,  { pay: 'card', ch: 'shop',  mem: 'M3', g: 'G3', cat: '003', brand: 'B3' }), // 취소
  mk('O4', false, false, 7000,  7000,  { pay: 'bank', ch: 'naver', mem: 'M2', g: 'G4', cat: '004', brand: 'B4' }), // 미결제
  mk('O5', true,  false, 8000,  8000,  { claim: 3000, pay: 'bank', ch: 'shop', mem: 'M1', g: 'G1', cat: '001', brand: 'B1' }),
];
const customers = [
  { memberKey: 'M1', segment: 'VIP', orderCount: 2, totalPaidAmount: 19500 },
  { memberKey: 'M2', segment: 'NEW', orderCount: 2, totalPaidAmount: 20000 },
  { memberKey: 'M3', segment: 'NEW', orderCount: 1, totalPaidAmount: 5000 },
];
const ds = { orders: F, customers, source: { dataKind: 'synthetic' } };
const q = (metric, extra = {}) => A.runAnalyticsQuery(ds, { metric, ...extra });
const sumRev = (res) => res.rows.reduce((s, r) => s + (r.revenue || 0), 0);
const keys = (res) => res.rows.map((r) => r.key);

// 비교기간 fixture(취소를 한쪽 기간에만): 5월 유효 20,000 / 6월 유효 20,000 + 취소 30,000
const G = [
  mk('MA', true, false, 20000, 20000, { pay: 'card', ch: 'shop', mem: 'M1', g: 'G1', cat: '001', brand: 'B1' }),
  mk('MB', true, false, 20000, 20000, { pay: 'card', ch: 'shop', mem: 'M1', g: 'G1', cat: '001', brand: 'B1' }),
  mk('MC', true, true,  30000, 30000, { pay: 'card', ch: 'shop', mem: 'M1', g: 'G1', cat: '001', brand: 'B1' }),
];
G[0].orderDate = '2025-05-10'; G[1].orderDate = '2025-06-10'; G[2].orderDate = '2025-06-20';
const dsG = { orders: G, customers, source: { dataKind: 'synthetic' } };

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}`); c ? baseP++ : baseF++; };
const red  = (n, c, cur) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? '' : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
// revenueShare는 r.value에 원매출을 유지하고 비중(%)은 valueLabel("70.0%")에 둔다.
const near100 = (res) => { const s = res.rows.reduce((a, r) => a + (parseFloat(r.valueLabel) || 0), 0); return Math.abs(s - 100) < 1.0; };

console.log('=== C-2 매출 기준 정합성 (RED, 확장) ===');

// ── [BASE] 모듈·fixture 불변 ──
const NET = R.computeNetOrderRevenue(F), GROSS = R.computeGrossProductRevenue(F);
const validLine = F.filter((o) => R.isValidOrder(o)).reduce((s, o) => s + o.lines.reduce((a, l) => a + l.lineRevenue, 0), 0);
const exclLine  = F.filter((o) => !R.isValidOrder(o)).reduce((s, o) => s + o.lines.reduce((a, l) => a + l.lineRevenue, 0), 0);
base('B1. 유효주문 결제금액 = 39,500', NET === 39500);
base('B2. 유효주문 수 = 3', R.countValidOrders(F) === 3);
base('B3. 전체 주문 수 = 5', R.countAllOrders(F) === 5);
base('B4. 전체 라인합 50,000 = 유효라인 38,000 + 취소·미결제 라인 12,000', GROSS === 50000 && validLine === 38000 && exclLine === 12000 && GROSS === validLine + exclLine);
base('B5. 취소·미결제 라인 12,000 = 취소 5,000 + 미결제 7,000', exclLine === 5000 + 7000);
base('B6. 유효결제 39,500 − 상품매출 38,000 = 1,500 (배송비 2,500 − 할인 1,000) · 서로 다른 계약', NET - validLine === 1500);
base('B7. 환불 미반영: O5 유효결제 전액 8,000 계상', R.computeNetOrderRevenue([F[4]]) === 8000);

// ── [RED] 계약 목표 ──
// 1) 헤드라인 매출 & 객단가(분모 3)
const rev = q('revenue');
red('R1. 헤드라인 매출 총합 = 39,500 (유효결제)', rev.summary.total === 39500, rev.summary.total);
const aov = q('averageOrderValue');
red('R2. 객단가 = 39,500 ÷ 3 = 13,167 (분모 유효주문 3)', aov.rows[0]?.value === Math.round(39500 / 3), aov.rows[0]?.value);
red('R3. 유효주문 수 지표 = 3 (취소·미결제 제외)', q('orderCount').rows[0]?.value === 3, q('orderCount').rows[0]?.value);
// 2) 결제수단·채널·고객군 = 각 39,500
red('R4. 결제수단별 매출 합계 = 39,500', q('paymentMethodRevenue').summary.total === 39500, q('paymentMethodRevenue').summary.total);
red('R5. 주문채널별 매출 합계 = 39,500', q('orderChannelRevenue').summary.total === 39500, q('orderChannelRevenue').summary.total);
red('R6. 고객군별 매출 합계 = 39,500', q('customerSegmentRevenue').summary.total === 39500, q('customerSegmentRevenue').summary.total);
// 3~4) 상품·카테고리·브랜드 = 38,000, 취소·미결제 라인 제외(003/004·G3/G4 없음)
const prod = q('productRevenue'), cat = q('categoryRevenue'), brand = q('brandRevenue');
red('R7. 상품별 매출 합계 = 38,000', prod.summary.total === 38000, prod.summary.total);
red('R8. 상품축에 취소/미결제 상품(G3·G4) 없음', !keys(prod).includes('G3') && !keys(prod).includes('G4'), keys(prod).join(','));
red('R9. 카테고리별 매출 = 38,000 & 003·004 없음', cat.summary.total === 38000 && !keys(cat).includes('003') && !keys(cat).includes('004'), `${cat.summary.total}/${keys(cat).join(',')}`);
red('R10. 브랜드별 매출 = 38,000 & B3·B4 없음', brand.summary.total === 38000 && !keys(brand).includes('B3') && !keys(brand).includes('B4'), `${brand.summary.total}/${keys(brand).join(',')}`);
// 5~6) revenueShare: 주문기준 분모 39,500 / 상품기준 분모 38,000, 각 합계 100%
const shareOrder = q('revenueShare', { groupBy: 'paymentMethod' });
const shareLine  = q('revenueShare', { groupBy: 'category' });
red('R11. 주문기준 비중 분모 = 39,500', sumRev(shareOrder) === 39500, sumRev(shareOrder));
base('B8. 주문기준 비중 합계 ≈ 100%', near100(shareOrder));
red('R12. 상품기준 비중 분모 = 38,000 & 003·004 제외', sumRev(shareLine) === 38000 && !keys(shareLine).includes('003') && !keys(shareLine).includes('004'), `${sumRev(shareLine)}/${keys(shareLine).join(',')}`);
base('B9. 상품기준 비중 합계 ≈ 100%', near100(shareLine));
// 7) 성장률·기간비교 왜곡(취소를 6월에만): 계약은 0%, 현행은 +150%
const growth = A.runAnalyticsQuery(dsG, { metric: 'salesGrowthRate' });
const juneRow = growth.rows.find((r) => r.key === '2025-06');
red('R13. 성장률: 6월 = 0% (취소 30,000 제외 → 5월20,000=6월20,000)', juneRow && juneRow.value === 0, juneRow && juneRow.value);
const pc = A.runAnalyticsQuery(dsG, { metric: 'periodComparison', startDate: '2025-06-01', endDate: '2025-06-30', compareTo: { startDate: '2025-05-01', endDate: '2025-05-31', label: '5월' } });
const cur = pc.rows.find((r) => r.key === 'current');
red('R14. 기간비교: 6월 매출 = 20,000 (취소 제외)', cur && cur.value === 20000, cur && cur.value);
// 8) 라벨 계약: 주문 단위 = 유효주문 결제금액/운영매출, 상품 단위 = 상품매출, 순매출 금지
const revLabel = A.getAnalyticsMetric('revenue')?.labelKo, prodLabel = A.getAnalyticsMetric('productRevenue')?.labelKo, netLabel = A.getAnalyticsMetric('netRevenue')?.labelKo;
red('R15. 주문 매출 라벨 = 유효주문 결제금액/운영매출 (맨숫자 "매출" 금지)', !!revLabel && /유효주문 결제금액|운영매출/.test(revLabel), JSON.stringify(revLabel));
red('R16. 상품 매출 라벨에 "상품" 포함(주문 매출과 구분)', !!prodLabel && /상품/.test(prodLabel) && prodLabel !== revLabel, JSON.stringify(prodLabel));
red('R17. netRevenue 라벨에 "순매출" 미사용', !!netLabel && !/순매출/.test(netLabel), JSON.stringify(netLabel));

console.log(`\n--- 요약 ---`);
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (기준선 — fail>0이면 회귀)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (계약 목표 — GREEN 전이므로 unmet>0 정상)`);

rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 기준선 회귀 — 치명'); process.exit(2); }
if (redUnmet > 0) { console.log('\n● RED 상태(의도된 실패) — GREEN에서 위 [RED] 전부 MET 되어야 한다.'); process.exit(1); }
console.log('\n✓ 전부 충족 — GREEN 도달'); process.exit(0);
