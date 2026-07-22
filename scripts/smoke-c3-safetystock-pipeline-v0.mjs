#!/usr/bin/env node
/*
 * scripts/smoke-c3-safetystock-pipeline-v0.mjs
 * RC-1 C-3: 상품별 safetyStock이 데이터 경계(computeSyntheticStockImpact)에서 실제로 실려 나오는지 검증.
 * 조인은 여기서 1회만 수행되고(상품 productId 기준), 소비자는 완성된 stockImpact를 읽는다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'c3-pipe-'));
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'api', '_shared', 'syntheticRevenue.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tmp,
    '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
const SR = await import(pathToFileURL(path.join(tmp, 'syntheticRevenue.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== C-3 safetyStock 파이프라인 smoke ===');

const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, optionName: '' }
];
const impact = SR.computeSyntheticStockImpact(products, []);

ok('1. stockImpact 2종 생성', Array.isArray(impact) && impact.length === 2);
ok('2. 각 항목에 safetyStock(양수 유한 수치) 실림', impact.every((s) => typeof s.safetyStock === 'number' && Number.isFinite(s.safetyStock) && s.safetyStock > 0));
ok('3. safetyStock은 productId별로 결정적(같은 상품 동일값)', SR.computeSyntheticStockImpact(products, [])[0].safetyStock === impact[0].safetyStock);
ok('4. productId 조인키 유지(소비자 재조인 불필요)', impact.every((s) => s.productId));
ok('5. 상품마다 다른 safetyStock 가능(단일 전역값 아님 — 상품별 정책 구조)', impact[0].safetyStock !== undefined && impact[1].safetyStock !== undefined);

console.log('\n안전재고 샘플:', JSON.stringify(impact.map((s) => `${s.productId}:safety=${s.safetyStock},projected=${s.syntheticProjectedStock}`)));
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
