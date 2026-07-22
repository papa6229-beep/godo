#!/usr/bin/env node
/*
 * scripts/smoke-c3-inventory-risk-contract-v0.mjs
 * RC-1 C-3 재고 위험 단계 계약 — RED→GREEN.
 *
 * 계약(사장 확정):
 *   out_of_stock : stock <= 0
 *   low_stock    : 0 < stock <= resolvedSafetyStock
 *   ok           : stock > resolvedSafetyStock
 *   unknown      : stock 누락·NaN·해석 불가 (ok/low_stock으로 뭉개지 않음)
 *   resolvedSafetyStock: 유효한 상품별 safetyStock 우선 / 누락·NaN·음수·무효 → 기본 5 / 0은 유효
 *   판정결과 근거: level·stock·resolvedSafetyStock·safetyStockSource(product|global_default)
 *   riskyStockCount = out_of_stock + low_stock, unknownStockCount 분리, attentionCount = risky + unknown
 *   판매속도·재고 소진 예상일 제외. 공통 기본값 5는 단일 상수(inventoryRiskContract).
 *
 * 소비자는 각자 조인/임계값 복붙 금지 → 공통 inventoryRiskContract를 사용.
 * 실행 가능한 순수 소비자 2개(productTeamChatFacts·departmentDataSourceOfTruth)는 실제 모듈로 검증.
 * React 소비자(Dashboard·Calendar)는 공통 판정 결과(summarizeStockRisk)가 표시 건수로 전달되는 값을 검증한다
 *   → GREEN에서 두 컴포넌트가 summarizeStockRisk를 호출하고, 스모크는 그 함수의 값이 계약과 일치함을 확인.
 *
 * 출력: [BASE] 계약 목표값 정합(불변) · [RED] 공통 계약/소비자 값이 계약과 불일치(GREEN 대상).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'c3-'));
const hasContract = existsSync(path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'));
const entries = [
  path.join(REPO, 'src', 'services', 'productTeamChatFacts.ts'),
  path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
  ...(hasContract ? [path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts')] : [])
];
try {
  execFileSync(process.execPath, [tscBin, ...entries,
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const PT = await import(pathToFileURL(path.join(tmp, 'productTeamChatFacts.js')).href);
const DS = await import(pathToFileURL(path.join(tmp, 'departmentDataSourceOfTruth.js')).href);
let IR = null;
if (hasContract && existsSync(path.join(tmp, 'inventoryRiskContract.js'))) {
  try { IR = await import(pathToFileURL(path.join(tmp, 'inventoryRiskContract.js')).href); } catch { IR = null; }
}

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}`); c ? baseP++ : baseF++; };
const red = (n, c, cur) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? '' : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== C-3 재고 위험 단계 계약 (RED→GREEN) ===');

// ── fixture: stock=syntheticProjectedStock, safetyStock 별도 + unknown 케이스 ──
const F = [
  { productId: 'P1', goodsNo: 'P1', productName: 'P1', syntheticProjectedStock: 0,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 5 },        // out_of_stock
  { productId: 'P2', goodsNo: 'P2', productName: 'P2', syntheticProjectedStock: 3,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 5 },        // low_stock
  { productId: 'P3', goodsNo: 'P3', productName: 'P3', syntheticProjectedStock: 6,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 5 },        // ok
  { productId: 'P4', goodsNo: 'P4', productName: 'P4', syntheticProjectedStock: 15, syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 20 },       // low_stock
  { productId: 'P5', goodsNo: 'P5', productName: 'P5', syntheticProjectedStock: 6,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 20 },       // low_stock
  { productId: 'P6', goodsNo: 'P6', productName: 'P6', syntheticProjectedStock: 5,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0 },                        // safetyStock 누락 → 기본5 → low_stock
  { productId: 'P7', goodsNo: 'P7', productName: 'P7', syntheticProjectedStock: 8,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 'abc' },    // 잘못된 값 → 기본5 → ok
  { productId: 'P8', goodsNo: 'P8', productName: 'P8', syntheticProjectedStock: 1,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 0 },        // safetyStock 0(유효) → ok
  { productId: 'P9', goodsNo: 'P9', productName: 'P9', syntheticProjectedStock: NaN, syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 5 },       // stock NaN → unknown
  { productId: 'P10', goodsNo: 'P10', productName: 'P10', syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 5 },                                 // stock 누락 → unknown
];

// ── 계약(목표) 정의 — 테스트 내 순수(소비자 재구현 아님, 목표 기준) ──
const GLOBAL_DEFAULT = 5;
const isValidNum = (v) => typeof v === 'number' && Number.isFinite(v);
const resolveSafety = (raw) => { const s = String(raw).trim(); if (s === '' || s === 'undefined' || s === 'null') return { v: GLOBAL_DEFAULT, src: 'global_default' }; const n = Number(s); return (Number.isFinite(n) && n >= 0) ? { v: n, src: 'product' } : { v: GLOBAL_DEFAULT, src: 'global_default' }; };
const classify = (stock, safRaw) => {
  if (!isValidNum(stock)) return { level: 'unknown', safetyStockSource: resolveSafety(safRaw).src };
  const { v: saf, src } = resolveSafety(safRaw);
  const level = stock <= 0 ? 'out_of_stock' : stock <= saf ? 'low_stock' : 'ok';
  return { level, resolvedSafetyStock: saf, safetyStockSource: src };
};
const con = F.map((p) => ({ id: p.productId, ...classify(p.syntheticProjectedStock, p.safetyStock) }));
const cnt = (lv) => con.filter((c) => c.level === lv).length;
const cOut = cnt('out_of_stock'), cLow = cnt('low_stock'), cOk = cnt('ok'), cUnknown = cnt('unknown');
const cRisky = cOut + cLow, cAttention = cRisky + cUnknown;

// ── [BASE] 계약 목표값 정합 ──
base('B1. 분류 합 = 10', cOut + cLow + cOk + cUnknown === 10);
base('B2. out_of_stock=1(P1) · low_stock=4(P2·P4·P5·P6) · ok=3(P3·P7·P8) · unknown=2(P9·P10)', cOut === 1 && cLow === 4 && cOk === 3 && cUnknown === 2);
base('B3. riskyStockCount(out+low)=5 · unknownStockCount=2 · attentionCount=7', cRisky === 5 && cUnknown === 2 && cAttention === 7);
base('B4. resolvedSafetyStock: 누락/무효→5(global_default), 유효→product', classify(5, undefined).resolvedSafetyStock === 5 && classify(5, undefined).safetyStockSource === 'global_default' && classify(6, 20).resolvedSafetyStock === 20 && classify(6, 20).safetyStockSource === 'product');
base('B5. safetyStock=0 유효(주의 밴드 없음): stock1→ok, stock0→out_of_stock', classify(1, 0).level === 'ok' && classify(0, 0).level === 'out_of_stock');
base('B6. stock NaN·누락 → unknown (ok/low로 뭉개지 않음)', classify(NaN, 5).level === 'unknown' && classify(undefined, 5).level === 'unknown');

// ── [RED] 공통 계약 함수(inventoryRiskContract) ──
red('R1. inventoryRiskContract 모듈 존재(classify/resolve/summarize)', !!IR && typeof IR.classifyStockRisk === 'function' && typeof IR.resolveSafetyStock === 'function' && typeof IR.summarizeStockRisk === 'function', IR ? 'export 일부 없음' : '모듈 없음');
if (IR && typeof IR.summarizeStockRisk === 'function') {
  const items = F.map((p) => ({ stock: p.syntheticProjectedStock, safetyStock: p.safetyStock }));
  const sum = IR.summarizeStockRisk(items);
  red('R2. summarizeStockRisk = 계약(out1·low4·ok3·unknown2·risky5·attention7)', sum.outOfStock === 1 && sum.lowStock === 4 && sum.ok === 3 && sum.unknown === 2 && sum.risky === 5 && sum.attention === 7, JSON.stringify(sum));
  const c4 = IR.classifyStockRisk(6, 20), c0 = IR.classifyStockRisk(1, 0), cu = IR.classifyStockRisk(NaN, 5), cg = IR.classifyStockRisk(5, undefined);
  red('R3. classifyStockRisk 근거(level·resolvedSafetyStock·safetyStockSource) + 0유효 + unknown + 기본5',
    c4.level === 'low_stock' && c4.resolvedSafetyStock === 20 && c4.safetyStockSource === 'product' && c0.level === 'ok' && cu.level === 'unknown' && cg.resolvedSafetyStock === 5 && cg.safetyStockSource === 'global_default',
    `c4=${JSON.stringify(c4)} c0=${c0.level} cu=${cu.level} cg=${cg.safetyStockSource}`);
  red('R4. DEFAULT_SAFETY_STOCK 단일 상수 = 5', IR.DEFAULT_SAFETY_STOCK === 5, IR.DEFAULT_SAFETY_STOCK);
} else { red('R2. summarizeStockRisk 계약 일치', false, '모듈 없음'); red('R3. classifyStockRisk 근거', false, '모듈 없음'); red('R4. DEFAULT_SAFETY_STOCK=5', false, '모듈 없음'); }

// ── revenue universe(두 순수 소비자 공통 입력) ──
const orders = [{ orderNo: 'O1', orderDate: '2025-06-10', paid: true, canceled: false, totalAmount: 10000, productRevenueByLines: 10000, lines: [{ goodsNo: 'P1', goodsName: 'P1', quantity: 1, lineRevenue: 10000, categoryCode: '001' }] }];
const revenue = { count: 1, source: 'synthetic_test', live: false, summary: null, orders, stockImpact: F, universeAux: { customers: [], inquiries: [], reviews: [] } };

// ── 소비자 1: productTeamChatFacts ──
const chat = PT.buildProductTeamChatFacts('재고 위험 상품 알려줘', revenue);
const chatText = (chat?.facts ?? []).join(' ');
const chatRiskyMatch = chatText.match(/위험\/주의 상품 (\d+)종/);
const chatRisky = chatRiskyMatch ? Number(chatRiskyMatch[1]) : -1;
// ── 소비자 2: departmentDataSourceOfTruth ──
const snap = DS.buildDepartmentSourceOfTruthSnapshot(revenue, {});
const pu = snap?.productUniverse ?? {};
const snapRisky = pu.riskyStockCount ?? -1;

console.log(`  · chat 위험 수 = ${chatRisky} (계약 ${cRisky}) · snapshot riskyStockCount = ${snapRisky} (계약 ${cRisky})`);

// ── [RED] 소비자 값이 공통 계약과 일치 ──
red('R5. productTeamChatFacts 위험 수 = 계약 5', chatRisky === cRisky, chatRisky);
red('R6. departmentDataSourceOfTruth riskyStockCount = 계약 5', snapRisky === cRisky, snapRisky);
red('R7. 두 순수 소비자 위험 수 일치', chatRisky === snapRisky && chatRisky === cRisky, `chat=${chatRisky}·snap=${snapRisky}`);
red('R8. chat이 safetyStock 기준 위험(P4·P5) 분류', /P4/.test(chatText) && /P5/.test(chatText), `P4=${/P4/.test(chatText)}·P5=${/P5/.test(chatText)}`);
red('R9. snapshot 상태별 분리(out_of_stock1·low_stock4·unknown2·attention7)', pu.outOfStockCount === cOut && pu.lowStockCount === cLow && pu.unknownStockCount === cUnknown && pu.attentionCount === cAttention, `out=${pu.outOfStockCount}·low=${pu.lowStockCount}·unknown=${pu.unknownStockCount}·attention=${pu.attentionCount}`);
red('R10. NaN·누락 재고(P9·P10)를 위험이 아니라 unknown으로 분리(정상 오판 방지)', pu.unknownStockCount === cUnknown, `unknownStockCount=${pu.unknownStockCount}`);

console.log(`\n--- 요약 ---`);
console.log(`[BASE] ${baseP} pass / ${baseF} fail`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 계약 목표값 정합 실패 — 치명'); process.exit(2); }
if (redUnmet > 0) { console.log('\n● RED 상태(의도된 실패) — GREEN에서 공통 계약으로 위 [RED] 전부 MET.'); process.exit(1); }
console.log('\n✓ 전부 충족 — GREEN 도달'); process.exit(0);
