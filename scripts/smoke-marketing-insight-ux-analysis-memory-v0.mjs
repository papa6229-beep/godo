#!/usr/bin/env node
/*
 * scripts/smoke-marketing-insight-ux-analysis-memory-v0.mjs
 * Marketing Insight UX + Analysis Memory v0 검증.
 *  - 분석 메모리(비PII, localStorage 1 key, masking, 유사 검색)
 *  - 차트 UX: series style helper, tooltip 경로, groupedBar 우선(month YoY), proxy chart, comparison insights
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-insight-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-insight-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'marketingAnalysisMemory.ts'),
    path.join(REPO, 'src', 'services', 'marketingIntelligencePlanner.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}

// localStorage 폴리필 (window) — 메모리 저장/로드 테스트
const store = new Map();
globalThis.window = { localStorage: {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
} };

const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const MEM = await import(pathToFileURL(path.join(tmpSrc, 'marketingAnalysisMemory.js')).href);
const PL = await import(pathToFileURL(path.join(tmpSrc, 'marketingIntelligencePlanner.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Insight UX + Analysis Memory v0 smoke ===');

// ── 메모리 export / key / 제한 ──
ok('1. marketingAnalysisMemory.ts 존재', existsSync(path.join(REPO, 'src/services/marketingAnalysisMemory.ts')));
ok('2. maskMarketingMemoryText export', typeof MEM.maskMarketingMemoryText === 'function');
ok('3. createMarketingAnalysisMemoryEntry export', typeof MEM.createMarketingAnalysisMemoryEntry === 'function');
ok('4. saveMarketingAnalysisMemoryEntry export', typeof MEM.saveMarketingAnalysisMemoryEntry === 'function');
ok('5. loadMarketingAnalysisMemoryEntries export', typeof MEM.loadMarketingAnalysisMemoryEntries === 'function');
ok('6. findSimilarMarketingAnalysisMemories export', typeof MEM.findSimilarMarketingAnalysisMemories === 'function');
ok('7. clearMarketingAnalysisMemory export', typeof MEM.clearMarketingAnalysisMemory === 'function');
ok('8. localStorage key가 godo.marketing.analysisMemory.v0', MEM.MARKETING_ANALYSIS_MEMORY_KEY === 'godo.marketing.analysisMemory.v0');
ok('9. 최대 저장 개수 제한 존재(50~100)', MEM.MARKETING_ANALYSIS_MEMORY_MAX >= 50 && MEM.MARKETING_ANALYSIS_MEMORY_MAX <= 100);

// ── masking ──
const masked = MEM.maskMarketingMemoryText('고객 홍길동 010-1234-5678 hong@example.com 서울시 강남구 syn_member_42 분석해줘');
ok('10. name/phone/email/syn_member 마스킹', !/010-1234-5678/.test(masked) && !/hong@example\.com/.test(masked) && !/syn_member_42/.test(masked) && /\[전화\]|\[이메일\]|\[회원\]/.test(masked));

// ── entry 생성: raw/orderNo/memberKey 저장 금지 ──
const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26', includeBaselineYear: true });
const nowMs = Date.parse('2026-06-27T00:00:00');
const resp = PL.buildMarketingIntelligenceResponse({ message: '2025년과 2026년 1월부터 6월까지의 월별 매출을 그래프로 보여줘', orders: u.orders, products, nowMs });
const entry = MEM.createMarketingAnalysisMemoryEntry({ question: '2025년과 2026년 1월부터 6월까지의 월별 매출을 그래프로 보여줘', plan: resp.plan, artifact: resp.artifact, resultType: resp.result.narrative.answerType, nowMs });
const entryJson = JSON.stringify(entry);
ok('11. entry에 raw order/orderNo/memberKey/orderGoodsData 저장 안 됨', !/orderNo|memberKey|orderGoodsData|receiverName|"name"|totalAmount/.test(entryJson));
ok('12. entry는 planSummary/chartSummary/resultType/requiredData/timestamp만(집계/계획)', !!entry.planSummary && !!entry.chartSummary && !!entry.resultType && Array.isArray(entry.requiredData) && !!entry.createdAt);
ok('13. entry planSummary에 metrics/dimensions/comparison(enum) 포함', Array.isArray(entry.planSummary.metrics) && Array.isArray(entry.planSummary.dimensions) && entry.planSummary.comparison === 'year_over_year');

// ── 저장/로드/유사검색/clear ──
MEM.clearMarketingAnalysisMemory();
MEM.saveMarketingAnalysisMemoryEntry(entry);
const loaded = MEM.loadMarketingAnalysisMemoryEntries();
ok('14. 저장 후 load로 복원', loaded.length === 1 && loaded[0].planSummary.comparison === 'year_over_year');
ok('15. localStorage는 marketing analysis memory key로만 기록', [...store.keys()].every((k) => k === 'godo.marketing.analysisMemory.v0'));
const similar = MEM.findSimilarMarketingAnalysisMemories({ question: '2025년과 2026년 상반기 월별 매출 비교', plan: resp.plan, limit: 5 });
ok('16. 유사 질문 검색이 이전 분석을 찾음', similar.length >= 1);
const noSim = MEM.findSimilarMarketingAnalysisMemories({ question: '오늘 날씨 어때', limit: 5 });
ok('17. 무관 질문은 유사 결과 적음', noSim.length === 0);
MEM.clearMarketingAnalysisMemory();
ok('18. clear 후 빈 배열', MEM.loadMarketingAnalysisMemoryEntries().length === 0);
// 최대 개수 제한 동작
for (let i = 0; i < MEM.MARKETING_ANALYSIS_MEMORY_MAX + 10; i++) MEM.saveMarketingAnalysisMemoryEntry(MEM.createMarketingAnalysisMemoryEntry({ question: `q${i} 매출 추이`, plan: resp.plan, artifact: resp.artifact, nowMs: nowMs + i }));
ok('19. 최대 개수 초과 시 오래된 것부터 제거(상한 유지)', MEM.loadMarketingAnalysisMemoryEntries().length === MEM.MARKETING_ANALYSIS_MEMORY_MAX);
MEM.clearMarketingAnalysisMemory();

// ── groupedBar 우선(month YoY) + comparison insights ──
ok('20. year_over_year + month + periods≥2 → groupedBar 우선', resp.plan.chartRecommendation.chartType === 'groupedBar' && resp.result.primaryChartSpec.chartType === 'groupedBar');
ok('21. groupedBar reason에 "나란히/비교" 설명', /나란히|비교/.test(resp.plan.chartRecommendation.reason));
const trend = PL.buildMarketingIntelligenceResponse({ message: '월별 매출 추이 보여줘', orders: u.orders, products, nowMs });
ok('22. 비교 아닌 "추이"는 line 유지', trend.result.primaryChartSpec.chartType === 'line');
const comp = PL.buildMarketingComparisonInsights({ chartSpec: resp.result.primaryChartSpec, plan: resp.plan });
ok('23. buildMarketingComparisonInsights: totalComparison/largestGap/strongest', typeof PL.buildMarketingComparisonInsights === 'function' && !!comp.totalComparison && !!comp.largestGap);
ok('24. AI 리포트(narrative)에 비교/최대격차/근거가 단순 낭독 대신 포함', resp.result.narrative.bullets.some((b) => /차이|가장 큰 차이|구간/.test(b)) && resp.result.narrative.sections && resp.result.narrative.sections.largestGaps.length >= 0);
ok('25. 인과 단정어(때문에/덕분에/원인입니다) 없음', !['때문에', '덕분에', '원인입니다'].some((c) => (resp.reply + JSON.stringify(resp.result.narrative)).includes(c)));

// ── partial_with_proxy: proxy chart available(미locked) ──
const conv = PL.buildMarketingIntelligenceResponse({ message: '2026년 신규 가입회원의 구매전환율을 알려줘', orders: u.orders, products, nowMs });
ok('26. 구매전환율 partial_with_proxy + proxy chart available(unsupported 아님)', conv.result.narrative.answerType === 'partial_with_proxy' && conv.result.primaryChartSpec.available === true && conv.result.primaryChartSpec.chartType !== 'unsupported');
ok('27. proxy 응답에 requiredData 안내 존재', conv.artifact.requiredData.length > 0);
const roas = PL.buildMarketingIntelligenceResponse({ message: 'ROAS 알려줘', orders: u.orders, products, nowMs });
ok('28. ROAS는 required_data + available false(fake 0 금지)', roas.result.narrative.answerType === 'required_data' && roas.result.primaryChartSpec.available === false);

// ── PII self-check ──
ok('29. 대표 응답 piiCheck.containsPii false', [resp, conv, roas, trend].every((r) => r.result.piiCheck.containsPii === false));

// ── 대시보드/패널 소스 마커 ──
const DASH = readFileSync(path.join(REPO, 'src/components/MarketingAnalysisDashboard.tsx'), 'utf8');
const CSS = readFileSync(path.join(REPO, 'src/components/MarketingAnalysisDashboard.css'), 'utf8');
const PANEL = readFileSync(path.join(REPO, 'src/components/DepartmentWorkspacePanel.tsx'), 'utf8');
ok('30. series visual style helper 존재', /getMarketingSeriesVisualStyle/.test(DASH));
ok('31. 2025/2026 등 연도 series style 분기(year-even/odd)', /mkt-s-year-/.test(DASH) && /\d{4}/.test(DASH) && /mkt-s-year-even/.test(CSS) && /mkt-s-year-odd/.test(CSS));
ok('32. tooltip 렌더 경로(buildMarketingTooltipPayload + ChartTooltip + onMouseEnter)', /buildMarketingTooltipPayload/.test(DASH) && /marketing-chart-tooltip/.test(DASH) && /onMouseEnter/.test(DASH));
ok('33. groupedBar/line/rankedBar 모두 tooltip hover 경로', (DASH.match(/setHover/g) || []).length >= 3 && /marketing-chart-line-dot/.test(DASH));
ok('34. partial_with_proxy proxy 배지 분기(available && requiredData)', /marketing-chart-proxy-badge/.test(DASH) && /cs\.available && artifact\.requiredData/.test(DASH));
ok('35. unsupported는 !available일 때만(렌더 분기)', /if \(!chartSpec\.available \|\| chartSpec\.chartType === 'unsupported'\) return <UnsupportedChart/.test(DASH));
ok('36. AI 리포트 narrative 경로(bullets/evidence/warnings/requiredData)', /n\.bullets\.map/.test(DASH) && /n\.evidence\.map/.test(DASH) && /n\.warnings/.test(DASH) && /필요 데이터/.test(DASH));
ok('37. 메모리 dev marker(data-marketing-analysis-memory-count/used)', /data-marketing-analysis-memory-count/.test(DASH) && /data-marketing-analysis-memory-used/.test(DASH));
ok('38. 패널이 메모리 저장 + 유사 검색 연결', /saveMarketingAnalysisMemoryEntry\(/.test(PANEL) && /findSimilarMarketingAnalysisMemories\(/.test(PANEL) && /createMarketingAnalysisMemoryEntry\(/.test(PANEL));
ok('39. 패널 메모리 저장이 try/catch로 안전 처리', /try \{[\s\S]*saveMarketingAnalysisMemoryEntry[\s\S]*catch/.test(PANEL));
ok('40. chartSpec JSON.stringify 화면 노출 없음(대시보드)', !/JSON\.stringify\(.*chartSpec/.test(DASH) && !/<pre/.test(DASH));
ok('41. 고도몰 WRITE/API route 추가 없음(대시보드/패널/메모리)', !/fetch\(|api\/order|writeOrder|godomall.*write/i.test(DASH + readFileSync(path.join(REPO, 'src/services/marketingAnalysisMemory.ts'), 'utf8')));
ok('42. localStorage 사용은 메모리 key로만 제한(메모리 파일 외 신규 setItem 없음)', !/localStorage\.setItem/.test(DASH) && !/localStorage\.setItem/.test(PANEL));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
