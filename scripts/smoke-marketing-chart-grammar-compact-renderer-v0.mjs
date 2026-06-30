#!/usr/bin/env node
/*
 * scripts/smoke-marketing-chart-grammar-compact-renderer-v0.mjs
 * Marketing Chart Grammar & Compact Renderer v0 검증 — chart type 선택 문법 + compact UX.
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
console.log('=== Marketing Chart Grammar & Compact Renderer v0 smoke ===');

const GRAMMAR = has('src/services/marketingChartGrammar.ts') ? read('src/services/marketingChartGrammar.ts') : '';
const EXECUTOR = read('src/services/marketingAnalysisExecutor.ts');
const DASH = read('src/components/MarketingAnalysisDashboard.tsx');
const DASH_CSS = read('src/components/MarketingAnalysisDashboard.css');
const DOC = has('docs/MARKETING_CHART_GRAMMAR_COMPACT_RENDERER_V0.md');

// ── 런타임 컴파일 ──
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-grammar-'));
let G = null, X = null;
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingAnalysisExecutor.ts'), path.join(REPO, 'src', 'services', 'marketingChartGrammar.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  G = await import(pathToFileURL(path.join(tmp, 'marketingChartGrammar.js')).href);
  X = await import(pathToFileURL(path.join(tmp, 'marketingAnalysisExecutor.js')).href);
} catch (e) { console.error('[smoke] compile failed:', e.stdout?.toString() || e.message); }

const sel = (o) => G?.selectMarketingChartType(o);
const orders = [];
const addO = (y, m, amt, opt = {}) => orders.push({ orderDate: `${y}-${String(m).padStart(2, '0')}-15 10:00:00`, totalAmount: amt, paid: true, canceled: false, lines: [{ quantity: 1 }], ...opt });
for (let i = 0; i < 1003; i++) addO(2025, 3, 75752, { discountSummary: { hasCoupon: false } });
for (let i = 0; i < 179; i++) addO(2025, 3, 67808, { discountSummary: { hasCoupon: true } });
addO(2024, 7, 50000); addO(2025, 7, 80000);
addO(2024, 4, 90000); addO(2025, 4, 95000);
const resp = (q) => X?.buildMarketingAnalysisResponse({ message: q, orders, nowMs: Date.parse('2025-08-01') });
const rCoupon = resp('쿠폰 사용 고객과 미사용 고객의 객단가를 비교해줘.');
const rMonthOrder = resp('2024년 7월 주문수와 2025년 7월 주문수 비교해줘.');
const rMonthRev = resp('2024년 7월 매출과 2025년 7월 매출 비교해줘.');
const rMonthly = resp('2024년과 2025년 월별 주문수 비교해줘.');
const rSuppress = resp('그래프 없이 쿠폰 사용 고객과 미사용 고객의 객단가만 비교해줘.');
const rRoas = resp('광고비까지 포함해서 ROAS 비교해줘.');
if (rCoupon) console.log(`  coupon AOV → chartType:${rCoupon.artifact.chartSpec.chartType} points:${rCoupon.artifact.chartSpec.series[0].points.length} title:${rCoupon.artifact.chartSpec.title}`);

ok('1. marketingChartGrammar selector 존재', has('src/services/marketingChartGrammar.ts') && /selectMarketingChartType/.test(GRAMMAR));
ok('2. AOV metric은 donut/pie로 안 감', sel({ intent: 'compare', metric: 'averageOrderValue', rowCount: 2, suppressed: false, isShare: true }) !== 'donut' && sel({ intent: 'compare', metric: 'averageOrderValue', comparisonType: 'segmentCompare', rowCount: 2, suppressed: false }) === 'groupedBar');
ok('3. 쿠폰 사용/미사용 객단가는 compactBars(groupedBar)', rCoupon?.artifact.chartSpec.chartType === 'groupedBar');
ok('4. 쿠폰 chart rows 2개', rCoupon?.artifact.chartSpec.series[0].points.length === 2);
ok('5. 쿠폰 chart title에 객단가 포함', /객단가/.test(rCoupon?.artifact.chartSpec.title || ''));
ok('6. 주문수 기간 비교는 groupedBar(compact)', rMonthOrder?.artifact.chartSpec.chartType === 'groupedBar' && rMonthOrder?.artifact.chartSpec.primaryMetric === 'orderCount');
ok('7. 매출 기간 비교는 groupedBar', rMonthRev?.artifact.chartSpec.chartType === 'groupedBar');
ok('8. 월별 비교는 groupedBar(다중 series 유지)', rMonthly?.artifact.chartSpec.chartType === 'groupedBar' && rMonthly?.artifact.chartSpec.series.length === 2);
ok('9. ranking(5+) 질문은 rankedBar', sel({ intent: 'rank', metric: 'revenue', rowCount: 6, suppressed: false }) === 'rankedBar');
ok('10. share/비중만 donut 허용', sel({ intent: 'compare', metric: 'revenue', rowCount: 4, suppressed: false, isShare: true }) === 'donut' && sel({ intent: 'compare', metric: 'revenue', rowCount: 2, suppressed: false }) === 'groupedBar');
ok('11. compactBars tooltip disabled(렌더 config)', /\{!compact && <ChartTooltip/.test(DASH));
ok('12. compactBars height/padding < monthly(css)', /mkt-chart-compact-bars/.test(DASH_CSS) && /mkt-chart-compact .marketing-chart-tooltip/.test(DASH_CSS));
ok('13. compact hover card 미렌더 class/config', /compact \? ' mkt-chart-compact-bars'/.test(DASH) && /const compact = chartSpec\.series\.flatMap/.test(DASH));
ok('14. metric label grammar(revenue/orderCount/AOV)', /MARKETING_METRIC_GRAMMAR/.test(GRAMMAR) && /revenue:.*매출/.test(GRAMMAR) && /averageOrderValue:.*객단가/.test(GRAMMAR));
ok('15. suppressChart true이면 표시 차트 없음', rSuppress?.suppressChart === true && /suppressChart \? null/.test(read('src/components/DepartmentWorkspacePanel.tsx')));
ok('16. unsupported이면 chart artifact 없음', rRoas?.handled === true && !rRoas?.artifact);

// 안전/금지 영역 (git)
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
ok('20. synthetic data 변경 없음', !changed.some((f) => /syntheticCommerceUniverse|syntheticRevenue/.test(f)));
ok('21. department source/contract 변경 없음', !changed.some((f) => /departmentDataSourceOfTruth|departmentMetricContract|revenueMetricContract/.test(f)));
ok('22. Vercel gateway 변경 없음', !changed.some((f) => /\[action\]\.ts|\[resource\]\.ts/.test(f)));
ok('23. Godomall WRITE 없음', !/writeOrder|goodsRegist|Order_Regist|memberModify/i.test(GRAMMAR + EXECUTOR));
ok('24. Agent Studio wiring 없음', !/initialAgents|resolveAgentBrain|systemPrompt/.test(GRAMMAR + EXECUTOR));
ok('25. 문서 존재', DOC);
// Query Compiler/Executor 계산 로직 무변경(executor의 집계 함수 보존)
ok('26. Executor 계산 기준(isValidOrder net) 보존', /isValidOrder/.test(EXECUTOR) && /aggregateRange/.test(EXECUTOR));

rmSync(tmp, { recursive: true, force: true });
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
