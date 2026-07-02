#!/usr/bin/env node
/*
 * scripts/smoke-marketing-analytics-query-bridge-v0.mjs
 * Marketing Analytics Query Bridge v0 — Stage (a) 시간축 비교.
 *  - 다연도 + 월범위 + "월별" → monthlyTrend(startMonth/endMonth 보존), 1~5월만(12개월 확장 금지)
 *  - revenue / orderCount / averageOrderValue 각각
 *  - groupedBar chart artifact 생성
 *  - narrow intercept: 단일월/비월별 yearOverYear/전체12개월 월별 → null(기존 경로 fallback)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const has = (rel) => existsSync(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing Analytics Query Bridge v0 smoke (Stage a) ===');

ok('marketingAnalyticsQueryBridge.ts 존재', has('src/services/marketingAnalyticsQueryBridge.ts'));
ok('analyticsQueryToMarketingPlan.ts adapter 구현(stub 아님)', /analyticsQueryToMarketingPlan/.test(readFileSync(path.join(REPO, 'src/services/analyticsQueryToMarketingPlan.ts'), 'utf8')) && /monthlyTrend/.test(readFileSync(path.join(REPO, 'src/services/analyticsQueryToMarketingPlan.ts'), 'utf8')));
ok('DepartmentWorkspacePanel이 bridge를 scope 앞단에서 호출', /runMarketingAnalyticsQueryBridge/.test(readFileSync(path.join(REPO, 'src/components/DepartmentWorkspacePanel.tsx'), 'utf8')));

// ── 런타임 컴파일 ──
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-bridge-'));
let B = null;
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingAnalyticsQueryBridge.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  B = await import(pathToFileURL(path.join(tmp, 'marketingAnalyticsQueryBridge.js')).href);
} catch (e) { console.error('[smoke] compile failed:', e.stdout?.toString() || e.message); }

ok('bridge 런타임 로드', !!B?.runMarketingAnalyticsQueryBridge);

if (B) {
  const run = B.runMarketingAnalyticsQueryBridge;
  // 데이터셋: 2024·2025년 1~7월, 각 (연,월) 주문 1건, totalAmount = 월*1000
  const orders = [];
  for (const y of [2024, 2025]) for (let m = 1; m <= 7; m++) {
    orders.push({ orderNo: `${y}-${m}`, orderDate: `${y}-${String(m).padStart(2, '0')}-15 10:00:00`, sourceType: 'synthetic_test', paid: true, canceled: false, unpaid: false, confirmed: true, totalAmount: m * 1000, productRevenueByLines: m * 1000, lines: [{ goodsNo: 'G1', goodsName: '상품', quantity: 1, lineRevenue: m * 1000, categoryCode: '001', categoryLabel: '001' }] });
  }

  // ── 1) 다연도 월범위 월별 매출 비교 → 1~5월만 ──
  const r1 = run({ message: '2024년과 2025년 1월부터 5월까지의 월별 매출을 그래프로 비교해줘', orders });
  ok('1. handled + artifact 존재', !!r1 && r1.handled && !!r1.artifact);
  const cs1 = r1?.artifact?.chartSpec;
  ok('1. chartType=groupedBar', cs1?.chartType === 'groupedBar');
  ok('1. series 2개(2024/2025)', cs1?.series?.length === 2);
  ok('1. 각 series 5개월만(1~5월)', !!cs1 && cs1.series.every((s) => s.points.length === 5 && s.points[0].bucketLabel === '1월' && s.points[4].bucketLabel === '5월'));
  ok('1. 6~12월 row 없음', !!cs1 && !cs1.series.some((s) => s.points.some((p) => ['6월', '7월', '12월'].includes(p.bucketLabel))));
  ok('1. 값 검증(2024 3월=3000, 5월=5000)', !!cs1 && cs1.series[0].points[2].value === 3000 && cs1.series[0].points[4].value === 5000);
  ok('1. 제목/서술이 1~5월 기준(전체연도 아님)', !!r1 && /1~5월/.test(r1.artifact.chartSpec.title));
  ok('1. suppressChart=false(그래프 요청)', r1?.suppressChart === false);

  // ── 2) 주문수 월별 비교 ──
  const r2 = run({ message: '2024년과 2025년 1~5월 주문수 월별 비교해줘', orders });
  ok('2. handled + metric=orderCount(값=1/월)', !!r2 && r2.handled && r2.artifact.chartSpec.series[0].points.length === 5 && r2.artifact.chartSpec.series[0].points[0].value === 1);
  ok('2. unit=count', r2?.artifact?.chartSpec?.unit === 'count');

  // ── 3) 객단가 월별 비교(weighted, 월별 각 월 AOV) ──
  const r3 = run({ message: '2024년과 2025년 1~5월 객단가 월별 비교해줘', orders });
  ok('3. handled + 5개월 AOV(3월=3000)', !!r3 && r3.handled && r3.artifact.chartSpec.series[0].points.length === 5 && r3.artifact.chartSpec.series[0].points[2].value === 3000);

  // ── 4) narrow intercept: 단일월/비월별/전체12개월 월별 → null(기존 경로 fallback) ──
  ok('4a. 단일월 요약 → null(fallback)', run({ message: '2024년 7월 매출 알려줘', orders }) === null);
  ok('4b. 비월별 yearOverYear(월범위) → null(기존 compiler)', run({ message: '2024년 3월~5월과 2025년 3월~5월 매출 비교해줘', orders }) === null);
  ok('4c. 전체 12개월 월별 → null(기존 broad)', run({ message: '2024년과 2025년 월별 매출 비교해줘', orders }) === null);
  ok('4d. 세그먼트 비교 → null(기존)', run({ message: '쿠폰 사용 vs 미사용 객단가 비교', orders }) === null);

  // ── Stage (b) 데이터셋: 2024년 7월 상품/카테고리 ──
  const L = (goodsNo, goodsName, quantity, lineRevenue, categoryCode) => ({ goodsNo, goodsName, quantity, lineRevenue, categoryCode, categoryLabel: categoryCode });
  const O = (orderNo, orderDate, lines) => ({ orderNo, orderDate, sourceType: 'synthetic_test', paid: true, canceled: false, unpaid: false, confirmed: true, totalAmount: lines.reduce((s, l) => s + l.lineRevenue, 0), productRevenueByLines: lines.reduce((s, l) => s + l.lineRevenue, 0), lines });
  const ordersB = [
    O('A', '2024-07-05 10:00:00', [L('G1', '선풍기', 2, 20000, '001')]),
    O('B', '2024-07-10 11:00:00', [L('G2', '가습기', 1, 50000, '003')]),
    O('C', '2024-07-20 12:00:00', [L('G1', '선풍기', 1, 10000, '001'), L('G3', '청소기', 1, 15000, '001')]),
    O('D', '2025-03-15 09:00:00', [L('G1', '선풍기', 5, 100000, '001')])
  ];
  // July 2024: G2 매출50000/1개, G1 매출30000/3개, G3 15000/1개. 매출1위=가습기, 수량1위=선풍기.

  // ── 5) product rank: "가장 많이 판매된 상품" (매출 기준) ──
  const b1 = run({ message: '2024년 7월 매출 중 가장 많이 판매된 상품이 뭐야?', orders: ordersB });
  ok('5. handled(product rank) + artifact rankedBar', !!b1 && b1.handled && b1.artifact?.chartSpec?.chartType === 'rankedBar');
  ok('5. 매출 1위=가습기 명시', !!b1 && /가습기/.test(b1.reply) && /매출 기준 1위/.test(b1.reply));
  ok('5. 수량 1위=선풍기 병기(기준 다름)', !!b1 && /판매수량 기준 1위: 선풍기/.test(b1.reply));
  ok('5. 상품명+매출+수량 제시(총매출 축소 아님)', !!b1 && /50,000원/.test(b1.reply) && /개/.test(b1.reply));
  ok('5. 외부데이터 없음 안내 미부착', !!b1 && !/방문자|광고비|ROAS|외부/.test(b1.reply));
  ok('5. 7월만(2025 100000 제외 → 가습기가 1위, 선풍기 130000 아님)', !!b1 && !/130,000/.test(b1.reply));

  // ── 6) product rank 그래프 요청 ──
  const b2 = run({ message: '2024년 7월 상품별 매출 순위 그래프로 보여줘', orders: ordersB });
  ok('6. handled + rankedBar + suppressChart=false', !!b2 && b2.handled && b2.artifact?.chartSpec?.chartType === 'rankedBar' && b2.suppressChart === false);
  ok('6. 순위 상위=가습기(50000)>선풍기(30000)>청소기(15000)', !!b2 && b2.artifact.chartSpec.series[0].points[0].bucketLabel === '가습기' && b2.artifact.chartSpec.series[0].points[0].value === 50000);

  // ── 7) category share: 표시명·raw code 미노출 ──
  const b3 = run({ message: '2024년 7월 카테고리별 매출 비중 보여줘', orders: ordersB });
  ok('7. handled(category share)', !!b3 && b3.handled);
  ok('7. 표시명 사용(주방가전/생활가전) & raw code(001/003) 미노출', !!b3 && /주방가전|생활가전/.test(b3.reply) && !/00[13]/.test(b3.reply));
  ok('7. 비중 표기(52.6%/47.4%)', !!b3 && /52\.6%/.test(b3.reply) && /47\.4%/.test(b3.reply));
  ok('7. chart series label 표시명', !!b3 && b3.artifact.chartSpec.series[0].points.every((p) => !/^\d{3}$/.test(p.bucketLabel)));

  // ── 8) unsupported: ROAS / 전환율 → fake 없이 + 대체 분석 제안 ──
  const b4 = run({ message: 'ROAS 비교해줘', orders: ordersB });
  ok('8a. ROAS unsupported(차트 없음, fake 없음)', !!b4 && b4.handled && b4.suppressChart === true && !b4.artifact && /ROAS|광고/.test(b4.reply));
  ok('8a. 대체 분석 제안 포함', !!b4 && /매출|주문수|객단가|순위|비중/.test(b4.reply));
  const b5 = run({ message: '방문자 대비 전환율 알려줘', orders: ordersB });
  ok('8b. 전환율 unsupported', !!b5 && b5.handled && b5.suppressChart === true && /전환율|방문자|세션/.test(b5.reply));
}

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
