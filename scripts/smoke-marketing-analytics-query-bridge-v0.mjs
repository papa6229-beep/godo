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
const tmp2 = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-route-'));
let B = null, R = null;
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingAnalyticsQueryBridge.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  B = await import(pathToFileURL(path.join(tmp, 'marketingAnalyticsQueryBridge.js')).href);
  // 실제 렌더 라우팅 함수(대시보드가 소비) — 렌더 관례 검증에 사용. type-only import뿐이라 런타임 상대의존 없음.
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'components', 'charts', 'marketingChartRoute.ts'),
    '--outDir', tmp2, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  const findFile = (dir, name) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { const r = findFile(p, name); if (r) return r; }
      else if (e.name === name) return p;
    }
    return null;
  };
  const routeJs = findFile(tmp2, 'marketingChartRoute.js');
  if (routeJs) R = await import(pathToFileURL(routeJs).href);
} catch (e) { console.error('[smoke] compile failed:', e.stdout?.toString() || e.message); }

ok('bridge 런타임 로드', !!B?.runMarketingAnalyticsQueryBridge);
ok('resolveMarketingChartRoute 로드', !!R?.resolveMarketingChartRoute);

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

  // ── Stage (b) 데이터셋: 2024년 7월 상품/카테고리(3종) ──
  const L = (goodsNo, goodsName, quantity, lineRevenue, categoryCode) => ({ goodsNo, goodsName, quantity, lineRevenue, categoryCode, categoryLabel: categoryCode });
  const O = (orderNo, orderDate, lines) => ({ orderNo, orderDate, sourceType: 'synthetic_test', paid: true, canceled: false, unpaid: false, confirmed: true, totalAmount: lines.reduce((s, l) => s + l.lineRevenue, 0), productRevenueByLines: lines.reduce((s, l) => s + l.lineRevenue, 0), lines });
  const ordersB = [
    O('A', '2024-07-05 10:00:00', [L('G1', '선풍기', 2, 20000, '001')]),
    O('B', '2024-07-10 11:00:00', [L('G2', '가습기', 1, 50000, '003')]),
    O('C', '2024-07-20 12:00:00', [L('G1', '선풍기', 1, 10000, '001'), L('G3', '청소기', 1, 15000, '001')]),
    O('F', '2024-07-25 12:00:00', [L('G4', '공기청정기', 1, 25000, '006')]),
    O('D', '2025-03-15 09:00:00', [L('G1', '선풍기', 5, 100000, '001')])
  ];
  // July 2024 상품: 가습기50000/1, 선풍기30000/3, 공기청정기25000/1, 청소기15000/1. 매출1위=가습기, 수량1위=선풍기.
  // July 2024 카테고리: 003=50000, 001=45000, 006=25000. (총 120000)
  const route = R.resolveMarketingChartRoute;

  // ── 5) product rank 단답형("가장 많이"): 텍스트 1위 강조 + 능동 차트(top5 후보군) ──
  const b1 = run({ message: '2024년 7월 매출 중 가장 많이 판매된 상품이 뭐야?', orders: ordersB });
  ok('5. handled + artifact 존재(능동 차트)', !!b1 && b1.handled && !!b1.artifact?.chartSpec);
  ok('5. route=rankedBar', !!b1 && route(b1.artifact.chartSpec) === 'rankedBar');
  ok('5. series="항목당 1개"(상품 4종 = series 4개)', !!b1 && b1.artifact.chartSpec.series.length === 4);
  ok('5. first series.label=실제 상품명(가습기), generic "상품" 아님', !!b1 && b1.artifact.chartSpec.series[0].label === '가습기' && b1.artifact.chartSpec.series[0].label !== '상품');
  ok('5. 각 series 1 point, value=항목 매출(가습기 50000)', !!b1 && b1.artifact.chartSpec.series[0].points.length === 1 && b1.artifact.chartSpec.series[0].points[0].value === 50000);
  ok('5. 텍스트 1위=가습기 강조 + 수량1위=선풍기 병기', !!b1 && /매출 기준 1위: 가습기/.test(b1.reply) && /판매수량 기준 1위: 선풍기/.test(b1.reply));
  ok('5. 텍스트 1위와 chart 첫 series 동일 source(가습기)', !!b1 && b1.artifact.chartSpec.series[0].label === '가습기' && /매출 기준 1위: 가습기/.test(b1.reply));
  ok('5. 외부데이터 없음 안내 미부착', !!b1 && !/방문자|광고비|ROAS|외부/.test(b1.reply));
  // 툴팁 semantics 데이터: 판매수량(quantity)·주문건수(orderCount)가 point에 실려 있고 0 아님 → "주문수 0건" 방지, 판매수량 표시.
  ok('5. point.quantity>0 (판매수량 표시 가능)', !!b1 && b1.artifact.chartSpec.series[0].points[0].quantity === 1);
  ok('5. point.orderCount 실제 계산>0 (0 fallback 아님)', !!b1 && b1.artifact.chartSpec.series[0].points[0].orderCount === 1);
  ok('5. quantity≠orderCount 혼동 없음(선풍기 판매3/주문2)', !!b1 && (() => { const s = b1.artifact.chartSpec.series.find((x) => x.label === '선풍기'); return s && s.points[0].quantity === 3 && s.points[0].orderCount === 2; })());
  ok('5. unit=krw(상품 랭킹 매출 기준)', !!b1 && b1.artifact.chartSpec.unit === 'krw');

  // ── 6) product rank 그래프 요청 ──
  const b2 = run({ message: '2024년 7월 상품별 매출 순위 그래프로 보여줘', orders: ordersB });
  ok('6. handled + route rankedBar + suppressChart=false', !!b2 && b2.handled && route(b2.artifact.chartSpec) === 'rankedBar' && b2.suppressChart === false);
  ok('6. series 개수=상품 수(4), 다중 막대(1막대 총합 아님)', !!b2 && b2.artifact.chartSpec.series.length === 4);
  ok('6. 순위: 가습기(50000)>선풍기(30000)>공기청정기(25000)>청소기(15000)', !!b2 &&
    b2.artifact.chartSpec.series[0].label === '가습기' && b2.artifact.chartSpec.series[0].points[0].value === 50000 &&
    b2.artifact.chartSpec.series[1].label === '선풍기' && b2.artifact.chartSpec.series[2].label === '공기청정기');

  // ── 7) category share: 항목당 1 series, 표시명, raw code 미노출 ──
  const b3b = run({ message: '2024년 7월 카테고리별 매출 비중 보여줘', orders: ordersB });
  ok('7. handled(category share)', !!b3b && b3b.handled && !!b3b.artifact?.chartSpec);
  ok('7. route=rankedBar', !!b3b && route(b3b.artifact.chartSpec) === 'rankedBar');
  ok('7. series 개수=카테고리 수(3), 1막대 총합 아님', !!b3b && b3b.artifact.chartSpec.series.length === 3);
  ok('7. series.label=표시명(주방가전/생활가전/공기·청정), raw code 아님', !!b3b &&
    b3b.artifact.chartSpec.series.every((s) => !/^\d{3}$/.test(s.label)) &&
    b3b.artifact.chartSpec.series.map((s) => s.label).includes('주방가전') &&
    b3b.artifact.chartSpec.series.map((s) => s.label).includes('생활가전'));
  ok('7. raw code(001/003/006) 사용자 라벨 미노출', !!b3b && !b3b.artifact.chartSpec.series.some((s) => /^00[136]$/.test(s.label)) && !/00[136]/.test(b3b.reply));
  ok('7. 텍스트/차트 동일 source(1위 주방가전)', !!b3b && b3b.artifact.chartSpec.series[0].label === '주방가전' && /주방가전/.test(b3b.reply));
  // 비중 질문: 그래프 주인공은 percent. (July: 003=50000/120000=41.7%, 001=45000=37.5%, 006=25000=20.8%)
  ok('7. unit=percent(비중이 메인)', !!b3b && b3b.artifact.chartSpec.unit === 'percent');
  ok('7. point.value=share percent(주방가전 41.7)', !!b3b && b3b.artifact.chartSpec.series[0].points[0].value === 41.7);
  ok('7. 매출은 secondary로 보존(point.revenue=50000)', !!b3b && b3b.artifact.chartSpec.series[0].points[0].revenue === 50000);
  ok('7. 매출(₩)이 메인 value가 아님(value는 %스케일 ≤100)', !!b3b && b3b.artifact.chartSpec.series.every((s) => s.points[0].value <= 100));

  // ── 8) 그래프 없이/텍스트로만 → chart artifact 없음 ──
  const bS = run({ message: '2024년 7월 상품별 매출 순위 그래프 없이 텍스트로만 알려줘', orders: ordersB });
  ok('8. suppress: handled + artifact 없음 + suppressChart=true', !!bS && bS.handled && !bS.artifact && bS.suppressChart === true);
  ok('8. suppress: 텍스트 답변은 정상(순위 포함)', !!bS && /가습기/.test(bS.reply));

  // ── 9) unsupported: ROAS / 전환율 → fake 없이 + 대체 분석 제안, 차트 없음 ──
  const b4 = run({ message: 'ROAS 비교해줘', orders: ordersB });
  ok('9a. ROAS unsupported(차트 없음, fake 없음)', !!b4 && b4.handled && b4.suppressChart === true && !b4.artifact && /ROAS|광고/.test(b4.reply));
  ok('9a. 대체 분석 제안 포함', !!b4 && /매출|주문수|객단가|순위|비중/.test(b4.reply));
  const b5 = run({ message: '방문자 대비 전환율 알려줘', orders: ordersB });
  ok('9b. 전환율 unsupported(차트 없음)', !!b5 && b5.handled && b5.suppressChart === true && !b5.artifact && /전환율|방문자|세션/.test(b5.reply));
}

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
