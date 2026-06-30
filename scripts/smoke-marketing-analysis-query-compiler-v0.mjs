#!/usr/bin/env node
/*
 * scripts/smoke-marketing-analysis-query-compiler-v0.mjs
 * Marketing Analysis Query Compiler v0 검증 — 질문→AnalysisPlan→Executor→Narrative.
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
console.log('=== Marketing Analysis Query Compiler v0 smoke ===');

const COMPILER = has('src/services/marketingAnalysisQueryCompiler.ts') ? read('src/services/marketingAnalysisQueryCompiler.ts') : '';
const EXECUTOR = has('src/services/marketingAnalysisExecutor.ts') ? read('src/services/marketingAnalysisExecutor.ts') : '';
const SCOPE = read('src/services/marketingScopeInsightEngine.ts');
const PANEL = read('src/components/MarketingAnalysisDashboard.tsx');
const DOC = has('docs/MARKETING_ANALYSIS_QUERY_COMPILER_V0.md');

// ── 런타임 컴파일 ──
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-compiler-'));
let C = null, X = null;
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingAnalysisExecutor.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  C = await import(pathToFileURL(path.join(tmp, 'marketingAnalysisQueryCompiler.js')).href);
  X = await import(pathToFileURL(path.join(tmp, 'marketingAnalysisExecutor.js')).href);
} catch (e) { console.error('[smoke] compile failed:', e.stdout?.toString() || e.message); }

const orders = [];
const addO = (y, m, amt, opt = {}) => orders.push({ orderDate: `${y}-${String(m).padStart(2, '0')}-15 10:00:00`, totalAmount: amt, paid: true, canceled: false, lines: [{ quantity: 2 }], ...opt });
for (const m of [3, 4, 5]) { addO(2024, m, 100000); addO(2024, m, 100000); addO(2025, m, 120000); }
addO(2024, 7, 50000); addO(2025, 7, 80000);
addO(2024, 3, 99999, { paid: false, canceled: true });
addO(2024, 4, 60000, { discountSummary: { hasCoupon: true } }); addO(2024, 4, 40000, { discountSummary: { hasCoupon: false } });
const cm = (q) => C?.compileMarketingAnalysisQuery(q);
const resp = (q) => X?.buildMarketingAnalysisResponse({ message: q, orders, nowMs: Date.parse('2025-08-01') });

const pRange = cm('2024년 3~5월 주문수와 2025년 3~5월 주문수 비교해줘.');
const rRange = resp('2024년 3~5월 주문수와 2025년 3~5월 주문수 비교해줘.');
const rAov = resp('2024년 3~5월 객단가와 2025년 3~5월 객단가 비교해줘.');
const pQuarter = cm('2025년 1분기 주문수 알려줘.');
const pHalf = cm('올해 상반기 매출과 작년 상반기 매출 비교해줘.');
const pMonthly = cm('2024년과 2025년 월별 주문수 비교해줘.');
const pSeg = cm('쿠폰 사용 고객과 미사용 고객의 객단가를 비교해줘.');
const pSuppress = cm('그래프 빼고 2025년 7월 객단가만 알려줘.');
const pRoas = cm('광고비까지 포함해서 ROAS 비교해줘.');
if (pRange) console.log(`  3~5월 plan: ${pRange.intent}/${pRange.metric}/${pRange.comparison?.type} period=${JSON.stringify(pRange.comparison?.period)}`);

ok('1. marketingAnalysisQueryCompiler 파일 존재', has('src/services/marketingAnalysisQueryCompiler.ts') && has('src/services/marketingAnalysisExecutor.ts'));
ok('2. MarketingAnalysisPlan 타입 존재', /export type MarketingAnalysisPlan/.test(COMPILER));
ok('3. metric parser revenue/orderCount/averageOrderValue 구분', cm('매출 비교')?.metric === 'revenue' && cm('주문수 비교')?.metric === 'orderCount' && cm('객단가 비교')?.metric === 'averageOrderValue');
ok('4. singleMonth parser', cm('2025년 7월 객단가')?.period?.type === 'singleMonth');
ok('5. monthRange parser', pRange?.comparison?.period?.type === 'monthRange');
ok('6. quarter parser', pQuarter?.period?.type === 'quarter');
ok('7. halfYear parser', pHalf?.comparison?.period?.type === 'halfYear' || pHalf?.period?.type === 'halfYear');
ok('8. yearOverYear comparison parser', pRange?.comparison?.type === 'yearOverYear');
ok('9. segment comparison parser', pSeg?.comparison?.type === 'segmentCompare' && pSeg?.comparison?.dimension === 'coupon');
ok('10. chart suppression parser', pSuppress?.chart?.suppressed === true);
ok('11. 3~5월이 5월 단일로 해석되지 않음', pRange?.comparison?.period?.startMonth === 3 && pRange?.comparison?.period?.endMonth === 5);
ok('12. 3~5월 주문수는 sum aggregation', pRange?.aggregation === 'sum' && rRange?.artifact.chartSpec.series[0].points[0].value === 8 && rRange?.artifact.chartSpec.series[0].points[1].value === 3);
ok('13. 3~5월 객단가는 weighted(매출/주문)', rAov?.artifact.chartSpec.series[0].points[0].value === 87500 && cm('3~5월 객단가')?.aggregation === 'ratio');
ok('14. 특정월/범위 비교는 compactBars', pRange?.chart?.type === 'compactBars');
ok('15. 월별 비교는 groupedBars/trend 유지', pMonthly?.comparison?.type === 'monthlyTrend' && pMonthly?.chart?.type === 'groupedBars');
ok('16. unsupported 질문이 year_compare로 fallback 안 됨', pRoas?.intent === 'unsupported' && resp('광고비까지 포함해서 ROAS 비교해줘.')?.suppressChart === true);
ok('17. executor가 canonical net 사용(취소 제외)', /isValidOrder/.test(EXECUTOR) && rRange?.artifact.chartSpec.series[0].points[0].orderCount === 8);
ok('18. gross productLineRevenue를 대표 매출로 안 씀', !/productRevenueByLines|grossProductRevenue/.test(EXECUTOR));
ok('19. narrative가 narrow 질문에 broad sections 미부착', !/카테고리 관찰|채널 관찰|쿠폰\/채널 관찰/.test(rRange?.reply || ''));
ok('20. compactBars chart compact layout marker', /mkt-chart-compact/.test(PANEL) && /mkt-chart-compact/.test(read('src/components/MarketingAnalysisDashboard.css')));
ok('21. chart suppression 시 artifact clear(handleSend)', /suppressChart \? null/.test(read('src/components/DepartmentWorkspacePanel.tsx')));
ok('22. scope engine이 compiler(buildMarketingAnalysisResponse) 사용', /buildMarketingAnalysisResponse/.test(SCOPE));
ok('30. 문서 존재', DOC);

// git 금지영역
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
ok('23. department source/contract 변경 없음', !changed.some((f) => /departmentDataSourceOfTruth|departmentMetricContract|revenueMetricContract/.test(f)));
ok('24. synthetic data 생성 변경 없음', !changed.some((f) => /syntheticCommerceUniverse|syntheticRevenue/.test(f)));
ok('25. Vercel gateway 변경 없음', !changed.some((f) => /\[action\]\.ts|\[resource\]\.ts/.test(f)));
ok('26. customer tracking 변경 없음', !changed.some((f) => /marketingBehavior|behavior-events|behavior-summary/.test(f)));
ok('27. Godomall WRITE 없음', !/writeOrder|goodsRegist|Order_Regist|memberModify/i.test(COMPILER + EXECUTOR));
ok('28. Agent Studio full wiring 없음', !/initialAgents|resolveAgentBrain|systemPrompt/.test(COMPILER + EXECUTOR));
ok('29. raw event 노출 없음', !/sessionIdHash|orderIdHash|eventId/.test(COMPILER + EXECUTOR));

rmSync(tmp, { recursive: true, force: true });
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
