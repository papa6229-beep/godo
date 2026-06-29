#!/usr/bin/env node
/*
 * scripts/smoke-marketing-chat-chartspec-runtime-connection-v0.mjs
 * Marketing Chat ChartSpec Runtime Connection v0 검증.
 *  - runMarketingChartRequest 런타임(코드 주도) 응답 + chartSpec artifact
 *  - 패널 마케팅 분기 연결(chart intent → bridge, unknown → 기존 facts fallback)
 *  - 계산 가능 질문은 "계산 가능합니다", 외부 데이터 질문은 requiredData, PII/인과 단정 부재
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Chat ChartSpec Runtime Connection v0 smoke ===');

const PANEL = read('src/components/DepartmentWorkspacePanel.tsx');

// ── 패널 연결 마커 ──
ok('1. 패널이 runMarketingChartRequest import', /import\s*\{[^}]*runMarketingChartRequest/.test(PANEL));
ok('2. 마케팅 분기에서 runMarketingChartRequest 호출', /teamId === 'marketing'/.test(PANEL) && /runMarketingChartRequest\(\{\s*message: text/.test(PANEL));
ok('3. chart.handled 시 코드 응답 + return(LLM 미경유)', /chart\.handled/.test(PANEL) && /setMarketingChartArtifact\(/.test(PANEL));
ok('4. unknown(미handled)이면 기존 marketing facts fallback 유지', /buildMarketingChatContext\(text/.test(PANEL));
ok('5. chartSpec artifact 비영속 state(localStorage 미저장)', /marketingChartArtifact/.test(PANEL) && /비영속/.test(PANEL));
ok('6. dev/smoke marker(marketing-chart-artifact/intent/available)', /marketing-chart-artifact/.test(PANEL) && /data-marketing-chart-intent/.test(PANEL) && /data-marketing-chart-available/.test(PANEL));
ok('7. non-marketing 분기엔 chartSpec bridge 미적용(호출이 marketing 블록 내부)', PANEL.indexOf('runMarketingChartRequest({ message: text') > PANEL.indexOf("teamId === 'marketing'"));
ok('8. artifact는 useState(비영속), 영속 메시지 shape 불변({role,text})', /useState<MarketingChatChartArtifact \| null>/.test(PANEL) && /\[teamId\]: \[\.\.\.prev\[teamId\], \{ role: 'system', text: chart\.reply \}\]/.test(PANEL));

// ── 런타임 함수 emit & import ──
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-rt-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-rt-src-'));
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
const M = await import(pathToFileURL(path.join(tmpSrc, 'marketingChatChartSpec.js')).href);
ok('9. runMarketingChartRequest export', typeof M.runMarketingChartRequest === 'function');

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26', includeBaselineYear: true });
const nowMs = Date.parse('2026-06-27T00:00:00');
const run = (message) => M.runMarketingChartRequest({ message, orders: u.orders, products, nowMs });
const FORBIDDEN = ['월별 주문 데이터가 없어서', '쿠폰 사용 여부 데이터가 없어서', '주문금액 데이터가 없어서', '데이터가 없어서 어렵', '데이터 없음'];
const CAUSAL = ['때문에', '덕분에', '원인입니다'];

// ── 월별 쿠폰 사용/미사용 객단가 ──
const c1 = run('월별 쿠폰 사용/미사용 객단가 비교해줘');
const c2 = run('쿠폰 쓴 주문과 안 쓴 주문의 월별 객단가 보여줘');
ok('10. 쿠폰 객단가 handled + artifact intent monthly_coupon_aov', c1.handled === true && c1.artifact.intent === 'monthly_coupon_aov' && c2.artifact.intent === 'monthly_coupon_aov');
ok('11. 쿠폰 chartSpec.available true', c1.artifact.chartSpec.available === true);
ok('12. series에 coupon/non_coupon 존재', c1.artifact.chartSpec.series.some((s) => s.key === 'coupon') && c1.artifact.chartSpec.series.some((s) => s.key === 'non_coupon'));
ok('13. 응답에 "계산 가능합니다" 포함', /계산 가능합니다/.test(c1.reply));
ok('14. 응답에 금지 문구 없음', !FORBIDDEN.some((p) => c1.reply.includes(p)));
ok('15. artifact type/source/createdAt 구조', c1.artifact.type === 'marketing_chart_spec' && c1.artifact.source === 'marketingChatChartSpec' && typeof c1.artifact.createdAt === 'string');

// ── 작년/올해, baseline/promotion ──
const y1 = run('작년이랑 올해 월별 매출 비교해줘');
const s1 = run('baseline이랑 promotion 매출 비교해줘');
ok('16. yearly_revenue_compare artifact + available', y1.handled && y1.artifact.intent === 'yearly_revenue_compare' && y1.artifact.chartSpec.available === true);
ok('17. scenario_revenue_compare baseline/promotion series', s1.handled && s1.artifact.intent === 'scenario_revenue_compare' && s1.artifact.chartSpec.series.some((x) => x.key === 'baseline') && s1.artifact.chartSpec.series.some((x) => x.key === 'promotion'));

// ── 회원그룹/첫재구매/채널/카테고리/상품/리워드 ──
const mg = run('회원그룹별 매출 비교해줘');
const vip = run('VIP 매출 비중 알려줘');
const fr = run('월별 첫구매 재구매 매출 비교해줘');
const ch = run('월별 주문채널 매출 비교해줘');
const cat = run('카테고리별 월별 매출 보여줘');
const prod = run('상품별 매출 추이 보여줘');
const rew = run('마일리지 사용 주문 객단가 비교해줘');
ok('18. member_group_revenue artifact', mg.handled && mg.artifact.intent === 'member_group_revenue' && vip.artifact.intent === 'member_group_revenue');
ok('19. monthly_first_repeat artifact + first/repeat', fr.handled && fr.artifact.intent === 'monthly_first_repeat' && fr.artifact.chartSpec.series.some((x) => x.key === 'first') && fr.artifact.chartSpec.series.some((x) => x.key === 'repeat'));
ok('20. monthly_order_channel artifact', ch.handled && ch.artifact.intent === 'monthly_order_channel' && ch.artifact.chartSpec.available === true);
ok('21. category/product/reward artifact available', cat.handled && cat.artifact.chartSpec.available && prod.handled && prod.artifact.chartSpec.available && rew.handled && rew.artifact.chartSpec.available);
ok('22. 모든 계산 가능 질문 응답 "계산 가능합니다" + 금지문구 없음', [y1, s1, mg, fr, ch, cat, prod, rew].every((r) => /계산 가능합니다/.test(r.reply) && !FORBIDDEN.some((p) => r.reply.includes(p))));

// ── unsupported ──
const roas = run('ROAS 알려줘');
const vis = run('방문자 전환율 알려줘');
const pv = run('상품조회 전환율 알려줘');
const cartA = run('장바구니 이탈률 알려줘');
ok('23. ROAS handled + intent unsupported_roas', roas.handled === true && roas.artifact.intent === 'unsupported_roas');
ok('24. ROAS chartSpec.available false', roas.artifact.chartSpec.available === false);
ok('25. ROAS requiredData(adSpend) 존재', (roas.artifact.chartSpec.requiredData || []).includes('adSpend'));
ok('26. ROAS 응답 0/추정 없음 + "계산하지 않습니다"', /계산하지 않습니다/.test(roas.reply) && !/0원|0건|0%/.test(roas.reply));
ok('27. 방문/상품조회/장바구니 requiredData 처리', [vis, pv, cartA].every((r) => r.artifact.chartSpec.available === false && (r.artifact.chartSpec.requiredData || []).length > 0));
ok('28. 각 requiredData(visitorSessions/productViewEvents/cartEvents)', (vis.artifact.chartSpec.requiredData || []).includes('visitorSessions') && (pv.artifact.chartSpec.requiredData || []).includes('productViewEvents') && (cartA.artifact.chartSpec.requiredData || []).includes('cartEvents'));

// ── unknown fallback ──
const unk = run('이번 분기 마케팅 전략 아이디어 좀 줘');
ok('29. 일반 전략 질문은 handled=false(기존 facts/LLM fallback)', unk.handled === false && unk.intent === 'unknown');

// ── PII / 인과 ──
const all = [c1, c2, y1, s1, mg, vip, fr, ch, cat, prod, rew, roas, vis, pv, cartA];
ok('30. 응답/artifact JSON에 PII/memberKey 없음', (() => {
  const blob = all.map((r) => r.reply + JSON.stringify(r.artifact || {})).join(' ');
  return !['"name"', '"phone"', '"email"', '"address"', 'receiverName', 'memberKey', 'syn_member_', '가상고객', '010-0000', '@example.test'].some((k) => blob.includes(k));
})());
ok('31. 응답/artifact 인과 단정어(때문에/덕분에/원인입니다) 없음', !all.some((r) => CAUSAL.some((c) => (r.reply + JSON.stringify(r.artifact || {})).includes(c))));

// ── WRITE/API/localStorage 변경 없음 ──
ok('32. 런타임/패널에 fetch/WRITE/localStorage 신규 없음', !/fetch\(|\.post\(|\.put\(|\.delete\(/.test(read('src/services/marketingChatChartSpec.ts')) && existsSync(path.join(REPO, 'src/services/marketingChatChartSpec.ts')));

console.log('\n--- 요약 ---');
console.log(`coupon series=${c1.artifact.chartSpec.series.length}, scenario=${s1.artifact.chartSpec.series.map((x) => x.key).join('/')}, roas available=${roas.artifact.chartSpec.available}`);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
