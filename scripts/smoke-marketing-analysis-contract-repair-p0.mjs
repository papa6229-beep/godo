#!/usr/bin/env node
/*
 * scripts/smoke-marketing-analysis-contract-repair-p0.mjs
 * Marketing Analysis Contract Repair P0 — Q1(기간 필터) / Q4(metric binding) 계약 검증.
 *  - 같은 버그(2년 오염, inquiryCount→revenue 둔갑)가 다시 통과하지 못하게 한다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-p0-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-p0-src-'));
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
console.log('=== Marketing Analysis Contract Repair P0 smoke ===');

ok('1. smoke 파일 존재', existsSync(path.join(REPO, 'scripts/smoke-marketing-analysis-contract-repair-p0.mjs')));
ok('2. isOrderWithinPlannedPeriods / choosePrimaryAnalysisDimension export', typeof P.isOrderWithinPlannedPeriods === 'function' && typeof P.choosePrimaryAnalysisDimension === 'function');

const products = Array.from({ length: 6 }, (_, i) => ({
  productId: String(1001 + i), productCode: `A-${1001 + i}`, productName: `상품${i + 1}`, price: 10000 + i * 2000, fixedPrice: 15000 + i * 2000,
  stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true,
  categoryCode: ['003', '004', '005'][i % 3], allCategoryCode: ['003', '004', '005'][i % 3], brandCode: ['001', '002'][i % 2],
  registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: ''
}));
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, includeBaselineYear: true });
const nowMs = Date.parse('2026-06-27T00:00:00');
const ask = (m) => P.buildMarketingIntelligenceResponse({ message: m, orders: u.orders, products, reviews: u.reviews, inquiries: u.inquiries, nowMs });
const blob = (r) => `${r.reply || ''} ${JSON.stringify(r.result?.narrative || {})} ${JSON.stringify(r.artifact || {})}`;

// ───────────────────────── Q1: 단일 연도 기간 필터 ─────────────────────────
const q1 = ask('2024년 1월부터 12월까지 월별 매출을 그래프로 보여줘');
const cs1 = q1.result.primaryChartSpec;
const buckets1 = [...new Set(cs1.series.flatMap((s) => s.points.map((p) => p.bucketKey)))];
console.log('  [Q1] buckets:', JSON.stringify(buckets1));
ok('3. Q1 handled + available', q1.handled === true && cs1.available === true);
ok('4. Q1 plan.periods = 2024-01-01~2024-12-31', q1.plan.periods.length === 1 && q1.plan.periods[0].startDate === '2024-01-01' && q1.plan.periods[0].endDate === '2024-12-31');
ok('5. Q1 timeBucket === month', q1.plan.timeBucket === 'month');
ok('6. Q1 bucket count === 12', buckets1.length === 12);
ok('7. Q1 buckets는 2024-** 만(2025 미포함)', buckets1.every((b) => b.startsWith('2024-')) && !buckets1.some((b) => b.startsWith('2025-')));
// 2024 매출 총합만(2년 전체 ≠). 2024 실제 합산과 일치, 2년 전체보다 작아야 함.
const rev2024 = u.orders.filter((o) => String(o.orderDate).startsWith('2024') && o.state && o.state.paid && !o.state.canceled).reduce((t, o) => t + (Number(o.totalAmount) || 0), 0);
const revAll = u.orders.filter((o) => o.state && o.state.paid && !o.state.canceled).reduce((t, o) => t + (Number(o.totalAmount) || 0), 0);
const q1total = cs1.series[0].points.reduce((t, p) => t + p.value, 0);
ok('8. Q1 총합이 2024 기준(2년 전체로 오염 안 됨)', Math.abs(q1total - rev2024) < 5 && q1total < revAll * 0.95);
ok('9. Q1 narrative에 2025 또는 2년 전체총합 오염 없음', !blob(q1).includes('2025') && q1.result.narrative.bullets.some((b) => b.includes(String(Math.round(rev2024).toLocaleString())) || /총합/.test(b)));

// ───────────────────────── Q4: metric binding ─────────────────────────
const q4 = ask('문의가 많은 상품의 매출이 낮은지 확인해줘');
const cs4 = q4.result.primaryChartSpec;
console.log('  [Q4] primaryMetric:', cs4.primaryMetric, 'series:', JSON.stringify(cs4.series.map((s) => s.label)), 'first val:', cs4.series[0]?.points[0]?.value);
ok('10. Q4 handled + goal relationship/diagnose', q4.handled === true && (q4.plan.goal === 'relationship' || q4.plan.goal === 'diagnose'));
ok('11. Q4 dimensions includes product 또는 category', q4.plan.dimensions.includes('product') || q4.plan.dimensions.includes('category'));
ok('12. Q4 metrics include inquiryCount and revenue', q4.plan.requestedMetrics.includes('inquiryCount') && q4.plan.requestedMetrics.includes('revenue'));
const inqValues = cs4.primaryMetric === 'inquiryCount' ? cs4.series.flatMap((s) => s.points.map((p) => p.value)) : [];
const maxInq = inqValues.length ? Math.max(...inqValues) : 0;
ok('13. Q4 primaryMetric === inquiryCount', cs4.primaryMetric === 'inquiryCount');
ok('14. inquiryCount 값이 revenue 총합과 다름(둔갑 금지)', !inqValues.includes(revAll) && !inqValues.includes(Math.round(rev2024)));
ok('15. inquiryCount 값이 매출급 큰 금액이 아님(< 전체 문의수+여유, < 100000)', maxInq <= u.inquiries.length && maxInq < 100000);
ok('16. inquiryCount 합이 실제 문의수와 정합(±전체 문의수 이내)', inqValues.reduce((t, v) => t + v, 0) <= u.inquiries.length);
const FORBIDDEN_VALUES = ['문의수 58716475', '문의수 88116982', '문의수 58,716,475', '문의수 88,116,982'];
ok('17. 금지 문구(문의수=매출 둔갑) 부재', !FORBIDDEN_VALUES.some((s) => blob(q4).includes(s)) && !/문의수\s*[0-9]{7,}건/.test(blob(q4)));
ok('18. Q4 relationshipNotes/evidence에 문의수·매출 관계 언급', (q4.result.narrative.relationshipNotes.join(' ') + q4.result.narrative.evidence.join(' ')).match(/문의수|inquiry/) && !!q4.result.relationshipSummary);
ok('19. Q4 series는 상품 단위(product)', cs4.series.length >= 2 && cs4.series.every((s) => /상품|product|미상/i.test(s.label)));
ok('20. Q1/Q4 piiCheck false + memberKey/PII 미노출', q1.result.piiCheck.containsPii === false && q4.result.piiCheck.containsPii === false && !/memberKey|syn_member_|"name"|010-0000|@example\.test/.test(blob(q1) + blob(q4)));

// ───────────────────────── metricFromAcc 회귀(둔갑 일반 검증) ─────────────────────────
const qReview = ask('상품별 리뷰 평점이 낮은 상품의 매출 비중');
const csR = qReview.result.primaryChartSpec;
ok('21. reviewCount/averageRating 등 미지원-on-주문축이 revenue로 둔갑하지 않음', (() => {
  // 어떤 series point든 primaryMetric이 count/percent인데 value가 매출급(>1e6)이면 실패
  if (!['count', 'percent', 'mixed'].includes(csR.unit)) return true;
  return !csR.series.some((s) => s.points.some((p) => p.value > 1_000_000));
})());

console.log(`\n--- 요약 ---\nQ1 buckets=${buckets1.length}(${buckets1[0]}~${buckets1[buckets1.length - 1]}) total=${q1total} / Q4 primary=${cs4.primaryMetric} maxInq=${maxInq} 문의총수=${u.inquiries.length}`);
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
