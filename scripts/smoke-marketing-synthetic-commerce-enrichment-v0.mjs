#!/usr/bin/env node
/*
 * scripts/smoke-marketing-synthetic-commerce-enrichment-v0.mjs
 * Spec-Based Marketing Synthetic Enrichment v0 검증.
 *  - synthetic universe 주문에 memberGroup / 쿠폰·할인 / 마일리지·예치금 enrichment
 *  - 같은 memberKey → 같은 memberGroup, 할인/리워드 일부 주문에만, 금액 관계 invariant
 *  - marketingDataCoverageAudit: 회원그룹/쿠폰/마일리지가 present + available_now로 이동
 *  - 가입→구매 전환율은 do_not_compute, ROAS/GA/행동은 requires_external_data 유지
 *  - 마케팅 facts(주문)에 PII 미포함 self-check
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');

// 1) api/_shared (universe + mapper) — nodenext
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-enrich-api-'));
// 2) src/services (audit) — bundler
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-enrich-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingDataCoverageAudit.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const R = await import(pathToFileURL(path.join(tmpApi, 'godomallRevenue.js')).href);
const M = await import(pathToFileURL(path.join(tmpSrc, 'marketingDataCoverageAudit.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Spec-Based Marketing Synthetic Enrichment v0 smoke ===');

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];

const u1 = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });
const u1b = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });
const orders = u1.orders;
const paid = orders.filter((o) => o.state.paid);

// ── 회원그룹 ──
ok('1. 모든 주문에 memberGroupName 존재', orders.length > 0 && orders.every((o) => typeof o.memberGroupName === 'string' && o.memberGroupName.length > 0 && typeof o.memberGroupCode === 'string'));
ok('2. 회원그룹 라벨이 정의된 그룹 집합', (() => { const allowed = new Set(['신규회원', '재구매회원', 'VIP', '휴면위험', '일반회원']); return orders.every((o) => allowed.has(o.memberGroupName)); })());
ok('3. 같은 memberKey → 같은 memberGroup(주문별 안정)', (() => {
  const byKey = new Map();
  for (const o of orders) { if (!o.memberKey) continue; const s = byKey.get(o.memberKey) || new Set(); s.add(o.memberGroupName); byKey.set(o.memberKey, s); }
  return [...byKey.values()].every((s) => s.size === 1);
})());
ok('4. customer profile에도 memberGroup 부착', u1.customers.every((c) => typeof c.memberGroupNm === 'string' && typeof c.memberGroupCode === 'string'));

// ── 쿠폰/할인 ──
const withDiscount = orders.filter((o) => o.discountSummary);
const withCoupon = orders.filter((o) => o.discountSummary?.hasCoupon);
ok('5. 할인이 일부 주문에만(0 < n < 전체)', withDiscount.length > 0 && withDiscount.length < orders.length);
ok('6. 쿠폰 사용 주문이 일부 존재', withCoupon.length > 0 && withCoupon.length < orders.length);
ok('7. 할인 총액/쿠폰 총액 음수 아님', orders.every((o) => !o.discountSummary || (o.discountSummary.totalDiscountAmount >= 0 && o.discountSummary.totalCouponDiscountAmount >= 0)));
ok('8. 할인이 상품액의 60% 이하(상품측)', orders.every((o) => { if (!o.discountSummary) return true; const gs = o.discountSummary.totalGoodsDiscountAmount + o.discountSummary.totalMemberDiscountAmount + o.discountSummary.totalCouponGoodsDiscountAmount + o.discountSummary.totalCouponOrderDiscountAmount; return gs <= o.productRevenueByHeader * 0.6 + 1; }));
ok('9. 라인 단위 쿠폰 할인 일부 존재', orders.some((o) => o.lines.some((l) => typeof l.couponGoodsDiscountAmount === 'number' && l.couponGoodsDiscountAmount > 0)));

// ── 마일리지/예치금 ──
const withMileage = orders.filter((o) => typeof o.useMileageAmount === 'number' && o.useMileageAmount > 0);
const withDeposit = orders.filter((o) => typeof o.useDepositAmount === 'number' && o.useDepositAmount > 0);
ok('10. 마일리지 사용 일부 주문에만', withMileage.length > 0 && withMileage.length < orders.length);
ok('11. 예치금 사용 일부 주문에만', withDeposit.length > 0 && withDeposit.length < orders.length);
ok('12. 리워드 사용액이 주문 총액보다 크지 않음', orders.every((o) => (o.rewardUseAmount || 0) <= (o.grossAmount ?? (o.totalAmount + (o.rewardUseAmount || 0) + (o.discountAmount || 0)))));

// ── 금액 관계 invariant ──
ok('13. grossAmount − discountAmount − rewardUseAmount === totalAmount', orders.filter((o) => o.grossAmount !== undefined).every((o) => o.grossAmount - (o.discountAmount || 0) - (o.rewardUseAmount || 0) === o.totalAmount));
ok('14. 모든 주문 totalAmount ≥ 0', orders.every((o) => o.totalAmount >= 0));
ok('15. 결제 주문 매출 합 ≥ 0 (summary 무파손)', (() => { const s = R.summarizeRevenue(orders); return s.totalAmount >= 0 && s.orderCount === orders.length; })());

// ── 결정성 ──
ok('16. 같은 seed → 동일 enriched 주문(첫 주문 금액/할인)', (() => { const a = orders[0], b = u1b.orders[0]; return a.orderNo === b.orderNo && a.totalAmount === b.totalAmount && JSON.stringify(a.discountSummary) === JSON.stringify(b.discountSummary) && a.memberGroupName === b.memberGroupName; })());

// ── RevenueOrder 계약 유지(회귀 금지) ──
ok('17. RevenueOrder 계약 유지(lines/state/productRevenueByLines)', orders.every((o) => o.orderNo && Array.isArray(o.lines) && o.state && typeof o.productRevenueByLines === 'number'));
ok('18. orders syntheticSource/ dataKind 유지', orders.every((o) => o.syntheticSource === 'commerce_universe_v1' && o.dataKind === 'synthetic'));

// ── 마케팅 facts PII self-check ──
ok('19. 분석 주문에 PII 키 없음(name/phone/email/address)', orders.every((o) => M.marketingFactsContainPii(o).length === 0));
// 주의: profile은 가명 memNo/memId를 의도적으로 보유(원문 식별자) → marketingFactsContainPii가 정상 탐지.
//   이는 "facts로 넘기기 전 strip 대상"임을 잡아내는 것. analytics profile엔 contact PII(name/phone/email/address)가 없어야 한다.
ok('20. customer profile(분석)에 contact PII(name/phone/email/address) 없음', u1.customers.every((c) => !['name', 'customerName', 'phone', 'mobile', 'email', 'address'].some((k) => k in c)));
ok('    profile의 memNo/memId는 정책상 facts 금지 키로 탐지됨', M.marketingFactsContainPii(u1.customers[0]).includes('memId'));
const sampleFact = { memberKey: orders[0].memberKey, memberGroup: orders[0].memberGroupName, totalRevenue: 120000, couponUsed: !!orders[0].discountSummary?.hasCoupon };
ok('21. 가명/집계 marketing fact는 PII 없음([])', M.marketingFactsContainPii(sampleFact).length === 0);

// ── coverage audit: 보강 후 present 이동 ──
const cov = M.auditMarketingDataCoverage({ customers: u1.customers, orders, products, reviews: u1.reviews, inquiries: u1.inquiries });
const byKey = Object.fromEntries(cov.map((i) => [i.key, i]));
ok('22. memberGroup present 이동', byKey.memberGroup?.status === 'present');
ok('23. couponDiscount present 이동', byKey.couponDiscount?.status === 'present');
ok('24. mileageDepositUse present 이동', byKey.mileageDepositUse?.status === 'present');

// ── metric availability: enrichment 반영 ──
const flags = {
  hasSignupDate: false,
  hasOrders: true,
  hasOrderLines: true,
  hasMemberId: orders.some((o) => o.memberKey),
  hasMemberGroup: orders.some((o) => o.memberGroupName),
  hasCouponDiscountFields: orders.some((o) => o.discountSummary),
  hasOrderChannel: orders.some((o) => o.orderChannel),
  hasBehaviorEvents: false,
  hasAdSpend: false,
  hasGa4: false,
  hasMileageDepositFields: orders.some((o) => o.useMileageAmount !== undefined || o.useDepositAmount !== undefined)
};
const metrics = M.auditMarketingMetricAvailability(flags);
const mByKey = Object.fromEntries(metrics.map((m) => [m.key, m]));
const isNowOrDerived = (a) => a === 'available_now' || a === 'derived_possible';
ok('25. 회원그룹별 매출/객단가/주문수 available_now', isNowOrDerived(mByKey.revenue_by_member_group?.availability) && isNowOrDerived(mByKey.aov_by_member_group?.availability) && isNowOrDerived(mByKey.order_count_by_member_group?.availability));
ok('26. 쿠폰 사용 주문수/매출/객단가/미사용객단가/할인총액 available_now', ['coupon_used_orders', 'coupon_used_revenue', 'coupon_used_aov', 'coupon_unused_aov', 'coupon_total_discount'].every((k) => isNowOrDerived(mByKey[k]?.availability)));
ok('27. 마일리지/예치금 사용 주문수 available_now', isNowOrDerived(mByKey.mileage_used_orders?.availability) && isNowOrDerived(mByKey.deposit_used_orders?.availability));
ok('28. 첫구매/재구매 분석 여전히 available_now', mByKey.first_purchase_orders?.availability === 'available_now' && mByKey.repurchase_orders?.availability === 'available_now');

// ── 계속 금지/외부 필요 유지 ──
ok('29. 가입→구매 전환율 do_not_compute 유지', mByKey.signup_to_purchase_conversion?.availability === 'do_not_compute');
ok('30. ROAS/GA4/상품조회→구매/방문→주문 requires_external_data 유지', ['roas', 'ga4_behavior', 'product_view_to_purchase_conversion', 'visitor_to_order_conversion'].every((k) => mByKey[k]?.availability === 'requires_external_data'));
ok('31. 광고 CTR/장바구니 이탈률 requires_external_data 유지', mByKey.ad_ctr?.availability === 'requires_external_data' && mByKey.cart_abandonment_rate?.availability === 'requires_external_data');

console.log('\n--- 요약 ---');
console.log(`orders=${orders.length}, paid=${paid.length}, withDiscount=${withDiscount.length}, withCoupon=${withCoupon.length}, withMileage=${withMileage.length}, withDeposit=${withDeposit.length}`);
const groupCounts = {};
for (const o of orders) groupCounts[o.memberGroupName] = (groupCounts[o.memberGroupName] || 0) + 1;
console.log('memberGroup 분포:', JSON.stringify(groupCounts));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
