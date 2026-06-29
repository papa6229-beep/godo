#!/usr/bin/env node
/*
 * scripts/smoke-marketing-data-coverage-audit-v0.mjs
 * Marketing Data Coverage Audit v0 검증 (순수 함수, LLM/네트워크 없음).
 *  - auditMarketingDataCoverage / auditMarketingMetricAvailability export 확인
 *  - 가입일 부재 → 가입→구매 전환율 do_not_compute(또는 available_if_enriched)
 *  - 주문+회원ID → 첫구매/재구매 available_now
 *  - behaviorEvents 부재 → 상품조회→구매 전환율 requires_external_data
 *  - adSpend 부재 → ROAS requires_external_data
 *  - identity/contact PII가 마케팅 facts에 직접 포함되지 않는 정책(가드) 확인
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-mktaudit-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'marketingDataCoverageAudit.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const M = await import(pathToFileURL(path.join(tmp, 'marketingDataCoverageAudit.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Data Coverage Audit v0 smoke ===');

// ── 1. exports ──
ok('1. auditMarketingDataCoverage export', typeof M.auditMarketingDataCoverage === 'function');
ok('2. auditMarketingMetricAvailability export', typeof M.auditMarketingMetricAvailability === 'function');
ok('   marketingFactsContainPii export', typeof M.marketingFactsContainPii === 'function');
ok('   summarize helpers export', typeof M.summarizeMarketingDataCoverage === 'function' && typeof M.summarizeMarketingMetricAvailability === 'function');

// ── 데이터 보유 감사 (현재 synthetic 형태 입력) ──
const customers = [
  { customerId: 'cust_000001', memberKey: 'syn_member_100000', memNo: '100000', memId: 'syn_user_000001', segment: 'returning', firstOrderDate: '2026-01-02 10:00:00', lastOrderDate: '2026-06-20 10:00:00', orderCount: 3, totalPaidAmount: 120000, averageOrderValue: 40000, repurchaseCount: 2, refundCount: 0, reviewCount: 1, sourceType: 'synthetic' }
];
const orders = [
  { orderNo: 'O1', orderDate: '2026-01-02 10:00:00', memberKey: 'syn_member_100000', isFirstPurchase: true, settleKind: 'pc', orderChannel: 'shop', totalAmount: 40000, productRevenueByLines: 37500, lines: [{ goodsNo: '1001', goodsName: '상품A', quantity: 1, lineRevenue: 37500 }] },
  { orderNo: 'O2', orderDate: '2026-03-10 10:00:00', memberKey: 'syn_member_100000', isFirstPurchase: false, settleKind: 'gb', orderChannel: 'naverpay', totalAmount: 40000, productRevenueByLines: 37500, claimSummary: { hasClaim: true, claimTypes: ['refund'] }, lines: [{ goodsNo: '1002', goodsName: '상품B', quantity: 1, lineRevenue: 37500 }] }
];
const cov = M.auditMarketingDataCoverage({ customers, orders, products: [], reviews: [], inquiries: [] });
const byKey = Object.fromEntries(cov.map((i) => [i.key, i]));
const covSummary = M.summarizeMarketingDataCoverage(cov);

ok('3. coverage 항목 다수 반환', Array.isArray(cov) && cov.length >= 20);
ok('4. customerId/memberKey present', byKey.customerId?.status === 'present' && byKey.memberKey?.status === 'present');
ok('5. 주문 보유 필드 present (firstPurchase/channel/payment/claim)',
  byKey.isFirstPurchase?.status === 'present' && byKey.orderChannel?.status === 'present' &&
  byKey.paymentMethod?.status === 'present' && byKey.claimSummary?.status === 'present');
ok('6. 가입일 missing + do_not_compute 경고 note', byKey.joinedAt?.status === 'missing' && byKey.joinedAt.notes.some((n) => /do_not_compute|가입→구매/.test(n)));
ok('7. 회원그룹 missing + 고도몰 스펙 보강 가능 note(memGroupNm)', byKey.memberGroup?.status === 'missing' && byKey.memberGroup.source === 'godomall_spec' && byKey.memberGroup.notes.some((n) => /memGroupNm/.test(n)));
ok('8. 쿠폰/할인 missing + syntheticEnrichmentNeeded', byKey.couponDiscount?.status === 'missing' && byKey.couponDiscount.notes.some((n) => /syntheticEnrichmentNeeded/.test(n)));
ok('9. 행동/광고/GA external_required', byKey.behaviorEvents?.status === 'external_required' && byKey.adSpend?.status === 'external_required' && byKey.ga4Behavior?.status === 'external_required');
ok('10. name/phone/email/address present_but_fake + contact', ['name', 'phone', 'email', 'address'].every((k) => byKey[k]?.status === 'present_but_fake' && byKey[k]?.piiLevel === 'contact'));
ok('11. riskTags/blacklist derived_possible', byKey.riskTags?.status === 'derived_possible' && byKey.blacklistCandidate?.status === 'derived_possible');

// enrich 시 present 승격 (real 연결 시나리오)
const covEnriched = M.auditMarketingDataCoverage({
  customers: [{ ...customers[0], memberGroup: 'VIP', birthDate: '1990-01-01' }],
  orders: [{ ...orders[0], memGroupNm: 'VIP', totalCouponGoodsDcPrice: 1000, useMileage: 500 }]
});
const ek = Object.fromEntries(covEnriched.map((i) => [i.key, i]));
ok('12. enrich 입력 시 회원그룹/쿠폰/마일리지 present 승격', ek.memberGroup?.status === 'present' && ek.couponDiscount?.status === 'present' && ek.mileageDepositUse?.status === 'present' && ek.birthDate?.status === 'present');

// ── 지표 산출 가능성 감사 ──
const base = { hasSignupDate: false, hasOrders: true, hasOrderLines: true, hasMemberId: true, hasMemberGroup: false, hasCouponDiscountFields: false, hasOrderChannel: true, hasBehaviorEvents: false, hasAdSpend: false, hasGa4: false };
const metrics = M.auditMarketingMetricAvailability(base);
const mByKey = Object.fromEntries(metrics.map((m) => [m.key, m]));
const mSummary = M.summarizeMarketingMetricAvailability(metrics);

ok('13. 가입일 없음 → 가입→구매 전환율 do_not_compute/available_if_enriched', ['do_not_compute', 'available_if_enriched'].includes(mByKey.signup_to_purchase_conversion?.availability));
ok('    do_not_compute 채택 + signupDate missing 명시', mByKey.signup_to_purchase_conversion.availability === 'do_not_compute' && mByKey.signup_to_purchase_conversion.missingFields.includes('signupDate'));
ok('14. 주문+회원ID → 첫구매 분석 available_now', mByKey.first_purchase_orders?.availability === 'available_now' && mByKey.first_purchase_revenue?.availability === 'available_now' && mByKey.first_purchase_aov?.availability === 'available_now');
ok('15. 주문+회원ID → 재구매 분석 available_now', mByKey.repurchase_orders?.availability === 'available_now' && mByKey.repurchase_revenue?.availability === 'available_now' && mByKey.time_to_repurchase?.availability === 'available_now');
ok('16. 채널 매출 available_now', mByKey.revenue_by_order_channel?.availability === 'available_now');
ok('17. 회원그룹 지표 available_if_enriched (memberGroup missing)', mByKey.revenue_by_member_group?.availability === 'available_if_enriched' && mByKey.revenue_by_member_group.missingFields.includes('memberGroup'));
ok('18. 쿠폰 세그먼트 available_if_enriched', mByKey.coupon_user_segment?.availability === 'available_if_enriched');
ok('19. behaviorEvents 없음 → 상품조회→구매 전환율 requires_external_data', mByKey.product_view_to_purchase_conversion?.availability === 'requires_external_data');
ok('20. adSpend 없음 → ROAS requires_external_data', mByKey.roas?.availability === 'requires_external_data');
ok('21. GA4 없음 → ga4_behavior requires_external_data', mByKey.ga4_behavior?.availability === 'requires_external_data');

// 충족 시나리오: 가입일/회원그룹/쿠폰/행동/광고 모두 있으면 available_now
const full = M.auditMarketingMetricAvailability({ hasSignupDate: true, hasOrders: true, hasOrderLines: true, hasMemberId: true, hasMemberGroup: true, hasCouponDiscountFields: true, hasOrderChannel: true, hasBehaviorEvents: true, hasAdSpend: true, hasGa4: true });
const fByKey = Object.fromEntries(full.map((m) => [m.key, m]));
ok('22. 전부 충족 시 가입전환/회원그룹/쿠폰/ROAS available_now', fByKey.signup_to_purchase_conversion.availability === 'available_now' && fByKey.revenue_by_member_group.availability === 'available_now' && fByKey.coupon_user_segment.availability === 'available_now' && fByKey.roas.availability === 'available_now');

// ── PII 분리 정책 ──
ok('23. 허용 식별키 = 가명(memberKey/customerId/segment)', M.MARKETING_FACTS_ALLOWED_IDENTITY_KEYS.includes('memberKey') && !M.MARKETING_FACTS_ALLOWED_IDENTITY_KEYS.includes('name'));
ok('24. 금지 PII 키에 name/phone/email/address/memId 포함', ['name', 'phone', 'email', 'address', 'memId'].every((k) => M.MARKETING_FACTS_FORBIDDEN_PII_KEYS.includes(k)));
// 마케팅 facts라 가정한 객체에 PII가 섞이면 탐지
const dirtyFact = { memberKey: 'syn_member_1', totalRevenue: 100000, customer: { name: '가상고객 1', phone: '010-0000-0001' } };
const leaked = M.marketingFactsContainPii(dirtyFact);
ok('25. marketingFactsContainPii 가 name/phone 탐지', leaked.includes('name') && leaked.includes('phone'));
// 가명/집계만 있는 안전한 facts는 통과
const cleanFact = { memberKey: 'syn_member_1', segment: 'returning', orderCount: 3, totalRevenue: 120000 };
ok('26. 가명/집계만 있는 facts는 PII 없음([])', M.marketingFactsContainPii(cleanFact).length === 0);
// coverage 항목 중 marketingUse가 분석에 쓰인다고 표시된 항목엔 contact PII 없음
const usablePiiLeak = cov.filter((i) => i.piiLevel === 'contact' && i.status !== 'present_but_fake');
ok('27. contact PII 항목은 모두 present_but_fake(분석 미사용)', usablePiiLeak.length === 0);

console.log('\n--- 요약 ---');
console.log('coverage status:', JSON.stringify(covSummary));
console.log('metric availability:', JSON.stringify(mSummary));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
