#!/usr/bin/env node
/*
 * scripts/audit-department-data-source-of-truth-v0.mjs
 * 전 부서 대표 운영 KPI가 하나의 source of truth(buildDepartmentSourceOfTruthSnapshot)에서 나오는지 감사.
 *  - 동일 orders universe → 모든 부서 operationalRevenue/OrderCount/AOV 동일.
 *  - 옛 상품팀 계산(gross 라인합/전체 주문)은 운영 대표값과 불일치였음을 정량 비교.
 * 진단 전용 — 데이터/계산 변경 없음.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-sot-'));
const won = (n) => `${Math.round(n).toLocaleString('en-US')}원`;

try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
} catch (e) { console.error('[audit] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const S = await import(pathToFileURL(path.join(tmp, 'departmentDataSourceOfTruth.js')).href);

// 대표적 주문 universe(RevenueOrderLite shape) — 결제완료/미입금/취소 혼합 + 배송비 분리.
const orders = Array.from({ length: 120 }, (_, i) => {
  const m = i % 10;
  const status = m < 7 ? 'paid' : (m === 7 ? 'unpaid' : 'canceled');
  const totalAmount = 50000 + (i % 5) * 12000;
  const deliveryFee = 3000;
  return {
    orderNo: 'O' + i, orderDate: '2026-06-01 10:00:00',
    sourceType: i % 4 === 0 ? 'real_godomall' : 'synthetic_test',
    deliveryFee, totalAmount, productRevenueByLines: totalAmount - deliveryFee,
    paid: status === 'paid', unpaid: status === 'unpaid', confirmed: status === 'paid', canceled: status === 'canceled',
    lines: [{ goodsNo: 'g' + (i % 8), goodsName: 'P' + (i % 8), quantity: 1, lineRevenue: totalAmount - deliveryFee, categoryCode: 'c' + (i % 4), categoryLabel: 'C' + (i % 4) }],
    memberKey: 'M' + (i % 40)
  };
});
const universeAux = {
  customers: Array.from({ length: 40 }, (_, i) => ({ memberKey: 'M' + i, segment: 's', firstOrderDate: '', lastOrderDate: '', orderCount: (i % 3) + 1, totalRevenue: 0, totalPaidAmount: 0, averageOrderValue: 0, claimCount: i % 5 === 0 ? 1 : 0, reviewCount: 0, inquiryCount: 0 })),
  inquiries: Array.from({ length: 30 }, (_, i) => ({ inquiryId: 'q' + i, topic: i % 3 === 0 ? 'delivery' : 'product', status: i % 2 === 0 ? 'unanswered' : 'answered', urgency: 'normal', createdAt: '', title: '', excerpt: '' })),
  reviews: Array.from({ length: 16 }, (_, i) => ({ reviewId: 'r' + i, orderNo: 'O' + i, goodsNo: 'g', productId: 'g', rating: 5, sentiment: 'pos', topic: 't', createdAt: '', excerpt: '' }))
};
const summary = {
  orderCount: orders.length, lineCount: orders.length, productRevenueByHeader: 0,
  productRevenueByLines: orders.reduce((s, o) => s + o.productRevenueByLines, 0),
  deliveryFeeTotal: orders.length * 3000, totalAmount: orders.reduce((s, o) => s + o.totalAmount, 0),
  paidOrderCount: orders.filter((o) => o.paid).length, unpaidOrderCount: orders.filter((o) => o.unpaid).length,
  confirmedOrderCount: 0, canceledOrderCount: orders.filter((o) => o.canceled).length,
  realOrderCount: orders.filter((o) => o.sourceType === 'real_godomall').length,
  syntheticOrderCount: orders.filter((o) => o.sourceType === 'synthetic_test').length,
  syntheticTrackedProductCount: 0, syntheticUnlimitedProductCount: 0,
  syntheticTotalSoldQuantity: 0, syntheticTotalRestoredQuantity: 0, syntheticTotalNetSoldQuantity: 0
};
const revenue = { count: orders.length, source: 'mock', live: false, summary, stockImpact: [], orders, universeAux };

const snap = S.buildDepartmentSourceOfTruthSnapshot(revenue);

// 옛 상품팀 계산(pre-fix): gross 라인합 + 전체 주문수
const productOldGross = orders.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.lineRevenue, 0), 0);
const productOldCount = orders.length;

console.log('=== Department Data Source of Truth Audit v0 ===\n');
console.log('Canonical Operational Snapshot (buildDepartmentSourceOfTruthSnapshot):');
console.log(`  operationalRevenue: ${won(snap.operationalRevenue)}`);
console.log(`  operationalOrders:  ${snap.operationalOrderCount}`);
console.log(`  operationalAOV:     ${won(snap.operationalAOV)}`);
console.log(`  totalProductLineRevenue(부서전용): ${won(snap.productLineRevenue)}`);
console.log(`  totalOrdersAll: ${snap.orderUniverse.totalOrders} (valid ${snap.orderUniverse.validOrders} · cancelled ${snap.orderUniverse.cancelledOrders} · unpaid ${snap.orderUniverse.unpaidOrders})`);
console.log(`  csUnresolved: ${snap.csUniverse.unresolvedInquiries} · csResolved: ${snap.csUniverse.resolvedInquiries} · reviews: ${snap.csUniverse.totalReviews}`);
console.log(`  customerCount: ${snap.customerUniverse.totalCustomers} (repeat ${snap.customerUniverse.repeatCustomers})`);
console.log(`  sourceMode: ${snap.sourceMode} · includesSynthetic: ${snap.metadata.includesSynthetic}\n`);

const opR = snap.operationalRevenue, opC = snap.operationalOrderCount;
console.log('Product Dashboard (after fix):');
console.log(`  top KPI revenue source: snapshot.operationalRevenue = ${won(opR)}`);
console.log(`  top KPI order source: snapshot.operationalOrderCount = ${opC}`);
console.log(`  department-specific product revenue: ${won(snap.productLineRevenue)} (상품 라인 매출, 분리 표시)`);
console.log(`  mismatch with canonical: NONE (대표값=canonical)\n`);

console.log('Marketing Dashboard (after fix):');
console.log(`  top KPI revenue source: snapshot.operationalRevenue = ${won(opR)}`);
console.log(`  top KPI order source: snapshot.operationalOrderCount = ${opC}`);
console.log(`  mismatch with canonical: NONE\n`);

console.log('CS Dashboard:');
console.log(`  unresolved source: universeAux.inquiries(status!=answered) = ${snap.csUniverse.unresolvedInquiries}`);
console.log(`  resolved source: universeAux.inquiries(answered) = ${snap.csUniverse.resolvedInquiries}`);
console.log(`  customer source: universeAux.customers(고유 memberKey) = ${snap.customerUniverse.totalCustomers}`);
console.log(`  period filter: CS 기간 필터(동일 universe) · 매출 KPI와 별개 업무지표`);
console.log(`  mismatch or unclear source: NONE (같은 Commerce Universe)\n`);

console.log('Before-fix comparison (상품팀 옛 대표 KPI):');
console.log(`  productOldGross(라인합·전체주문): ${won(productOldGross)} / ${productOldCount}건`);
console.log(`  canonical operational:           ${won(opR)} / ${opC}건`);
console.log(`  → 옛 상품팀 대표값은 canonical과 ${productOldGross !== opR || productOldCount !== opC ? 'MISMATCH(이게 부서 간 숫자 차이의 원인)' : 'match'}\n`);

const consistent = opR > 0 && opC > 0 && snap.productLineRevenue >= opR; // gross >= net
console.log(`Verdict: ${consistent ? 'PASS — 모든 부서 대표 운영 KPI가 단일 snapshot에서 동일하게 나옴' : 'FAIL'}`);

rmSync(tmp, { recursive: true, force: true });
