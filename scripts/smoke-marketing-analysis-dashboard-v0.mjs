#!/usr/bin/env node
/*
 * scripts/smoke-marketing-analysis-dashboard-v0.mjs
 * Marketing Analysis Dashboard v0 검증 (소스 마커 + facts helper).
 *  - 컴포넌트/CSS 존재, buildMarketingAnalysisFacts 사용, DepartmentWorkspacePanel 연결
 *  - 기간/KPI/차원/insight/requiredData 마커
 *  - ROAS/GA4/방문/상품조회/장바구니는 requiredData(미계산)로만, PII 미표시
 *  - facts helper로 실제 enriched 주문 분석 결과가 비어있지 않은지 검증
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
console.log('=== Marketing Analysis Dashboard v0 smoke ===');

// ── 파일 존재 ──
ok('1. MarketingAnalysisDashboard.tsx 존재', existsSync(path.join(REPO, 'src/components/MarketingAnalysisDashboard.tsx')));
ok('2. MarketingAnalysisDashboard.css 존재', existsSync(path.join(REPO, 'src/components/MarketingAnalysisDashboard.css')));
const TSX = read('src/components/MarketingAnalysisDashboard.tsx');
const PANEL = read('src/components/DepartmentWorkspacePanel.tsx');

// ── facts builder 사용 ──
ok('3. buildMarketingAnalysisFacts import', /import\s*\{[^}]*buildMarketingAnalysisFacts/.test(TSX));
ok('4. buildMarketingAnalysisFacts 호출', /buildMarketingAnalysisFacts\s*\(\s*\{/.test(TSX));
ok('5. 대시보드 내부에 새 매출 합산 로직 없음(reduce 직접 집계 회피)', !/\.reduce\(/.test(TSX));

// ── DepartmentWorkspacePanel 연결 ──
ok('6. Panel이 MarketingAnalysisDashboard import', /import\s*\{\s*MarketingAnalysisDashboard\s*\}/.test(PANEL));
ok('7. 마케팅팀 선택 시 렌더 연결', /team\.id === 'marketing'\s*\?\s*\(?\s*renderMarketingData\(\)/.test(PANEL) && /<MarketingAnalysisDashboard/.test(PANEL));
ok('8. 마케팅이 dashboard 레이아웃 클래스에 포함', /team\.id === 'marketing'/.test(PANEL) && /dept-col-center-dashboard/.test(PANEL));

// ── 화면 마커 ──
ok('9. 헤더(마케팅 분석팀)', /마케팅 분석팀/.test(TSX) && /고도몰 주문\/상품\/CS 데이터 기반 분석/.test(TSX));
ok('10. 기간 필터 마커(presets + custom)', /mkt-period/.test(TSX) && /직접 선택/.test(TSX) && /적용/.test(TSX) && /초기화/.test(TSX));
ok('11. 기간 preset 전체/오늘/최근7일/이번달/지난달/올해', ['전체', '오늘', '최근 7일', '최근 30일', '이번 달', '지난 달', '올해'].every((l) => TSX.includes(l)));
ok('12. KPI 그리드 + 8 KPI(헤드라인은 공통 운영 KPI)', /mkt-kpi-grid/.test(TSX) && /OP\.operationalRevenue\.label/.test(TSX) && /OP\.operationalOrderCount\.label/.test(TSX) && ['객단가', '첫구매 매출', '재구매 매출', '쿠폰 사용 주문', '총 할인액', '리워드 사용액'].every((l) => TSX.includes(l)));
ok('13. useAnimatedNumber 재사용', /useAnimatedNumber/.test(TSX));
ok('14. 분석 차원 블록 마커', ['mkt-dim-memberGroup', 'mkt-dim-channel', 'mkt-dim-coupon', 'mkt-dim-reward', 'mkt-dim-product', 'mkt-dim-category'].every((m) => TSX.includes(m)));
ok('15. 차원 라벨(회원그룹/주문채널/쿠폰/마일리지/상품/카테고리)', ['회원그룹별 매출', '주문채널별 매출', '쿠폰 사용/미사용 비교', '마일리지/예치금 사용 비교', '상품 매출 TOP', '카테고리 매출 TOP'].every((l) => TSX.includes(l)));
ok('16. insight panel 마커 + insights 사용', /mkt-insights/.test(TSX) && /facts\.insights\.map/.test(TSX));
ok('17. insight evidence/severity/recommendedNextAction 표시', /evidenceIds/.test(TSX) && /severity/.test(TSX) && /recommendedNextAction/.test(TSX));
ok('18. requiredData panel 마커 + requiredData 사용', /mkt-required/.test(TSX) && /facts\.requiredData\.map/.test(TSX));
ok('19. requiredData "외부 연동 필요" 표시', /외부 연동 필요/.test(TSX) && /계산하지 않습니다/.test(TSX));

// ── 금지 항목 ──
ok('20. ROAS/GA4 등을 KPI/차원으로 직접 계산하지 않음(facts.summary엔 roas 없음)', !/summary\.roas|summary\.ga4|summary\.visitorToOrder|conversionRate/i.test(TSX));
ok('21. 브랜드 메타 부족 graceful 처리(미연동 문구)', /브랜드 미연동/.test(TSX));
// PII 표시 금지: 컴포넌트 소스에 고객 PII 필드 접근/표시 없음
ok('22. PII 필드 표시 없음(phone/email/address/customerName/ordererName/receiverName)', !/\.(phone|email|address|customerName|ordererName|receiverName|receiverPhone|receiverAddress)\b/.test(TSX));
ok('23. memberKey를 화면에 직접 렌더하지 않음(집계/차원 라벨만)', !/\{[^}]*\.memberKey[^}]*\}/.test(TSX));

// ── facts helper 동작 검증 (api/_shared universe + src facts) ──
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-mktdash-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-mktdash-src-'));
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
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, categoryCode: '003', allCategoryCode: '003', brandCode: '001' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, categoryCode: '004', allCategoryCode: '004', brandCode: '002' }
];
const u = U.buildSyntheticCommerceUniverse([
  { ...products[0], fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { ...products[1], fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
], { seed: 42, endDate: '2026-06-26' });
// RevenueOrderLite-유사 어댑터(컴포넌트가 하는 것과 동일 형태)
const adapted = u.orders.map((o) => ({ ...o, state: { paid: o.state.paid, canceled: o.state.canceled } }));
const facts = F.buildMarketingAnalysisFacts({ orders: adapted, products, reviews: u.reviews, inquiries: u.inquiries, period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') });

ok('24. facts.summary.totalRevenue>0 & orderCount>0', facts.summary.totalRevenue > 0 && facts.summary.orderCount > 0);
ok('25. 회원그룹/채널/쿠폰/리워드 비어있지 않음', facts.byMemberGroup.length > 0 && facts.byOrderChannel.length > 0 && facts.byCouponUsage.length === 2 && facts.byRewardUsage.length >= 1);
ok('26. insights ≥5 & evidence 존재', facts.insights.length >= 5 && facts.evidence.length > 0);
ok('27. requiredData(라벨+unlocks)에 ROAS/GA4/방문→주문/상품조회→구매/장바구니 유지', (() => {
  const text = facts.requiredData.flatMap((r) => [r.label, ...r.unlocks]).join(' ');
  return ['ROAS', 'GA4', '방문→주문', '상품조회→구매', '장바구니'].every((k) => text.includes(k));
})());
ok('28. requiredData key에 memberSignupDate/adSpend/ga4/cartEvents 유지', (() => { const ks = new Set(facts.requiredData.map((r) => r.key)); return ['memberSignupDate', 'adSpend', 'ga4', 'cartEvents'].every((k) => ks.has(k)); })());
ok('29. piiCheck.containsPii === false', facts.piiCheck.containsPii === false);
ok('30. facts 직접 스캔 PII 없음', F.assertMarketingFactsNoPii(facts).length === 0);

console.log('\n--- 요약 ---');
console.log(`총매출=${facts.summary.totalRevenue}, 주문=${facts.summary.orderCount}, 회원그룹=${facts.byMemberGroup.length}, insights=${facts.insights.length}, requiredData=${facts.requiredData.length}`);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
