#!/usr/bin/env node
/*
 * scripts/smoke-commerce-query-plan-engine-v0.mjs
 * Commerce Query Plan Engine — 원시연산 조립 계산기(질문별 답변기 아님).
 *  검증 방식: 특정 질문을 맞히는지가 아니라, 원시연산이 일반적으로 조립·실행되는지.
 *   1) LLM(fake)이 자연어를 QueryPlan으로 → 엔진이 실행
 *   2) Validator가 없는 필드/없는 데이터/숫자 생성/미연결 지표를 막는지
 *   3) Executor가 QueryPlan을 일반 실행하는지(직접 plan 주입)
 *   4) groupBy·seriesBy가 임의 축으로 동작하는지(연도/쿠폰/채널/상품…)
 *   5) chartShape가 결과 구조에 맞게 선택되는지(다중series→groupedBar 등)
 *   6) broad 종합덤프로 새지 않는지
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
console.log('=== Commerce Query Plan Engine v0 smoke ===');

ok('commerceQueryPlan.ts(카탈로그) 존재', has('src/services/commerceQueryPlan.ts'));
ok('commerceDataQueryEngine.ts 존재', has('src/services/commerceDataQueryEngine.ts'));

const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-qp-'));
let E = null, C = null;
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'commerceDataQueryEngine.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  E = await import(pathToFileURL(path.join(tmp, 'commerceDataQueryEngine.js')).href);
  C = await import(pathToFileURL(path.join(tmp, 'marketingAnalyticsQueryCompilerLlm.js')).href);
} catch (e) { console.error('[smoke] compile failed:', e.stdout?.toString() || e.message); }

ok('엔진/컴파일러 런타임 로드', !!E?.answerCommerceQuestion && !!E?.executeCommerceQueryPlan && !!C?.validateQueryPlan && !!C?.understandCommerceQuery);

if (E && C) {
  const answer = E.answerCommerceQuestion;         // (msg, dataset, {callLlm,team}) → Promise<res|null>
  const exec = E.executeCommerceQueryPlan;         // (plan, dataset) → res|null
  const validate = C.validateQueryPlan;            // (obj, msg) → QueryPlan|null
  const toPlan = C.analyticsQueryToPlan;           // (aq, nowMs) → QueryPlan

  // 월별 매출: 2024 m→m*100k(최고 12월), 2025 m→(13-m)*90k(최고 1월). 통틀어 최고=2024-12, 최저=2025-12.
  const mkOrder = (y, m, amt, extra = {}) => ({ orderNo: `${y}${m}`, orderDate: `${y}-${String(m).padStart(2, '0')}-15 10:00:00`, paid: true, canceled: false, totalAmount: amt, lines: [{ goodsNo: 'G1', goodsName: '상품', quantity: 1, lineRevenue: amt, categoryCode: '001' }], ...extra });
  const orders = [];
  for (let m = 1; m <= 12; m++) orders.push(mkOrder(2024, m, m * 100000));
  for (let m = 1; m <= 12; m++) orders.push(mkOrder(2025, m, (13 - m) * 90000));
  const ds = { orders };

  // ══ (1) LLM(fake)→QueryPlan→실행 : seriesBy로 다연도 월별 grouped 비교(5·6번 스샷의 정답) ══
  const llmGrouped = async () => JSON.stringify({ metric: 'revenue', groupBy: 'month', seriesBy: 'year', operation: 'trend', filters: { years: [2024, 2025] }, chartRequested: true });
  const g = await answer('2024년과 2025년의 월별 매출을 그래프로 비교해줘', ds, { callLlm: llmGrouped });
  ok('(LLM→plan) grouped 비교 handled', !!g && g.handled);
  ok('(seriesBy) chartShape=groupedBar (세로 grouped 라우트)', !!g?.artifact && g.artifact.chartSpec.chartType === 'groupedBar');
  ok('(seriesBy) series=연도 2개(2024·2025), 각 12개월 정렬', !!g?.artifact && g.artifact.chartSpec.series.length === 2 && g.artifact.chartSpec.series.every((s) => s.points.length === 12));
  ok('(seriesBy) 24개 한 줄 나열이 아님(단일 series 아님)', !!g?.artifact && g.artifact.chartSpec.series.length !== 1);

  // AOV 월별 연도 비교(#5) — 지표만 바뀌고 구조 동일해야 함(케이스 코드 아님)
  const llmAov = async () => JSON.stringify({ metric: 'averageOrderValue', groupBy: 'month', seriesBy: 'year', operation: 'trend', filters: { years: [2024, 2025] }, chartRequested: true });
  const gAov = await answer('2024년과 2025년의 월별 객단가를 그래프로 보여줘', ds, { callLlm: llmAov });
  ok('(#5 AOV) 전체합 연도비교가 아니라 월별×연도 grouped', !!gAov?.artifact && gAov.artifact.chartSpec.chartType === 'groupedBar' && gAov.artifact.chartSpec.series.every((s) => s.points.length === 12));

  // ══ (2) Validator: 없는 필드/데이터/숫자생성/미연결 차단 ══
  ok('validator: 숫자결과(value) 넣으면 reject', validate({ metric: 'revenue', operation: 'summarize', value: 12345 }, 'x') === null);
  ok('validator: 없는 metric reject', validate({ metric: 'phaseOfMoon', operation: 'rank' }, 'x') === null);
  ok('validator: notData → null(열린 질문)', validate({ notData: true }, '왜?') === null);
  const vRoas = validate({ metric: 'revenue', operation: 'summarize' }, 'ROAS 알려줘');
  ok('validator: ROAS 요구 → unsupportedReason', !!vRoas && !!vRoas.unsupportedReason);
  const vBadAxis = validate({ metric: 'revenue', groupBy: 'reviewRating', operation: 'rank' }, '매출을 평점별로');
  ok('validator: 지표 소스에 없는 축(매출×평점) → unsupported', !!vBadAxis && !!vBadAxis.unsupportedReason);
  const vGood = validate({ metric: 'revenue', groupBy: 'channel', seriesBy: 'year', operation: 'trend', filters: { years: [2024] } }, '채널별');
  ok('validator: 허용 축(channel/year)은 통과 + filters 파싱', !!vGood && vGood.groupBy === 'channel' && vGood.seriesBy === 'year' && vGood.filters.years[0] === 2024);

  // ══ (3)(4) Executor 일반 실행 + groupBy 임의 축 (직접 plan 주입) ══
  const dsMix = { orders: [
    mkOrder(2024, 3, 30000, { orderChannel: 'pc', memberGroupName: 'VIP', isFirstPurchase: false, discountSummary: { hasCoupon: true } }),
    mkOrder(2024, 3, 10000, { orderChannel: 'mobile', memberGroupName: '신규', isFirstPurchase: true, discountSummary: { hasCoupon: false } }),
    mkOrder(2024, 4, 20000, { orderChannel: 'mobile', memberGroupName: 'VIP', isFirstPurchase: false, discountSummary: { hasCoupon: true } })
  ] };
  const byChannel = exec({ metric: 'revenue', groupBy: 'channel', operation: 'rank', filters: { years: [2024] }, chartRequested: true }, dsMix, {});
  ok('(임의 축) groupBy=channel: pc/mobile 2그룹', !!byChannel?.artifact && byChannel.artifact.chartSpec.series.length === 2);
  const byCoupon = exec({ metric: 'averageOrderValue', groupBy: 'couponUsed', operation: 'compare', chartRequested: true }, dsMix, {});
  ok('(임의 축) groupBy=couponUsed: 사용/미사용 비교', !!byCoupon?.handled && /쿠폰 사용|쿠폰 미사용/.test(byCoupon.reply));
  const byCust = exec({ metric: 'orderCount', groupBy: 'customerType', operation: 'compare' }, dsMix, {});
  ok('(임의 축) groupBy=customerType: 신규/재구매', !!byCust?.handled && /신규|재구매/.test(byCust.reply));
  // seriesBy 임의 축: 채널 × 쿠폰
  const seriesArb = exec({ metric: 'revenue', groupBy: 'channel', seriesBy: 'couponUsed', operation: 'compare' }, dsMix, {});
  ok('(seriesBy 임의 축) channel × couponUsed grouped', !!seriesArb?.artifact && seriesArb.artifact.chartSpec.chartType === 'groupedBar' && seriesArb.artifact.chartSpec.series.length >= 2);

  // ══ (5) chartShape 정합 ══
  const trend1 = exec({ metric: 'revenue', groupBy: 'month', operation: 'trend', filters: { years: [2025] }, chartRequested: true }, ds, {});
  ok('chartShape: 단일 series 월 추이 → line(세로 combo용), 12점', trend1?.artifact?.chartSpec.chartType === 'line' && trend1.artifact.chartSpec.series[0].points.length === 12);
  const ext1 = exec({ metric: 'revenue', groupBy: 'month', operation: 'extremes', filters: { years: [2024, 2025] }, chartRequested: true }, ds, {});
  ok('chartShape: extremes → 항목 2개(최고·최저)', ext1?.artifact?.chartSpec.series.length === 2 && /최고: 2024년 12월/.test(ext1.reply) && /최저: 2025년 12월/.test(ext1.reply));

  // ══ (6) broad 종합덤프 없음 + 없으면 없다 + 열린 질문 null ══
  ok('종합덤프 없음(extremes에 카테고리/고객/쿠폰 잡설 X)', !!ext1 && !/카테고리 관찰|고객 관찰|쿠폰\/채널|종합/.test(ext1.reply));
  const none = exec({ metric: 'revenue', groupBy: 'month', operation: 'trend', filters: { years: [2030] } }, ds, {});
  ok('없는 기간 → "없습니다"(전체합/거짓 아님)', !!none?.handled && /없습니다/.test(none.reply));
  const open = await answer('왜 3월 매출이 떨어졌어?', ds, {});
  ok('열린 질문(왜) → null(엔진 미처리, 열린 경로로)', open === null);

  // ══ join(교차 지표): 문의 많은 상품 중 매출 높은 상품 ══
  const dsJoin = { orders: [
    { orderNo: 'o1', orderDate: '2024-05-01 10:00:00', paid: true, canceled: false, totalAmount: 50000, lines: [{ goodsNo: 'G2', goodsName: '가습기', quantity: 1, lineRevenue: 50000, categoryCode: '003' }] },
    { orderNo: 'o2', orderDate: '2024-05-02 10:00:00', paid: true, canceled: false, totalAmount: 10000, lines: [{ goodsNo: 'G1', goodsName: '선풍기', quantity: 1, lineRevenue: 10000, categoryCode: '001' }] },
    { orderNo: 'o3', orderDate: '2024-05-03 10:00:00', paid: true, canceled: false, totalAmount: 5000, lines: [{ goodsNo: 'G3', goodsName: '청소기', quantity: 1, lineRevenue: 5000, categoryCode: '001' }] },
    { orderNo: 'o4', orderDate: '2024-05-04 10:00:00', paid: true, canceled: false, totalAmount: 99999, lines: [{ goodsNo: 'G4', goodsName: '건조기', quantity: 1, lineRevenue: 99999, categoryCode: '006' }] }
  ], inquiries: [
    { goodsNo: 'G1', createdAt: '2024-05-01' }, { goodsNo: 'G1', createdAt: '2024-05-02' }, { goodsNo: 'G1', createdAt: '2024-05-03' },
    { goodsNo: 'G3', createdAt: '2024-05-01' }, { goodsNo: 'G3', createdAt: '2024-05-02' },
    { goodsNo: 'G2', createdAt: '2024-05-01' }
  ] };
  const j = exec({ metric: 'inquiryCount', secondaryMetric: 'revenue', groupBy: 'product', operation: 'rank', chartRequested: true }, dsJoin, {});
  ok('(join) 문의 있는 상품만(G4 문의0 제외)', !!j?.handled && !/건조기/.test(j.reply));
  ok('(join) 문의 상위 풀을 매출순 정렬: 1위=가습기(매출50000)', !!j && /1위 가습기/.test(j.reply) && /매출/.test(j.reply) && /문의/.test(j.reply));
  ok('(join) 차트 생성(매출 막대)', !!j?.artifact && j.artifact.chartSpec.series.length >= 3);
  ok('(join) 각 막대에 1차 지표(문의수) 데이터라벨 부착', !!j?.artifact
    && j.artifact.chartSpec.series.every((s) => typeof s.points?.[0]?.secondaryLabel === 'string' && /문의/.test(s.points[0].secondaryLabel))
    && j.artifact.chartSpec.series.some((s) => /가습기/.test(s.label) && /1건/.test(s.points[0].secondaryLabel)));
  const jNo = exec({ metric: 'inquiryCount', operation: 'rank', groupBy: 'product' }, { orders: dsJoin.orders }, {});
  ok('(join) 문의 데이터 없으면 "없다"(허구 금지)', !!jNo?.handled && /문의 데이터/.test(jNo.reply));

  // ══ deterministic 경로(키 미연결)도 다연도 월별 → grouped 로 어댑트 ══
  const aq = { originalQuestion: 'x', team: 'marketing', metric: 'revenue', dimension: 'time', aggregation: 'trend', comparison: 'monthlyTrend', period: { type: 'year', years: [2024, 2025] }, chartRequested: true, confidence: 'high' };
  const p = toPlan(aq, Date.parse('2026-07-02'));
  ok('deterministic 어댑터: 다연도 월별 → groupBy=month + seriesBy=year', p.groupBy === 'month' && p.seriesBy === 'year');
  const detG = exec(p, ds, {});
  ok('deterministic grouped 실행 → groupedBar 2 series', detG?.artifact?.chartSpec.chartType === 'groupedBar' && detG.artifact.chartSpec.series.length === 2);
}

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
