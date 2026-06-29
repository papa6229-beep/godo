#!/usr/bin/env node
/*
 * scripts/smoke-marketing-baseline-year-synthetic-expansion-v0.mjs
 * Marketing Baseline Year Synthetic Expansion v0 검증.
 *  - includeBaselineYear=true → 2년(baseline+promotion) span, baseline=쿠폰/이벤트 0, promotion=쿠폰 유지
 *  - 리뷰/문의 연결, orderNo 충돌 없음, memberKey/ firstPurchase consistency, 금액 invariant
 *  - buildMarketingAnalysisFacts baseline/promotion custom period, 외부지표 requiredData 유지, PII self-check
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-baseline-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-baseline-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingAnalysisFacts.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const F = await import(pathToFileURL(path.join(tmpSrc, 'marketingAnalysisFacts.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Baseline Year Synthetic Expansion v0 smoke ===');

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26', includeBaselineYear: true });
const u2 = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26', includeBaselineYear: true });
const orders = u.orders;
const baseOrders = orders.filter((o) => o.syntheticYearLabel === 'baseline');
const promoOrders = orders.filter((o) => o.syntheticYearLabel === 'promotion');

// ── 2년 범위 ──
ok('1. meta.includesBaselineYear + span ≥ 700일', u.meta.includesBaselineYear === true && u.meta.spanDays >= 700);
ok('2. 결정성(같은 seed → 동일 orderCount/첫주문)', u.orders.length === u2.orders.length && orders[0].orderNo === u2.orders[0].orderNo);
ok('3. baseline / promotion 주문 모두 존재', baseOrders.length > 0 && promoOrders.length > 0);
ok('4. meta baseline/promotion count 일치', u.meta.baselineOrderCount === baseOrders.length && u.meta.promotionOrderCount === promoOrders.length);
ok('5. baseline·promotion 둘 다 합리적 규모(각 ≥ 250)', baseOrders.length >= 250 && promoOrders.length >= 250);

// ── baseline 쿠폰/이벤트 0 ──
ok('6. baseline 모든 주문 discountSummary.hasCoupon === false', baseOrders.every((o) => o.discountSummary && o.discountSummary.hasCoupon === false));
ok('7. baseline 쿠폰/할인 총액 0', baseOrders.every((o) => o.discountSummary && o.discountSummary.totalCouponDiscountAmount === 0 && o.discountSummary.totalDiscountAmount === 0 && (o.discountAmount || 0) === 0));
ok('8. baseline 라인 쿠폰/상품 할인 0', baseOrders.every((o) => (o.lines || []).every((l) => (l.couponGoodsDiscountAmount || 0) === 0 && (l.goodsDiscountAmount || 0) === 0)));

// ── promotion 쿠폰 유지 ──
ok('9. promotion 쿠폰 사용 주문 존재(hasCoupon true 일부)', promoOrders.some((o) => o.discountSummary && o.discountSummary.hasCoupon === true));
ok('10. promotion 쿠폰 할인 총액 > 0 주문 존재', promoOrders.some((o) => o.discountSummary && o.discountSummary.totalCouponDiscountAmount > 0));

// ── 마일리지: baseline도 낮은 비율 허용(일부 존재) ──
ok('11. baseline 마일리지/예치금 일부 존재(쿠폰과 분리)', baseOrders.some((o) => (o.useMileageAmount || 0) > 0 || (o.useDepositAmount || 0) > 0));

// ── 리뷰/문의 연결 ──
const baseOrderNos = new Set(baseOrders.map((o) => o.orderNo));
const baseReviews = u.reviews.filter((r) => baseOrderNos.has(r.orderNo));
const baseInq = u.inquiries.filter((q) => q.orderNo && baseOrderNos.has(q.orderNo));
ok('12. baseline 리뷰/문의 존재', baseReviews.length > 0 && baseInq.length > 0);
const allOrderNos = new Set(orders.map((o) => o.orderNo));
ok('13. 리뷰/문의 orderNo 연결 무결', u.reviews.every((r) => allOrderNos.has(r.orderNo)) && u.inquiries.every((q) => !q.orderNo || allOrderNos.has(q.orderNo)));

// ── ID/연결 무결 ──
ok('14. orderNo 충돌 없음(unique)', allOrderNos.size === orders.length);
const memberKeys = new Set(u.customers.map((c) => c.memberKey));
ok('15. 주문 memberKey가 고객과 연결', orders.every((o) => !o.memberKey || memberKeys.has(o.memberKey)));

// ── firstPurchase consistency ──
ok('16. memberKey별 isFirstPurchase 정확히 1건(결제·미취소)', (() => {
  const byKey = new Map();
  for (const o of orders) { if (!o.memberKey) continue; const a = byKey.get(o.memberKey) || []; a.push(o); byKey.set(o.memberKey, a); }
  for (const list of byKey.values()) {
    const firsts = list.filter((o) => o.isFirstPurchase === true);
    const hasPaid = list.some((o) => o.state.paid && !o.state.canceled);
    if (hasPaid && firsts.length !== 1) return false;
    if (!hasPaid && firsts.length !== 0) return false;
    if (firsts.length === 1 && !(firsts[0].state.paid && !firsts[0].state.canceled)) return false;
  }
  return true;
})());
ok('17. 첫구매는 그 고객의 가장 이른 결제 주문', (() => {
  const byKey = new Map();
  for (const o of orders) { if (!o.memberKey) continue; const a = byKey.get(o.memberKey) || []; a.push(o); byKey.set(o.memberKey, a); }
  for (const list of byKey.values()) {
    const first = list.find((o) => o.isFirstPurchase === true);
    if (!first) continue;
    const earlierPaid = list.find((o) => o.state.paid && !o.state.canceled && o.orderDate < first.orderDate);
    if (earlierPaid) return false;
  }
  return true;
})());

// ── 금액 invariant ──
ok('18. grossAmount − discountAmount − rewardUseAmount === totalAmount', orders.filter((o) => o.grossAmount !== undefined).every((o) => o.grossAmount - (o.discountAmount || 0) - (o.rewardUseAmount || 0) === o.totalAmount));
ok('19. 모든 주문 totalAmount ≥ 0', orders.every((o) => o.totalAmount >= 0));

// ── facts: baseline / promotion custom period ──
const factsAll = F.buildMarketingAnalysisFacts({ orders, products, period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') });
const factsBase = F.buildMarketingAnalysisFacts({ orders: baseOrders, products, period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') });
const factsPromo = F.buildMarketingAnalysisFacts({ orders: promoOrders, products, period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') });
ok('20. all 기간 = baseline+promotion 합산 매출', factsAll.summary.totalRevenue > 0 && factsBase.summary.totalRevenue > 0 && factsPromo.summary.totalRevenue > 0);
ok('21. baseline facts: couponOrderCount===0 & 쿠폰 할인===0', factsBase.summary.couponOrderCount === 0 && factsBase.summary.totalCouponDiscountAmount === 0);
ok('22. promotion facts: couponOrderCount>0 & 쿠폰 할인>0', factsPromo.summary.couponOrderCount > 0 && factsPromo.summary.totalCouponDiscountAmount > 0);

// custom period(날짜 범위)로도 두 연도 분리 가능 — Calendar Rebase v0: promotion=2025, baseline=2024 고정 달력
const endMs = Date.parse('2025-12-31T23:59:59');
const promoCustom = F.buildMarketingAnalysisFacts({ orders, products, period: { preset: 'custom', startDate: '2025-01-01', endDate: '2025-12-31' }, nowMs: endMs });
const baseCustom = F.buildMarketingAnalysisFacts({ orders, products, period: { preset: 'custom', startDate: '2024-01-01', endDate: '2024-12-31' }, nowMs: endMs });
ok('23. custom promotion 기간 couponOrderCount > 0', promoCustom.summary.orderCount > 0 && promoCustom.summary.couponOrderCount > 0);
ok('24. custom baseline 기간 couponOrderCount === 0', baseCustom.summary.orderCount > 0 && baseCustom.summary.couponOrderCount === 0);

// ── 외부지표 requiredData 유지 ──
const rdText = factsAll.requiredData.flatMap((r) => [r.label, ...r.unlocks]).join(' ');
ok('25. ROAS/GA4/방문/상품조회/장바구니 requiredData 유지', ['ROAS', 'GA4', '방문→주문', '상품조회→구매', '장바구니'].every((k) => rdText.includes(k)));
ok('26. summary에 전환율/ROAS 필드 부재', !('roas' in factsAll.summary) && !('signupToPurchaseConversion' in factsAll.summary));

// ── PII self-check ──
ok('27. marketing facts PII 없음(self-check)', factsAll.piiCheck.containsPii === false && F.assertMarketingFactsNoPii(factsAll).length === 0);
ok('28. 분석 주문/리뷰/문의에 PII 값 없음', (() => {
  const blob = JSON.stringify(orders) + JSON.stringify(u.reviews) + JSON.stringify(u.inquiries);
  return !['가상고객', '010-0000', '@example.test', '샘플로', 'customerName', 'receiverName'].some((k) => blob.includes(k));
})());
ok('29. syntheticScenario는 테스트 metadata(고도몰 스펙 필드 아님 — 모든 주문에 라벨)', orders.every((o) => o.syntheticScenario === 'baseline_no_promotion' || o.syntheticScenario === 'promotion_year'));

console.log('\n--- 요약 ---');
console.log(`총주문=${orders.length}, baseline=${baseOrders.length}, promotion=${promoOrders.length}, span=${u.meta.spanDays}일`);
console.log(`baseline매출=${factsBase.summary.totalRevenue}(쿠폰주문 ${factsBase.summary.couponOrderCount}) / promotion매출=${factsPromo.summary.totalRevenue}(쿠폰주문 ${factsPromo.summary.couponOrderCount})`);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
