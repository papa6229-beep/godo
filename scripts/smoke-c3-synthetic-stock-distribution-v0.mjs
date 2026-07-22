#!/usr/bin/env node
/*
 * scripts/smoke-c3-synthetic-stock-distribution-v0.mjs
 * 합성 재고 위험 분포 비퇴화 — RED→GREEN (데이터 품질).
 *
 * 문제: computeSyntheticStockImpact가 projectedStock을 항상 safetyStock과 같게 만들어
 *   (initialStock = max(0,netSold)+safety → projected=safety) 전 상품이 low_stock으로 붕괴.
 * 목표(합성 시나리오, 결정적·Math.random 금지): out_of_stock~10% / low_stock~25% / ok~65%,
 *   세 상태 모두 최소 1개, 단일 상태 100% 금지. safetyStock 생성 해시와 시나리오 해시 분리.
 *   상태별 projectedStock: out=0 / low=1..safety / ok=>safety. initialStock-netSold=projected, 0 이상 정수.
 *   ※ C-3 판정 임계값은 바꾸지 않는다(계약은 정상). 생성기만 고친다.
 *
 * [BASE] 생성 불변식(결정성·정수·initialStock 관계) · [RED] 퇴화 해소(분산·세 상태 존재).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tsc = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tApi = mkdtempSync(path.join(os.tmpdir(), 'c3dist-api-'));
const tSrc = mkdtempSync(path.join(os.tmpdir(), 'c3dist-src-'));
try {
  execFileSync(process.execPath, [tsc, path.join(REPO, 'api', '_shared', 'syntheticRevenue.ts'), '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'), '--outDir', tApi, '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tsc, path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'), '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
const SR = await import(pathToFileURL(path.join(tApi, 'syntheticRevenue.js')).href);
const IR = await import(pathToFileURL(path.join(tSrc, 'inventoryRiskContract.js')).href);

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}`); c ? baseP++ : baseF++; };
const red = (n, c, cur) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? '' : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== C-3 합성 재고 분포 비퇴화 (RED→GREEN) ===');

const products = Array.from({ length: 40 }, (_, i) => ({
  productId: String(1000 + i), productCode: `A-${1000 + i}`, productName: `상품${i + 1}`,
  stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true,
  price: 10000 + i * 100, optionName: '', categoryCode: '001', brandCode: '001'
}));
const gen = () => SR.computeSyntheticStockImpact(products, SR.generateSyntheticRevenueOrders(products, { months: 12, orderCount: 240, seed: 42 }));
const impact = gen();
const impact2 = gen();

// ── [BASE] 생성 불변식 ──
base('B1. 결정적: 같은 입력 2회 → stockImpact 완전 동일', JSON.stringify(impact) === JSON.stringify(impact2));
base('B2. projectedStock 0 이상 정수', impact.every((s) => Number.isInteger(s.syntheticProjectedStock) && s.syntheticProjectedStock >= 0));
base('B3. initialStock − netSoldQuantity = projectedStock', impact.every((s) => s.syntheticInitialStock - s.syntheticNetSoldQuantity === s.syntheticProjectedStock));
base('B4. safetyStock 유지(20~80)', impact.every((s) => s.safetyStock >= 20 && s.safetyStock <= 80));

// 분류
const cls = impact.map((s) => IR.classifyStockRisk(s.syntheticProjectedStock, s.safetyStock).level);
const n = impact.length;
const cnt = (lv) => cls.filter((l) => l === lv).length;
const out = cnt('out_of_stock'), low = cnt('low_stock'), ok = cnt('ok'), unk = cnt('unknown');
const eqSafety = impact.filter((s) => s.syntheticProjectedStock === s.safetyStock).length;
const maxShare = Math.max(out, low, ok, unk) / n;
console.log(`  · 분포: out ${out} · low ${low} · ok ${ok} · unknown ${unk} (전체 ${n}) · projected==safety ${eqSafety}`);

// ── [RED] 퇴화 해소 ──
red('R1. projectedStock==safetyStock 40/40 붕괴 해소(대부분 다름)', eqSafety < n * 0.5, `${eqSafety}/${n}`);
red('R2. out_of_stock ≥ 1', out >= 1, out);
red('R3. low_stock ≥ 1', low >= 1, low);
red('R4. ok ≥ 1', ok >= 1, ok);
red('R5. 단일 상태 100% 금지', maxShare < 1, `최대상태 비중 ${Math.round(maxShare * 100)}%`);
red('R6. 정상 합성 40종에 unknown 없음', unk === 0, unk);
red('R7. 상태별 projectedStock 계약 일치(out=0 / 0<low<=safety / ok>safety)',
  impact.every((s) => { const lv = IR.classifyStockRisk(s.syntheticProjectedStock, s.safetyStock).level; const st = s.syntheticProjectedStock, sf = s.safetyStock; return lv === 'out_of_stock' ? st === 0 : lv === 'low_stock' ? (st > 0 && st <= sf) : lv === 'ok' ? st > sf : true; }),
  '상태-재고 불일치');

console.log(`\n--- 요약 ---`);
console.log(`[BASE] ${baseP} pass / ${baseF} fail`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet`);
console.log('대표:', JSON.stringify(impact.slice(0, 6).map((s) => `${s.productId}:proj=${s.syntheticProjectedStock},safety=${s.safetyStock}→${IR.classifyStockRisk(s.syntheticProjectedStock, s.safetyStock).level}`)));
rmSync(tApi, { recursive: true, force: true }); rmSync(tSrc, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 생성 불변식 실패'); process.exit(2); }
if (redUnmet > 0) { console.log('\n● RED 상태 — 생성기 보정에서 위 [RED] MET.'); process.exit(1); }
console.log('\n✓ 분포 비퇴화 달성'); process.exit(0);
