#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-green-b-resolve-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 GREEN B — resolveOrdersRevenue 실제/시험 독립 실행
 *
 * 실제 export resolveOrdersRevenue() 를 컴파일·호출한다(자기검사 아님).
 * 네트워크 독립(globalThis.fetch 스텁 + env). 외부 고도몰 호출·실키 없음.
 *
 * 잠금(사장 지시 5종):
 *   1. 실제 연결 실패 + synthetic=false → unavailable · orders/stockImpact [] · summary null · mock 대체 0
 *   2. 실제 연결 실패 + synthetic=true → realOrdersStatus unavailable · syntheticStatus success ·
 *      1315 · 1182 · 88,116,982(운영 순매출) · 98,363,022(전체 합) · stockImpact 13 · 위험 4 ·
 *      사용자 표시 '시험 데이터' · '실제 자료' 표현 0
 *   3. 실상품 API 0개·13개(다른 상품)·50개 fixture → v1 생성값 불변 · 자동 혼합/덮어쓰기 0
 *   4. 카탈로그 손상 → fail-closed(syntheticStatus unavailable) · mock/실상품 대체 0 · 오류 근거 보존
 *   5. 정본 불변성 — 파이프라인 실행 후에도 v1 정본 무변형
 *
 * 계산식 복제 없이 실제 정본 함수로 교차검증. 88,116,982 ≠ 98,363,022 의미 구별 별도 단언.
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
console.log('=== SIMULATION-CATALOG-BASELINE-01 GREEN B — resolveOrdersRevenue 독립 실행 ===');

// ── 컴파일 ───────────────────────────────────────────────────────────────────
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const outApi = mkdtempSync(path.join(cacheRoot, 'simcatB-'));
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

const outSrc = mkdtempSync(path.join(os.tmpdir(), 'simcatB-src-'));
execFileSync(process.execPath, [TSC,
  path.join(REPO, 'src', 'services', 'revenueMetricContract.ts'),
  path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'),
  path.join(REPO, 'src', 'services', 'revenueScreenState.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(outSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}

const RES = await import(pathToFileURL(apiJs('godomallResource.js')).href);
const L = await import(pathToFileURL(apiJs(path.join('simCatalog', 'simCatalogV1.js'))).href);
const REV = await import(pathToFileURL(apiJs('godomallRevenue.js')).href);
const C = await import(pathToFileURL(path.join(outSrc, 'revenueMetricContract.js')).href);
const IR = await import(pathToFileURL(path.join(outSrc, 'inventoryRiskContract.js')).href);
const SS = await import(pathToFileURL(path.join(outSrc, 'revenueScreenState.js')).href);

// ── fetch 스텁 ───────────────────────────────────────────────────────────────
const ENV = ['GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY', 'GODOMALL_REAL_BASE_URL'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
const goodsXml = (n, base = 5000) => {
  const items = Array.from({ length: n }, (_, i) =>
    `<goods_data><goodsNo>${base + i}</goodsNo><goodsCd>Z${base + i}</goodsCd><goodsNm>다른상품${i}</goodsNm><goodsPrice>${7777 + i * 313}</goodsPrice><totalStock>${3 + i}</totalStock><stockFl>y</stockFl><soldOutFl>n</soldOutFl><cateCd>C${i % 4}</cateCd></goods_data>`).join('');
  return `<?xml version="1.0"?><data><header><code>000</code><msg>ok</msg></header><return>${items}</return></data>`;
};
const emptyXml = `<?xml version="1.0"?><data><header><code>000</code><msg>ok</msg></header><return></return></data>`;
const run = async (net, opts) => {
  process.env.GODOMALL_API_MODE = 'real';
  process.env.GODOMALL_PARTNER_KEY = 'stub-partner'; process.env.GODOMALL_USER_KEY = 'stub-user';
  process.env.GODOMALL_REAL_BASE_URL = 'http://127.0.0.1:9';
  globalThis.fetch = async (url) => {
    const isGoods = String(url).includes('Goods_Search');
    if (net === 'allFail') throw new Error('network down (stub)');
    if (typeof net === 'object') { // {goods:N} : 주문 빈 성공 + 상품 N개
      return { ok: true, status: 200, text: async () => (isGoods ? goodsXml(net.goods) : emptyXml) };
    }
    return { ok: true, status: 200, text: async () => emptyXml };
  };
  try { return await RES.resolveOrdersRevenue(opts); } finally { globalThis.fetch = realFetch; }
};
const restore = () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } globalThis.fetch = realFetch; };

// ── 1. 실제 연결 실패 + synthetic=false ──────────────────────────────────────
const s1 = await run('allFail', { includeSynthetic: false });
T('1. 연결 실패 + synthetic=false → unavailable · orders/stockImpact [] · summary null · mock 대체 0',
  s1.realOrdersStatus === 'unavailable' && s1.orders.length === 0 && s1.stockImpact.length === 0 &&
  s1.summary === null && s1.source === 'unavailable' && s1.syntheticStatus === 'not_requested',
  `real=${s1.realOrdersStatus} orders=${s1.orders.length} stock=${s1.stockImpact.length} summary=${s1.summary === null ? 'null' : 'present'} source=${s1.source}`);

// ── 2. 실제 연결 실패 + synthetic=true → v1 로 시뮬레이션 유지 ─────────────────
const s2 = await run('allFail', { includeSynthetic: true });
const allC = C.countAllOrders(s2.orders), validC = C.countValidOrders(s2.orders), netC = C.computeNetOrderRevenue(s2.orders);
const totalAmt = REV.summarizeRevenue(s2.orders).totalAmount;
const risk = IR.summarizeStockRisk(s2.stockImpact.map((x) => ({ stock: x.syntheticProjectedStock, safetyStock: x.safetyStock })));
const screen = SS.screenStateFromRevenue({ realOrdersStatus: s2.realOrdersStatus, syntheticStatus: s2.syntheticStatus, realOrdersErrorMessage: s2.realOrdersErrorMessage, summary: s2.summary });
T('2a. 연결 실패 + synthetic=true → realOrdersStatus unavailable · syntheticStatus success',
  s2.realOrdersStatus === 'unavailable' && s2.syntheticStatus === 'success' && !!s2.realOrdersErrorMessage,
  `real=${s2.realOrdersStatus} synthetic=${s2.syntheticStatus} realErr=${!!s2.realOrdersErrorMessage}`);
T('2b. canonical 기준값(실제 정본 함수): 1315/1182/88,116,982/98,363,022/재고13/위험4',
  allC === 1315 && validC === 1182 && netC === 88116982 && totalAmt === 98363022 && s2.stockImpact.length === 13 && risk.risky === 4,
  `all=${allC} valid=${validC} net=${netC.toLocaleString()} total=${totalAmt.toLocaleString()} impact=${s2.stockImpact.length} risky=${risk.risky}(품절${risk.outOfStock}+부족${risk.lowStock})`);
T('2c. 88,116,982(운영 순매출) ≠ 98,363,022(전체 합) — 의미 구별(넷 < 전체)',
  netC === 88116982 && totalAmt === 98363022 && netC < totalAmt, `net<total=${netC < totalAmt}`);
T('2d. 사용자 표시 = 시험 데이터(사용 가능) · 실제 주문 연결 안 됨 별도 안내 · source unavailable(정직)',
  screen.userLabel === '시험 데이터' && screen.usable === true && !!screen.realOrdersNotice && s2.source === 'unavailable',
  `label=${screen.userLabel} usable=${screen.usable} notice=${!!screen.realOrdersNotice} source=${s2.source}`);
T('2e. 시뮬레이션 주문 전부 synthetic_test/dataKind synthetic · real 표기 0 · "실제 데이터" 라벨 0',
  s2.orders.every((o) => o.sourceType === 'synthetic_test' && o.dataKind === 'synthetic') && screen.userLabel !== '실제 데이터',
  `synthetic ${s2.orders.filter((o) => o.sourceType === 'synthetic_test').length}/${s2.orders.length}건`);

// ── 3. 실상품 API 0/13(다른)/50개 → v1 기준값 불변 ───────────────────────────
const variants = await Promise.all([{ goods: 0 }, { goods: 13 }, { goods: 50 }].map((v) => run(v, { includeSynthetic: true })));
const synthOf = (r) => r.orders.filter((o) => o.dataKind === 'synthetic');
const inv = variants.map((r) => ({ all: C.countAllOrders(synthOf(r)), net: C.computeNetOrderRevenue(synthOf(r)), impact: r.stockImpact.length, mixed: r.orders.some((o) => o.dataKind !== 'synthetic') }));
T('3. 실상품 0/13(다른)/50개 fixture → v1 시뮬레이션 불변(1315·88,116,982·재고13) · 자동 혼합/덮어쓰기 0',
  inv.every((x) => x.all === 1315 && x.net === 88116982 && x.impact === 13) && variants.every((r) => r.syntheticStatus === 'success'),
  inv.map((x, i) => `[${[0, 13, 50][i]}개]all=${x.all} net=${x.net.toLocaleString()} impact=${x.impact}`).join(' · '));

// ── 4. 카탈로그 손상 → fail-closed(구조·통합) ────────────────────────────────
const corrupt = L.validateSimCatalog(L.getSimCatalogManifest ? [] : [], L.getSimCatalogManifest());
const resourceSrc = readFileSync(path.join(REPO, 'api/_shared/godomallResource.ts'), 'utf8');
// 통합 fail-closed: catch → syntheticStatus 'unavailable' + syntheticErrorMessage, mock/실상품 대체 참조 없음.
const catchBlock = (resourceSrc.match(/catch \(err\)[\s\S]*?syntheticErrorMessage = `Simulation catalog unavailable[\s\S]*?\}/) || [''])[0];
const failClosedWiring = /syntheticStatus = 'unavailable'/.test(catchBlock) && /Simulation catalog unavailable/.test(catchBlock) &&
  !/getProxyMock|mockInventory|mockProducts/.test(catchBlock);
T('4. 카탈로그 손상 → fail-closed: validate([]) 거부 + resolveOrdersRevenue catch=syntheticStatus unavailable·오류보존·mock/실상품 대체 0',
  corrupt.ok === false && corrupt.errors.length > 0 && failClosedWiring,
  `validate([]) ok=${corrupt.ok}(${corrupt.errors.length}건) · 통합 fail-closed 배선=${failClosedWiring}`);

// ── 5. 정본 불변성 — 파이프라인 실행 후에도 v1 무변형 ────────────────────────
const snapBefore = JSON.stringify(L.loadSimCatalogV1());
await run('allFail', { includeSynthetic: true });
await run({ goods: 50 }, { includeSynthetic: true });
const snapAfter = JSON.stringify(L.loadSimCatalogV1());
T('5. 정본 불변성 — resolveOrdersRevenue 반복 실행 후에도 sim-catalog-v1 무변형(deep-equal · 동일 참조)',
  snapBefore === snapAfter && Object.isFrozen(L.loadSimCatalogV1()) && L.loadSimCatalogV1() === L.loadSimCatalogV1(),
  `deepEqual=${snapBefore === snapAfter} frozen=${Object.isFrozen(L.loadSimCatalogV1())}`);

restore();
console.log('');
console.log(`--- ${pass} pass / ${fail} fail ---`);
rmSync(outApi, { recursive: true, force: true });
rmSync(outSrc, { recursive: true, force: true });
if (fail > 0) { console.log('\n✗ GREEN B 미충족'); process.exit(1); }
console.log('\n✓ GREEN B — 실제/시험 독립 실행 완성(연결 실패에도 v1 시뮬레이션 유지·실상품 변화 무관·fail-closed·불변).');
