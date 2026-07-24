#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-green-a-loader-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 GREEN A — 버전 카탈로그·검증 로더
 *
 * 잠금:
 *   A1. loadSimCatalogV1() → 13 StandardProduct(정본), productId 전부·실재고 stock:0(실재고 미포함).
 *   A2. manifest 버전 식별 근거(catalogId/schemaVersion/datasetKind=simulation/recordCount/integrity).
 *   A3. validateSimCatalog(정본) ok.
 *   A4. fail-closed — ID 중복·필수 누락·타입 오류·음수 가격·미지 필드·건수 불일치·integrity 불일치.
 *   A5. 깊은 동결 — 반환 배열·객체 frozen, 소비자 변형 시도 후에도 정본 불변.
 *   A6. 반복 호출 동일(메모이즈) + 값 동일.
 *   A7. 정적 import(파일시스템/CWD 읽기 없음) — Vercel 번들 포함 보장.
 *   A8. 로더 출력이 canonical 기준값 재현(1315/1182/88,116,982/98,363,022/재고13/위험4).
 *
 * 검증 실패 시 mock/실상품 대체 0. 계산식 복제 없이 실제 정본 함수로 A8 교차검증.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd().replace(/\\/g, '/');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
let pass = 0, fail = 0;
const T = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${d ? `  — ${d}` : ''}`); ok ? pass++ : fail++; };
console.log('=== SIMULATION-CATALOG-BASELINE-01 GREEN A — 버전 카탈로그·검증 로더 ===');

const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const outApi = mkdtempSync(path.join(cacheRoot, 'simcatA-'));
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

const outSrc = mkdtempSync(path.join(os.tmpdir(), 'simcatA-src-'));
execFileSync(process.execPath, [TSC,
  path.join(REPO, 'src', 'services', 'revenueMetricContract.ts'),
  path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(outSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}

const L = await import(pathToFileURL(apiJs(path.join('simCatalog', 'simCatalogV1.js'))).href);
const DATA = await import(pathToFileURL(apiJs(path.join('simCatalog', 'simCatalogV1.data.js'))).href);
const UNI = await import(pathToFileURL(apiJs('syntheticCommerceUniverse.js')).href);
const REV = await import(pathToFileURL(apiJs('godomallRevenue.js')).href);
const SYN = await import(pathToFileURL(apiJs('syntheticRevenue.js')).href);
const C = await import(pathToFileURL(path.join(outSrc, 'revenueMetricContract.js')).href);
const IR = await import(pathToFileURL(path.join(outSrc, 'inventoryRiskContract.js')).href);

const manifest = DATA.SIM_CATALOG_V1_MANIFEST;
const records = DATA.SIM_CATALOG_V1_RECORDS;

// A1
const products = L.loadSimCatalogV1();
T('A1. loadSimCatalogV1() → 13 StandardProduct · productId 전부 · 실재고 stock:0',
  products.length === 13 && products.every((p) => typeof p.productId === 'string' && p.productId) && products.every((p) => p.stock === 0),
  `len=${products.length} · ids=${products.every((p) => p.productId)} · stock0=${products.every((p) => p.stock === 0)}`);

// A2
T('A2. manifest 버전 식별 근거',
  manifest.catalogId === 'sim-catalog-v1' && manifest.schemaVersion === 1 && manifest.datasetKind === 'simulation' &&
  manifest.recordCount === 13 && /^fnv1a32:[0-9a-f]{8}$/.test(manifest.integrity),
  `${manifest.catalogId} v${manifest.schemaVersion} ${manifest.datasetKind} n=${manifest.recordCount} ${manifest.integrity}`);

// A3
T('A3. validateSimCatalog(정본) ok', L.validateSimCatalog(records, manifest).ok === true, JSON.stringify(L.validateSimCatalog(records, manifest).errors));

// A4 fail-closed
const clone = () => records.map((r) => ({ ...r }));
const cases = [
  ['ID 중복', () => { const r = clone(); r[1].productId = r[0].productId; return r; }, /duplicate productId/],
  ['필수 누락', () => { const r = clone(); delete r[0].productName; return r; }, /productName must be string/],
  ['타입 오류(price 문자열)', () => { const r = clone(); r[0].price = '111'; return r; }, /price must be a finite number/],
  ['음수 가격', () => { const r = clone(); r[0].price = -1; return r; }, /price must be >= 0/],
  ['미지 필드', () => { const r = clone(); r[0].customerEmail = 'x@y.com'; return r; }, /unknown field: customerEmail/],
  ['건수 불일치', () => clone().slice(0, 12), /recordCount mismatch/],
  ['integrity 불일치(값 변조)', () => { const r = clone(); r[0].price = r[0].price + 1000; return r; }, /integrity mismatch|price/]
];
let a4ok = true, a4detail = [];
for (const [name, mk, re] of cases) {
  const res = L.validateSimCatalog(mk(), manifest);
  const hit = res.ok === false && res.errors.some((e) => re.test(e));
  if (!hit) { a4ok = false; a4detail.push(`${name}:MISS(${JSON.stringify(res.errors).slice(0, 80)})`); }
}
// loadSimCatalogV1 은 정본만 로드하므로 fail-closed 는 validate 로 잠근다(로더는 정본 ok 라 throw 안 함).
T('A4. fail-closed — ID중복·필수누락·타입오류·음수가격·미지필드·건수불일치·integrity불일치 전부 거부',
  a4ok, a4ok ? '7종 전부 거부' : a4detail.join(' · '));

// A5 immutability
const frozenArr = Object.isFrozen(products);
const frozenObj = products.every((p) => Object.isFrozen(p));
const before = products[0].price;
let mutBlocked = false;
try { products[0].price = 999999999; } catch { mutBlocked = true; }
const after = L.loadSimCatalogV1()[0].price;
T('A5. 깊은 동결 — 배열·객체 frozen · 소비자 변형 시도 후에도 정본 불변',
  frozenArr && frozenObj && before === after && after !== 999999999,
  `arrFrozen=${frozenArr} objFrozen=${frozenObj} price ${before}→${after} (mut throw=${mutBlocked})`);

// A6 memoize
const a = L.loadSimCatalogV1(), b = L.loadSimCatalogV1();
T('A6. 반복 호출 동일 참조(메모이즈) + 값 동일', a === b && a.length === b.length && a[0].productId === b[0].productId, `sameRef=${a === b}`);

// A7 정적 import(파일시스템/CWD 없음)
const loaderSrc = readFileSync(path.join(REPO, 'api/_shared/simCatalog/simCatalogV1.ts'), 'utf8');
const dataSrcFile = path.join(REPO, 'api/_shared/simCatalog/simCatalogV1.data.ts');
T('A7. 정적 import(readFileSync/process.cwd/fs 없음 — Vercel 번들 포함)',
  !/readFileSync|process\.cwd|from ['"]node:fs|require\(['"]fs/.test(loaderSrc) && existsSync(dataSrcFile) && /import \{[\s\S]*SIM_CATALOG_V1_RECORDS[\s\S]*\} from '\.\/simCatalogV1\.data\.js'/.test(loaderSrc),
  'fs/cwd 미사용 · 정적 데이터 import 확인');

// A8 canonical 재현(실제 정본 함수)
const uni = UNI.buildSyntheticCommerceUniverse([...products], { includeBaselineYear: true });
const allC = C.countAllOrders(uni.orders), validC = C.countValidOrders(uni.orders), netC = C.computeNetOrderRevenue(uni.orders);
const totalAmt = REV.summarizeRevenue(uni.orders).totalAmount;
const impact = SYN.computeSyntheticStockImpact([...products], uni.orders);
const risk = IR.summarizeStockRisk(impact.map((x) => ({ stock: x.syntheticProjectedStock, safetyStock: x.safetyStock })));
T('A8. 로더 출력 → canonical 재현: 1315/1182/88,116,982/98,363,022/재고13/위험4',
  allC === 1315 && validC === 1182 && netC === 88116982 && totalAmt === 98363022 && impact.length === 13 && risk.risky === 4,
  `all=${allC} valid=${validC} net=${netC.toLocaleString()} total=${totalAmt.toLocaleString()} impact=${impact.length} risky=${risk.risky}`);

console.log('');
console.log(`--- ${pass} pass / ${fail} fail ---`);
rmSync(outApi, { recursive: true, force: true });
rmSync(outSrc, { recursive: true, force: true });
if (fail > 0) { console.log('\n✗ GREEN A 미충족'); process.exit(1); }
console.log('\n✓ GREEN A — 버전 카탈로그·검증 로더 완성(fail-closed·동결·정적·canonical 재현).');
