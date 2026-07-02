#!/usr/bin/env node
/*
 * scripts/smoke-marketing-analytics-query-bridge-v0.mjs
 * Marketing General Analytics Query Engine v0 (+ 기존 bridge 회귀).
 *  - 이해=LLM(understandMarketingQuery)·검증=코드(validateAnalyticsQueryJson)·계산=코드·fallback=deterministic
 *  - time × metric × {trend, argmax, argmin} 일반 실행 (net 재사용)
 *  - product rank / category share / unsupported / monthRange 보존 / broad-scope 미유출
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const has = (rel) => existsSync(path.join(REPO, rel));
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Marketing General Analytics Query Engine v0 smoke ===');

ok('marketingAnalyticsQueryBridge.ts 존재', has('src/services/marketingAnalyticsQueryBridge.ts'));
ok('LLM query compiler 파일 존재', has('src/services/marketingAnalyticsQueryCompilerLlm.ts'));
ok('time×metric executor 파일 존재', has('src/services/marketingTimeMetricExecutor.ts'));
ok('bridge가 이해=LLM(understandMarketingQuery) 사용', /understandMarketingQuery/.test(read('src/services/marketingAnalyticsQueryBridge.ts')));
ok('bridge async + callLlm 파라미터', /async function runMarketingAnalyticsQueryBridge/.test(read('src/services/marketingAnalyticsQueryBridge.ts')) && /callLlm/.test(read('src/services/marketingAnalyticsQueryBridge.ts')));
ok('LLM compiler: 숫자 결과 키 reject 가드', /FORBIDDEN_RESULT_KEYS/.test(read('src/services/marketingAnalyticsQueryCompilerLlm.ts')));
ok('DepartmentWorkspacePanel이 bridge를 await + callLlm 전달', /await runMarketingAnalyticsQueryBridge/.test(read('src/components/DepartmentWorkspacePanel.tsx')) && /callLlm: callMarketingPlannerLlm/.test(read('src/components/DepartmentWorkspacePanel.tsx')));

// ── 런타임 컴파일 ──
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-bridge-'));
const tmp2 = mkdtempSync(path.join(os.tmpdir(), 'godo-mkt-route-'));
let B = null, R = null, C = null;
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'marketingAnalyticsQueryBridge.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  B = await import(pathToFileURL(path.join(tmp, 'marketingAnalyticsQueryBridge.js')).href);
  C = await import(pathToFileURL(path.join(tmp, 'marketingAnalyticsQueryCompilerLlm.js')).href);
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
ok('LLM compiler 런타임 로드', !!C?.understandMarketingQuery && !!C?.validateAnalyticsQueryJson);
ok('resolveMarketingChartRoute 로드', !!R?.resolveMarketingChartRoute);

if (B && C) {
  const run = B.runMarketingAnalyticsQueryBridge;
  const route = R.resolveMarketingChartRoute;
  const { understandMarketingQuery, validateAnalyticsQueryJson } = C;

  // ── 데이터셋 1: 2024·2025년 1~7월, 각 (연,월) 주문 1건 (월범위 비교용) ──
  const orders = [];
  for (const y of [2024, 2025]) for (let m = 1; m <= 7; m++) {
    orders.push({ orderNo: `${y}-${m}`, orderDate: `${y}-${String(m).padStart(2, '0')}-15 10:00:00`, sourceType: 'synthetic_test', paid: true, canceled: false, unpaid: false, confirmed: true, totalAmount: m * 1000, productRevenueByLines: m * 1000, lines: [{ goodsNo: 'G1', goodsName: '상품', quantity: 1, lineRevenue: m * 1000, categoryCode: '001', categoryLabel: '001' }] });
  }
  // ── 데이터셋 2: 2025년 월별 변동(argmax/argmin 판별용) ──
  //  1월: 2건(60000+40000)→rev100000/AOV50000, 2월:1건 90000→AOV90000(최고), 3월:5건×10000→rev50000/주문5(최다)/AOV10000(최저), 4월:1건 30000
  const O2 = (mm, amts) => amts.map((a, i) => ({ orderNo: `25${mm}-${i}`, orderDate: `2025-${String(mm).padStart(2, '0')}-15 10:00:00`, sourceType: 'synthetic_test', paid: true, canceled: false, unpaid: false, confirmed: true, totalAmount: a, productRevenueByLines: a, lines: [{ goodsNo: 'G1', goodsName: '상품', quantity: 1, lineRevenue: a, categoryCode: '001', categoryLabel: '001' }] }));
  const orders2025 = [...O2(1, [60000, 40000]), ...O2(2, [90000]), ...O2(3, [10000, 10000, 10000, 10000, 10000]), ...O2(4, [30000])];

  // ── LLM compiler / validator (검증=코드) ──
  const vBad = validateAnalyticsQueryJson({ metric: 'averageOrderValue', dimension: 'time', aggregation: 'argmax', period: { type: 'year', year: 2025 }, value: 90000 }, 'q', 'marketing');
  ok('validator: 숫자 결과 키(value) 포함 → reject(null)', vBad === null);
  const vEnum = validateAnalyticsQueryJson({ metric: 'nope', dimension: 'time', aggregation: 'argmax', period: { type: 'year' } }, 'q', 'marketing');
  ok('validator: 허용 안 된 metric → reject(null)', vEnum === null);
  const vOk = validateAnalyticsQueryJson({ metric: 'averageOrderValue', dimension: 'time', aggregation: 'argmax', period: { type: 'year', year: 2025 } }, 'q', 'marketing');
  ok('validator: 정상 JSON → AnalyticsQuery', !!vOk && vOk.metric === 'averageOrderValue' && vOk.aggregation === 'argmax' && vOk.period.year === 2025);
  const vRoas = validateAnalyticsQueryJson({ metric: 'revenue', dimension: 'time', aggregation: 'summarize', period: { type: 'all' } }, 'ROAS 알려줘', 'marketing');
  ok('validator: 메시지가 ROAS → unsupported 강제', !!vRoas && !!vRoas.unsupportedReason);

  // understand: deterministic fallback(키 없음) + LLM(mock) 경로
  const qDet = await understandMarketingQuery('2025년 중 객단가 제일 쎈 달이 언제야?', {});
  ok('understand(fallback): argmax + time + AOV', qDet.dimension === 'time' && qDet.aggregation === 'argmax' && qDet.metric === 'averageOrderValue');
  const mockLlm = async () => JSON.stringify({ metric: 'revenue', dimension: 'time', aggregation: 'argmin', period: { type: 'year', year: 2025 } });
  const qLlm = await understandMarketingQuery('아무 표현이나', { callLlm: mockLlm });
  ok('understand(LLM mock): JSON 채택', qLlm.aggregation === 'argmin' && qLlm.metric === 'revenue');
  const badLlm = async () => JSON.stringify({ metric: 'revenue', dimension: 'time', aggregation: 'argmax', period: { type: 'year', year: 2025 }, total: 123 });
  const qReject = await understandMarketingQuery('2025년 매출 가장 높은 달', { callLlm: badLlm });
  ok('understand(LLM 숫자결과) → reject 후 deterministic fallback', qReject.aggregation === 'argmax' && qReject.dimension === 'time' && qReject.metric === 'revenue');

  // ── time × metric × argmax/argmin/trend (Stage 1 핵심) ──
  const t1 = await run({ message: '2025년 중 가장 객단가가 높았던 달은 몇월인지 알려줘', orders: orders2025 });
  ok('T1 handled(broad로 안 샘)', !!t1 && t1.handled);
  ok('T1 객단가 최고 달=2월 먼저 답변(종합덤프 아님)', !!t1 && /2월/.test(t1.reply) && /가장 높았던 달은 2월/.test(t1.reply) && !/카테고리 관찰|문의\/리뷰 신호/.test(t1.reply));
  ok('T1 차트 존재(월별)', !!t1 && !!t1.artifact?.chartSpec && t1.artifact.chartSpec.series[0].points.length === 12);

  const t2 = await run({ message: '2025년 중 객단가 제일 쎈 달이 언제야?', orders: orders2025 });
  ok('T2 표현 변형(제일 쎈) → 2월', !!t2 && t2.handled && /2월/.test(t2.reply));
  const t3 = await run({ message: '2025년 AOV가 피크였던 월 알려줘', orders: orders2025 });
  ok('T3 표현 변형(AOV 피크) → 2월', !!t3 && t3.handled && /2월/.test(t3.reply));

  const t4 = await run({ message: '2025년 중 매출이 가장 높았던 달은?', orders: orders2025 });
  ok('T4 매출 최고 달=1월(100,000원)', !!t4 && t4.handled && /1월/.test(t4.reply) && /100,000/.test(t4.reply));
  const t5 = await run({ message: '2025년 중 주문수가 가장 낮았던 달은?', orders: orders2025 });
  ok('T5 주문수 최저(활성월 중)=2월', !!t5 && t5.handled && /2월/.test(t5.reply) && /가장 낮았던/.test(t5.reply));
  const t6b = await run({ message: '2025년 중 객단가가 가장 낮았던 달도 알려줘', orders: orders2025 });
  ok('T6 객단가 최저 달=3월(10,000원)', !!t6b && t6b.handled && /3월/.test(t6b.reply));

  const t7 = await run({ message: '2025년 월별 객단가 추이 그래프로 보여줘', orders: orders2025 });
  ok('T7 trend: handled + 12개월 차트', !!t7 && t7.handled && !!t7.artifact && t7.artifact.chartSpec.series[0].points.length === 12);
  ok('T7 route=groupedBar(월별 추이)', !!t7 && route(t7.artifact.chartSpec) === 'groupedBar');
  const t7keys = t7?.artifact?.chartSpec?.series[0]?.points?.map((p) => p.bucketKey) ?? [];
  ok('T7 bucketKey 2자리 패딩 & 월 순서 1→12(사전식 정렬 어긋남 방지)', t7keys.join(',') === '01,02,03,04,05,06,07,08,09,10,11,12');

  // ── 다연도 월범위 월별 비교(기존 stage-a, 이제 time executor 경로) ──
  const r1 = await run({ message: '2024년과 2025년 1월부터 5월까지의 월별 매출을 그래프로 비교해줘', orders });
  const cs1 = r1?.artifact?.chartSpec;
  ok('R1 handled + groupedBar + series 2', !!r1 && r1.handled && cs1?.chartType === 'groupedBar' && cs1.series.length === 2);
  ok('R1 각 series 5개월(1~5월)만, 6~12월 없음', !!cs1 && cs1.series.every((s) => s.points.length === 5 && s.points[0].bucketLabel === '1월' && s.points[4].bucketLabel === '5월'));
  ok('R1 값(2024 3월=3000, 5월=5000) + 제목 1~5월', !!cs1 && cs1.series[0].points[2].value === 3000 && cs1.series[0].points[4].value === 5000 && /1~5월/.test(cs1.title));
  const r2 = await run({ message: '2024년과 2025년 1~5월 주문수 월별 비교해줘', orders });
  ok('R2 orderCount unit=count, 5개월', !!r2 && r2.artifact.chartSpec.unit === 'count' && r2.artifact.chartSpec.series[0].points.length === 5);
  const r3 = await run({ message: '2024년과 2025년 1~5월 객단가 월별 비교해줘', orders });
  ok('R3 AOV weighted(3월=3000), 5개월', !!r3 && r3.artifact.chartSpec.series[0].points.length === 5 && r3.artifact.chartSpec.series[0].points[2].value === 3000);

  // ── broad-scope 미유출 / narrow fallback ──
  const n1 = await run({ message: '2024년 7월 매출 알려줘', orders });         // 단일월 요약 → 기존 경로(null)
  ok('N1 단일월 요약 → null(기존 compiler로)', n1 === null);
  const n2 = await run({ message: '2024년 3월~5월과 2025년 3월~5월 매출 비교해줘', orders }); // 비월별 yearOverYear
  ok('N2 비월별 기간비교 → null(기존 compiler)', n2 === null);
  const n3 = await run({ message: '쿠폰 사용 vs 미사용 객단가 비교', orders });     // 세그먼트(Stage1 제외)
  ok('N3 세그먼트 비교 → null(기존)', n3 === null);
  const c12 = await run({ message: '2024년과 2025년 월별 매출 비교해줘', orders }); // 다연도 전체월 trend → time executor가 처리(broad 아님)
  ok('C12 다연도 12개월 월별 → time executor가 처리(broad 미유출)', !!c12 && c12.handled && c12.artifact.chartSpec.series.length === 2 && c12.artifact.chartSpec.series[0].points.length === 12);

  // ── Stage(b) 데이터셋: 2024년 7월 상품/카테고리(3종) ──
  const L = (goodsNo, goodsName, quantity, lineRevenue, categoryCode) => ({ goodsNo, goodsName, quantity, lineRevenue, categoryCode, categoryLabel: categoryCode });
  const O = (orderNo, orderDate, lines) => ({ orderNo, orderDate, sourceType: 'synthetic_test', paid: true, canceled: false, unpaid: false, confirmed: true, totalAmount: lines.reduce((s, l) => s + l.lineRevenue, 0), productRevenueByLines: lines.reduce((s, l) => s + l.lineRevenue, 0), lines });
  const ordersB = [
    O('A', '2024-07-05 10:00:00', [L('G1', '선풍기', 2, 20000, '001')]),
    O('B', '2024-07-10 11:00:00', [L('G2', '가습기', 1, 50000, '003')]),
    O('C', '2024-07-20 12:00:00', [L('G1', '선풍기', 1, 10000, '001'), L('G3', '청소기', 1, 15000, '001')]),
    O('F', '2024-07-25 12:00:00', [L('G4', '공기청정기', 1, 25000, '006')]),
    O('D', '2025-03-15 09:00:00', [L('G1', '선풍기', 5, 100000, '001')])
  ];

  // ── product rank ──
  const b1 = await run({ message: '2024년 7월 매출 중 가장 많이 판매된 상품이 뭐야?', orders: ordersB });
  ok('P1 handled + route rankedBar + series 4(항목당1)', !!b1 && b1.handled && route(b1.artifact.chartSpec) === 'rankedBar' && b1.artifact.chartSpec.series.length === 4);
  ok('P1 매출1위=가습기, 수량1위=선풍기 병기', !!b1 && /매출 기준 1위: 가습기/.test(b1.reply) && /판매수량 기준 1위: 선풍기/.test(b1.reply));
  ok('P1 point.quantity>0 & orderCount 실계산(0 아님)', !!b1 && b1.artifact.chartSpec.series[0].points[0].quantity === 1 && b1.artifact.chartSpec.series[0].points[0].orderCount === 1);
  const b2 = await run({ message: '2024년 7월 상품별 매출 순위 그래프로 보여줘', orders: ordersB });
  ok('P2 순위 가습기>선풍기>공기청정기>청소기', !!b2 && b2.artifact.chartSpec.series[0].label === '가습기' && b2.artifact.chartSpec.series[1].label === '선풍기' && b2.artifact.chartSpec.series[2].label === '공기청정기');

  // ── category share (percent 메인) ──
  const b3 = await run({ message: '2024년 7월 카테고리별 매출 비중 보여줘', orders: ordersB });
  ok('C1 handled + route rankedBar + series 3', !!b3 && b3.handled && route(b3.artifact.chartSpec) === 'rankedBar' && b3.artifact.chartSpec.series.length === 3);
  ok('C1 unit=percent + value=share%(주방가전 41.7) + revenue 보존', !!b3 && b3.artifact.chartSpec.unit === 'percent' && b3.artifact.chartSpec.series[0].points[0].value === 41.7 && b3.artifact.chartSpec.series[0].points[0].revenue === 50000);
  ok('C1 표시명(주방가전/생활가전), raw code 미노출', !!b3 && b3.artifact.chartSpec.series.every((s) => !/^\d{3}$/.test(s.label)) && !/00[136]/.test(b3.reply));

  // ── 그래프 억제 / unsupported ──
  const bS = await run({ message: '2024년 7월 상품별 매출 순위 그래프 없이 텍스트로만 알려줘', orders: ordersB });
  ok('S 그래프 억제: artifact 없음 + 텍스트', !!bS && bS.handled && !bS.artifact && bS.suppressChart === true && /가습기/.test(bS.reply));
  const u1 = await run({ message: 'ROAS 비교해줘', orders: ordersB });
  ok('U ROAS unsupported(차트 없음, 대체 제안)', !!u1 && u1.handled && !u1.artifact && u1.suppressChart === true && /ROAS|광고/.test(u1.reply) && /매출|주문수|객단가|순위|비중/.test(u1.reply));
  const u2 = await run({ message: '방문자 대비 전환율 알려줘', orders: ordersB });
  ok('U 전환율 unsupported', !!u2 && u2.handled && !u2.artifact && /전환율|방문자|세션/.test(u2.reply));
}

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
