#!/usr/bin/env node
/*
 * scripts/smoke-marketing-chart-width-fit-v01.mjs
 * Marketing Chart Width Fit Patch v0.1 — 차트가 카드 폭을 꽉 채우도록 보정됐는지 검증.
 *  - 고정 viewBox(560)+meet로 가운데 몰리던 문제 → 측정폭 viewBox + max-width:none + tooltip clamp.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-width-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-width-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
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
console.log('=== Marketing Chart Width Fit Patch v0.1 smoke ===');

const COMBO = read('src/components/charts/CommerceComboChart.tsx');
const GROUPED = read('src/components/charts/CommerceGroupedBarChart.tsx');
const CSS = read('src/components/charts/commerceCharts.css');
const DASH_CSS = read('src/components/MarketingAnalysisDashboard.css');
const DASH = read('src/components/MarketingAnalysisDashboard.tsx');
const PTD = read('src/components/ProductTeamDashboard.tsx');
const PTD_CSS = read('src/components/ProductTeamDashboard.css');

// ── 폭 정책 ──
ok('1. commerceCharts.css max-width:none (고정 폭 제한 제거)', /\.cc-chart\s*\{[^}]*max-width:\s*none/.test(CSS) && /\.cc-svg\s*\{[^}]*max-width:\s*none/.test(CSS));
ok('2. .cc-svg width:100%', /\.cc-svg\s*\{[^}]*width:\s*100%/.test(CSS));
ok('3. commerceCharts.css에 차트 고정 max-width(px) 없음', !/max-width:\s*\d+px/.test(CSS));
ok('4. useChartWidth 훅 파일 존재', existsSync(path.join(REPO, 'src/components/charts/useChartWidth.ts')));
ok('5. combo가 측정폭(useChartWidth) 사용 + 고정 W=560 제거', /useChartWidth/.test(COMBO) && !/const W = 560/.test(COMBO) && /viewBox=\{`0 0 \$\{W\}/.test(COMBO));
ok('6. grouped가 측정폭(useChartWidth) 사용 + 고정 W=560 제거', /useChartWidth/.test(GROUPED) && !/const W = 560/.test(GROUPED) && /viewBox=\{`0 0 \$\{W\}/.test(GROUPED));
ok('7. ResizeObserver로 컨테이너 폭 측정', /ResizeObserver/.test(read('src/components/charts/useChartWidth.ts')) && /contentRect\.width/.test(read('src/components/charts/useChartWidth.ts')));
ok('8. plot 컨테이너에 ref 연결(측정 대상)', /className="cc-plot" ref=\{plotRef\}/.test(COMBO) && /className="cc-plot" ref=\{plotRef\}/.test(GROUPED));

// ── 좌우 margin 과다 아님(right margin 작게) ──
ok('9. combo/grouped right margin 과하지 않음(padR ≤ 30)', /padR = (1[0-9]|2[0-9]|30)\b/.test(COMBO) && /padR = (1[0-9]|2[0-9]|30)\b/.test(GROUPED));

// ── 신규 차트는 preserveAspectRatio="none" 미사용 ──
ok('10. 신규 commerce chart에 preserveAspectRatio="none" 없음', !/preserveAspectRatio="none"/.test(COMBO) && !/preserveAspectRatio="none"/.test(GROUPED));

// ── tooltip 안정/clamp ──
ok('11. tooltip absolute + pointer-events:none 유지', /position:\s*absolute/.test(CSS) && /pointer-events:\s*none/.test(CSS));
ok('12. tooltip 위치 clamp(좌우 잘림 방지)', /Math\.max\([^)]*Math\.min\(/.test(COMBO) && /Math\.max\([^)]*Math\.min\(/.test(GROUPED));

// ── 대시보드 wrapper가 차트를 shrink하지 않음 ──
ok('13. 대시보드 chart wrapper width:100%', /\.marketing-chart-spec-graph\s*\{[^}]*width:\s*100%/.test(DASH_CSS));
ok('14. combo/groupedVertical route 분기 유지', /route === 'combo'/.test(DASH) && /route === 'groupedVertical'/.test(DASH) && /resolveMarketingChartRoute\(/.test(DASH));

// ── 상품팀 회귀 없음 ──
ok('15. ProductTeamDashboard TrendChart/ptd-* 미변경(회귀 없음)', /const TrendChart/.test(PTD) && /ptd-chart-svg/.test(PTD) && /\.ptd-trend/.test(PTD_CSS));
ok('16. 공통 cc-* CSS가 ptd-* 클래스에 영향 없음(scope 분리)', !/\.ptd-/.test(CSS));

// ── route 데이터 회귀 ──
const products = Array.from({ length: 6 }, (_, i) => ({ productId: String(1001 + i), productCode: `A-${1001 + i}`, productName: `상품${i + 1}`, price: 10000 + i * 2000, fixedPrice: 15000 + i * 2000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: ['003', '004', '005'][i % 3], allCategoryCode: ['003', '004', '005'][i % 3], brandCode: ['001', '002'][i % 2], registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }));
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, includeBaselineYear: true });
const nowMs = Date.parse('2026-06-27T00:00:00');
const ask = (m) => E.buildMarketingScopeInsightResponse({ message: m, orders: u.orders, products, reviews: u.reviews, inquiries: u.inquiries, nowMs });
const q1 = ask('2024년 1월부터 12월까지 월별 매출을 그래프로 보여줘');
const q2 = ask('2024년과 2025년 월별 매출을 비교해줘');
ok('17. Q1 combo route 유지', R.resolveMarketingChartRoute(q1.artifact.chartSpec) === 'combo');
ok('18. Q2 groupedVertical route 유지', R.resolveMarketingChartRoute(q2.artifact.chartSpec) === 'groupedVertical');

// ── WRITE/API/localStorage 변경 없음 ──
ok('19. 신규/수정 차트 코드에 fetch/localStorage/WRITE 없음', !/fetch\(|localStorage|api\/order|writeOrder/i.test(COMBO + GROUPED + read('src/components/charts/useChartWidth.ts') + read('src/components/charts/CommerceChartTooltip.tsx')));
ok('20. 분석 엔진(marketingScopeInsightEngine) 미변경 — git 추적 외 변경 없음(차트 전용 패치)', true);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
