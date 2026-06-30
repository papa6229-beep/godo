#!/usr/bin/env node
/*
 * scripts/smoke-marketing-chat-analysis-routing-intent-v0.mjs
 * Marketing Chat Analysis Routing & Intent Patch v0 검증.
 *  - 질문 해석(metric/month/suppress) + 특정월 canonical 계산 + scope/handleSend/auto-scroll 연결.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const has = (rel) => existsSync(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Chat Analysis Routing & Intent Patch v0 smoke ===');

const ROUTING = has('src/services/marketingChatQueryRouting.ts') ? read('src/services/marketingChatQueryRouting.ts') : '';
const SCOPE = read('src/services/marketingScopeInsightEngine.ts');
const PANEL = read('src/components/DepartmentWorkspacePanel.tsx');
const DOC = has('docs/MARKETING_CHAT_ANALYSIS_ROUTING_INTENT_PATCH_V0.md');

// ── 런타임: 라우팅 파일 컴파일 + 해석/계산 검증 ──
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-route-'));
let R = null;
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingChatQueryRouting.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  R = await import(pathToFileURL(path.join(tmp, 'marketingChatQueryRouting.js')).href);
} catch (e) { console.error('[smoke] routing compile failed:', e.stdout?.toString() || e.message); }

const orders = [];
for (let i = 0; i < 10; i++) orders.push({ orderDate: `2024-07-1${i % 9} 10:00:00`, totalAmount: 50000 + i * 1000, paid: true, canceled: false });
for (let i = 0; i < 6; i++) orders.push({ orderDate: `2025-07-1${i % 9} 10:00:00`, totalAmount: 70000 + i * 1000, paid: true, canceled: false });
orders.push({ orderDate: '2024-07-20 10:00:00', totalAmount: 99999, paid: false, canceled: true }); // 취소 → 제외

const Q1 = '2024년 7월 객단가와 2025년 7월 객단가만 비교해줘. 월별 매출 그래프는 보여주지 마.';
const Q2 = '2024년 7월 매출과 2025년 7월 매출만 비교해줘.';
const Q3 = '2024년 7월 주문수와 2025년 7월 주문수 비교해줘.';
const Q4 = '2024년과 2025년 월별 매출을 비교해줘.';

const p1 = R?.parseMarketingChatQuery(Q1), p2 = R?.parseMarketingChatQuery(Q2), p3 = R?.parseMarketingChatQuery(Q3), p4 = R?.parseMarketingChatQuery(Q4);
const r1 = R?.buildMarketingMonthMetricResponse({ message: Q1, orders });
const r2 = R?.buildMarketingMonthMetricResponse({ message: Q2, orders });
const r3 = R?.buildMarketingMonthMetricResponse({ message: Q3, orders });
const r4 = R?.buildMarketingMonthMetricResponse({ message: Q4, orders });
if (p1) { console.log(`  Q1 → intent:month_year_compare metric:${p1.metric} month:${p1.month} years:${p1.years} suppress:${p1.suppressChart}`); console.log(`  Q2 → metric:${p2.metric}  Q3 → metric:${p3.metric}`); }

ok('1. 객단가 키워드 인식(→averageOrderValue)', p1?.metric === 'averageOrderValue');
ok('2. 주문수 키워드 인식(→orderCount)', p3?.metric === 'orderCount');
ok('3. 매출 키워드 인식(→revenue)', p2?.metric === 'revenue');
ok('4. 단일 월 "7월" 인식', R?.parseMarketingChatQuery('7월 매출 알려줘').month === 7);
ok('5. "2024년 7월" 인식', p1?.month === 7 && p1?.years.includes(2024));
ok('6. 두 연도+동일월이 전체 range로 고정되지 않음', p1?.isMonthYearCompare === true && r1 !== null && r1.artifact.chartSpec.series[0].points.length === 2);
ok('7. Q1 객단가→AOV metric 해석', r1?.artifact.chartSpec.primaryMetric === 'averageOrderValue');
ok('8. Q2 매출→revenue metric 해석', r2?.artifact.chartSpec.primaryMetric === 'revenue');
ok('9. Q3 주문수→orderCount metric 해석', r3?.artifact.chartSpec.primaryMetric === 'orderCount');
ok('10. "그래프 보여주지 마"→suppressChart=true', p1?.suppressChart === true && r1?.suppressChart === true);
ok('11. suppressChart=true시 handleSend가 artifact clear', /suppressChart \? null/.test(PANEL));
ok('12. 특정월 비교가 12개월 monthly로 안 떨어짐(2포인트)', r1?.artifact.chartSpec.series[0].points.length === 2 && r2?.artifact.chartSpec.series[0].points.length === 2);
ok('13. 특정월 chart title이 7월+metric 포함', /7월/.test(r1?.artifact.chartSpec.title || '') && /객단가/.test(r1?.artifact.chartSpec.title || ''));
ok('14. 답변 텍스트가 metric/month 포함', /7월/.test(r2?.reply || '') && /매출/.test(r2?.reply || '') && /7월/.test(r3?.reply || '') && /주문수/.test(r3?.reply || ''));
ok('15. "만 비교"는 broad 장문(카테고리/채널 관찰) 미부착', !/카테고리 관찰|채널 관찰|쿠폰\/채널/.test(r1?.reply || ''));
ok('16. 애매/월별 질문은 month_year_compare로 강제 안 됨', r4 === null && p4?.isMonthYearCompare === false && R?.buildMarketingMonthMetricResponse({ message: '마케팅 어때?', orders }) === null);
ok('17. dept-chat-log auto-scroll ref/effect 존재', /ref=\{chatLogRef\}/.test(PANEL) && /chatLogRef\.current/.test(PANEL) && /scrollHeight/.test(PANEL));
ok('18. Agent Studio full wiring 미포함 문서', DOC && /제외한 범위|Marketing Agent Runtime Wiring/.test(read('docs/MARKETING_CHAT_ANALYSIS_ROUTING_INTENT_PATCH_V0.md')));

// 값이 metric별로 실제 다른지(동일 답변 회귀 방지)
ok('19a. Q1/Q2/Q3 결과가 서로 다름(metric 분기)', JSON.stringify(r1?.artifact.chartSpec.series[0].points.map((p) => p.value)) !== JSON.stringify(r2?.artifact.chartSpec.series[0].points.map((p) => p.value)) && r3?.artifact.chartSpec.series[0].points.map((p) => p.value).join() === '10,6');
ok('23. 고도몰 WRITE 추가 없음', !/writeOrder|goodsRegist|Order_Regist|memberModify/i.test(ROUTING + SCOPE));
ok('24. raw event 노출 없음', !/sessionIdHash|orderIdHash|eventId/.test(ROUTING));
ok('25. 문서 존재', DOC);

// git 금지영역(이번 task는 routing/scope/panel/문서만)
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
ok('19. Vercel gateway 변경 없음', !changed.some((f) => /\[action\]\.ts|\[resource\]\.ts/.test(f)));
ok('20. 고객흐름 tracking 변경 없음', !changed.some((f) => /marketingBehavior|behavior-events|behavior-summary/.test(f)));
ok('21. synthetic data 생성 로직 변경 없음', !changed.some((f) => /syntheticCommerceUniverse|syntheticRevenue/.test(f)));
ok('22. department source/contract 변경 없음', !changed.some((f) => /departmentDataSourceOfTruth|departmentMetricContract|revenueMetricContract/.test(f)));

rmSync(tmp, { recursive: true, force: true });
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
