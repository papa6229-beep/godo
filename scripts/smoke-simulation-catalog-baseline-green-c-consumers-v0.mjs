#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-green-c-consumers-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 GREEN C — 소비자 실배선·출처 표시 회귀
 *
 * GREEN B 서버 출력(실제 연결 실패 + sim-catalog-v1 시뮬레이션 유지)을 소비자 공통 계약에
 * 통과시켜 사용자 표시가 '시험 데이터(사용 가능)'가 되는지 end-to-end 로 잠근다.
 * 소비자 6곳이 공통 출처 판정을 쓰고, 배열 길이·화면 이름·mode 로 추측하지 않으며,
 * 기술문구/mock 표현을 사용자 화면에 노출하지 않음을 정적으로 잠근다.
 *
 * 직접 소비자: DepartmentWorkspacePanel · CalendarPanel · OfficeView
 * 하류 소비자: ProductTeamDashboard · MarketingAnalysisDashboard · productTeamChatFacts
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd().replace(/\\/g, '/');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
let pass = 0, fail = 0;
const T = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${d ? `  — ${d}` : ''}`); ok ? pass++ : fail++; };
console.log('=== SIMULATION-CATALOG-BASELINE-01 GREEN C — 소비자 실배선·출처 표시 ===');

// ── 컴파일 ───────────────────────────────────────────────────────────────────
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const outApi = mkdtempSync(path.join(cacheRoot, 'simcatC-'));
const outApiUnix = outApi.replace(/\\/g, '/');
const cfg = path.join(outApi, 'tsconfig.json');
writeFileSync(cfg, JSON.stringify({
  compilerOptions: { target: 'ES2023', lib: ['ES2023'], module: 'NodeNext', moduleResolution: 'NodeNext',
    types: ['node'], strict: false, strictNullChecks: true, skipLibCheck: true, esModuleInterop: true,
    outDir: outApiUnix, rootDir: `${REPO}/api`, noEmit: false, noEmitOnError: false },
  include: [`${REPO}/api/_shared/**/*.ts`]
}));
writeFileSync(path.join(outApi, 'package.json'), JSON.stringify({ type: 'module' }));
try { execFileSync(process.execPath, [TSC, '-p', cfg, '--pretty', 'false'], { cwd: REPO, stdio: 'pipe' }); } catch { /* noEmitOnError:false */ }
const apiJs = (rel) => path.join(outApi, '_shared', rel);

const outSrc = mkdtempSync(path.join(os.tmpdir(), 'simcatC-src-'));
execFileSync(process.execPath, [TSC,
  path.join(REPO, 'src', 'services', 'revenueScreenState.ts'),
  path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
  path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
const srcDir = outSrc; // 세 엔트리 모두 src/services → rootDir 공통조상 → outSrc 직하 flat
for (const f of readdirSync(srcDir).filter((x) => x.endsWith('.js'))) {
  const p = path.join(srcDir, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}

const RES = await import(pathToFileURL(apiJs('godomallResource.js')).href);
const SS = await import(pathToFileURL(path.join(srcDir, 'revenueScreenState.js')).href);
const DS = await import(pathToFileURL(path.join(srcDir, 'departmentDataSourceOfTruth.js')).href);
const PV = await import(pathToFileURL(path.join(srcDir, 'dataSourceProvenanceContract.js')).href);

// ── 서버 시나리오: 실제 연결 실패 + synthetic=true (GREEN B) ─────────────────
const ENV = ['GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY', 'GODOMALL_REAL_BASE_URL'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
process.env.GODOMALL_API_MODE = 'real'; process.env.GODOMALL_PARTNER_KEY = 'k'; process.env.GODOMALL_USER_KEY = 'k';
process.env.GODOMALL_REAL_BASE_URL = 'http://127.0.0.1:9';
globalThis.fetch = async () => { throw new Error('network down (stub)'); };
const rr = await RES.resolveOrdersRevenue({ includeSynthetic: true });
for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
globalThis.fetch = realFetch;

// RevenueResult 형태(소비자가 받는 것과 동형) — slice 상태 보존
const revenue = {
  count: rr.count, source: 'unavailable', live: false,
  realOrdersStatus: rr.realOrdersStatus, syntheticStatus: rr.syntheticStatus,
  realOrdersErrorMessage: rr.realOrdersErrorMessage, syntheticErrorMessage: rr.syntheticErrorMessage,
  summary: rr.summary, stockImpact: rr.stockImpact, orders: rr.orders
};

// ── C1. 화면 상태 계약(직접 소비자 공통) → 시험 데이터·사용 가능·연결 안 됨 별도 안내 ──
const screen = SS.screenStateFromRevenue(revenue);
T('C1. screenStateFromRevenue(GREEN B 출력) → 시험 데이터 · usable · 실제 주문 연결 안 됨 별도 안내',
  screen.userLabel === '시험 데이터' && screen.usable === true && !!screen.realOrdersNotice && screen.kind === 'simulation',
  `label=${screen.userLabel} usable=${screen.usable} notice=${!!screen.realOrdersNotice}`);

// ── C2. 부서 공통 snapshot(MarketingAnalysisDashboard 경유) → 시험 데이터 계열 ──
const snap = DS.buildDepartmentSourceOfTruthSnapshot(revenue);
const mktKind = snap?.sourceMode === 'real' ? 'actual' : snap?.sourceMode === 'unavailable' ? 'unavailable' : 'simulation';
T('C2. buildDepartmentSourceOfTruthSnapshot → sourceMode synthetic → 마케팅 라벨 "시험 데이터"',
  snap.sourceMode === 'synthetic' && PV.userLabelOf(mktKind) === '시험 데이터',
  `sourceMode=${snap.sourceMode} · 라벨=${PV.userLabelOf(mktKind)}`);

// ── C3. 실제 자료로 오판 0 — 어떤 경로도 '실제 데이터' 아님, source 는 정직하게 unavailable ──
T('C3. 실제 자료로 오판 0 (screen≠실제 · 마케팅≠실제 · source unavailable 정직)',
  screen.userLabel !== '실제 데이터' && PV.userLabelOf(mktKind) !== '실제 데이터' && revenue.source === 'unavailable',
  `screen=${screen.userLabel} mkt=${PV.userLabelOf(mktKind)} source=${revenue.source}`);

// ── C4. userLabelOf 는 항상 3종 한글만(기술문구 미노출) ─────────────────────
const labels = ['actual', 'simulation', 'fixture', 'unavailable'].map((k) => PV.userLabelOf(k));
const ONLY3 = new Set(['실제 데이터', '시험 데이터', '연결 안 됨']);
T('C4. userLabelOf 4분류 → 3종 한글 라벨만(기술문구 미노출)',
  labels.every((l) => ONLY3.has(l)) && PV.userLabelOf('simulation') === '시험 데이터' && PV.userLabelOf('fixture') === '시험 데이터',
  JSON.stringify(labels));

// ── C5. 소비자 6곳 전수: 공통 계약 사용 + 금지 휴리스틱 0 + 기술문구 노출 0 ────
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const CONSUMERS = {
  'DepartmentWorkspacePanel.tsx': { f: 'src/components/DepartmentWorkspacePanel.tsx', contract: /screenStateFromRevenue/ },
  'CalendarPanel.tsx': { f: 'src/components/CalendarPanel.tsx', contract: /screenStateFromRevenue/ },
  'OfficeView.tsx': { f: 'src/components/OfficeView.tsx', contract: /fetchRevenue\(\s*true/ },
  'ProductTeamDashboard.tsx': { f: 'src/components/ProductTeamDashboard.tsx', contract: /screenStateFromRevenue/ },
  'MarketingAnalysisDashboard.tsx': { f: 'src/components/MarketingAnalysisDashboard.tsx', contract: /buildDepartmentSourceOfTruthSnapshot|userLabelOf/ },
  'productTeamChatFacts.ts': { f: 'src/services/productTeamChatFacts.ts', contract: /classifyStockRisk/ }
};
// 금지: 식별을 배열길이·mode·화면이름으로 추측 / source==='unavailable' 로 숨김
const FORBIDDEN = /source\s*===\s*'unavailable'|mode\s*===\s*'real'\s*\?[^:]*(실제|actual)|orders\.length\s*===\s*0\s*\?[^:]*(실제|시험)/;
// 렌더된 원시 기술문구(JSX 텍스트 노드)
const TECH_TEXT = />\s*(synthetic|api_mock_fallback|synthetic_test|unavailable|mock)\s*</i;
let c5ok = true, c5d = [];
for (const [name, { f, contract }] of Object.entries(CONSUMERS)) {
  const src = read(f);
  const usesContract = contract.test(src);
  const forbidden = FORBIDDEN.test(src);
  const techText = TECH_TEXT.test(src);
  if (!usesContract || forbidden || techText) { c5ok = false; c5d.push(`${name}[계약=${usesContract} 금지휴리스틱=${forbidden} 기술문구=${techText}]`); }
}
T('C5. 소비자 6곳: 공통 계약 사용 · 금지 휴리스틱 0 · 렌더 기술문구 0',
  c5ok, c5ok ? '6곳 전부 통과' : c5d.join(' · '));

// ── C6. OfficeView: GREEN B 후 HQ 채팅용 orders 유입(시험 주문) ──────────────
T('C6. OfficeView 는 fetchRevenue(true) orders 를 HQ 채팅에 전달 — GREEN B 후 시험 주문 유입',
  rr.orders.length > 0 && rr.orders.every((o) => o.sourceType === 'synthetic_test'),
  `orders=${rr.orders.length}(synthetic_test)`);

console.log('');
console.log(`--- ${pass} pass / ${fail} fail ---`);
rmSync(outApi, { recursive: true, force: true });
rmSync(outSrc, { recursive: true, force: true });
if (fail > 0) { console.log('\n✗ GREEN C 미충족'); process.exit(1); }
console.log('\n✓ GREEN C — 소비자 실배선·출처 표시 완성(시험 데이터·연결 안 됨 별도 안내·기술문구 미노출).');
