#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-red-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 — RED 최종 잠금 (재현 가능·추적 표본)
 *
 * 이 RED 는 다음을 **추적된 저장소 파일만으로**(세션 UUID·절대경로·외부 고도몰 연결 없이) 잠근다.
 *   표본 = api/_shared/simCatalog/simCatalogV1.data.ts (추적, 커밋됨).
 *
 *   [BASE] 영구 불변식:
 *     B0. 표본 민감정보 0 (실제 값·필드 구조 검사 — email/phone/key/secret/token/cookie 전수)
 *     R1. 확보 13개 → 실제 정본 함수로 canonical 기준값 정확 재현
 *         (buildSyntheticCommerceUniverse · countAllOrders · countValidOrders · computeNetOrderRevenue
 *          · summarizeRevenue.totalAmount · computeSyntheticStockImpact · summarizeStockRisk)
 *         1315 / 1182 / 88,116,982(운영 순매출) / 98,363,022(전체 주문 합) / 재고13 / 위험4(품절2+부족2)
 *     R1b. 88,116,982(net) ≠ 98,363,022(total) — 의미 구별 별도 단언
 *     R2. 카탈로그 [] → 빈 세계(시뮬레이션 통째 소멸)
 *     R4. 화장품 mock 4개 ≠ 시험몰 13개(식별자 부재) → 기준선 재사용 불가
 *
 *   [GREEN 해소 확인] (GREEN B 반영 후 — 연결 실패에도 시뮬레이션 유지):
 *     R3. 실제 연결 실패 + synthetic=true → sim-catalog-v1 로 시뮬레이션 유지
 *         (realOrdersStatus=unavailable · syntheticStatus=success · orders>0 · summary present).
 *     R5. resolveOrdersRevenue 가 sim-catalog-v1 재주입(loadSimCatalogV1) 경로를 가진다.
 *
 * **제품 소스 변경 0.** 로컬 tsc 로 컴파일해 실제 함수를 import·호출한다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd().replace(/\\/g, '/');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');

let base = 0, basef = 0, met = 0, unmet = 0;
const B = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} [BASE] ${n}${d ? `  — ${d}` : ''}`); ok ? base++ : basef++; };
const R = (n, ok, d) => { console.log(`  ${ok ? 'MET ' : 'RED '} [RED ] ${n}${d ? `  — ${d}` : ''}`); ok ? met++ : unmet++; };
console.log('=== SIMULATION-CATALOG-BASELINE-01 — RED 최종 잠금 ===');

// ── 컴파일 A) api/_shared 전체(시험 카탈로그 데이터 모듈 포함) ─────────────────
const cacheRoot = path.join(REPO, 'node_modules', '.cache'); mkdirSync(cacheRoot, { recursive: true });
const outApi = mkdtempSync(path.join(cacheRoot, 'simcat-api-'));
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

// ── 컴파일 B) src 정본 계약 함수 ─────────────────────────────────────────────
const outSrc = mkdtempSync(path.join(os.tmpdir(), 'simcat-src-'));
execFileSync(process.execPath, [TSC,
  path.join(REPO, 'src', 'services', 'revenueMetricContract.ts'),
  path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(outSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}

const DATA = await import(pathToFileURL(apiJs(path.join('simCatalog', 'simCatalogV1.data.js'))).href);
const UNI = await import(pathToFileURL(apiJs('syntheticCommerceUniverse.js')).href);
const REV = await import(pathToFileURL(apiJs('godomallRevenue.js')).href);
const SYN = await import(pathToFileURL(apiJs('syntheticRevenue.js')).href);
const RES = await import(pathToFileURL(apiJs('godomallResource.js')).href);
const C = await import(pathToFileURL(path.join(outSrc, 'revenueMetricContract.js')).href);
const IR = await import(pathToFileURL(path.join(outSrc, 'inventoryRiskContract.js')).href);

const records = DATA.SIM_CATALOG_V1_RECORDS;
const preserved = records.map((p) => ({ stock: 0, ...p })); // 생성기는 실재고 미사용

// ── B0) 민감정보 검사(보정): email/phone/key/secret/token/cookie 를 모든 문자열 값에서 ──────
const WHITELIST = new Set(DATA.SIM_CATALOG_V1_MANIFEST.fields);
// 기계 식별값(숫자 ID/일시) — phone 오탐만 필드 의미로 제외. email/secret 검사는 그대로 적용.
const MACHINE_ID_FIELDS = new Set(['productId', 'productCode', 'registeredAt', 'modifiedAt']);
// 고객·주문·주소·인증·실재고 필드명(존재 자체가 위반)
const FORBIDDEN_KEY = /(^stock$|receiver|buyer|memberId|orderNo|address|addr|zipcode|cookie|password|passwd|secret|token|api[_-]?key|partner_?key|userKey|auth|email|phone|mobile)/i;
const EMAIL = /[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/;
const KR_PHONE = /(?<!\d)01[016789][-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/;
const SECRET_MARKER = /(api[_-]?key|secret|token|cookie|password|passwd|bearer\s|sk-[A-Za-z0-9]{12,})/i;
const HIGH_ENTROPY = /\b[A-Fa-f0-9]{32,}\b|\b[A-Za-z0-9+/]{40,}={0,2}\b/;
let sens = [];
for (const rec of records) {
  for (const [k, v] of Object.entries(rec)) {
    // 화이트리스트 밖 키만 구조 위반(금지 필드명 검사도 여기서 — sellMobile 등 정당 필드 오탐 방지).
    if (!WHITELIST.has(k)) { sens.push(`미지 필드: ${k}`); if (FORBIDDEN_KEY.test(k)) sens.push(`금지 필드명: ${k}`); }
    if (typeof v === 'string') {
      if (EMAIL.test(v)) sens.push(`이메일 값(${k})`);
      if (SECRET_MARKER.test(v)) sens.push(`key/secret/token/cookie 값(${k})`);
      if (HIGH_ENTROPY.test(v)) sens.push(`고엔트로피 비밀 값(${k})`);
      if (!MACHINE_ID_FIELDS.has(k) && KR_PHONE.test(v)) sens.push(`휴대폰 값(${k})`);
    }
  }
  if ('stock' in rec) sens.push('실재고 stock 포함');
}
B('B0. 표본 13개 민감정보 0 (email/phone/key/secret/token/cookie 전수 · 고객·주문·주소·실재고·인증 0)',
  records.length === 13 && preserved.every((p) => p.productId) && sens.length === 0,
  `records=${records.length} · 위반=${sens.length}${sens.length ? ' ' + JSON.stringify([...new Set(sens)]) : ''}`);

// ── R1) 실제 정본 함수로 6개 기준값 잠금(계산식 복제 없음) ─────────────────────
const uni13 = UNI.buildSyntheticCommerceUniverse(preserved, { includeBaselineYear: true });
const orders = uni13.orders;
const allC = C.countAllOrders(orders);
const validC = C.countValidOrders(orders);
const netC = C.computeNetOrderRevenue(orders);          // 운영 순매출(유효주문 결제금액)
const totalAmt = REV.summarizeRevenue(orders).totalAmount; // 전체 주문 합
const impact = SYN.computeSyntheticStockImpact(preserved, orders);
const risk = IR.summarizeStockRisk(impact.map((x) => ({ stock: x.syntheticProjectedStock, safetyStock: x.safetyStock })));
B('R1. 확보 13개 → canonical 기준값 정확 재현: 1315/1182/88,116,982/98,363,022/재고13/위험4',
  allC === 1315 && validC === 1182 && netC === 88116982 && totalAmt === 98363022 && impact.length === 13 && risk.risky === 4,
  `all=${allC} valid=${validC} net=${netC.toLocaleString()} total=${totalAmt.toLocaleString()} impact=${impact.length} risky=${risk.risky}(품절${risk.outOfStock}+부족${risk.lowStock})`);
B('R1b. 88,116,982(운영 순매출) ≠ 98,363,022(전체 주문 합) — 의미 구별(넷 < 전체)',
  netC === 88116982 && totalAmt === 98363022 && netC < totalAmt,
  `net(${netC.toLocaleString()}) < total(${totalAmt.toLocaleString()}) = ${netC < totalAmt}`);

// ── R2) 카탈로그 소멸 → 빈 세계 ──────────────────────────────────────────────
const uniEmpty = UNI.buildSyntheticCommerceUniverse([], { includeBaselineYear: true });
B('R2. 카탈로그 [] → 빈 세계: orderCount 0 · orders [] · customers []',
  uniEmpty.orders.length === 0 && uniEmpty.customers.length === 0 && uniEmpty.meta.orderCount === 0,
  `orders=${uniEmpty.orders.length} customers=${uniEmpty.customers.length}`);

// ── R4) 화장품 mock 4개 ≠ 시험몰 13개 ────────────────────────────────────────
const mockSrc = existsSync(path.join(REPO, 'api/_shared/mockProxyData.ts')) ? readFileSync(path.join(REPO, 'api/_shared/mockProxyData.ts'), 'utf8') : '';
const mockInvBlock = (mockSrc.match(/mockInventory[\s\S]*?\n\];/) || [''])[0];
const mockItemCount = (mockInvBlock.match(/productName\s*:/g) || []).length;
const mockHasId = /\bgoodsNo\b|\bproductId\b/.test(mockInvBlock);
B('R4. 화장품 mock 4개 ≠ 시험몰 13개(식별자 부재) → 기준선 재사용 불가',
  mockItemCount === 4 && mockItemCount !== records.length && !mockHasId,
  `mock=${mockItemCount} · 시험몰=${records.length} · mock productId=${mockHasId}`);

// ── R3) [GREEN 해소] 실제 연결 실패 + synthetic=true → sim-catalog-v1 로 시뮬레이션 유지 ──
process.env.GODOMALL_API_MODE = 'real';
process.env.GODOMALL_PARTNER_KEY = 'RED-TEST-DUMMY-partner-not-a-real-key';
process.env.GODOMALL_USER_KEY = 'RED-TEST-DUMMY-user-not-a-real-key';
process.env.GODOMALL_REAL_BASE_URL = 'http://127.0.0.1:9';
const rr = await RES.resolveOrdersRevenue({ includeSynthetic: true });
R('R3. 실제 연결 실패 + synthetic=true → sim-catalog-v1 로 시뮬레이션 유지 (real unavailable · synthetic success · orders>0)',
  rr.realOrdersStatus === 'unavailable' && rr.syntheticStatus === 'success' &&
  rr.orders.length > 0 && rr.stockImpact.length === 13 && rr.summary !== null &&
  rr.orders.every((o) => o.sourceType === 'synthetic_test'),
  `realOrdersStatus=${rr.realOrdersStatus} syntheticStatus=${rr.syntheticStatus} orders=${rr.orders.length} stockImpact=${rr.stockImpact.length} summary=${rr.summary === null ? 'null' : 'present'}`);

// ── R5) [GREEN 해소] resolveOrdersRevenue 가 sim-catalog-v1 재주입 경로를 가진다 ──
const resourceSrc = readFileSync(path.join(REPO, 'api/_shared/godomallResource.ts'), 'utf8');
R('R5. resolveOrdersRevenue 가 sim-catalog-v1 재주입(loadSimCatalogV1) — 실 products 와 독립',
  /loadSimCatalogV1/.test(resourceSrc),
  `godomallResource 가 loadSimCatalogV1 참조=${/loadSimCatalogV1/.test(resourceSrc)}`);

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${base} pass / ${basef} fail`);
console.log(`[RED ] ${met} met / ${unmet} unmet  (GREEN B 반영: 연결 실패에도 v1 시뮬레이션 유지)`);
rmSync(outApi, { recursive: true, force: true });
rmSync(outSrc, { recursive: true, force: true });
if (basef > 0) { console.log('\n✗ 불변식 위반'); process.exit(1); }
if (unmet > 0) { console.log(`\n✗ ${unmet}건 미충족`); process.exit(1); }
console.log('\n✓ SIMULATION-CATALOG-BASELINE-01 — 표본 민감정보 0, canonical 재현, 카탈로그 의존 불변식,');
console.log('  연결 실패에도 sim-catalog-v1 로 시뮬레이션 유지 확정.');
