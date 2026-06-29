#!/usr/bin/env node
/*
 * scripts/smoke-marketing-intelligence-planner-v0.mjs
 * Marketing Intelligence Planner v0 검증.
 *  - 질문 → plan → capability 검증 → 실행 → chartSpec + narrative
 *  - 계산 가능 질문 handled/available, 전환율/ROAS는 required_data/proxy, 관계 분석, PII/인과 가드
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-intel-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-intel-src-'));
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
console.log('=== Marketing Intelligence Planner v0 smoke ===');

ok('1. marketingIntelligencePlanner.ts 존재', existsSync(path.join(REPO, 'src/services/marketingIntelligencePlanner.ts')));
ok('2. buildMarketingDataCapabilityMap export', typeof P.buildMarketingDataCapabilityMap === 'function');
ok('3. parseMarketingQuestionToPlan export', typeof P.parseMarketingQuestionToPlan === 'function');
ok('4. validateMarketingIntelligencePlan export', typeof P.validateMarketingIntelligencePlan === 'function');
ok('5. executeMarketingIntelligencePlan export', typeof P.executeMarketingIntelligencePlan === 'function');
ok('6. recommendMarketingChartForPlan export', typeof P.recommendMarketingChartForPlan === 'function');
ok('7. buildMarketingIntelligenceResponse export', typeof P.buildMarketingIntelligenceResponse === 'function');
ok('   buildMarketingRelationshipSummary / assertNoPii export', typeof P.buildMarketingRelationshipSummary === 'function' && typeof P.assertMarketingIntelligenceNoPii === 'function');

// capability map
const cap = P.buildMarketingDataCapabilityMap();
ok('8. capability map: available metrics 포함(revenue/couponUsageRate/firstPurchaseRevenue 등)', ['revenue', 'averageOrderValue', 'couponUsageRateWithinOrders', 'firstPurchaseRevenue', 'revenueShare'].every((k) => cap.availableMetrics.some((m) => m.key === k)));
ok('9. capability map: unavailable에 ROAS/visitor/signup 전환율', ['ROAS', 'visitorConversionRate', 'signupToPurchaseConversionRate'].every((k) => cap.unavailableMetrics.some((m) => m.key === k)));

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26', includeBaselineYear: true });
const nowMs = Date.parse('2026-06-27T00:00:00');
const ask = (message) => P.buildMarketingIntelligenceResponse({ message, orders: u.orders, products, reviews: u.reviews, inquiries: u.inquiries, nowMs });
const FORBIDDEN = ['월별 데이터가 없습니다', '쿠폰 사용 여부 데이터가 없습니다', '주문금액 데이터가 없습니다', '데이터가 없어서', '데이터 없음'];
const CAUSAL = ['때문에', '덕분에', '원인입니다'];
const text = (r) => `${r.reply || ''} ${JSON.stringify(r.artifact || {})}`;

// 대표 질문
const q_coupon = ask('쿠폰기간의 총매출 알려줘');
ok('10. "쿠폰기간의 총매출" handled true', q_coupon.handled === true && q_coupon.result.available === true);
const q_newCouponRate = ask('신규회원의 쿠폰 사용율이 궁금해');
ok('11. "신규회원 쿠폰 사용율" handled + couponUsageRate 실행', q_newCouponRate.handled === true && q_newCouponRate.plan.executableMetrics.includes('couponUsageRateWithinOrders'));
const q_conv = ask('신규회원의 구매전환율이 궁금해');
ok('12. "신규회원 구매전환율" partial_with_proxy 또는 required_data + proxy chartSpec', q_conv.handled === true && ['partial_with_proxy', 'required_data'].includes(q_conv.result.narrative.answerType) && q_conv.result.requiredData.length > 0);
ok('    구매전환율 proxy chartSpec 생성(partial이면 available true)', q_conv.result.narrative.answerType === 'required_data' || q_conv.result.primaryChartSpec.available === true);
const q_yoy = ask('2025년과 2026년 1월부터 6월까지의 월별 매출을 비교해줘');
ok('13. "2025/2026 월별 매출 비교" handled + 연도 series', q_yoy.handled === true && q_yoy.result.available === true && q_yoy.result.primaryChartSpec.series.length >= 2 && q_yoy.plan.comparison === 'year_over_year');
const q_seg = ask('VIP 재구매회원의 객단가가 일반회원보다 높은지 보여줘');
ok('14. "VIP/재구매 vs 일반 객단가" handled + memberGroup 비교', q_seg.handled === true && q_seg.result.available === true && q_seg.plan.dimensions.includes('memberGroup'));
const q_couponMonthly = ask('쿠폰 사용 고객과 미사용 고객의 객단가 차이를 월별로 보여줘');
ok('15. "쿠폰 사용/미사용 월별 객단가" handled + couponUsage 차원', q_couponMonthly.handled === true && q_couponMonthly.result.available === true && q_couponMonthly.plan.dimensions.includes('couponUsage'));
const q_catCoupon = ask('카테고리별로 쿠폰 사용률과 매출 비중을 비교해줘');
ok('16. "카테고리 쿠폰/매출비중" handled', q_catCoupon.handled === true);
const q_inqRev = ask('문의가 많은 상품의 매출이 낮은지 확인해줘');
ok('17. "문의 많은 상품 매출" handled + relationship', q_inqRev.handled === true && (q_inqRev.result.relationshipSummary !== undefined || q_inqRev.result.available === true));
const q_review = ask('리뷰 평점이 낮은 상품군의 매출 비중을 보여줘');
ok('18. "리뷰 평점/매출비중" handled', q_review.handled === true);
const q_yoyNew = ask('작년 대비 올해 신규회원 매출 비중이 어떻게 달라졌어?');
ok('19. "작년 대비 신규회원 매출비중" handled', q_yoyNew.handled === true && q_yoyNew.plan.segments.some((s) => s.key === '신규회원'));
const q_roas = ask('ROAS 알려줘');
ok('20. "ROAS" required_data + available false + requiredData', q_roas.handled === true && q_roas.result.narrative.answerType === 'required_data' && q_roas.result.available === false && q_roas.result.requiredData.some((r) => r.requiredData.includes('adSpend')));
const q_visitor = ask('방문자 전환율 알려줘');
ok('21. "방문자 전환율" required_data + visitorSessions', q_visitor.handled === true && q_visitor.result.narrative.answerType === 'required_data' && q_visitor.result.requiredData.some((r) => r.requiredData.includes('visitorSessions')));

// 금지 문구 / 인과
const calc = [q_coupon, q_newCouponRate, q_yoy, q_seg, q_couponMonthly];
ok('22. 계산 가능 질문은 "데이터 없음"류 미사용', calc.every((r) => !FORBIDDEN.some((p) => text(r).includes(p))));
ok('23. 계산 가능 질문 "계산 가능합니다" 포함', calc.every((r) => /계산 가능합니다/.test(r.reply)));
const all = [q_coupon, q_newCouponRate, q_conv, q_yoy, q_seg, q_couponMonthly, q_catCoupon, q_inqRev, q_review, q_yoyNew, q_roas, q_visitor];
ok('24. 인과 단정어(때문에/덕분에/원인입니다) 없음', all.every((r) => !CAUSAL.some((c) => text(r).includes(c))));

// PII
ok('25. 모든 result piiCheck.containsPii === false', all.every((r) => r.result.piiCheck.containsPii === false));
ok('26. artifact/응답에 PII/memberKey/raw order 없음', (() => {
  const blob = all.map((r) => text(r)).join(' ');
  return !['"name"', '"phone"', '"email"', '"address"', 'receiverName', 'memberKey', 'syn_member_', '가상고객', '010-0000', '@example.test'].some((k) => blob.includes(k));
})());
ok('27. artifact.plan에 raw order row 없음(집계/계획만)', all.every((r) => { const a = r.artifact; if (!a) return true; const blob = JSON.stringify(a.plan || {}); return !/orderNo|totalAmount|orderGoodsData/.test(blob); }));

// 일반 대화 fallback
const chitchat = P.buildMarketingIntelligenceResponse({ message: '안녕하세요 오늘 기분 어때요', orders: u.orders, products, nowMs });
ok('28. 분석 의도 없는 일반 대화는 handled=false(fallback)', chitchat.handled === false);

// chart recommendation / relationship 단위
ok('29. recommendMarketingChartForPlan: trend→line, share(category)→rankedBar', (() => {
  const p1 = P.parseMarketingQuestionToPlan({ message: '월별 매출 추이 보여줘' });
  const p2 = P.parseMarketingQuestionToPlan({ message: '카테고리별 매출 비중 보여줘' });
  return P.recommendMarketingChartForPlan(p1).chartType === 'line' && ['rankedBar', 'donut'].includes(P.recommendMarketingChartForPlan(p2).chartType);
})());
ok('30. buildMarketingRelationshipSummary 상관계수 + 인과 단정 아님 note', (() => {
  const rel = P.buildMarketingRelationshipSummary({ rows: [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }, { x: 4, y: 40 }], xMetric: 'inquiryCount', yMetric: 'revenue' });
  return typeof rel.correlation === 'number' && rel.notes.some((nn) => /원인을 증명하지 않습니다/.test(nn));
})());

console.log('\n--- 요약 ---');
console.log(`coupon series=${q_coupon.result.primaryChartSpec.series.length}, yoy series=${q_yoy.result.primaryChartSpec.series.map((s) => s.key).join('/')}, conv=${q_conv.result.narrative.answerType}, roas=${q_roas.result.narrative.answerType}`);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
