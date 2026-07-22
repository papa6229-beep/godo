#!/usr/bin/env node
/*
 * scripts/smoke-c3-inventory-risk-contract-v0.mjs
 * RC-1 C-3 실패 재현(RED) — 재고 위험 단계 계약.
 *
 * 계약(사장 승인):
 *   stock <= 0                  → out_of_stock (위험)
 *   0 < stock <= safetyStock    → low_stock   (주의) — 위험 수량 합계에 포함
 *   stock > safetyStock         → ok
 *   상품별 safetyStock 우선, 누락/NaN/음수/잘못된 값 → 전역 기본값 5.
 *   safetyStock=0은 '유효 설정'(warning 밴드 없음)으로 취급하되 실데이터 확인은 별도(보고서).
 *   판매속도·재고 소진 예상일은 이번 범위 제외.
 *
 * 현재 결함: 4 소비자가 같은 syntheticProjectedStock(조인키 productId)을 읽지만 하드코딩
 *   임계값이 제각각(chat ≤0/≤5, snapshot·dashboard·calendar ≤20/≤40)이고 safetyStock을 무시한다.
 *   → 같은 재고가 화면마다 다른 상태·위험 건수로 나온다.
 *
 * 이 스모크는 node에서 실행 가능한 순수 소비자 2개(productTeamChatFacts,
 * departmentDataSourceOfTruth)를 실제 모듈로 돌려 발산을 값으로 고정한다.
 * (React 소비자 2개 ProductTeamDashboard/CalendarPanel는 비교표로 문서화 — 보고서 참조.)
 *
 * 출력: [BASE] 계약 목표값 자체 정합(불변) · [RED] 현재 소비자 값이 계약과 불일치(GREEN 대상).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'c3-red-'));
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'productTeamChatFacts.ts'),
    path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const PT = await import(pathToFileURL(path.join(tmp, 'productTeamChatFacts.js')).href);
const DS = await import(pathToFileURL(path.join(tmp, 'departmentDataSourceOfTruth.js')).href);

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}`); c ? baseP++ : baseF++; };
const red = (n, c, cur) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? '' : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== C-3 재고 위험 단계 계약 (RED) ===');

// ── 사장 지정 fixture (stock=syntheticProjectedStock, safetyStock 별도) ──
const F = [
  { productId: 'P1', goodsNo: 'P1', productName: 'P1', syntheticProjectedStock: 0,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 5 },        // out_of_stock
  { productId: 'P2', goodsNo: 'P2', productName: 'P2', syntheticProjectedStock: 3,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 5 },        // low_stock
  { productId: 'P3', goodsNo: 'P3', productName: 'P3', syntheticProjectedStock: 6,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 5 },        // ok
  { productId: 'P4', goodsNo: 'P4', productName: 'P4', syntheticProjectedStock: 15, syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 20 },       // low_stock
  { productId: 'P5', goodsNo: 'P5', productName: 'P5', syntheticProjectedStock: 6,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 20 },       // low_stock
  { productId: 'P6', goodsNo: 'P6', productName: 'P6', syntheticProjectedStock: 5,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0 },                        // safetyStock 누락 → 기본 5 → low_stock
  { productId: 'P7', goodsNo: 'P7', productName: 'P7', syntheticProjectedStock: 8,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 'abc' },    // 잘못된 값 → 기본 5 → ok
  { productId: 'P8', goodsNo: 'P8', productName: 'P8', syntheticProjectedStock: 1,  syntheticSoldQuantity: 0, syntheticRestoredQuantity: 0, safetyStock: 0 },        // safetyStock 0(유효) → ok
];

// ── 계약(목표) 분류 — 테스트 내 순수 정의(소비자 재구현 아님, 목표 정의) ──
const GLOBAL_DEFAULT = 5;
const normSafety = (v) => { const s = String(v).trim(); if (s === '' || s === 'undefined') return GLOBAL_DEFAULT; const n = Number(s); return (Number.isFinite(n) && n >= 0) ? n : GLOBAL_DEFAULT; };
const classify = (stock, safRaw) => { const saf = normSafety(safRaw); if (stock <= 0) return 'out_of_stock'; if (stock <= saf) return 'low_stock'; return 'ok'; };
const contract = F.map((p) => ({ id: p.productId, status: classify(p.syntheticProjectedStock, p.safetyStock) }));
const cOut = contract.filter((c) => c.status === 'out_of_stock').length;
const cLow = contract.filter((c) => c.status === 'low_stock').length;
const cOk = contract.filter((c) => c.status === 'ok').length;
const cRisky = cOut + cLow;
const riskyIds = new Set(contract.filter((c) => c.status !== 'ok').map((c) => c.id));

// ── [BASE] 계약 목표값 자체 정합 ──
base('B1. 계약 분류 합 = 8', cOut + cLow + cOk === 8);
base('B2. out_of_stock = 1 (P1)', cOut === 1);
base('B3. low_stock = 4 (P2·P4·P5·P6)', cLow === 4 && ['P2', 'P4', 'P5', 'P6'].every((id) => riskyIds.has(id)));
base('B4. ok = 3 (P3·P7·P8)', cOk === 3);
base('B5. 위험 수량 합계(out_of_stock+low_stock) = 5', cRisky === 5);
base('B6. safetyStock 누락/잘못된값 → 기본 5 (P6 low_stock·P7 ok)', classify(5, undefined) === 'low_stock' && classify(8, 'abc') === 'ok');
base('B7. safetyStock=0 → warning 밴드 없음 (P8 stock1 → ok)', classify(1, 0) === 'ok' && classify(0, 0) === 'out_of_stock');

// ── revenue universe 구성(두 소비자 공통 입력) ──
const orders = [{ orderNo: 'O1', orderDate: '2025-06-10', paid: true, canceled: false, totalAmount: 10000, productRevenueByLines: 10000, lines: [{ goodsNo: 'P1', goodsName: 'P1', quantity: 1, lineRevenue: 10000, categoryCode: '001' }] }];
const revenue = { count: 1, source: 'synthetic_test', live: false, summary: null, orders, stockImpact: F, universeAux: { customers: [], inquiries: [], reviews: [] } };

// ── 소비자 1: productTeamChatFacts (현재 ≤0 danger / ≤5 warning) ──
const chat = PT.buildProductTeamChatFacts('재고 위험 상품 알려줘', revenue);
const chatText = (chat?.facts ?? []).join(' ');
const chatRiskyMatch = chatText.match(/위험\/주의 상품 (\d+)종/);
const chatRisky = chatRiskyMatch ? Number(chatRiskyMatch[1]) : -1;

// ── 소비자 2: departmentDataSourceOfTruth (현재 ≤20 riskyStockCount) ──
const snap = DS.buildDepartmentSourceOfTruthSnapshot(revenue, {});
const snapRisky = snap?.productUniverse?.riskyStockCount ?? -1;

console.log(`  · 현재 chat 위험/주의 수 = ${chatRisky} (계약 ${cRisky})`);
console.log(`  · 현재 snapshot riskyStockCount = ${snapRisky} (계약 ${cRisky})`);

// ── [RED] 계약 목표: 현재 실패 ──
red('R1. productTeamChatFacts 위험 수 = 계약 위험 수 5 (safetyStock 반영)', chatRisky === cRisky, chatRisky);
red('R2. departmentDataSourceOfTruth riskyStockCount = 계약 위험 수 5', snapRisky === cRisky, snapRisky);
red('R3. 두 소비자 위험 수 일치(같은 재고 → 같은 판정)', chatRisky === snapRisky && chatRisky === cRisky, `chat=${chatRisky}·snap=${snapRisky}`);
// safetyStock을 봐야만 위험인 상품(P4 15/20, P5 6/20)을 chat이 위험으로 잡는가
red('R4. chat이 safetyStock 기준 위험(P4·P5)을 위험으로 분류', /P4/.test(chatText) && /P5/.test(chatText), `chat 위험목록에 P4=${/P4/.test(chatText)}·P5=${/P5/.test(chatText)}`);
// 상태별 분리(out_of_stock vs low_stock) 노출
red('R5. snapshot이 out_of_stock/low_stock 상태별 수량 분리 노출(계약 1·4)',
  snap?.productUniverse?.outOfStockCount === cOut && snap?.productUniverse?.lowStockCount === cLow,
  `outOfStockCount=${snap?.productUniverse?.outOfStockCount}·lowStockCount=${snap?.productUniverse?.lowStockCount}`);

console.log(`\n--- 요약 ---`);
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (계약 목표값 정합 — fail>0이면 계약/픽스처 오류)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (현재 소비자 vs 계약 — GREEN 전이므로 unmet>0 정상)`);

rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 계약 목표값 정합 실패 — 치명'); process.exit(2); }
if (redUnmet > 0) { console.log('\n● RED 상태(의도된 실패) — GREEN에서 4 소비자가 공통 계약으로 위 [RED]를 MET.'); process.exit(1); }
console.log('\n✓ 전부 충족 — GREEN 도달'); process.exit(0);
