#!/usr/bin/env node
/*
 * scripts/smoke-marketing-chat-driven-chartspec-bridge-v0.mjs
 * Marketing Chat-Driven ChartSpec Bridge v0 검증.
 *  - 자연어 → intent → CrossTabRequest → crosstab → chartSpec + narrative
 *  - 계산 가능한 질문은 available true + "계산 가능합니다", 금지 답변 부재
 *  - 외부 데이터 질문은 unsupported + requiredData, PII/인과 단정 부재
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-bridge-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-bridge-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingChatChartSpec.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const B = await import(pathToFileURL(path.join(tmpSrc, 'marketingChatChartSpec.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Chat-Driven ChartSpec Bridge v0 smoke ===');

ok('1. marketingChatChartSpec.ts 존재', existsSync(path.join(REPO, 'src/services/marketingChatChartSpec.ts')));
ok('2. detectMarketingChartIntent export', typeof B.detectMarketingChartIntent === 'function');
ok('3. buildMarketingCrossTabRequestFromIntent export', typeof B.buildMarketingCrossTabRequestFromIntent === 'function');
ok('4. buildMarketingChartSpecFromCrosstab export', typeof B.buildMarketingChartSpecFromCrosstab === 'function');
ok('5. buildMarketingChartNarrative export', typeof B.buildMarketingChartNarrative === 'function');
ok('6. buildMarketingChatChartResponse export', typeof B.buildMarketingChatChartResponse === 'function');

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26', includeBaselineYear: true });
const nowMs = Date.parse('2026-06-27T00:00:00');
const ask = (message) => B.buildMarketingChatChartResponse({ message, orders: u.orders, products, nowMs });
const FORBIDDEN_PHRASES = ['월별 주문 데이터가 없어서', '쿠폰 사용 여부 데이터가 없어서', '주문금액 데이터가 없어서', '데이터가 없어서 어렵', '데이터 없음'];
const CAUSAL = ['때문에', '덕분에', '원인입니다'];
const narrText = (r) => `${r.narrative.summary} ${r.narrative.bullets.join(' ')}`;

// ── 월별 쿠폰 사용/미사용 객단가 ──
ok('7. 월별 쿠폰 객단가 → monthly_coupon_aov', B.detectMarketingChartIntent('월별 쿠폰 사용/미사용 객단가 비교해줘') === 'monthly_coupon_aov');
ok('   "쿠폰 쓴 주문과 안 쓴 주문의 월별 객단가" 도 감지', B.detectMarketingChartIntent('쿠폰 쓴 주문과 안 쓴 주문의 월별 객단가 보여줘') === 'monthly_coupon_aov');
const cAov = ask('월별 쿠폰 사용/미사용 객단가 비교해줘');
ok('8. 쿠폰 객단가 available true', cAov.chartSpec.available === true);
ok('9. chartType groupedBar 또는 line', ['groupedBar', 'line'].includes(cAov.chartSpec.chartType));
ok('10. series에 쿠폰 사용/미사용 포함', cAov.chartSpec.series.some((s) => s.key === 'coupon') && cAov.chartSpec.series.some((s) => s.key === 'non_coupon'));
ok('11. narrative "계산 가능합니다" 계열', /계산 가능합니다/.test(cAov.narrative.summary));
ok('12. narrative 금지 문구 없음', !FORBIDDEN_PHRASES.some((p) => narrText(cAov).includes(p)));

// ── 작년/올해 월별 매출 ──
ok('13. "작년이랑 올해 월별 매출 비교" → yearly_revenue_compare', B.detectMarketingChartIntent('작년이랑 올해 월별 매출 비교해줘') === 'yearly_revenue_compare');
const yr = ask('작년이랑 올해 월별 매출 비교해줘');
ok('14. yearly available true + series 존재', yr.chartSpec.available === true && yr.chartSpec.series.length > 0);
ok('15. "baseline이랑 promotion 매출 비교" → scenario_revenue_compare', B.detectMarketingChartIntent('baseline이랑 promotion 매출 비교해줘') === 'scenario_revenue_compare');
const sc = ask('baseline이랑 promotion 매출 비교해줘');
ok('16. scenario chartSpec baseline/promotion series', sc.chartSpec.available && sc.chartSpec.series.some((s) => s.key === 'baseline') && sc.chartSpec.series.some((s) => s.key === 'promotion'));

// ── 회원그룹/첫재구매/채널/카테고리/상품/리워드 ──
ok('17. "회원그룹별 매출" → member_group_revenue', B.detectMarketingChartIntent('회원그룹별 매출 비교해줘') === 'member_group_revenue');
ok('18. "VIP 매출 비중" → member_group_revenue', B.detectMarketingChartIntent('VIP 매출 비중 알려줘') === 'member_group_revenue');
ok('19. "월별 첫구매 재구매 매출" → monthly_first_repeat', B.detectMarketingChartIntent('월별 첫구매 재구매 매출 비교해줘') === 'monthly_first_repeat');
ok('20. "월별 주문채널 매출" → monthly_order_channel', B.detectMarketingChartIntent('월별 주문채널 매출 비교해줘') === 'monthly_order_channel');
ok('21. "마일리지 사용 주문 객단가" → monthly_reward_aov', B.detectMarketingChartIntent('마일리지 사용 주문 객단가 비교해줘') === 'monthly_reward_aov');
ok('22. "카테고리별 월별 매출" → category_revenue_trend', B.detectMarketingChartIntent('카테고리별 월별 매출 보여줘') === 'category_revenue_trend');
ok('23. "상품별 매출 추이" → top_product_trend', B.detectMarketingChartIntent('상품별 매출 추이 보여줘') === 'top_product_trend');
const mg = ask('회원그룹별 매출 비교해줘');
const fr = ask('월별 첫구매 재구매 매출 비교해줘');
const ch = ask('월별 주문채널 매출 비교해줘');
const cat = ask('카테고리별 월별 매출 보여줘');
ok('24. 회원그룹/첫재구매/채널/카테고리 모두 available true + series', [mg, fr, ch, cat].every((r) => r.chartSpec.available === true && r.chartSpec.series.length > 0));
ok('25. firstRepeat series first/repeat', fr.chartSpec.series.some((s) => s.key === 'first') && fr.chartSpec.series.some((s) => s.key === 'repeat'));

// ── intent → request 매핑 정확성 ──
ok('26. monthly_coupon_aov request 매핑', (() => { const q = B.buildMarketingCrossTabRequestFromIntent('monthly_coupon_aov'); return q.timeBucket === 'month' && q.dimensions[0] === 'couponUsage' && q.metrics.includes('averageOrderValue'); })());
ok('27. scenario_revenue_compare request 매핑', (() => { const q = B.buildMarketingCrossTabRequestFromIntent('scenario_revenue_compare'); return q.timeBucket === 'scenario' && q.dimensions[0] === 'scenario'; })());

// ── unsupported 외부 데이터 ──
ok('28. "ROAS 알려줘" → unsupported_roas', B.detectMarketingChartIntent('ROAS 알려줘') === 'unsupported_roas');
const roas = ask('ROAS 알려줘');
ok('29. ROAS chartSpec available false + unsupported', roas.chartSpec.available === false && roas.chartSpec.chartType === 'unsupported');
ok('30. ROAS requiredData(adSpend) 존재', Array.isArray(roas.chartSpec.requiredData) && roas.chartSpec.requiredData.includes('adSpend') && (roas.narrative.requiredData || []).includes('adSpend'));
ok('31. ROAS narrative "계산하지 않습니다" + 금지문구 없음', /계산하지 않습니다/.test(roas.narrative.summary) && !FORBIDDEN_PHRASES.some((p) => narrText(roas).includes(p)));
const vis = ask('방문자 전환율 알려줘');
const pv = ask('상품조회 전환율 알려줘');
const cartA = ask('장바구니 이탈률 알려줘');
ok('32. 방문/상품조회/장바구니 unsupported + requiredData', [vis, pv, cartA].every((r) => r.chartSpec.available === false && (r.chartSpec.requiredData || []).length > 0));
ok('33. 방문→visitorSessions / 상품조회→productViewEvents / 장바구니→cartEvents', vis.chartSpec.requiredData.includes('visitorSessions') && pv.chartSpec.requiredData.includes('productViewEvents') && cartA.chartSpec.requiredData.includes('cartEvents'));

// ── PII / 인과 단정 ──
const allResp = [cAov, yr, sc, mg, fr, ch, cat, roas, vis, pv, cartA, ask('마일리지 사용 주문 객단가 비교해줘'), ask('상품별 매출 추이 보여줘')];
ok('34. chartSpec/narrative에 PII/memberKey 직접 노출 없음', (() => {
  const blob = JSON.stringify(allResp.map((r) => ({ chartSpec: r.chartSpec, narrative: r.narrative })));
  return !['"name"', '"phone"', '"email"', '"address"', 'receiverName', 'memberKey', 'syn_member_', '가상고객', '010-0000', '@example.test'].some((k) => blob.includes(k));
})());
ok('35. 인과 단정어(때문에/덕분에/원인입니다) 없음', !allResp.some((r) => CAUSAL.some((c) => narrText(r).includes(c) || r.chartSpec.warnings.join(' ').includes(c))));
ok('36. 계산 가능한 질문은 금지 답변("데이터 없어서") 미사용', [cAov, yr, sc, mg, fr, ch, cat].every((r) => !FORBIDDEN_PHRASES.some((p) => narrText(r).includes(p))));

console.log('\n--- 요약 ---');
console.log(`couponAov series=${cAov.chartSpec.series.length}, scenario series=${sc.chartSpec.series.map((s) => s.key).join('/')}, roas available=${roas.chartSpec.available}`);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
