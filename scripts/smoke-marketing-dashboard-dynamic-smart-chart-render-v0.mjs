#!/usr/bin/env node
/*
 * scripts/smoke-marketing-dashboard-dynamic-smart-chart-render-v0.mjs
 * Marketing Dashboard Dynamic Smart Chart Render v0 검증 (소스 마커 + chartSpec helper).
 *  - 채팅 chartSpec artifact → MarketingAnalysisDashboard prop → 중앙 smart chart 렌더 분기
 *  - groupedBar/line/rankedBar/unsupported 렌더, narrative 우선 AI 리포트, JSON/PII 미노출
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
console.log('=== Marketing Dashboard Dynamic Smart Chart Render v0 smoke ===');

const DASH = read('src/components/MarketingAnalysisDashboard.tsx');
const CSS = read('src/components/MarketingAnalysisDashboard.css');
const PANEL = read('src/components/DepartmentWorkspacePanel.tsx');

// ── prop 연결 ──
ok('1. Panel → Dashboard marketingChartArtifact prop 전달', /marketingChartArtifact=\{marketingChartArtifact\}/.test(PANEL));
ok('2. onClearMarketingChartArtifact clear handler 전달', /onClearMarketingChartArtifact=\{\(\) => setMarketingChartArtifact\(null\)\}/.test(PANEL));
ok('3. Dashboard props에 marketingChartArtifact optional 추가', /marketingChartArtifact\?: MarketingChatChartArtifact \| null/.test(DASH) && /onClearMarketingChartArtifact\?: \(\) => void/.test(DASH));
ok('4. MarketingChatChartArtifact import from marketingChatChartSpec', /import type \{[^}]*MarketingChatChartArtifact[^}]*\} from '\.\.\/services\/marketingChatChartSpec'/.test(DASH));

// ── 렌더 분기 ──
ok('5. artifact 있을 때 chartSpec 패널 렌더 분기', /marketingChartArtifact \?\s*\(\s*<MarketingChartSpecPanel/.test(DASH));
ok('6. artifact 없을 때 기존 focus smart chart fallback 유지', /: \(\s*<div className="marketing-smart-chart">/.test(DASH) && /view\.chipLabel/.test(DASH));
ok('7. focus chip 기능 유지(marketing-focus-selector)', /marketing-focus-selector/.test(DASH) && /MarketingFocusMetric/.test(DASH));
ok('8. dev marker marketing-dynamic-chart-active/intent/type/available', /data-marketing-dynamic-chart-active/.test(DASH) && /data-marketing-dynamic-chart-intent/.test(DASH) && /data-marketing-dynamic-chart-type/.test(DASH) && /data-marketing-dynamic-chart-available/.test(DASH));

// ── chartType 렌더 함수/분기 ──
ok('9. groupedBar 렌더', /GroupedBarChart/.test(DASH) && /case 'groupedBar'/.test(DASH));
ok('10. line 렌더', /LineChart/.test(DASH) && /case 'line'/.test(DASH) && /polyline/.test(DASH));
ok('11. rankedBar 렌더', /RankedBarChart/.test(DASH) && /case 'rankedBar'/.test(DASH));
ok('12. unsupported 렌더', /UnsupportedChart/.test(DASH) && /chartType === 'unsupported'/.test(DASH));
ok('13. stacked/donut/table fallback 처리', /case 'stackedBar'/.test(DASH) && /case 'donut'/.test(DASH) && /case 'table'/.test(DASH));

// ── 문구/배지/버튼 ──
ok('14. "채팅 질문 기반 분석 결과" 배지', /채팅 질문 기반 분석 결과/.test(DASH));
ok('15. "기본 분석으로 돌아가기" 버튼 + onClear', /기본 분석으로 돌아가기/.test(DASH) && /onClick=\{onClear\}/.test(DASH));

// ── narrative AI 리포트 ──
ok('16. artifact 있을 때 narrative 리포트 분기', /marketingChartArtifact \?\s*\(\s*<MarketingNarrativeReport/.test(DASH));
ok('17. narrative title/summary/bullets/evidence/warnings 표시', /n\.title/.test(DASH) && /n\.summary/.test(DASH) && /n\.bullets\.map/.test(DASH) && /n\.evidence\.map/.test(DASH) && /n\.warnings/.test(DASH));
ok('18. requiredData unsupported 패널에서 표시', /chartSpec\.requiredData\.map/.test(DASH) && /marketing-chart-required-chip/.test(DASH));

// ── 금지: chartSpec JSON 그대로 노출 / 계산 로직 재구현 ──
ok('19. chartSpec JSON.stringify 노출 없음', !/JSON\.stringify\([^)]*chartSpec/.test(DASH) && !/JSON\.stringify\([^)]*artifact/.test(DASH));
ok('20. 새 계산 엔진/facts 재구현 없음(buildMarketing* 신규 호출 없음 — 기존 buildMarketingAnalysisFacts만)', !/buildMarketingTemporalCrosstab|buildMarketingChatChartResponse|runMarketingChartRequest/.test(DASH));

// ── CSS 마커 ──
ok('21. CSS: chartSpec 패널/그래프 클래스', /marketing-chart-spec-panel/.test(CSS) && /marketing-chart-grouped-bars/.test(CSS) && /marketing-chart-line/.test(CSS) && /marketing-chart-ranked-bars/.test(CSS) && /marketing-chart-unsupported/.test(CSS));

// ── PII / 인과 ──
// 주석 제거 후 스캔(정책 설명 주석의 memberKey 등 단어는 렌더 아님).
const DASH_CODE = DASH.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok('22. PII 필드 직접 렌더 없음(주석 제외)', !/\.(phone|email|address|customerName|ordererName|receiverName)\b/.test(DASH_CODE) && !/memberKey|syn_member_/.test(DASH_CODE));
ok('23. 인과 단정어(때문에/덕분에/원인입니다) 없음', !/때문에|덕분에|원인입니다/.test(DASH));
ok('24. localStorage 신규 사용 없음(렌더 컴포넌트)', !/localStorage/.test(DASH));
ok('25. fetch/WRITE API 호출 추가 없음', !/fetch\(|\.post\(|\.put\(|\.delete\(/.test(DASH));

// ── chartSpec helper 동작(렌더가 받을 데이터가 실제로 생성되는지) ──
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-dyn-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-dyn-src-'));
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
const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26', includeBaselineYear: true });
const run = (m) => M.runMarketingChartRequest({ message: m, orders: u.orders, products, nowMs: Date.parse('2026-06-27T00:00:00') });
const coupon = run('월별 쿠폰 사용/미사용 객단가 비교해줘');
const channel = run('월별 주문채널 매출 비교해줘');
const member = run('회원그룹별 매출 비교해줘');
const roas = run('ROAS 알려줘');
ok('26. groupedBar artifact series/points 구조(렌더 입력 유효)', coupon.artifact.chartSpec.chartType === 'groupedBar' && coupon.artifact.chartSpec.series.every((s) => Array.isArray(s.points) && s.points.every((p) => typeof p.bucketLabel === 'string' && typeof p.value === 'number')));
ok('27. line artifact(channel) points 구조', channel.artifact.chartSpec.chartType === 'line' && channel.artifact.chartSpec.series.length > 0);
ok('28. rankedBar artifact(memberGroup) series 구조', member.artifact.chartSpec.chartType === 'rankedBar' && member.artifact.chartSpec.series.length > 0);
ok('29. unsupported artifact(roas) available false + requiredData', roas.artifact.chartSpec.available === false && (roas.artifact.chartSpec.requiredData || []).length > 0 && roas.artifact.chartSpec.series.length === 0);
ok('30. narrative 필드 존재(title/summary/bullets/evidence/warnings)', ['title', 'summary', 'bullets', 'evidence', 'warnings'].every((k) => k in coupon.artifact.narrative));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
