#!/usr/bin/env node
/*
 * scripts/smoke-marketing-team-chat-facts-v0.mjs
 * Marketing Team Chat Facts v0 검증.
 *  - buildMarketingTeamChatFacts가 buildMarketingAnalysisFacts 기반 facts 생성
 *  - summary/회원그룹/쿠폰/리워드/requiredData/guardrails
 *  - ROAS/방문전환/상품조회전환/장바구니 질문 → unsupported intent + requiredData 안내
 *  - PII 미포함, department chat 연결 마커
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
console.log('=== Marketing Team Chat Facts v0 smoke ===');

// ── 파일/연결 마커 ──
ok('1. marketingTeamChatFacts.ts 존재', existsSync(path.join(REPO, 'src/services/marketingTeamChatFacts.ts')));
const SRC = read('src/services/marketingTeamChatFacts.ts');
const PANEL = read('src/components/DepartmentWorkspacePanel.tsx');
ok('2. buildMarketingAnalysisFacts 사용(같은 facts 기준)', /buildMarketingAnalysisFacts/.test(SRC));
ok('3. department chat 연결(panel import + 마케팅 분기)', /buildMarketingChatContext/.test(PANEL) && /teamId === 'marketing'/.test(PANEL));

// ── emit & import ──
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-mktchat-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-mktchat-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingTeamChatFacts.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const C = await import(pathToFileURL(path.join(tmpSrc, 'marketingTeamChatFacts.js')).href);

ok('4. buildMarketingTeamChatFacts export', typeof C.buildMarketingTeamChatFacts === 'function');
ok('   detectMarketingChatIntent / buildMarketingChatContext export', typeof C.detectMarketingChatIntent === 'function' && typeof C.buildMarketingChatContext === 'function');

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });
const input = { orders: u.orders, products, reviews: u.reviews, inquiries: u.inquiries, period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') };
const facts = C.buildMarketingTeamChatFacts(input);

// ── facts ──
ok('5. source = marketing_analysis_facts', facts.source === 'marketing_analysis_facts');
ok('6. summary 총매출/주문수/객단가', facts.summary.totalRevenue > 0 && facts.summary.orderCount > 0 && facts.summary.averageOrderValue > 0);
ok('7. 회원그룹 facts 존재', facts.topMemberGroups.length > 0 && facts.topMemberGroups.every((m) => m.label && m.value));
ok('8. 쿠폰 facts 존재(2버킷)', facts.couponComparison.length === 2);
ok('9. 리워드 facts 존재', facts.rewardComparison.length >= 1);
ok('10. 주문채널 facts 존재', facts.topOrderChannels.length > 0);
ok('11. requiredData facts 존재', facts.requiredData.length > 0);
ok('12. insights 존재', facts.insights.length >= 5);

// ── guardrails ──
ok('13. guardrails.canAnswerRoas === false', facts.guardrails.canAnswerRoas === false);
ok('14. guardrails.canAnswerVisitorConversion === false', facts.guardrails.canAnswerVisitorConversion === false);
ok('15. guardrails.canAnswerProductView/Cart === false', facts.guardrails.canAnswerProductViewConversion === false && facts.guardrails.canAnswerCartAbandonment === false);
ok('16. guardrails.containsPii === false', facts.guardrails.containsPii === false);

// ── intent 분류 ──
ok('17. ROAS 질문 → unsupported_roas', C.detectMarketingChatIntent('우리 ROAS 알려줘') === 'unsupported_roas');
ok('18. 방문자 전환율 → unsupported_visitor_conversion', C.detectMarketingChatIntent('방문자 전환율 어때?') === 'unsupported_visitor_conversion');
ok('19. 상품조회 전환율 → unsupported_product_view_conversion', C.detectMarketingChatIntent('상품조회 전환율 알려줘') === 'unsupported_product_view_conversion');
ok('20. 장바구니 이탈률 → unsupported_cart_abandonment', C.detectMarketingChatIntent('장바구니 이탈률 보여줘') === 'unsupported_cart_abandonment');
ok('21. 회원그룹 질문 → member_group_performance', C.detectMarketingChatIntent('VIP 매출 비중 알려줘') === 'member_group_performance');
ok('22. 쿠폰 질문 → coupon_performance', C.detectMarketingChatIntent('쿠폰 쓴 주문 객단가 높아?') === 'coupon_performance');
ok('23. 매출 질문 → marketing_overview', C.detectMarketingChatIntent('최근 매출 어때?') === 'marketing_overview');

// ── context 렌더 ──
const ctxOverview = C.buildMarketingChatContext('최근 매출 어때?', input);
ok('24. overview context: 요약 + 외부연동 안내 포함', /마케팅 분석 요약/.test(ctxOverview.contextNote) && /외부 연동 필요/.test(ctxOverview.contextNote));
ok('25. answerGuidance: 인과 단정 금지 + requiredData 안내', /때문에/.test(ctxOverview.answerGuidance) && /추측하지/.test(ctxOverview.answerGuidance));

const ctxRoas = C.buildMarketingChatContext('ROAS 알려줘', input);
ok('26. ROAS 질문 context: 미계산 + 필요 데이터(광고비) 안내, 0 미표시', /현재 계산하지 않/.test(ctxRoas.contextNote) && /광고비/.test(ctxRoas.contextNote) && !/ROAS[^가-힣]*0\b/.test(ctxRoas.contextNote));
ok('27. ROAS guidance: 숫자 만들지 말고 필요 데이터 안내', /숫자를 만들지 말/.test(ctxRoas.answerGuidance));
const ctxVisitor = C.buildMarketingChatContext('방문자 전환율 알려줘', input);
const ctxView = C.buildMarketingChatContext('상품조회 전환율 알려줘', input);
const ctxCart = C.buildMarketingChatContext('장바구니 이탈률 알려줘', input);
ok('28. 방문/상품조회/장바구니 질문도 미계산 안내', [ctxVisitor, ctxView, ctxCart].every((c) => /현재 계산하지 않/.test(c.contextNote)));

// ── PII self-check ──
const FORBIDDEN = ['name', 'phone', 'email', 'address', 'receiverName', 'customerName', '가상고객', '010-0000', '@example.test', '샘플로'];
ok('29. facts/ context에 PII 키/값 없음', (() => {
  const blob = JSON.stringify(facts) + ctxOverview.contextNote + ctxRoas.contextNote;
  return !FORBIDDEN.some((k) => blob.includes(k));
})());
ok('30. marketingChatContextContainsPii([]) — context 스캔', C.marketingChatContextContainsPii(facts).length === 0 && C.marketingChatContextContainsPii(ctxOverview).length === 0);
ok('31. memberKey 미노출(context)', !/memberKey|syn_member_/.test(ctxOverview.contextNote));

console.log('\n--- 요약 ---');
console.log(`총매출=${facts.summary.totalRevenue}, 주문=${facts.summary.orderCount}, 회원그룹=${facts.topMemberGroups.length}, insights=${facts.insights.length}, requiredData=${facts.requiredData.length}`);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
