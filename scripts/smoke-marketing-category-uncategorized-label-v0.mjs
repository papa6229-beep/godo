#!/usr/bin/env node
/*
 * scripts/smoke-marketing-category-uncategorized-label-v0.mjs
 * RC-1 C-1 회귀: 마케팅 '카테고리 매출 TOP'의 미분류 표시 계약.
 *
 * 계약(C-1): 카테고리 축의 내부 key = 'uncategorized' / 화면 label = '미분류'.
 *   - 내부 key는 통일용이므로 'uncategorized' 그대로 유지한다.
 *   - 사용자에게 보이는 label만 한글 '미분류'로 노출한다(내부 키 노출 금지).
 *
 * 실제 어댑터(departmentDataService.ts:477-478)는 카테고리 정보가 없을 때
 *   categoryCode 와 categoryLabel 을 '둘 다' 'uncategorized'로 정규화한다.
 *   따라서 label이 비어 있을 때만 변환하는 규칙으로는 부족하다 — key가
 *   'uncategorized'이면 categoryLabel 값과 무관하게 '미분류'여야 한다(key 우선).
 *
 * 검증 방식: 문자열 스캔·테스트 전용 복제 구현이 아니라, 실제 모듈
 *   buildMarketingAnalysisFacts의 반환값 topCategories(key/label)로 직접 검증한다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-uncat-api-'));
const tmpSrc = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-uncat-src-'));
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

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing 카테고리 미분류 label 계약 smoke ===');

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });

// 집계 대상(유효) 주문 1건을 도너로 확보 — isValidOrder 조건을 그대로 물려받아
// 우리가 원하는 라인 형태만 갈아끼운다(테스트 전용 주문 조작이 아니라 실제 유효 주문 클론).
const donor = u.orders.find((o) => Array.isArray(o.lines) && o.lines.length > 0 && o.lines.some((l) => Number(l.lineRevenue) > 0));
if (!donor) { console.error('[smoke] 유효 도너 주문을 찾지 못함'); process.exit(1); }

// 라인 하나짜리 유효 주문을 만들되, 라인의 카테고리 필드를 '실제 어댑터가 내보내는 형태'로 세팅한다.
const makeOrder = (orderNo, categoryCode, categoryLabel) => {
  const o = JSON.parse(JSON.stringify(donor));
  o.orderNo = orderNo;
  const l0 = o.lines.find((l) => Number(l.lineRevenue) > 0) || o.lines[0];
  const rev = Number(l0.lineRevenue) > 0 ? Number(l0.lineRevenue) : 10000;
  o.lines = [{ goodsNo: '', goodsName: l0.goodsName ?? '', quantity: 1, lineRevenue: rev, categoryCode, categoryLabel }];
  return o;
};
// 단일 주문으로 facts를 만들어 특정 카테고리 버킷을 격리 검증한다.
const catOf = (order, key) => {
  const facts = F.buildMarketingAnalysisFacts({ orders: [order], products: [], period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') });
  return facts.topCategories.find((c) => c.key === key);
};

// ── 케이스 1: 어댑터가 code/label을 모두 'uncategorized'로 정규화 ──
const c1 = catOf(makeOrder('UNCAT-1', 'uncategorized', 'uncategorized'), 'uncategorized');
ok('1. code=label=uncategorized → 버킷 key 유지', !!c1);
ok('2. code=label=uncategorized → 화면 label === "미분류"', !!c1 && c1.label === '미분류');

// ── 케이스 2: label이 그럴듯한 문자열이어도 key가 uncategorized면 미분류(key 우선) ──
const c2 = catOf(makeOrder('UNCAT-2', 'uncategorized', 'unknown_product'), 'uncategorized');
ok('3. code=uncategorized·label=unknown_product → key 유지', !!c2);
ok('4. code=uncategorized·label=unknown_product → 화면 label === "미분류"', !!c2 && c2.label === '미분류');
ok('5. 내부 키 문자열(uncategorized/unknown_product)이 label로 노출되지 않음', !!c2 && c2.label !== 'uncategorized' && c2.label !== 'unknown_product');

// ── 케이스 3: 실제 카테고리 코드 + 정상 label은 그대로 유지 ──
const c3 = catOf(makeOrder('CAT-3', '003', '주방가전'), '003');
ok('6. 실제 코드(003)+정상 label(주방가전)은 보존', !!c3 && c3.label === '주방가전');

// ── 케이스 4: 실제 코드인데 label이 없으면 기존대로 코드 표시 유지(범위 밖 불변) ──
const c4 = catOf(makeOrder('CAT-4', '003', ''), '003');
ok('7. 실제 코드(003)+label 없음 → 코드값 그대로 표시(미분류로 뭉개지 않음)', !!c4 && c4.label === '003');

console.log('\n--- 요약 ---');
console.log('c1:', c1 && `${c1.key}→${c1.label}`, '| c2:', c2 && `${c2.key}→${c2.label}`, '| c3:', c3 && `${c3.key}→${c3.label}`, '| c4:', c4 && `${c4.key}→${c4.label}`);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
