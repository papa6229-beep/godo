#!/usr/bin/env node
/*
 * scripts/smoke-department-data-source-of-truth-v0.mjs
 * Department Data Source of Truth v0 검증.
 *  - 공통 snapshot/contract 존재 · 대표 운영 KPI를 모든 부서가 같은 builder에서 읽음 · 부서 전용값 분리 · CS source 감사.
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
console.log('=== Department Data Source of Truth v0 smoke ===');

const SOT = has('src/services/departmentDataSourceOfTruth.ts') ? read('src/services/departmentDataSourceOfTruth.ts') : '';
const DMC = has('src/services/departmentMetricContract.ts') ? read('src/services/departmentMetricContract.ts') : '';
const PROD = read('src/components/ProductTeamDashboard.tsx');
const MKT = read('src/components/MarketingAnalysisDashboard.tsx');
const CS = read('src/components/CsTeamDashboard.tsx');
const DOC = has('docs/DEPARTMENT_DATA_SOURCE_OF_TRUTH_V0.md') ? read('docs/DEPARTMENT_DATA_SOURCE_OF_TRUTH_V0.md') : '';

// 1~6. 공통 서비스/계약
ok('1. departmentDataSourceOfTruth 서비스 존재', has('src/services/departmentDataSourceOfTruth.ts') && /buildDepartmentSourceOfTruthSnapshot/.test(SOT));
ok('2. departmentMetricContract 존재', has('src/services/departmentMetricContract.ts'));
ok('3. operationalRevenue 정의 존재', /operationalRevenue/.test(DMC) && /operationalRevenue/.test(SOT));
ok('4. operationalOrderCount 정의 존재', /operationalOrderCount/.test(DMC) && /operationalOrderCount/.test(SOT));
ok('5. operationalAOV 정의 존재', /operationalAOV/.test(DMC) && /operationalAOV/.test(SOT));
ok('6. productLineRevenue가 부서 전용값으로 분리', /productLineRevenue/.test(DMC) && /전용/.test(DMC));

// 7~9. 대시보드가 canonical 사용
ok('7. Product 상단 대표 매출이 canonical operationalRevenue 사용', /buildDepartmentSourceOfTruthSnapshot/.test(PROD) && /snap\?\.operationalRevenue/.test(PROD) && /OP\.operationalRevenue\.label/.test(PROD));
ok('8. Marketing 상단 대표 매출이 canonical operationalRevenue 사용', /buildDepartmentSourceOfTruthSnapshot/.test(MKT) && /snap\?\.operationalRevenue/.test(MKT) && /OP\.operationalOrderCount\.label/.test(MKT));
ok('9. CS 주요 숫자 audit 포함(같은 universe·기준 보조문구)', /cs-dash-basis-note/.test(CS) && /Commerce Universe/.test(CS) && /csUniverse/.test(SOT));

// 10~11. 같은 이름/같은 급 KPI 기준 통일
ok('10. 같은 이름 KPI 독립 계산 안 함(헤드라인은 snap, gross 아님)', !/value=\{kpi\.revenue\}/.test(PROD) && /value=\{snap\?\.operationalRevenue/.test(PROD));
ok('11. 같은 급 대표 KPI가 같은 기준(둘 다 snap.operational)', /snap\?\.operationalRevenue/.test(PROD) && /snap\?\.operationalRevenue/.test(MKT) && /snap\?\.operationalOrderCount/.test(PROD) && /snap\?\.operationalOrderCount/.test(MKT));

// 12~13. 문서화
ok('12. 상품 라인 매출 vs 운영 매출 차이 문서화', /상품 라인 매출/.test(DOC) && /operationalRevenue/.test(DOC) && /부서 전용/.test(DOC));
ok('13. CS 고객수/문의수 source 문서화', /memberKey/.test(DOC) && /미처리 문의/.test(DOC) && /universeAux/.test(DOC));

// 17~18. 안전
ok('17. raw event 노출 없음', !/sessionIdHash|orderIdHash|eventId/.test(SOT + DMC));
ok('18. 고도몰 WRITE 추가 없음', !/writeOrder|goodsRegist|Order_Regist|memberModify/i.test(SOT + DMC + PROD + MKT + CS));
// 20. 문서 존재
ok('20. DEPARTMENT_DATA_SOURCE_OF_TRUTH_V0.md 존재', has('docs/DEPARTMENT_DATA_SOURCE_OF_TRUTH_V0.md'));

// 14~16,19. 금지영역 git 무변경(이번 task는 3 대시보드 + 공통 service + 문서만)
let changed = [];
try { changed = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString().split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean); } catch { /* noop */ }
ok('14. synthetic data 생성 로직 변경 없음', !changed.some((f) => /syntheticCommerceUniverse|syntheticRevenue|syntheticGodomallOrders/.test(f)));
ok('15. Vercel gateway 변경 없음', !changed.some((f) => /\[action\]\.ts|\[resource\]\.ts/.test(f)));
ok('16. 고객흐름 tracking 변경 없음', !changed.some((f) => /marketingBehavior|behavior-events|behavior-summary/.test(f)));
ok('19. unrelated UI(컴포넌트) 변경 없음', !changed.some((f) => /\.tsx$/.test(f) && !/ProductTeamDashboard|MarketingAnalysisDashboard|CsTeamDashboard/.test(f)));

// 런타임: 단일 snapshot이 net 기준 운영값을 주고 gross(부서전용)와 구분되는지
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-sot-smoke-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const S = await import(pathToFileURL(path.join(tmp, 'departmentDataSourceOfTruth.js')).href);
  const C = await import(pathToFileURL(path.join(tmp, 'revenueMetricContract.js')).href);
  const orders = Array.from({ length: 100 }, (_, i) => {
    const m = i % 10; const status = m < 7 ? 'paid' : (m === 7 ? 'unpaid' : 'canceled');
    const totalAmount = 50000 + (i % 5) * 10000;
    return { orderNo: 'O' + i, orderDate: '2026-06-01 10:00:00', sourceType: 'synthetic_test', deliveryFee: 3000, totalAmount, productRevenueByLines: totalAmount - 3000, paid: status === 'paid', unpaid: status === 'unpaid', confirmed: status === 'paid', canceled: status === 'canceled', lines: [{ goodsNo: 'g', goodsName: 'P', quantity: 1, lineRevenue: totalAmount - 3000, categoryCode: 'c', categoryLabel: 'C' }], memberKey: 'M' + (i % 30) };
  });
  const revenue = { count: orders.length, source: 'mock', live: false, summary: null, stockImpact: [], orders, universeAux: { customers: [], inquiries: [], reviews: [] } };
  const snap = S.buildDepartmentSourceOfTruthSnapshot(revenue);
  const net = C.computeNetOrderRevenue(orders);
  const gross = C.computeGrossProductRevenue(orders);
  console.log(`     runtime: operationalRevenue=${snap.operationalRevenue} net=${net} gross(부서전용)=${gross} validOrders=${snap.operationalOrderCount}`);
  ok('21. (런타임) operationalRevenue == net(유효 주문 기준)', snap.operationalRevenue === net);
  ok('22. (런타임) operationalRevenue != gross 라인합(대표≠부서전용)', snap.operationalRevenue !== gross && snap.productLineRevenue === gross);
  ok('23. (런타임) operationalOrderCount == 유효 주문수', snap.operationalOrderCount === C.countValidOrders(orders) && snap.operationalOrderCount < orders.length);
} catch (e) {
  console.error('[smoke] runtime failed:', e.stdout?.toString() || e.message);
  ok('21. (런타임) operationalRevenue == net', false);
  ok('22. (런타임) operationalRevenue != gross', false);
  ok('23. (런타임) operationalOrderCount == 유효 주문수', false);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
