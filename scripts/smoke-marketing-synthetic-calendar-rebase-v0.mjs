#!/usr/bin/env node
/*
 * scripts/smoke-marketing-synthetic-calendar-rebase-v0.mjs
 * Marketing Synthetic Calendar Rebase v0 검증.
 *  - synthetic 기간 고정 달력: 2024-01-01 ~ 2025-12-31 (baseline=2024 쿠폰0 / promotion=2025 쿠폰>0)
 *  - 2023/2026 데이터 없음, 12개월 bucket, firstPurchase 재계산, reviews/inquiries 기간 정합성, PII
 *  - fixture 질문: 2024/2025 월별·비교가 handled, 2026 미참조
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-rebase-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-rebase-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingIntelligencePlanner.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const P = await import(pathToFileURL(path.join(tmpSrc, 'marketingIntelligencePlanner.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Synthetic Calendar Rebase v0 smoke ===');

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
// options.endDate는 무시되어야 함(고정 달력 우선) — 일부러 2026 전달
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26', includeBaselineYear: true });
const orders = u.orders;
const nowMs = Date.parse('2026-06-27T00:00:00');
const ymd = (s) => String(s || '').slice(0, 10);
const yearOf = (s) => Number(String(s || '').slice(0, 4));

// ── 상수 export ──
ok('1. SYNTHETIC_CALENDAR export(2024-01-01~2025-12-31, baseline 2024/promotion 2025)', U.SYNTHETIC_CALENDAR && U.SYNTHETIC_CALENDAR.startDate === '2024-01-01' && U.SYNTHETIC_CALENDAR.endDate === '2025-12-31' && U.SYNTHETIC_CALENDAR.baselineYear === 2024 && U.SYNTHETIC_CALENDAR.promotionYear === 2025);

// ── 기간 ──
const dates = orders.map((o) => ymd(o.orderDate)).sort();
const minD = dates[0], maxD = dates[dates.length - 1];
ok('2. order min date >= 2024-01-01', minD >= '2024-01-01');
ok('3. order max date <= 2025-12-31', maxD <= '2025-12-31');
const years = new Set(orders.map((o) => yearOf(o.orderDate)));
ok('4. 2024년 주문 존재', orders.some((o) => yearOf(o.orderDate) === 2024));
ok('5. 2025년 주문 존재', orders.some((o) => yearOf(o.orderDate) === 2025));
ok('6. 2023년 주문 없음', !orders.some((o) => yearOf(o.orderDate) === 2023));
ok('7. 2026년 주문 없음', !orders.some((o) => yearOf(o.orderDate) === 2026));
ok('8. 주문 연도는 2024/2025만', [...years].every((y) => y === 2024 || y === 2025));

const monthsOf = (yr) => new Set(orders.filter((o) => yearOf(o.orderDate) === yr).map((o) => ymd(o.orderDate).slice(5, 7)));
ok('9. 2024년 12개월 모두 주문 존재', monthsOf(2024).size === 12);
ok('10. 2025년 12개월 모두 주문 존재', monthsOf(2025).size === 12);

// ── scenario/year label ──
const base = orders.filter((o) => o.syntheticYearLabel === 'baseline');
const promo = orders.filter((o) => o.syntheticYearLabel === 'promotion');
ok('11. baseline 라벨은 모두 2024년', base.length > 0 && base.every((o) => yearOf(o.orderDate) === 2024));
ok('12. promotion 라벨은 모두 2025년', promo.length > 0 && promo.every((o) => yearOf(o.orderDate) === 2025));
ok('13. 2024는 baseline_no_promotion, 2025는 promotion_year scenario', base.every((o) => o.syntheticScenario === 'baseline_no_promotion') && promo.every((o) => o.syntheticScenario === 'promotion_year'));

// ── coupon policy ──
const couponSum = (arr) => arr.reduce((t, o) => t + ((o.discountSummary && o.discountSummary.totalCouponDiscountAmount) || 0), 0);
ok('14. 2024 coupon orders = 0 (hasCoupon false)', base.every((o) => o.discountSummary && o.discountSummary.hasCoupon === false));
ok('15. 2024 couponDiscountAmount 합계 = 0', couponSum(base) === 0);
ok('16. 2025 coupon orders > 0', promo.some((o) => o.discountSummary && o.discountSummary.hasCoupon === true));
ok('17. 2025 couponDiscountAmount 합계 > 0', couponSum(promo) > 0);

// ── firstPurchase 전역 재계산 ──
const fpByMember = new Map();
for (const o of orders) {
  if (!o.memberKey) continue;
  const arr = fpByMember.get(o.memberKey) || [];
  arr.push(o); fpByMember.set(o.memberKey, arr);
}
const paidNonCancel = (o) => o.state && o.state.paid && !o.state.canceled;
let fpOk = true, repeatAcrossYears = false, crossYearOk = true;
for (const arr of fpByMember.values()) {
  const firsts = arr.filter((o) => o.isFirstPurchase === true);
  if (firsts.length > 1) fpOk = false; // 회원당 최대 1건
  // 2024에 "결제완료" 구매한 회원이 2025에도 구매 → 첫구매는 2024쪽, 2025 주문은 첫구매 아님
  const paid2024 = arr.some((o) => yearOf(o.orderDate) === 2024 && paidNonCancel(o));
  const paid2025 = arr.some((o) => yearOf(o.orderDate) === 2025 && paidNonCancel(o));
  if (paid2024 && paid2025) { repeatAcrossYears = true; if (arr.some((o) => yearOf(o.orderDate) === 2025 && o.isFirstPurchase === true)) crossYearOk = false; }
}
ok('18. firstPurchase 회원당 최대 1건(전역 재계산)', fpOk);
ok('19. 2024 결제 회원이 2025 재구매 시 repeatPurchase(첫구매는 2024쪽)', repeatAcrossYears && crossYearOk);

// ── reviews/inquiries/claims 기간 정합성 ──
const rDates = (u.reviews || []).map((r) => ymd(r.createdAt));
const iDates = (u.inquiries || []).map((q) => ymd(q.createdAt));
ok('20. reviews createdAt 모두 2024-01-01 ~ 2025-12-31', rDates.length > 0 && rDates.every((d) => d >= '2024-01-01' && d <= '2025-12-31'));
ok('21. inquiries createdAt 모두 2024-01-01 ~ 2025-12-31', iDates.length > 0 && iDates.every((d) => d >= '2024-01-01' && d <= '2025-12-31'));
const derivedDates = orders.flatMap((o) => [o.paymentDt, o.deliveryDt, o.cancelDt, o.finishDt].filter(Boolean).map(ymd));
ok('22. 주문 파생일(결제/배송/취소/완료) 모두 <= 2025-12-31', derivedDates.every((d) => d <= '2025-12-31') && derivedDates.length > 0);

// ── PII self-check ──
ok('23. 분석 주문에 PII 키(name/phone/email/address/memberKey 노출)는 별개 — orders는 memberKey만(분석 허용), contact PII 분리', (u.contacts || []).length > 0 && orders.every((o) => o.customerName === undefined && o.phone === undefined && o.email === undefined));

// ── fixture 질문(기간 정합성만, 깊은 품질 아님) ──
const ask = (m) => P.buildMarketingIntelligenceResponse({ message: m, orders, products, reviews: u.reviews, inquiries: u.inquiries, nowMs });
const q24 = ask('2024년 1월부터 12월까지 월별 매출을 그래프로 보여줘');
ok('24. 2024년 월별 매출 질문 handled + available', q24.handled === true && q24.result.available === true);
const q25 = ask('2025년 1월부터 12월까지 월별 매출을 그래프로 보여줘');
ok('25. 2025년 월별 매출 질문 handled + available', q25.handled === true && q25.result.available === true);
const qCmp = ask('2024년과 2025년 1월부터 12월까지의 월별 매출을 비교해줘');
ok('26. 2024/2025 월별 비교 handled + year_over_year', qCmp.handled === true && qCmp.result.available === true && qCmp.plan.comparison === 'year_over_year');
ok('27. 비교 chartSpec에 2024/2025 series 존재', qCmp.result.primaryChartSpec.series.length >= 2 && qCmp.result.primaryChartSpec.series.some((s) => /2024/.test(s.key + s.label)) && qCmp.result.primaryChartSpec.series.some((s) => /2025/.test(s.key + s.label)));
ok('28. 비교가 2026을 참조하지 않음', !qCmp.result.primaryChartSpec.series.some((s) => /2026/.test(s.key + s.label)) && !qCmp.result.primaryChartSpec.series.some((s) => s.points.some((p) => /2026/.test(p.bucketKey))));
const qH1 = ask('2025년 상반기 월별 매출을 보여줘');
const qH2 = ask('2025년 하반기 월별 매출을 보여줘');
ok('29. 2025 상/하반기 질문 handled', qH1.handled === true && qH2.handled === true);
const qCoupon = ask('쿠폰 사용 고객과 미사용 고객의 객단가 차이를 월별로 보여줘');
ok('30. 쿠폰 사용/미사용 월별 객단가 handled + available', qCoupon.handled === true && qCoupon.result.available === true);
ok('31. 모든 fixture 응답 piiCheck false', [q24, q25, qCmp, qH1, qH2, qCoupon].every((r) => r.result.piiCheck.containsPii === false));

console.log(`\n--- 요약 ---\n총주문=${orders.length}, min=${minD}, max=${maxD}, baseline=${base.length}, promotion=${promo.length}, 2025쿠폰합=${couponSum(promo)}`);
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
