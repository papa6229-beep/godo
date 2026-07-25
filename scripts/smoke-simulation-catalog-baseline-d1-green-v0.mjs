#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-d1-green-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 D-1 GREEN — 연결 안 됨 ≠ 실제 0건
 *
 * 실제 resolveOrdersRevenue() + 실제 소비자 함수(buildProductTeamChatFacts,
 * buildDepartmentSourceOfTruthSnapshot) + 공통 판정기(resolveRealOrdersDisplay/realOrdersPhrase)로
 * A~H 를 잠근다. 계산식 복제 없이 실제 정본 함수로 H 교차검증.
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
console.log('=== SIMULATION-CATALOG-BASELINE-01 D-1 GREEN — 연결 안 됨 ≠ 실제 0건 ===');

// ── 컴파일 ───────────────────────────────────────────────────────────────────
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const outApi = mkdtempSync(path.join(cacheRoot, 'd1g-api-'));
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

const outSrc = mkdtempSync(path.join(os.tmpdir(), 'd1g-src-'));
execFileSync(process.execPath, [TSC,
  path.join(REPO, 'src', 'services', 'productTeamChatFacts.ts'),
  path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
  path.join(REPO, 'src', 'services', 'revenueScreenState.ts'),
  path.join(REPO, 'src', 'services', 'revenueMetricContract.ts'),
  path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(outSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}

const RES = await import(pathToFileURL(apiJs('godomallResource.js')).href);
const REV = await import(pathToFileURL(apiJs('godomallRevenue.js')).href);
const SS = await import(pathToFileURL(path.join(outSrc, 'revenueScreenState.js')).href);
const C = await import(pathToFileURL(path.join(outSrc, 'revenueMetricContract.js')).href);
const IR = await import(pathToFileURL(path.join(outSrc, 'inventoryRiskContract.js')).href);
const PTCF = await import(pathToFileURL(path.join(outSrc, 'productTeamChatFacts.js')).href);
const DS = await import(pathToFileURL(path.join(outSrc, 'departmentDataSourceOfTruth.js')).href);

// ── fetch 스텁 ───────────────────────────────────────────────────────────────
const ENV = ['GODOMALL_API_MODE', 'GODOMALL_PARTNER_KEY', 'GODOMALL_USER_KEY', 'GODOMALL_REAL_BASE_URL'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
const goods = `<?xml version="1.0"?><data><header><code>000</code><msg>ok</msg></header><return>${
  Array.from({ length: 13 }, (_, i) => `<goods_data><goodsNo>${9000 + i}</goodsNo><goodsCd>Q${i}</goodsCd><goodsNm>실상품${i}</goodsNm><goodsPrice>${10000 + i * 500}</goodsPrice><totalStock>5</totalStock><stockFl>y</stockFl></goods_data>`).join('')}</return></data>`;
const emptyOrders = `<?xml version="1.0"?><data><header><code>000</code><msg>ok</msg></header><return></return></data>`;
const twoOrders = `<?xml version="1.0"?><data><header><code>000</code><msg>ok</msg></header><return>` +
  [1, 2].map((n) => `<order_data><orderNo>ANON-${n}</orderNo><orderDate>2026-07-0${n} 10:00:00</orderDate><orderStatus>p1</orderStatus><settlePrice>12500</settlePrice><totalGoodsPrice>10000</totalGoodsPrice><totalDeliveryCharge>2500</totalDeliveryCharge><orderGoodsData><goodsNo>9000</goodsNo><goodsNm>실상품0</goodsNm><goodsCnt>1</goodsCnt><goodsPrice>10000</goodsPrice></orderGoodsData></order_data>`).join('') +
  `</return></data>`;
const run = async (net, opts) => {
  process.env.GODOMALL_API_MODE = 'real'; process.env.GODOMALL_PARTNER_KEY = 'k'; process.env.GODOMALL_USER_KEY = 'k';
  process.env.GODOMALL_REAL_BASE_URL = 'http://127.0.0.1:9';
  globalThis.fetch = async (url) => {
    const isGoods = String(url).includes('Goods_Search');
    if (net === 'fail') throw new Error('network down (stub)');
    const ordersBody = net === 'ordersN' ? twoOrders : emptyOrders;
    return { ok: true, status: 200, text: async () => (isGoods ? goods : ordersBody) };
  };
  try { return await RES.resolveOrdersRevenue(opts); } finally { globalThis.fetch = realFetch; }
};

const cA = await run('ok', { includeSynthetic: false });     // 실성공0 + synF
const cB = await run('fail', { includeSynthetic: false });    // 실패 + synF
const cC = await run('fail', { includeSynthetic: true });     // 실패 + synT ★
const cD = await run('ok', { includeSynthetic: true });       // 실성공0 + synT
const cE = await run('ordersN', { includeSynthetic: true });  // 실성공N + synT
for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
globalThis.fetch = realFetch;

// RevenueResult 형태 + 공통 판정
const revLike = (rr) => ({ count: rr.count, source: rr.source, live: rr.live, realOrdersStatus: rr.realOrdersStatus, syntheticStatus: rr.syntheticStatus, realOrdersErrorMessage: rr.realOrdersErrorMessage, summary: rr.summary, stockImpact: rr.stockImpact, orders: rr.orders, syntheticSource: 'commerce_universe_v1' });
const phraseOf = (rr) => SS.realOrdersPhrase(SS.resolveRealOrdersDisplay(rr.realOrdersStatus, rr.summary ? rr.summary.realOrderCount : null));
const screenOf = (rr) => SS.screenStateFromRevenue(revLike(rr));
// 채팅 facts 의 주문 구성 문구 추출(총매출 질문 → total_revenue 분기)
const chatComposition = (rr) => {
  const facts = PTCF.buildProductTeamChatFacts('전체 매출 알려줘', revLike(rr));
  const joined = (facts?.facts || []).join(' | ');
  const m = joined.match(/(실제 주문[^|]*?시험 주문[^|]*?건)/);
  return { joined, phrase: m ? m[1].trim() : '(주문구성 문구 없음)' };
};
const FORBIDDEN_UI = /(실 0 \+ 가상|실 0건|실제 주문 0건 \+ |\bunavailable\b|synthetic_test|api_proxy|api_mock|\bmock\b|\bknown\b)/i;

// ── A. 실성공0 + synF → 실제 데이터 · 실제 주문 0건 ──────────────────────────
const sA = screenOf(cA);
T('A. 실성공0+synF → 실제 데이터 · 실제 주문 0건',
  sA.userLabel === '실제 데이터' && cA.realOrdersStatus === 'success' && phraseOf(cA) === '실제 주문 0건',
  `label=${sA.userLabel} realStatus=${cA.realOrdersStatus} phrase="${phraseOf(cA)}"`);

// ── B. 실패 + synF → 연결 안 됨 · "실제 주문 0건" 표현 0 ──────────────────────
const sB = screenOf(cB);
T('B. 실패+synF → 연결 안 됨 · 실제 주문 0건 표현 0(= "실제 주문 연결 안 됨")',
  sB.userLabel === '연결 안 됨' && sB.usable === false && phraseOf(cB) === '실제 주문 연결 안 됨',
  `label=${sB.userLabel} phrase="${phraseOf(cB)}"`);

// ── C. 실패 + synT → 시험 데이터 · 실제 주문 연결 안 됨 · 시험 1315 · 금지표현 0 ──
const sC = screenOf(cC); const chC = chatComposition(cC);
T('C. 실패+synT → 시험 데이터 · 실제 주문 연결 안 됨 · 시험 주문 1,315건 · realOrdersStatus unavailable 보존',
  sC.userLabel === '시험 데이터' && sC.usable === true && !!sC.realOrdersNotice &&
  phraseOf(cC) === '실제 주문 연결 안 됨' && cC.summary.syntheticOrderCount === 1315 && cC.realOrdersStatus === 'unavailable',
  `label=${sC.userLabel} notice=${!!sC.realOrdersNotice} phrase="${phraseOf(cC)}" syn=${cC.summary.syntheticOrderCount}`);
T('C(채팅). "실제 주문 연결 안 됨 · 시험 주문 1,315건" · "실 0"/"실제 주문 0건"/"실 0 + 가상"/기술값 노출 0',
  chC.phrase === '실제 주문 연결 안 됨 · 시험 주문 1,315건' && !FORBIDDEN_UI.test(chC.phrase),
  `chat="${chC.phrase}"`);

// ── D. 실성공0 + synT → 시험 데이터 · 실제 주문 0건 · 시험 1315 · realStatus success 보존 ──
const sD = screenOf(cD); const chD = chatComposition(cD);
T('D. 실성공0+synT → 시험 데이터 · 실제 주문 0건 · 시험 주문 1,315건 · realOrdersStatus success 보존',
  sD.userLabel === '시험 데이터' && phraseOf(cD) === '실제 주문 0건' && cD.summary.syntheticOrderCount === 1315 && cD.realOrdersStatus === 'success' &&
  chD.phrase === '실제 주문 0건 · 시험 주문 1,315건',
  `label=${sD.userLabel} phrase="${phraseOf(cD)}" realStatus=${cD.realOrdersStatus} chat="${chD.phrase}"`);

// ── E. 실성공N + synT → 실제 N건·시험 구성 무회귀 ────────────────────────────
const realN = cE.summary.realOrderCount; const chE = chatComposition(cE);
T('E. 실성공N+synT → 실제 주문 N건 보존 · 시험 주문 구성/수치 무회귀',
  cE.realOrdersStatus === 'success' && realN === 2 && phraseOf(cE) === `실제 주문 2건` &&
  chE.phrase === `실제 주문 2건 · 시험 주문 ${cE.summary.syntheticOrderCount.toLocaleString()}건` && cE.summary.syntheticOrderCount === 1315,
  `realN=${realN} phrase="${phraseOf(cE)}" chat="${chE.phrase}"`);

// ── F. 카탈로그 손상 + 실제 실패 → 전체 연결 안 됨 · mock 대체 0 ──────────────
const L = await import(pathToFileURL(apiJs(path.join('simCatalog', 'simCatalogV1.js'))).href);
const validateRejects = L.validateSimCatalog([{ productId: '', price: -1 }], L.getSimCatalogManifest()).ok === false;
const sF = SS.screenStateFromRevenue({ loaded: true, realOrdersStatus: 'unavailable', syntheticStatus: 'unavailable', hasSummary: false });
T('F. 카탈로그 손상 + 실제 실패 → 전체 연결 안 됨 · 실0/시험0 오인 0 · mock 대체 0(validate 거부)',
  sF.userLabel === '연결 안 됨' && sF.usable === false && validateRejects,
  `label=${sF.userLabel} validate거부=${validateRejects}`);

// ── G. SourceOfTruth: C와 D snapshot 이 실제 주문 하위 상태에서 다름 ───────────
const snapC = DS.buildDepartmentSourceOfTruthSnapshot(revLike(cC));
const snapD = DS.buildDepartmentSourceOfTruthSnapshot(revLike(cD));
T('G. 스냅샷 C(연결실패)≠D(실제0건): realOrders 하위상태 다름 · sourceMode 등 기존 필드 의미 유지',
  snapC.metadata.realOrders.kind === 'unavailable' && snapD.metadata.realOrders.kind === 'known' && snapD.metadata.realOrders.count === 0 &&
  snapC.sourceMode === 'synthetic' && snapD.sourceMode === 'synthetic' && snapC.metadata.realOrderCount === 0 && snapD.metadata.realOrderCount === 0,
  `C.realOrders=${JSON.stringify(snapC.metadata.realOrders)} D.realOrders=${JSON.stringify(snapD.metadata.realOrders)} · sourceMode C=${snapC.sourceMode} D=${snapD.sourceMode}`);

// ── H. 기준값 불변 ───────────────────────────────────────────────────────────
const o = cC.orders;
const allC = C.countAllOrders(o), validC = C.countValidOrders(o), netC = C.computeNetOrderRevenue(o);
const totalAmt = REV.summarizeRevenue(o).totalAmount;
const risk = IR.summarizeStockRisk(cC.stockImpact.map((x) => ({ stock: x.syntheticProjectedStock, safetyStock: x.safetyStock })));
T('H. 기준값 불변: 1315/1182/88,116,982/98,363,022/재고13/위험4',
  allC === 1315 && validC === 1182 && netC === 88116982 && totalAmt === 98363022 && cC.stockImpact.length === 13 && risk.risky === 4,
  `all=${allC} valid=${validC} net=${netC.toLocaleString()} total=${totalAmt.toLocaleString()} impact=${cC.stockImpact.length} risky=${risk.risky}`);

// ── 소비자 이관·기술값 미노출 정적 확인 ──────────────────────────────────────
const rd = (f) => readFileSync(path.join(REPO, f), 'utf8');
const ptd = rd('src/components/ProductTeamDashboard.tsx'), dwp = rd('src/components/DepartmentWorkspacePanel.tsx'), ptcf = rd('src/services/productTeamChatFacts.ts');
const migrated = /resolveRealOrdersDisplay/.test(ptd) && /resolveRealOrdersDisplay/.test(dwp) && /resolveRealOrdersDisplay/.test(ptcf);
const oldGone = !/실제 유효 주문 \$\{\(summary\?\.realOrderCount/.test(ptd) && !/`실 \$\{s\.realOrderCount\}건 \+ /.test(dwp) && !/총 주문 \$\{s\.orderCount\}건\(실 \$\{s\.realOrderCount\}/.test(ptcf);
T('소비자 3곳 공통 판정기 이관 + 옛 "실 N" 결함 템플릿 제거',
  migrated && oldGone, `이관=${migrated} 옛템플릿제거=${oldGone}`);
T('사용자/AI 노출 기술값(known/unavailable/synthetic_test/api_*/mock) 0 — realOrdersPhrase 반환 검사',
  ['known', 'unavailable'].every((tok) => !SS.realOrdersPhrase({ kind: 'known', count: 5 }).includes(tok) && !SS.realOrdersPhrase({ kind: 'unavailable' }).includes(tok)),
  `known→"${SS.realOrdersPhrase({ kind: 'known', count: 5 })}" unavailable→"${SS.realOrdersPhrase({ kind: 'unavailable' })}"`);

console.log('');
console.log(`--- ${pass} pass / ${fail} fail ---`);
rmSync(outApi, { recursive: true, force: true });
rmSync(outSrc, { recursive: true, force: true });
if (fail > 0) { console.log('\n✗ D-1 GREEN 미충족'); process.exit(1); }
console.log('\n✓ D-1 GREEN — 연결 안 됨 ≠ 실제 0건: 공통 판정기 + 소비자 이관 + 기준값 불변.');
