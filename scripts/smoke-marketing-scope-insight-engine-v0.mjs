#!/usr/bin/env node
/*
 * scripts/smoke-marketing-scope-insight-engine-v0.mjs
 * Marketing Scope Insight Engine v0 — 질문→분석 범위→insight pack 계약 검증(Q1~Q5).
 *  - "총합만" 응답 금지, 다축 관찰, 연도 비교 series, category/product 차원 유지 + dual metric, PII/인과 가드.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-scope-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-scope-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingScopeInsightEngine.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const E = await import(pathToFileURL(path.join(tmpSrc, 'marketingScopeInsightEngine.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Scope Insight Engine v0 smoke ===');

ok('1. marketingScopeInsightEngine.ts 존재', existsSync(path.join(REPO, 'src/services/marketingScopeInsightEngine.ts')));
ok('2. buildMarketingScopeInsightResponse export', typeof E.buildMarketingScopeInsightResponse === 'function');
ok('3. interpretMarketingQuestion / buildMarketingScopeInsightNarrative / adapter export', typeof E.interpretMarketingQuestion === 'function' && typeof E.buildMarketingScopeInsightNarrative === 'function' && typeof E.adaptScopeInsightChartToMarketingChartSpec === 'function');

const products = Array.from({ length: 6 }, (_, i) => ({
  productId: String(1001 + i), productCode: `A-${1001 + i}`, productName: `상품${i + 1}`, price: 10000 + i * 2000, fixedPrice: 15000 + i * 2000,
  stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true,
  categoryCode: ['003', '004', '005'][i % 3], allCategoryCode: ['003', '004', '005'][i % 3], brandCode: ['001', '002'][i % 2],
  registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: ''
}));
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, includeBaselineYear: true });
const nowMs = Date.parse('2026-06-27T00:00:00');
const ask = (m) => E.buildMarketingScopeInsightResponse({ message: m, orders: u.orders, products, reviews: u.reviews, inquiries: u.inquiries, nowMs });
const CAUSAL = ['때문에', '덕분에', '원인입니다'];
const blob = (r) => `${r.reply || ''} ${JSON.stringify(r.result?.narrative || {})} ${JSON.stringify(r.artifact || {})}`;
const hasAxes = (r, words) => words.filter((w) => r.reply.includes(w)).length;

// ── Q1 ──
const q1 = ask('2024년 1월부터 12월까지 월별 매출을 그래프로 보여줘');
const tt1 = q1.result.insightPack.timeTrend;
console.log('  [Q1] focus:', q1.result.primaryQuestion.focus, 'months:', tt1?.points.length, 'hi/lo:', tt1?.highestRevenuePoint, tt1?.lowestRevenuePoint);
ok('4. Q1 handled', q1.handled === true);
ok('5. Q1 timeTrend 12개월 + 2024만', !!tt1 && tt1.points.length === 12 && tt1.points.every((p) => p.bucketKey.startsWith('2024-')));
ok('6. Q1 chart 12 data points', q1.artifact.chartSpec.series[0].points.length === 12);
ok('7. Q1 narrative가 "총합"만 말하지 않음(섹션 다수)', q1.result.narrative.sections.length >= 4);
ok('8. Q1 narrative에 최고/최저/상승/하락 중 3개+', ['최고 매출', '최저', '오른 구간', '낮아진 구간'].filter((w) => blob(q1).includes(w)).length >= 3);
ok('9. Q1 narrative에 카테고리/상품/고객·회원그룹/쿠폰·채널 중 3축+', hasAxes(q1, ['카테고리', '상품', '회원그룹', '첫구매', '재구매', '쿠폰', '채널']) >= 3);
ok('10. Q1 insightPack 다축 채움(category/product/customer/promotion/channel)', !!q1.result.insightPack.categoryBreakdown && !!q1.result.insightPack.productBreakdown && !!q1.result.insightPack.customerBreakdown && !!q1.result.insightPack.promotionBreakdown);

// ── Q2 ──
const q2 = ask('2025년 1월부터 12월까지 월별 매출을 그래프로 보여줘');
const tt2 = q2.result.insightPack.timeTrend;
ok('11. Q2 handled + 12개월 2025만', q2.handled === true && !!tt2 && tt2.points.length === 12 && tt2.points.every((p) => p.bucketKey.startsWith('2025-')));
ok('12. Q2 narrative 총합만 아님', q2.result.narrative.sections.length >= 4);

// ── Q3 ──
const q3 = ask('2024년과 2025년 월별 매출을 비교해줘');
const cs3 = q3.artifact.chartSpec;
console.log('  [Q3] chartType:', cs3.chartType, 'series:', JSON.stringify(cs3.series.map((s) => s.label)));
ok('13. Q3 year_compare handled', q3.handled === true && q3.result.primaryQuestion.focus === 'year_compare');
ok('14. Q3 series 2024/2025 + 12개월', cs3.series.length === 2 && cs3.series.some((s) => /2024/.test(s.label)) && cs3.series.some((s) => /2025/.test(s.label)) && cs3.series[0].points.length === 12);
ok('15. Q3 narrative에 월별 비교/우세 월/최대 격차', /더 높게|우세|개월/.test(blob(q3)) && /가장 큰|차이가 가장/.test(blob(q3)));

// ── Q4 ──
const q4 = ask('카테고리별 쿠폰 사용률과 매출 비중의 관계를 보여줘');
const cat4 = q4.result.insightPack.categoryBreakdown || [];
console.log('  [Q4] dim:', q4.result.primaryQuestion.primaryDimension, 'metrics:', q4.result.primaryQuestion.primaryMetric, q4.result.primaryQuestion.secondaryMetric, 'chart:', q4.artifact.chartSpec.chartType);
ok('16. Q4 category dimension 유지', q4.result.primaryQuestion.primaryDimension === 'category' && cat4.length >= 2);
ok('17. Q4 couponUsageRate + revenueShare 둘 다 포함', q4.result.primaryQuestion.primaryMetric === 'couponUsageRate' && q4.result.primaryQuestion.secondaryMetric === 'revenueShare' && cat4.every((c) => typeof c.couponUsageRate === 'number' && typeof c.revenueShare === 'number'));
ok('18. Q4 0/100 단순 coupon split 금지(쿠폰 미사용/사용 series 아님)', !q4.artifact.chartSpec.series.some((s) => s.points.some((p) => p.bucketLabel === '쿠폰 사용' || p.bucketLabel === '쿠폰 미사용')) && !cat4.every((c) => c.couponUsageRate === 0 || c.couponUsageRate === 100));
ok('19. Q4 primaryChart에 두 metric(dualMetric secondaryValue) 포함', q4.result.primaryChart.secondaryMetric === 'revenueShare' && q4.result.primaryChart.series[0].points.some((p) => p.secondaryValue != null));
ok('20. Q4 narrative에 쿠폰 사용률/매출 비중/관계 언급', /쿠폰 사용률/.test(blob(q4)) && /매출 비중|비중/.test(blob(q4)) && /상관|관계/.test(blob(q4)));

// ── Q5 ──
const q5 = ask('문의가 많은 상품의 매출이 낮은지 확인해줘');
const prod5 = q5.result.insightPack.productBreakdown || [];
const inqVals = q5.result.primaryChart.series[0].points.map((p) => p.value);
const revAll = u.orders.filter((o) => o.state && o.state.paid && !o.state.canceled).reduce((t, o) => t + (Number(o.totalAmount) || 0), 0);
console.log('  [Q5] dim:', q5.result.primaryQuestion.primaryDimension, 'primary:', q5.result.primaryQuestion.primaryMetric, 'inqVals:', JSON.stringify(inqVals.slice(0, 4)));
ok('21. Q5 product dimension 유지', q5.result.primaryQuestion.primaryDimension === 'product' && prod5.length >= 2);
ok('22. Q5 inquiryCount + revenue 둘 다 포함', q5.result.primaryQuestion.primaryMetric === 'inquiryCount' && q5.result.primaryQuestion.secondaryMetric === 'revenue' && prod5.every((p) => typeof p.inquiryCount === 'number' && typeof p.revenue === 'number'));
ok('23. Q5 inquiryCount가 revenue 총액으로 둔갑하지 않음', !inqVals.includes(revAll) && Math.max(...inqVals, 0) <= u.inquiries.length && Math.max(...inqVals, 0) < 100000);
ok('24. Q5 narrative 문의수=매출 둔갑 문구 부재', !/문의[^]*?[0-9]{7,}건/.test(blob(q5)));
ok('25. Q5 relationship(문의수 vs 매출) 방향 언급', !!(q5.result.insightPack.relationships || []).find((r) => r.xMetric === 'inquiryCount') && /문의|관계|상관/.test(blob(q5)));

// ── 공통 가드 ──
const all = [q1, q2, q3, q4, q5];
ok('26. 모든 응답 piiCheck.containsPii false', all.every((r) => r.result.piiCheck.containsPii === false));
ok('27. PII/memberKey/orderNo/raw 미노출', !all.some((r) => /memberKey|syn_member_|"name"|orderNo|010-0000|@example\.test/.test(blob(r))));
ok('28. 인과 단정어(때문에/덕분에/원인입니다) 부재', !all.some((r) => CAUSAL.some((c) => blob(r).includes(c))));
ok('29. "총합만 말하고 끝" 금지(모든 응답 섹션≥3)', all.every((r) => r.result.narrative.sections.length >= 3));
ok('30. adapter: insight chart → MarketingChartSpec(source temporal_crosstab, chartType 매핑)', (() => {
  const cs = E.adaptScopeInsightChartToMarketingChartSpec(q4.result.primaryChart);
  return cs.source === 'temporal_crosstab' && ['line', 'groupedBar', 'rankedBar', 'table', 'unsupported'].includes(cs.chartType);
})());
ok('31. 분석 의도 없는 잡담은 handled=false', E.buildMarketingScopeInsightResponse({ message: '안녕하세요 점심 뭐 먹지', orders: u.orders, products, nowMs }).handled === false);
ok('32. 2024 baseline 쿠폰 효과 해석 주의 경고(Q1)', q1.result.narrative.causalCautions.some((c) => /baseline|쿠폰/.test(c)));

console.log(`\n--- 요약 ---\nQ1 months=${tt1?.points.length} hi=${tt1?.highestRevenuePoint} / Q3 chart=${cs3.chartType} / Q4 dim=${q4.result.primaryQuestion.primaryDimension} / Q5 maxInq=${Math.max(...inqVals, 0)} 문의총수=${u.inquiries.length}`);
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
