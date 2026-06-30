#!/usr/bin/env node
/*
 * scripts/audit-cross-team-revenue-metrics-v0.mjs
 * 상품관리팀 vs 마케팅팀 매출/주문 metric 차이의 원인을 실데이터(synthetic universe)로 추적.
 *  - 마케팅: buildMarketingAnalysisFacts(net 유효 주문 totalAmount).
 *  - revenueMetricContract로 전체/유효 주문·순매출을 계산해 두 축(주문 포함범위 / 매출 기준) 차이를 정량화.
 * 진단 전용 — 데이터/계산을 바꾸지 않는다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-audit-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-audit-src-'));
const won = (n) => `${Math.round(n).toLocaleString('en-US')}원`;

try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--outDir', tmpApi, '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingAnalysisFacts.ts'),
    '--outDir', tmpSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
} catch (e) { console.error('[audit] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const F = await import(pathToFileURL(path.join(tmpSrc, 'marketingAnalysisFacts.js')).href);
const C = await import(pathToFileURL(path.join(tmpSrc, 'revenueMetricContract.js')).href);

const products = Array.from({ length: 20 }, (_, i) => ({
  productId: String(1001 + i), productCode: 'A-' + (1001 + i), productName: '상품' + i,
  price: 12000 + i * 1500, fixedPrice: 15000 + i * 1500, stock: 0, stockEnabled: false, soldOut: false,
  displayPc: true, displayMobile: true, sellPc: true, sellMobile: true,
  categoryCode: String(3 + (i % 5)).padStart(3, '0'), allCategoryCode: String(3 + (i % 5)).padStart(3, '0'),
  brandCode: String(1 + (i % 3)).padStart(3, '0'), registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: ''
}));
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });
const orders = u.orders;
const nowMs = Date.parse('2026-06-27T00:00:00');
const facts = F.buildMarketingAnalysisFacts({ orders, products, reviews: u.reviews, inquiries: u.inquiries, period: { preset: 'all' }, nowMs });

const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };

// 전체/유효 (revenueMetricContract 기준)
const countAll = C.countAllOrders(orders);
const countValid = C.countValidOrders(orders);
const netRevenue = C.computeNetOrderRevenue(orders);                 // 유효 주문 totalAmount 합
const grossAllTotalAmount = orders.reduce((s, o) => s + num(o.totalAmount), 0); // 전체 주문 totalAmount 합

// 상태별 분해
const tally = {};
for (const o of orders) {
  const k = o.state ? (o.state.canceled ? 'canceled' : (o.state.paid ? 'paid' : 'unpaid')) : 'unknown';
  if (!tally[k]) tally[k] = { count: 0, amount: 0 };
  tally[k].count += 1; tally[k].amount += num(o.totalAmount);
}

// 마케팅(net) = facts.summary
const mkt = facts.summary;

console.log('=== Cross-Team Revenue Metric Audit v0 (synthetic universe seed=42) ===\n');

console.log('Product Dashboard (상품관리팀):');
console.log('  source: ProductTeamDashboard.kpi — Σ lineRevenue(배송비 제외) · relevantOrders.length');
console.log('  revenue basis: grossProductRevenue (상품 라인합, 취소·미입금·가상 포함)');
console.log(`  orderCount(전체): ${countAll}`);
console.log(`  revenue(전체 주문 총액 비교용): ${won(grossAllTotalAmount)}  ※ 실제 화면은 라인합(배송비 제외)이라 더 작을 수 있음`);
console.log('  included statuses: paid · unpaid · canceled (전체)');
console.log('  excluded statuses: 없음');
console.log('  data mode: 실제 + synthetic_test 포함\n');

console.log('Marketing Dashboard (마케팅팀):');
console.log('  source: buildMarketingAnalysisFacts.summary — Σ totalAmount over isValidOrder');
console.log('  revenue basis: netOrderRevenue (유효 주문 결제완료·미취소 주문총액)');
console.log(`  orderCount(유효): ${mkt.orderCount}`);
console.log(`  revenue(유효 순매출): ${won(mkt.totalRevenue)}`);
console.log(`  averageOrderValue: ${won(mkt.averageOrderValue)} (= netRevenue ÷ orderCountValid)`);
console.log('  included statuses: paid & !canceled (유효)');
console.log('  excluded statuses: canceled · unpaid\n');

console.log('Contract cross-check (revenueMetricContract):');
console.log(`  countValid: ${countValid}  (facts.orderCount=${mkt.orderCount}) → ${countValid === mkt.orderCount ? 'MATCH' : 'MISMATCH'}`);
console.log(`  netRevenue: ${won(netRevenue)}  (facts.totalRevenue=${won(mkt.totalRevenue)}) → ${netRevenue === mkt.totalRevenue ? 'MATCH' : 'MISMATCH'}\n`);

console.log('Status breakdown:');
for (const [k, v] of Object.entries(tally)) console.log(`  ${k.padEnd(9)} count=${v.count}  amount=${won(v.amount)}`);
console.log('');

console.log('Diff (전체 vs 유효):');
console.log(`  order count diff: ${countAll - countValid}건 (전체 ${countAll} − 유효 ${countValid}) = 취소+미입금`);
console.log(`  revenue diff(totalAmount 기준): ${won(grossAllTotalAmount - netRevenue)} (취소+미입금 주문 금액)`);
console.log('  likely cause:');
console.log('    [축1] 주문 포함범위 — 상품팀=전체 주문 / 마케팅팀=유효 주문(결제완료·미취소). 취소·미입금만큼 마케팅이 적음.');
console.log('    [축2] 매출 기준 — 상품팀=상품 라인합(배송비 제외) / 마케팅팀=주문 총액. 같은 주문이어도 기준이 달라 금액이 다름.');
console.log('    → 버그가 아니라 의도된 다른 관점. 공통 정의는 revenueMetricContract에 두고, 라벨/보조문구로 기준을 명시한다.');

rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
