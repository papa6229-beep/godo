#!/usr/bin/env node
/*
 * scripts/smoke-marketing-analysis-facts-core-v0.mjs
 * Marketing Analysis Facts Core v0 검증.
 *  - buildMarketingAnalysisFacts가 synthetic enriched 주문으로 facts 생성
 *  - 매출/첫·재구매/회원그룹/채널/쿠폰/리워드/상품·카테고리·브랜드 지표
 *  - 가입전환/ROAS/방문전환 미계산 → requiredData 유지
 *  - insights ≥5, evidence 존재, piiCheck.containsPii === false
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-facts-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-facts-src-'));
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
console.log('=== Marketing Analysis Facts Core v0 smoke ===');

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });

// ── exports ──
ok('1. buildMarketingAnalysisFacts export', typeof F.buildMarketingAnalysisFacts === 'function');
ok('   보조 함수 export', typeof F.filterMarketingOrdersByPeriod === 'function' && typeof F.calculateAverageOrderValue === 'function' && typeof F.buildMarketingRequiredDataNotices === 'function' && typeof F.assertMarketingFactsNoPii === 'function');

const facts = F.buildMarketingAnalysisFacts({ orders: u.orders, products, reviews: u.reviews, inquiries: u.inquiries, period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') });
const s = facts.summary;

// ── 기본 매출 ──
ok('2. totalRevenue > 0', s.totalRevenue > 0);
ok('3. orderCount > 0', s.orderCount > 0);
ok('4. averageOrderValue = totalRevenue/orderCount', s.averageOrderValue === Math.round(s.totalRevenue / s.orderCount));

// ── 첫/재구매 ──
// C-8: 첫구매/재구매는 3상태다. 첫구매 여부가 없는 주문은 unknown으로 분리되므로
//   'first + repeat = 전체'가 아니라 'first + repeat + unknown = 전체'가 계약이다.
ok('5. first/repeat/unknown metrics 존재 + 3분류 합 = 전체', typeof s.firstPurchaseOrderCount === 'number' && typeof s.repeatPurchaseOrderCount === 'number' && typeof s.unknownFirstPurchaseOrderCount === 'number' && s.firstPurchaseOrderCount + s.repeatPurchaseOrderCount + s.unknownFirstPurchaseOrderCount === s.orderCount);
ok('6. first/repeat/unknown 매출 합 = 총매출', s.firstPurchaseRevenue + s.repeatPurchaseRevenue + s.unknownFirstPurchaseRevenue === s.totalRevenue);
ok('   first/repeat AOV 계산 정상', s.firstPurchaseAverageOrderValue === (s.firstPurchaseOrderCount ? Math.round(s.firstPurchaseRevenue / s.firstPurchaseOrderCount) : 0));

// ── 회원그룹 ──
ok('7. byMemberGroup 비어 있지 않음', Array.isArray(facts.byMemberGroup) && facts.byMemberGroup.length > 0);
ok('8. 회원그룹 라벨/매출/객단가/비중 필드', facts.byMemberGroup.every((g) => typeof g.label === 'string' && typeof g.revenue === 'number' && typeof g.averageOrderValue === 'number' && typeof g.sharePercent === 'number'));
ok('9. 회원그룹 매출 합 ≈ 총매출', Math.abs(facts.byMemberGroup.reduce((a, g) => a + g.revenue, 0) - s.totalRevenue) <= 1);

// ── 채널 ──
ok('10. byOrderChannel 비어 있지 않음', facts.byOrderChannel.length > 0);
ok('    채널 라벨 한글 매핑(자사몰/네이버페이/페이코 중 존재)', facts.byOrderChannel.some((c) => ['자사몰', '네이버페이', '페이코'].includes(c.label)));

// ── 쿠폰/할인 ──
ok('11. coupon metrics 0이 아님', s.couponOrderCount > 0 && s.couponRevenue > 0 && s.totalCouponDiscountAmount > 0);
ok('12. 쿠폰 사용/미사용 객단가 비교 존재', typeof s.couponAverageOrderValue === 'number' && typeof s.nonCouponAverageOrderValue === 'number');
ok('13. byCouponUsage 2버킷', facts.byCouponUsage.length === 2 && facts.byCouponUsage.some((b) => b.key === 'coupon') && facts.byCouponUsage.some((b) => b.key === 'non_coupon'));

// ── 마일리지/예치금 ──
ok('14. reward metrics 존재', s.mileageOrderCount > 0 && s.depositOrderCount > 0 && s.totalRewardUseAmount > 0);
ok('15. byRewardUsage 버킷 존재', facts.byRewardUsage.length >= 1 && facts.byRewardUsage.some((b) => b.key === 'reward'));

// ── 상품/카테고리/브랜드 ──
ok('16. topProducts 존재 + goodsNo/매출', facts.topProducts.length > 0 && facts.topProducts.every((p) => p.goodsNo && typeof p.revenue === 'number'));
ok('17. topCategories 존재', facts.topCategories.length > 0);
ok('18. topBrands 존재(products 메타 제공 시)', facts.topBrands.length > 0);
ok('19. 브랜드 메타 evidence 기록(외부필요 분류 아님)', facts.evidence.some((e) => e.id === 'ev_brand_meta' && e.source === 'products'));

// ── requiredData 유지 (계산 금지) ──
const rdKeys = new Set(facts.requiredData.map((r) => r.key));
ok('20. requiredData에 memberSignupDate/ga4/adSpend/productViewEvents/cartEvents 유지', ['memberSignupDate', 'ga4', 'adSpend', 'productViewEvents', 'cartEvents'].every((k) => rdKeys.has(k)));
ok('21. 가입전환/ROAS/방문전환 지표를 summary에 계산하지 않음', !('signupToPurchaseConversion' in s) && !('roas' in s) && !('visitorToOrderConversion' in s));
ok('22. requiredData에 adClicks/adImpressions/snsMetrics/visitorSessions 유지', ['adClicks', 'adImpressions', 'snsMetrics', 'visitorSessions'].every((k) => rdKeys.has(k)));

// ── insights / evidence ──
ok('23. insights ≥ 5', facts.insights.length >= 5);
ok('24. insights가 evidence를 참조', facts.insights.every((i) => Array.isArray(i.evidenceIds)) && facts.insights.some((i) => i.evidenceIds.length > 0));
ok('25. 인과 단정 표현 없음(때문에/덕분에)', !facts.insights.some((i) => /때문에|덕분에|because of/i.test(i.summary)));
ok('26. evidence 존재', facts.evidence.length > 0 && facts.evidence.every((e) => e.id && e.source));

// ── PII self-check ──
ok('27. piiCheck.containsPii === false', facts.piiCheck.containsPii === false);
ok('28. facts 전체에 PII 키 없음(직접 스캔)', F.assertMarketingFactsNoPii(facts).length === 0);
ok('29. 분석 주문에 contact PII 없음(입력 검증)', u.orders.every((o) => F.assertMarketingFactsNoPii(o).length === 0));

// ── 기간 필터 ──
const custom = F.buildMarketingAnalysisFacts({ orders: u.orders, products, period: { preset: 'custom', startDate: '2025-06-01', endDate: '2025-06-30' }, nowMs: Date.parse('2026-06-27T00:00:00') });
ok('30. custom 기간 필터가 주문수 축소(부분집합)', custom.summary.orderCount > 0 && custom.summary.orderCount <= s.orderCount);
ok('31. calculateAverageOrderValue(0 케이스) === 0', F.calculateAverageOrderValue(1000, 0) === 0 && F.calculateAverageOrderValue(1000, 4) === 250);

console.log('\n--- 요약 ---');
console.log(`총매출=${s.totalRevenue}, 주문수=${s.orderCount}, AOV=${s.averageOrderValue}, 첫구매=${s.firstPurchaseOrderCount}, 재구매=${s.repeatPurchaseOrderCount}, 쿠폰주문=${s.couponOrderCount}, 마일리지=${s.mileageOrderCount}, 예치금=${s.depositOrderCount}`);
console.log('회원그룹:', JSON.stringify(facts.byMemberGroup.map((g) => `${g.label} ${g.sharePercent}%`)));
console.log('채널:', JSON.stringify(facts.byOrderChannel.map((c) => `${c.label} ${c.sharePercent}%`)));
console.log(`insights=${facts.insights.length}, evidence=${facts.evidence.length}, requiredData=${facts.requiredData.length}`);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
