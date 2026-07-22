#!/usr/bin/env node
/*
 * scripts/smoke-marketing-category-uncategorized-label-v0.mjs
 * RC-1 C-1 회귀: 마케팅 '카테고리 매출 TOP'의 미분류 표시 계약.
 *
 * 계약(C-1): 카테고리 축의 내부 key = 'uncategorized' / 화면 label = '미분류'.
 *   - 내부 key는 통일용이므로 'uncategorized' 그대로 유지한다.
 *   - 사용자에게 보이는 label만 한글 '미분류'로 노출한다(내부 키 노출 금지).
 *
 * 검증 방식: 문자열 스캔·테스트 전용 복제 구현이 아니라, 실제 모듈
 *   buildMarketingAnalysisFacts의 반환값 topCategories(key/label)로 직접 검증한다.
 *
 * 입력 구성: 실 합성 주문 1건을 클론해 라인의 카테고리 정보(categoryCode/
 *   categoryLabel)와 goodsNo를 비워 'uncategorized' 버킷을 강제한다.
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
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const u = U.buildSyntheticCommerceUniverse(products, { seed: 42, endDate: '2026-06-26' });

// 실제 반환값으로 기준 계약 확인: 정상 카테고리 버킷은 존재한다.
const base = F.buildMarketingAnalysisFacts({ orders: u.orders, products, period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') });
ok('1. 기준: topCategories 존재', Array.isArray(base.topCategories) && base.topCategories.length > 0);

// ── uncategorized 버킷을 강제하는 입력 구성 ──
// 유효(집계 대상) 주문 1건을 클론해 라인의 카테고리 정보와 goodsNo를 비운다.
// meta 조회가 실패(goodsNo 공백)하고 categoryCode/Label이 없으므로 key='uncategorized'로 확정된다.
const donor = JSON.parse(JSON.stringify(u.orders.find((o) => Array.isArray(o.lines) && o.lines.length > 0 && o.lines.some((l) => Number(l.lineRevenue) > 0))));
donor.orderNo = 'UNCAT-0001';
for (const l of donor.lines) { l.categoryCode = ''; l.categoryLabel = ''; l.goodsNo = ''; }

const withUncat = F.buildMarketingAnalysisFacts({ orders: [...u.orders, donor], products, period: { preset: 'all' }, nowMs: Date.parse('2026-06-27T00:00:00') });
const uncat = withUncat.topCategories.find((c) => c.key === 'uncategorized');

// C-1 핵심: 내부 key는 uncategorized로 유지되고, label은 '미분류'로 노출된다.
ok('2. uncategorized 버킷이 실제로 형성됨(key 유지)', !!uncat);
ok('3. uncategorized 버킷의 화면 label === "미분류"', !!uncat && uncat.label === '미분류');
ok('4. 내부 키 "uncategorized"가 label로 노출되지 않음', !!uncat && uncat.label !== 'uncategorized');

// 과잉 변경 가드: 실제 코드값 카테고리(key !== uncategorized)를 '미분류'로 뭉개지 않는다.
ok('5. 실제 코드 카테고리는 "미분류"로 뭉개지지 않음(범위 밖 폴백 불변)',
  withUncat.topCategories.filter((c) => c.key !== 'uncategorized').every((c) => c.label !== '미분류'));

console.log('\n--- 요약 ---');
console.log('topCategories:', JSON.stringify(withUncat.topCategories.map((c) => `${c.key}→${c.label} ${c.sharePercent}%`)));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpApi, { recursive: true, force: true });
rmSync(tmpSrc, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
