#!/usr/bin/env node
/*
 * scripts/smoke-marketing-chart-renderer-parity-p0.mjs
 * Marketing Chart Renderer Parity P0 — 단일 월별 매출=combo, 연도 비교=vertical grouped bar 라우팅 + tooltip 안정화.
 *  - resolveMarketingChartRoute(순수 함수)로 Q1→combo / Q2→groupedVertical 판정 검증
 *  - 신규 컴포넌트 존재 + 대시보드 import/use + tooltip absolute/pointer-events:none + 상품팀 회귀 없음
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-parity-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-parity-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  // 순수 라우팅 함수 + scope 엔진을 함께 emit
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'components', 'charts', 'marketingChartRoute.ts'),
    path.join(REPO, 'src', 'services', 'marketingScopeInsightEngine.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc, { recursive: true }).filter((x) => typeof x === 'string' && x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const R = await import(pathToFileURL(path.join(tmpSrc, 'components', 'charts', 'marketingChartRoute.js')).href);
const E = await import(pathToFileURL(path.join(tmpSrc, 'services', 'marketingScopeInsightEngine.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Chart Renderer Parity P0 smoke ===');

// ── 파일/컴포넌트 존재 ──
ok('1. CommerceComboChart 파일 존재', existsSync(path.join(REPO, 'src/components/charts/CommerceComboChart.tsx')));
ok('2. CommerceGroupedBarChart 파일 존재', existsSync(path.join(REPO, 'src/components/charts/CommerceGroupedBarChart.tsx')));
ok('3. CommerceChartTooltip / route / css 파일 존재', existsSync(path.join(REPO, 'src/components/charts/CommerceChartTooltip.tsx')) && existsSync(path.join(REPO, 'src/components/charts/marketingChartRoute.ts')) && existsSync(path.join(REPO, 'src/components/charts/commerceCharts.css')));
ok('4. resolveMarketingChartRoute export', typeof R.resolveMarketingChartRoute === 'function');

const COMBO = read('src/components/charts/CommerceComboChart.tsx');
const GROUPED = read('src/components/charts/CommerceGroupedBarChart.tsx');
const CSS = read('src/components/charts/commerceCharts.css');
const DASH = read('src/components/MarketingAnalysisDashboard.tsx');
const PTD = read('src/components/ProductTeamDashboard.tsx');

// ── 컴포넌트 구현 특성 ──
ok('5. combo: 세로 막대 <rect> + smooth line path + 정상 viewBox(0 0 560)', /<rect/.test(COMBO) && /smoothPath/.test(COMBO) && /viewBox=\{`0 0 \$\{W\}/.test(COMBO) && !/preserveAspectRatio="none"/.test(COMBO));
ok('6. grouped: 세로 막대 <rect> + 그룹 배치(groupCenter) + legend', /<rect/.test(GROUPED) && /groupCenter/.test(GROUPED) && /cc-legend/.test(GROUPED) && !/preserveAspectRatio="none"/.test(GROUPED));
ok('7. tooltip absolute + pointer-events:none', /position:\s*absolute/.test(CSS) && /pointer-events:\s*none/.test(CSS));
ok('8. tooltip이 레이아웃 밀지 않음(z-index + absolute)', /\.cc-tooltip\s*\{[\s\S]*?z-index/.test(CSS));

// ── 대시보드 연결 ──
ok('9. 대시보드가 CommerceComboChart import/use', /import \{ CommerceComboChart/.test(DASH) && /<CommerceComboChart/.test(DASH));
ok('10. 대시보드가 CommerceGroupedBarChart import/use', /import \{ CommerceGroupedBarChart/.test(DASH) && /<CommerceGroupedBarChart/.test(DASH));
ok('11. 대시보드가 resolveMarketingChartRoute 사용', /resolveMarketingChartRoute\(/.test(DASH));
ok('12. combo/groupedVertical 라우팅 분기 존재', /route === 'combo'/.test(DASH) && /route === 'groupedVertical'/.test(DASH));
ok('13. 기존 LineChart polyline / GroupedBarChart 마커 유지(회귀 방지)', /polyline/.test(DASH) && /case 'groupedBar'/.test(DASH) && /case 'line'/.test(DASH));
ok('14. chartSpec JSON 화면 노출 없음', !/JSON\.stringify\([^)]*chartSpec/.test(DASH) && !/<pre/.test(DASH));

// ── 상품팀 회귀 없음 ──
ok('15. ProductTeamDashboard TrendChart 그대로 유지(회귀 없음)', /const TrendChart/.test(PTD) && /ptd-chart-svg/.test(PTD));

// ── 라우팅 판정(데이터 기반) ──
const products = Array.from({ length: 6 }, (_, i) => ({
  productId: String(1001 + i), productCode: `A-${1001 + i}`, productName: `상품${i + 1}`, price: 10000 + i * 2000, fixedPrice: 15000 + i * 2000,
  stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true,
  categoryCode: ['003', '004', '005'][i % 3], allCategoryCode: ['003', '004', '005'][i % 3], brandCode: ['001', '002'][i % 2], registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: ''
}));
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, includeBaselineYear: true });
const nowMs = Date.parse('2026-06-27T00:00:00');
const ask = (m) => E.buildMarketingScopeInsightResponse({ message: m, orders: u.orders, products, reviews: u.reviews, inquiries: u.inquiries, nowMs });

// Q1
const q1 = ask('2024년 1월부터 12월까지 월별 매출을 그래프로 보여줘');
const cs1 = q1.artifact.chartSpec;
console.log('  [Q1] chartType:', cs1.chartType, 'series:', cs1.series.length, 'points:', cs1.series[0].points.length, '→ route:', R.resolveMarketingChartRoute(cs1));
ok('16. Q1 chartSpec line + 단일 series + 12 monthly points', cs1.chartType === 'line' && cs1.series.length === 1 && cs1.series[0].points.length === 12);
ok('17. Q1 → combo route', R.resolveMarketingChartRoute(cs1) === 'combo');

// Q2
const q2 = ask('2024년과 2025년 월별 매출을 비교해줘');
const cs2 = q2.artifact.chartSpec;
console.log('  [Q2] chartType:', cs2.chartType, 'series:', cs2.series.map((s) => s.label), '→ route:', R.resolveMarketingChartRoute(cs2));
ok('18. Q2 chartSpec groupedBar + 2024/2025 series + 월 buckets', cs2.chartType === 'groupedBar' && cs2.series.length === 2 && cs2.series[0].points.length === 12);
ok('19. Q2 → groupedVertical route(horizontal list 아님)', R.resolveMarketingChartRoute(cs2) === 'groupedVertical');

// 기타 라우팅 회귀(작은 비교/순위/미지원)
const mkSpec = (chartType, primaryMetric, series, available = true) => ({ chartType, primaryMetric, series, available, unit: 'krw', source: 'temporal_crosstab', request: {}, evidence: [], warnings: [], title: '', subtitle: '' });
const pts = (...vals) => vals.map((v, i) => ({ bucketKey: String(i + 1).padStart(2, '0'), bucketLabel: `${i + 1}월`, value: v }));
ok('20. rankedBar는 그대로 rankedBar route', R.resolveMarketingChartRoute(mkSpec('rankedBar', 'revenue', [{ key: 'a', label: 'A', metric: 'revenue', points: pts(1, 2) }])) === 'rankedBar');
ok('21. 2개 시점 line(비월별/소수)은 combo 아님', ['line', 'unsupported'].includes(R.resolveMarketingChartRoute(mkSpec('line', 'revenue', [{ key: 'a', label: 'A', metric: 'revenue', points: [{ bucketKey: 'all', bucketLabel: '전체', value: 5 }] }]))));
ok('22. !available → unsupported route', R.resolveMarketingChartRoute(mkSpec('line', 'revenue', [{ key: 'a', label: 'A', metric: 'revenue', points: pts(1) }], false)) === 'unsupported');
ok('23. 단일 series 2개월 groupedBar는 groupedVertical 아님(구간<3)', R.resolveMarketingChartRoute(mkSpec('groupedBar', 'revenue', [{ key: 'a', label: 'A', metric: 'revenue', points: pts(1) }, { key: 'b', label: 'B', metric: 'revenue', points: pts(2) }])) === 'groupedBar');

// ── API/WRITE/localStorage 변경 없음 ──
ok('24. 신규 차트 코드에 fetch/localStorage/WRITE 없음', !/fetch\(|localStorage|api\/order|writeOrder/i.test(COMBO + GROUPED + read('src/components/charts/marketingChartRoute.ts') + read('src/components/charts/commerceChartUtils.ts')));

console.log(`\n--- 요약 ---\nQ1 route=${R.resolveMarketingChartRoute(cs1)} (line ${cs1.series[0].points.length}pt) / Q2 route=${R.resolveMarketingChartRoute(cs2)} (series ${cs2.series.length})`);
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
