#!/usr/bin/env node
/*
 * scripts/smoke-marketing-analysis-dashboard-focused-insight-layout-v01.mjs
 * Marketing Analysis Dashboard Focused Insight Layout v0.1 검증 (소스 마커 + facts helper).
 *  - 분석 지표 선택 칩 / compact KPI / smart chart / AI 리포트 위치 / 세부 분석 / requiredData 축소
 *  - 계산 로직 변경 없음(buildMarketingAnalysisFacts 유지, reduce 남발 없음)
 *  - PII 미표시, 외부지표 requiredData 유지, 인과 단정어 부재
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
console.log('=== Marketing Analysis Dashboard Focused Insight Layout v0.1 smoke ===');

ok('1. MarketingAnalysisDashboard.tsx 존재', existsSync(path.join(REPO, 'src/components/MarketingAnalysisDashboard.tsx')));
const TSX = read('src/components/MarketingAnalysisDashboard.tsx');

// ── 분석 지표 선택 ──
ok('2. marketing-focus-selector 마커', /marketing-focus-selector/.test(TSX) && /marketing-focus-chip/.test(TSX));
ok('3. MarketingFocusMetric 선택 지표 타입/상태 존재', /MarketingFocusMetric/.test(TSX) && /useState<MarketingFocusMetric>/.test(TSX));
ok('4. 선택 지표 칩 라벨(객단가/첫구매·재구매/쿠폰/할인/리워드/회원그룹/주문채널/상품·카테고리·브랜드)', ['객단가', '첫구매/재구매', '쿠폰', '할인', '리워드', '회원그룹', '주문채널', '상품 TOP', '카테고리 TOP', '브랜드 TOP'].every((l) => TSX.includes(l)));
ok('5. 기본 선택값 aov', /useState<MarketingFocusMetric>\('aov'\)/.test(TSX));

// ── compact KPI ──
ok('6. marketing-kpi-compact-grid 마커', /marketing-kpi-compact-grid/.test(TSX));
ok('7. 고정 KPI 총매출/주문수 중심', /label="총매출"/.test(TSX) && /label="주문수"/.test(TSX));
ok('8. 선택 지표 KPI + 비교 요약 카드', /view\.selectedKpi/.test(TSX) && /view\.comparison/.test(TSX) && /mkt-kpi-compare/.test(TSX));

// ── smart chart ──
ok('9. marketing-smart-chart 마커', /marketing-smart-chart\b/.test(TSX) && /marketing-smart-chart-bars/.test(TSX) && /marketing-smart-chart-summary/.test(TSX));
ok('10. 선택 지표별 chart branch(buildFocusView switch)', /function buildFocusView/.test(TSX) && /case 'coupon'/.test(TSX) && /case 'reward'/.test(TSX) && /case 'memberGroup'/.test(TSX) && /case 'topBrands'/.test(TSX));
ok('11. chart 헤더(선택 지표 비교 그래프) + view.chart 사용', /선택 지표 비교 그래프/.test(TSX) && /view\.chart\.bars/.test(TSX));

// ── AI 분석 리포트 위치(smart chart 아래) ──
const idxChart = TSX.indexOf('marketing-smart-chart');
const idxReport = TSX.indexOf('marketing-ai-report');
const idxDetail = TSX.indexOf('marketing-detail-section');
ok('12. AI 분석 리포트가 smart chart 아래', idxChart > 0 && idxReport > idxChart);
ok('13. AI 리포트 제목 + 상위 N개 제한(idx<INSIGHT_LIMIT)', /AI 분석 리포트/.test(TSX) && /INSIGHT_LIMIT/.test(TSX) && /idx < INSIGHT_LIMIT/.test(TSX));
ok('14. 리포트 항목(핵심 관찰/근거/다음 확인 후보/주의할 해석)', ['핵심 관찰', '근거', '다음 확인 후보', '주의할 해석'].every((l) => TSX.includes(l)));

// ── 세부 분석(재배치) ──
ok('15. 세부 분석 섹션 마커 + 기존 차원 블록 유지', /marketing-detail-section/.test(TSX) && /세부 분석/.test(TSX) && ['mkt-dim-memberGroup', 'mkt-dim-channel', 'mkt-dim-coupon', 'mkt-dim-reward', 'mkt-dim-product', 'mkt-dim-category', 'mkt-dim-brand'].every((m) => TSX.includes(m)));
ok('16. AI 리포트가 세부 분석보다 위', idxReport > 0 && idxDetail > idxReport);

// ── requiredData 축소 ──
ok('17. requiredData 축소 마커', /marketing-required-compact/.test(TSX) && /mkt-required-grid compact/.test(TSX) && /facts\.requiredData\.map/.test(TSX));
ok('18. requiredData "외부 연동 필요" + 0 미표시 문구', /외부 연동 필요/.test(TSX) && /계산하지 않습니다/.test(TSX));

// ── 계산 로직/원칙 ──
ok('19. buildMarketingAnalysisFacts 사용 유지', /buildMarketingAnalysisFacts\s*\(\s*\{/.test(TSX));
ok('20. 컴포넌트 신규 집계 reduce 없음', !/\.reduce\(/.test(TSX));
ok('21. PII 필드 직접 렌더 없음(name/phone/email/address 등)', !/\.(phone|email|address|customerName|ordererName|receiverName|receiverPhone|receiverAddress)\b/.test(TSX));
ok('22. memberKey 직접 렌더 없음', !/\{[^}]*\.memberKey[^}]*\}/.test(TSX));
ok('23. ROAS/GA4 등을 summary로 직접 계산하지 않음', !/summary\.roas|summary\.ga4|summary\.visitorToOrder|conversionRate/i.test(TSX));
ok('24. 인과 단정어(때문에/덕분에/원인입니다) UI 문구에 없음', !/때문에|덕분에|원인입니다/.test(TSX));

// ── facts helper 동작(외부지표 requiredData 유지) ──
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-mktv01-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-mktv01-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmpApi,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingAnalysisFacts.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmpSrc,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const F = await import(pathToFileURL(path.join(tmpSrc, 'marketingAnalysisFacts.js')).href);
const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });
const adapted = u.orders.map((o) => ({ ...o, state: { paid: o.state.paid, canceled: o.state.canceled } }));
const facts = F.buildMarketingAnalysisFacts({ orders: adapted, products, period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') });
const text = facts.requiredData.flatMap((r) => [r.label, ...r.unlocks]).join(' ');
ok('25. ROAS/GA4/SNS/방문/상품조회/장바구니 requiredData 유지', ['ROAS', 'GA4', 'SNS', '방문→주문', '상품조회→구매', '장바구니'].every((k) => text.includes(k)));
ok('26. summary에 전환율/ROAS 필드 부재', !('roas' in facts.summary) && !('signupToPurchaseConversion' in facts.summary));
ok('27. piiCheck.containsPii === false', facts.piiCheck.containsPii === false);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
