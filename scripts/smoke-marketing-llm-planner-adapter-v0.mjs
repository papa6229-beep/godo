#!/usr/bin/env node
/*
 * scripts/smoke-marketing-llm-planner-adapter-v0.mjs
 * Marketing LLM Planner Adapter v0 검증 (fake LLM 주입, 네트워크 없음).
 *  - LLM은 plan만, 숫자 생성 reject, capability 검증/normalize, fallback
 *  - 숫자/PII/인과 단정 reject, deterministic executor가 계산, narrative는 deterministic builder
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-llmplan-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-llmplan-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingLlmPlannerAdapter.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const A = await import(pathToFileURL(path.join(tmpSrc, 'marketingLlmPlannerAdapter.js')).href);
const PL = await import(pathToFileURL(path.join(tmpSrc, 'marketingIntelligencePlanner.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing LLM Planner Adapter v0 smoke ===');

ok('1. marketingLlmPlannerAdapter.ts 존재', existsSync(path.join(REPO, 'src/services/marketingLlmPlannerAdapter.ts')));
ok('2. buildMarketingLlmPlannerPrompt export', typeof A.buildMarketingLlmPlannerPrompt === 'function');
ok('3. parseMarketingLlmPlannerJson export', typeof A.parseMarketingLlmPlannerJson === 'function');
ok('4. validateMarketingLlmPlanDraft export', typeof A.validateMarketingLlmPlanDraft === 'function');
ok('5. buildMarketingLlmPlan export', typeof A.buildMarketingLlmPlan === 'function');
ok('   buildMarketingIntelligenceResponseWithLlm export', typeof A.buildMarketingIntelligenceResponseWithLlm === 'function');

const cap = PL.buildMarketingDataCapabilityMap();
const prompt = A.buildMarketingLlmPlannerPrompt({ message: '2025년과 2026년 상반기 월별 매출 비교', capabilityMap: cap, nowIso: '2026-06-27T00:00:00.000Z' });
ok('6. prompt에 allowedMetrics/allowedDimensions/unavailableMetrics 포함', /allowedMetrics/.test(prompt) && /allowedDimensions/.test(prompt) && /unavailableMetrics/.test(prompt) && /revenue/.test(prompt));
ok('7. prompt에 숫자 계산 금지 문구', /숫자를 만들지|NOT allowed to calculate|숫자 결과/.test(prompt));
ok('8. prompt에 JSON only', /JSON만 출력|only one JSON|JSON object만/.test(prompt));

// valid plan
const validDraft = {
  goal: 'compare', requestedMetrics: ['revenue', 'averageOrderValue'],
  periods: [{ label: '2025 상반기', startDate: '2025-01-01', endDate: '2025-06-30' }, { label: '2026 상반기', startDate: '2026-01-01', endDate: '2026-06-30' }],
  timeBucket: 'month', dimensions: ['time'], segments: [], filters: [], comparison: 'year_over_year',
  chartRecommendation: { chartType: 'line', reason: '월별 흐름 비교' }, requiredData: [], warnings: ['관찰값이며 인과관계를 단정하지 않습니다.']
};
const v1 = A.validateMarketingLlmPlanDraft({ draft: validDraft, capabilityMap: cap, originalQuestion: '2025/2026 상반기 월별 매출 비교' });
ok('9. valid draft validation 통과 + plan 구조', v1.ok === true && v1.plan && v1.plan.goal === 'compare' && v1.plan.executableMetrics.includes('revenue') && v1.plan.comparison === 'year_over_year');

// invalid JSON
ok('10. invalid JSON parse 실패(throw)', (() => { try { A.parseMarketingLlmPlannerJson('not a json at all'); return false; } catch { return true; } })());
ok('11. 비-object draft validation 실패', A.validateMarketingLlmPlanDraft({ draft: [1, 2, 3], capabilityMap: cap, originalQuestion: 'x' }).ok === false);

// 숫자 결과 필드 reject
const numericDraft = { ...validDraft, totalRevenue: 38000000, computedResult: 123 };
ok('12. 숫자 결과 필드(totalRevenue/computedResult) reject', A.validateMarketingLlmPlanDraft({ draft: numericDraft, capabilityMap: cap, originalQuestion: 'x' }).ok === false);

// 허용되지 않은 metric / dimension reject
ok('13. 허용되지 않은 metric reject', A.validateMarketingLlmPlanDraft({ draft: { ...validDraft, requestedMetrics: ['magicMetric'] }, capabilityMap: cap, originalQuestion: 'x' }).ok === false);
ok('14. 허용되지 않은 dimension reject', A.validateMarketingLlmPlanDraft({ draft: { ...validDraft, dimensions: ['galaxy'] }, capabilityMap: cap, originalQuestion: 'x' }).ok === false);

// PII key / 인과 단정 reject
ok('15. PII key 포함 draft reject', A.validateMarketingLlmPlanDraft({ draft: { ...validDraft, memberKey: 'syn_member_1' }, capabilityMap: cap, originalQuestion: 'x' }).ok === false);
ok('16. 인과 단정 금지어 포함 draft reject', A.validateMarketingLlmPlanDraft({ draft: { ...validDraft, warnings: ['쿠폰 때문에 매출이 올랐습니다'] }, capabilityMap: cap, originalQuestion: 'x' }).ok === false);

// normalization
const synDraft = { goal: 'compare', requestedMetrics: ['sales', 'aov'], dimensions: ['coupon'], segments: ['newMember'], filters: ['couponUsage'], comparison: 'coupon_vs_non_coupon', chartRecommendation: { chartType: 'bar', reason: 'r' }, timeBucket: 'month' };
const vSyn = A.validateMarketingLlmPlanDraft({ draft: synDraft, capabilityMap: cap, originalQuestion: 'x' });
ok('17. normalize(sales→revenue, aov→AOV, coupon→couponUsage, bar→groupedBar, newMember→신규회원)', vSyn.ok === true && vSyn.plan.requestedMetrics.includes('revenue') && vSyn.plan.requestedMetrics.includes('averageOrderValue') && vSyn.plan.dimensions.includes('couponUsage') && vSyn.plan.segments.some((s) => s.key === '신규회원') && vSyn.plan.chartRecommendation.chartType === 'groupedBar' && vSyn.normalizedFields.length > 0);

// unavailable metric → requiredData
const convDraft = { goal: 'conversion', requestedMetrics: ['signupToPurchaseConversionRate'], dimensions: [], segments: ['newMember'], filters: [], comparison: 'none', chartRecommendation: { chartType: 'groupedBar', reason: 'r' } };
const vConv = A.validateMarketingLlmPlanDraft({ draft: convDraft, capabilityMap: cap, originalQuestion: 'x' });
ok('18. unavailable metric은 dataRequirements로 분리(executable 제외) + proxy', vConv.ok === true && vConv.plan.dataRequirements.some((r) => r.key === 'signupToPurchaseConversionRate') && !vConv.plan.executableMetrics.includes('signupToPurchaseConversionRate') && vConv.plan.proxyPlan);

// ISO date 검증
ok('19. 잘못된 period 날짜 reject', A.validateMarketingLlmPlanDraft({ draft: { ...validDraft, periods: [{ label: 'x', startDate: '2025/01/01', endDate: 'bad' }] }, capabilityMap: cap, originalQuestion: 'x' }).ok === false);

// buildMarketingLlmPlan with fake LLM
const fakeLlm = async () => JSON.stringify(validDraft);
const lp = await A.buildMarketingLlmPlan({ message: '2025/2026 상반기 월별 매출 비교', capabilityMap: cap, callPlannerLlm: fakeLlm, nowMs: Date.parse('2026-06-27T00:00:00') });
ok('20. buildMarketingLlmPlan fake LLM → ok + plan', lp.ok === true && lp.plan && lp.source === 'llm_planner');
const lpFail = await A.buildMarketingLlmPlan({ message: 'x', capabilityMap: cap, callPlannerLlm: async () => 'sorry I cannot', nowMs: 1 });
ok('21. fake LLM invalid 응답 → ok:false', lpFail.ok === false);
const lpThrow = await A.buildMarketingLlmPlan({ message: 'x', capabilityMap: cap, callPlannerLlm: async () => { throw new Error('no key'); }, nowMs: 1 });
ok('22. fake LLM throw → ok:false (네트워크 실패 안전)', lpThrow.ok === false && /llm call failed/.test(lpThrow.errors.join(' ')));

// 통합: deterministic 우선, LLM 미주입이면 deterministic
const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26', includeBaselineYear: true });
const nowMs = Date.parse('2026-06-27T00:00:00');
const det = await A.buildMarketingIntelligenceResponseWithLlm({ message: '월별 쿠폰 사용/미사용 객단가 비교', orders: u.orders, products, nowMs });
ok('23. LLM 미주입 → deterministic 경로 + handled', det.handled === true && det.plannerSource === 'deterministic' && det.result.available === true);

// 빈약한 deterministic + fake LLM → llm_planner 경로
const weakFakeLlm = async () => JSON.stringify({ goal: 'compare', requestedMetrics: ['revenue', 'averageOrderValue'], dimensions: ['couponUsage'], segments: ['newMember'], filters: [], comparison: 'coupon_vs_non_coupon', timeBucket: 'month', chartRecommendation: { chartType: 'groupedBar', reason: 'r' }, warnings: ['관찰값입니다.'] });
const aug = await A.buildMarketingIntelligenceResponseWithLlm({ message: '매출 인사이트 보여줘', orders: u.orders, products, reviews: u.reviews, inquiries: u.inquiries, callPlannerLlm: weakFakeLlm, nowMs });
ok('24. 빈약 질문 + LLM → llm_planner 경로 + artifact source', aug.handled === true && aug.plannerSource === 'llm_planner' && aug.artifact.source === 'marketingLlmPlannerAdapter');
ok('25. LLM 경로 숫자는 deterministic executor가 계산(chartSpec series 값 존재)', aug.result.available === true && aug.result.primaryChartSpec.series.some((s) => s.points.length > 0));
ok('26. LLM 경로 narrative는 deterministic builder(계산 가능합니다 또는 proxy 안내)', /계산 가능합니다|대체|계산하지 않습니다/.test(aug.reply));

// 대표 질문(통합, fake LLM 주입) PII/인과 가드
const fakeIntel = async () => JSON.stringify({ goal: 'diagnose', requestedMetrics: ['revenue', 'orderCount', 'averageOrderValue', 'couponUsageRateWithinOrders'], dimensions: ['couponUsage', 'firstRepeat'], segments: ['newMember'], filters: [], comparison: 'coupon_vs_non_coupon', timeBucket: 'month', chartRecommendation: { chartType: 'groupedBar', reason: 'r' }, warnings: ['관찰값이며 인과관계를 단정하지 않습니다.'] });
const reps = [];
for (const q of ['쿠폰기간 신규회원 반응이 어때?', 'VIP 재구매 고객이 일반 고객보다 객단가가 높은지 분석해줘', '신규회원 구매전환율이 궁금해', 'ROAS 알려줘']) {
  reps.push(await A.buildMarketingIntelligenceResponseWithLlm({ message: q, orders: u.orders, products, reviews: u.reviews, inquiries: u.inquiries, callPlannerLlm: fakeIntel, nowMs }));
}
ok('27. 전환율은 partial_with_proxy/required_data, ROAS는 required_data', reps[2].result.narrative.answerType.match(/partial_with_proxy|required_data/) && reps[3].result.narrative.answerType === 'required_data');
ok('28. 모든 응답 piiCheck.containsPii false + 인과 단정어 없음', reps.concat([aug, det]).every((r) => r.result.piiCheck.containsPii === false && !['때문에', '덕분에', '원인입니다'].some((c) => (r.reply + JSON.stringify(r.artifact || {})).includes(c))));
ok('29. artifact/응답에 PII/memberKey/raw order 없음', (() => {
  const blob = reps.concat([aug]).map((r) => (r.reply || '') + JSON.stringify(r.artifact || {})).join(' ');
  return !['"name"', '"phone"', '"email"', '"address"', 'receiverName', 'memberKey', 'syn_member_', '가상고객', '010-0000', 'orderNo'].some((k) => blob.includes(k));
})());

// 패널 연결 마커
const PANEL = readFileSync(path.join(REPO, 'src/components/DepartmentWorkspacePanel.tsx'), 'utf8');
ok('30. 패널이 buildMarketingIntelligenceResponseWithLlm + callMarketingPlannerLlm 연결(deterministic fallback 유지)', /buildMarketingIntelligenceResponseWithLlm\(/.test(PANEL) && /callPlannerLlm: callMarketingPlannerLlm/.test(PANEL) && /runMarketingChartRequest\(/.test(PANEL));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
