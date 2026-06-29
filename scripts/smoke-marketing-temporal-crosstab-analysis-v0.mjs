#!/usr/bin/env node
/*
 * scripts/smoke-marketing-temporal-crosstab-analysis-v0.mjs
 * Marketing Temporal Cross-Tab Analysis v0 검증.
 *  - timeBucket × dimension × metric 교차분석(월별 쿠폰/연도별 시나리오/회원그룹/첫재구매/채널/리워드/카테고리)
 *  - 외부 데이터 요청 unsupported+requiredData, insights 인과 단정 금지, PII self-check
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-ct-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-ct-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingTemporalCrosstab.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const C = await import(pathToFileURL(path.join(tmpSrc, 'marketingTemporalCrosstab.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Temporal Cross-Tab Analysis v0 smoke ===');

ok('1. marketingTemporalCrosstab.ts 존재', existsSync(path.join(REPO, 'src/services/marketingTemporalCrosstab.ts')));
ok('2. buildMarketingTemporalCrosstab export', typeof C.buildMarketingTemporalCrosstab === 'function');
ok('   보조 export(getKey/getDim/isSupported/defaults)', typeof C.getMarketingTimeBucketKey === 'function' && typeof C.getMarketingDimensionKey === 'function' && typeof C.isMarketingCrossTabRequestSupported === 'function' && typeof C.buildDefaultMarketingCrosstabRequests === 'function');

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26', includeBaselineYear: true });
const orders = u.orders;
const nowMs = Date.parse('2026-06-27T00:00:00');
const build = (request) => C.buildMarketingTemporalCrosstab({ orders, products, request, nowMs });

// 7-1. 월별 쿠폰 사용/미사용 객단가
const r1 = build({ timeBucket: 'month', dimensions: ['couponUsage'], metrics: ['averageOrderValue', 'orderCount', 'revenue', 'couponDiscountAmount'] });
ok('3. 월별 쿠폰 요청 available true + rows 존재', r1.available === true && r1.rows.length > 0);
ok('4. 쿠폰 사용(used)/미사용(unused) dimensionKey 존재', r1.rows.some((x) => x.dimensionKey === 'coupon') && r1.rows.some((x) => x.dimensionKey === 'non_coupon'));
// baseline 월: coupon used row 없음 또는 orderCount 0 / promotion 월: coupon used 존재
const baseMonth = new Date(nowMs - 500 * 86400000); // baseline 범위(약 1.4년 전)
const baseKey = `${baseMonth.getFullYear()}-${String(baseMonth.getMonth() + 1).padStart(2, '0')}`;
const usedInBase = r1.rows.filter((x) => x.bucketKey === baseKey && x.dimensionKey === 'coupon');
ok('5. baseline 월에는 쿠폰 사용 row 없음 또는 orderCount 0', usedInBase.every((x) => x.orderCount === 0));
const promoMonth = new Date(nowMs - 60 * 86400000);
const promoKey = `${promoMonth.getFullYear()}-${String(promoMonth.getMonth() + 1).padStart(2, '0')}`;
ok('6. promotion 월에는 쿠폰 사용 row 존재', r1.rows.some((x) => x.bucketKey === promoKey && x.dimensionKey === 'coupon' && x.orderCount > 0));

// 7-2. 연도별/시나리오 baseline vs promotion
const r2 = build({ timeBucket: 'scenario', dimensions: ['scenario'], metrics: ['revenue', 'orderCount', 'averageOrderValue', 'couponDiscountAmount'] });
ok('7. scenario 비교 available true + baseline/promotion 행', r2.available === true && r2.rows.some((x) => x.dimensionKey === 'baseline') && r2.rows.some((x) => x.dimensionKey === 'promotion'));
ok('8. baseline scenario couponDiscountAmount === 0', r2.rows.filter((x) => x.dimensionKey === 'baseline').every((x) => x.couponDiscountAmount === 0));
ok('9. promotion scenario couponDiscountAmount > 0', r2.rows.filter((x) => x.dimensionKey === 'promotion').some((x) => x.couponDiscountAmount > 0));

// 7-3. 연도별 회원그룹
const r3 = build({ timeBucket: 'year', dimensions: ['memberGroup'], metrics: ['revenue', 'orderCount', 'averageOrderValue', 'revenueShare'] });
ok('10. 연도별 회원그룹 rows 존재 + revenueShare', r3.available && r3.rows.length > 0 && r3.rows.every((x) => typeof x.revenueSharePercent === 'number'));

// 7-4. 월별 첫구매/재구매
const r4 = build({ timeBucket: 'month', dimensions: ['firstRepeat'], metrics: ['revenue', 'orderCount', 'averageOrderValue'] });
ok('11. 월별 firstRepeat rows(first/repeat)', r4.available && r4.rows.some((x) => x.dimensionKey === 'first') && r4.rows.some((x) => x.dimensionKey === 'repeat'));

// 7-5. 월별 주문채널
const r5 = build({ timeBucket: 'month', dimensions: ['orderChannel'], metrics: ['revenue', 'orderCount', 'averageOrderValue'] });
ok('12. 월별 orderChannel rows 존재', r5.available && r5.rows.length > 0 && r5.rows.some((x) => ['자사몰', '네이버페이', '페이코'].includes(x.dimensionLabel)));

// 7-6. 월별 리워드 사용/미사용
const r6 = build({ timeBucket: 'month', dimensions: ['rewardUsage'], metrics: ['revenue', 'orderCount', 'averageOrderValue', 'rewardUseAmount'] });
ok('13. 월별 rewardUsage rows(reward/non_reward)', r6.available && r6.rows.some((x) => x.dimensionKey === 'reward') && r6.rows.some((x) => x.dimensionKey === 'non_reward'));

// 7-7. 월별 카테고리 (line 기준 fallback)
const r7 = build({ timeBucket: 'month', dimensions: ['category'], metrics: ['revenue', 'orderCount', 'quantity'] });
ok('14. 월별 카테고리 rows 존재 + quantity', r7.available && r7.rows.length > 0 && r7.rows.every((x) => typeof x.quantity === 'number'));
const rBrand = build({ timeBucket: 'year', dimensions: ['brand'], metrics: ['revenue', 'orderCount'] });
const rProd = build({ timeBucket: 'year', dimensions: ['product'], metrics: ['revenue', 'quantity'] });
ok('15. product/brand graceful(깨지지 않음, available true)', rBrand.available === true && rProd.available === true && rProd.rows.length > 0);

// 8. unsupported 외부 데이터
const rRoas = build({ timeBucket: 'month', dimensions: ['couponUsage'], metrics: ['revenue', 'roas'] });
const rVisitor = build({ timeBucket: 'month', dimensions: ['visitorConversion'], metrics: ['revenue'] });
ok('16. ROAS metric 요청 unsupported + requiredData(adSpend)', rRoas.available === false && Array.isArray(rRoas.requiredData) && rRoas.requiredData.includes('adSpend'));
ok('17. 방문자 전환율 dimension 요청 unsupported + requiredData(visitorSessions)', rVisitor.available === false && (rVisitor.requiredData || []).includes('visitorSessions'));
ok('18. unsupported 결과는 0 채움/추정 없음(rows 비어있음)', rRoas.rows.length === 0 && rVisitor.rows.length === 0);
// 3개 이상 dimension unsupported
const r3dim = build({ timeBucket: 'month', dimensions: ['couponUsage', 'firstRepeat', 'memberGroup'], metrics: ['revenue'] });
ok('19. dimension 3개 이상 unsupported', r3dim.available === false && /2개/.test(r3dim.unavailableReason || ''));
// 2개 dimension 조합 지원
const r2dim = build({ timeBucket: 'month', dimensions: ['couponUsage', 'firstRepeat'], metrics: ['revenue', 'orderCount'] });
ok('20. 2개 dimension(couponUsage×firstRepeat) 지원 + secondaryDimension', r2dim.available && r2dim.rows.some((x) => x.secondaryDimensionKey === 'first' || x.secondaryDimensionKey === 'repeat'));

// 9. insights
ok('21. insights ≥ 1 생성(지원 요청)', r1.insights.length >= 1 && r2.insights.length >= 1);
ok('22. insights 인과 단정 금지어 없음(때문에/덕분에/원인입니다)', [r1, r2, r3, r4, r5, r6].every((r) => !r.insights.some((i) => /때문에|덕분에|원인입니다/.test(i.summary))));
ok('23. evidence 존재', r1.evidence.length > 0 && r2.evidence.length > 0);

// 10. PII self-check
const allResults = [r1, r2, r3, r4, r5, r6, r7, rBrand, rProd, r2dim];
ok('24. 모든 결과 piiCheck.containsPii === false', allResults.every((r) => r.piiCheck.containsPii === false));
ok('25. result(데이터부) JSON에 PII/memberKey 직접 포함 없음', (() => {
  // piiCheck.checkedKeys는 금지 키 "목록"(정책 메타)이라 키 이름이 들어있는 게 정상 → 제외하고 스캔.
  const blob = JSON.stringify(allResults.map((r) => ({ ...r, piiCheck: undefined })));
  return !['"name"', '"phone"', '"email"', '"address"', 'receiverName', 'memberKey', 'syn_member_', '가상고객', '010-0000', '@example.test'].some((k) => blob.includes(k));
})());

// 보조 함수 단위
ok('26. getMarketingTimeBucketKey month/year/quarter', C.getMarketingTimeBucketKey('2026-03-15 10:00:00', 'month') === '2026-03' && C.getMarketingTimeBucketKey('2026-03-15', 'year') === '2026' && C.getMarketingTimeBucketKey('2026-05-01', 'quarter') === '2026-Q2');
ok('27. getMarketingDimensionKey couponUsage/firstRepeat', C.getMarketingDimensionKey({ discountSummary: { hasCoupon: true } }, 'couponUsage').key === 'coupon' && C.getMarketingDimensionKey({ isFirstPurchase: true }, 'firstRepeat').key === 'first');
ok('28. buildDefaultMarketingCrosstabRequests ≥ 5', C.buildDefaultMarketingCrosstabRequests().length >= 5);
ok('29. totals = baseline+promotion 합산(전체 매출 > 0)', r2.totals.revenue > 0 && r2.totals.orderCount > 0);

console.log('\n--- 요약 ---');
console.log(`월별쿠폰 rows=${r1.rows.length}, scenario rows=${r2.rows.length}, 회원그룹 rows=${r3.rows.length}`);
console.log('scenario:', JSON.stringify(r2.rows.map((x) => `${x.dimensionLabel} 매출 ${x.revenue} 쿠폰할인 ${x.couponDiscountAmount}`)));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
