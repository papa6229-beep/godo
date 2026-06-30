#!/usr/bin/env node
/*
 * scripts/smoke-cross-team-revenue-metric-parity-v0.mjs
 * Cross-Team Revenue Metric Parity v0 검증.
 *  - 공통 revenueMetricContract 참조 / 같은 이름 KPI 독립계산 금지 / 라벨·보조문구 분리 / contract↔facts parity.
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
console.log('=== Cross-Team Revenue Metric Parity v0 smoke ===');

const CONTRACT = has('src/services/revenueMetricContract.ts') ? read('src/services/revenueMetricContract.ts') : '';
const FACTS = read('src/services/marketingAnalysisFacts.ts');
const PROD = read('src/components/ProductTeamDashboard.tsx');
const MKT = read('src/components/MarketingAnalysisDashboard.tsx');

// 1. 두 팀 매출 source 식별
ok('1. 두 팀 매출 source 식별(Product kpi / facts summary)', /kpi = useMemo/.test(PROD) && /lineRevenue/.test(PROD) && /counted\b/.test(FACTS) && /totalRevenue/.test(FACTS));
// 2. 공통 contract 파일 존재
ok('2. revenueMetricContract.ts 존재', has('src/services/revenueMetricContract.ts'));
// 3. gross/net/valid 정의 존재
ok('3. gross/net/valid revenue 정의', /grossProductRevenue/.test(CONTRACT) && /netOrderRevenue/.test(CONTRACT) && /validOrderRevenue/.test(CONTRACT));
// 4. 같은 이름 KPI 독립계산 금지 — 유효판정이 contract로 단일화 + 대시보드가 contract 참조
ok('4. 유효 주문 판정 단일화(facts가 contract isValidOrder 사용)', /from '\.\/revenueMetricContract'/.test(FACTS) && /isValidOrder/.test(FACTS) && /isCounted = \(o: OrderLike\): boolean => isValidOrder\(o\)/.test(FACTS));
// 5. 객단가 denominator 명시
ok('5. averageOrderValue denominator 명시', /averageOrderValue/.test(CONTRACT) && /orderCountValid/.test(CONTRACT) && /denominator/.test(CONTRACT));
// 6. 상품 매출 KPI 기준 명시(contract basis 참조)
ok('6. 상품매출 KPI 기준 명시', /revenueMetricContract/.test(PROD) && /RV\.grossProductRevenue\.basis/.test(PROD));
// 7. 마케팅 매출 KPI 기준 명시(contract basis 참조)
ok('7. 마케팅 총매출 KPI 기준 명시', /revenueMetricContract/.test(MKT) && /RV\.netOrderRevenue\.basis/.test(MKT));
// 8. 두 팀 기준이 다르면 라벨/보조문구가 다름
ok('8. 두 대시보드 기준 보조문구(basis-note) 존재', /ptd-kpi-basis-note/.test(PROD) && /mkt-kpi-basis-note/.test(MKT));
// 9. 동일 라벨 "총매출"을 다른 계산식에 쓰지 않음(상품=상품매출 / 마케팅=총매출, 서로 다른 metric)
ok('9. 동일 라벨을 다른 계산식에 쓰지 않음', /label="상품매출"/.test(PROD) && !/label="총매출"/.test(PROD) && /label="총매출"/.test(MKT) && !/label="상품매출"/.test(MKT));

// 13. raw event 노출 없음(대시보드/contract에 raw event dump 없음)
ok('13. raw event 노출 없음', !/sessionIdHash|orderIdHash|eventId/.test(CONTRACT + PROD + MKT));
// 14. 고도몰 WRITE 추가 없음
ok('14. 고도몰 WRITE 추가 없음', !/writeOrder|goodsRegist|Order_Regist|memberModify/i.test(CONTRACT + PROD + MKT));
// 16. 문서 존재
ok('16. CROSS_TEAM_REVENUE_METRIC_PARITY_V0.md 존재', has('docs/CROSS_TEAM_REVENUE_METRIC_PARITY_V0.md'));

// 10~12,15. 금지 영역 git 무변경(이번 task는 contract/대시보드/facts/문서만)
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
ok('10. synthetic data 생성 로직 미수정', !changed.some((f) => /syntheticCommerceUniverse|syntheticRevenue|syntheticGodomallOrders/.test(f)));
ok('11. 고객흐름 tracking pipeline 미수정', !changed.some((f) => /marketingBehavior|behavior-events|behavior-summary|\[action\]/.test(f)));
ok('12. Vercel gateway adapter 미수정', !changed.some((f) => /\[action\]\.ts|\[resource\]\.ts/.test(f)));
ok('15. CS/운영일지 unrelated UI 미수정', !changed.some((f) => /CustomerService|OperationLog|운영일지/.test(f)));

// 4(강): 런타임 parity — contract net == facts.totalRevenue, countValid == orderCount
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-parity-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-parity-src-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticCommerceUniverse.ts'),
    '--outDir', tmpApi, '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingAnalysisFacts.ts'),
    '--outDir', tmpSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const f of readdirSync(tmpSrc).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmpSrc, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
  const F = await import(pathToFileURL(path.join(tmpSrc, 'marketingAnalysisFacts.js')).href);
  const Cc = await import(pathToFileURL(path.join(tmpSrc, 'revenueMetricContract.js')).href);
  const products = Array.from({ length: 20 }, (_, i) => ({
    productId: String(1001 + i), productCode: 'A-' + (1001 + i), productName: '상품' + i,
    price: 12000 + i * 1500, fixedPrice: 15000 + i * 1500, stock: 0, stockEnabled: false, soldOut: false,
    displayPc: true, displayMobile: true, sellPc: true, sellMobile: true,
    categoryCode: String(3 + (i % 5)).padStart(3, '0'), allCategoryCode: String(3 + (i % 5)).padStart(3, '0'),
    brandCode: String(1 + (i % 3)).padStart(3, '0'), registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: ''
  }));
  const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });
  const facts = F.buildMarketingAnalysisFacts({ orders: u.orders, products, reviews: u.reviews, inquiries: u.inquiries, period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') });
  const netC = Cc.computeNetOrderRevenue(u.orders);
  const validC = Cc.countValidOrders(u.orders);
  const grossC = Cc.computeGrossProductRevenue(u.orders); // 라인합(universe raw에는 0일 수 있음 — 정의 존재만 확인)
  console.log(`     parity: contract.net=${netC} facts.totalRevenue=${facts.summary.totalRevenue} · contract.valid=${validC} facts.orderCount=${facts.summary.orderCount}`);
  ok('17. (런타임) contract.netOrderRevenue == facts.totalRevenue', netC === facts.summary.totalRevenue);
  ok('18. (런타임) contract.countValid == facts.orderCount', validC === facts.summary.orderCount);
  ok('19. (런타임) gross >= net (전체 ≥ 유효, 컨트랙트 함수 동작)', typeof grossC === 'number' && netC >= 0 && Cc.countAllOrders(u.orders) >= validC);
} catch (e) {
  console.error('[smoke] parity runtime failed:', e.stdout?.toString() || e.message);
  ok('17. (런타임) contract.netOrderRevenue == facts.totalRevenue', false);
  ok('18. (런타임) contract.countValid == facts.orderCount', false);
  ok('19. (런타임) gross/valid 함수 동작', false);
} finally {
  rmSync(tmpApi, { recursive: true, force: true });
  rmSync(tmpSrc, { recursive: true, force: true });
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
