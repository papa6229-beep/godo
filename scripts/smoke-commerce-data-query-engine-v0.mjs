#!/usr/bin/env node
/*
 * scripts/smoke-commerce-data-query-engine-v0.mjs
 * Commerce Data Query Engine v0 — 단일 조회·계산 엔진.
 *  이해(LLM/deterministic)→실행(코드). 읽고·필터·묶고·합/카운트/나누기/비중/최고·최저/비교, 없으면 없다.
 *  질문 초점만 답(종합덤프 없음), 열린 질문(왜/전략)은 null(→ 기존 경로).
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
console.log('=== Commerce Data Query Engine v0 smoke ===');

ok('commerceDataQueryEngine.ts 존재', has('src/services/commerceDataQueryEngine.ts'));
ok('DepartmentWorkspacePanel이 answerCommerceQuestion 엔진-우선 사용', /answerCommerceQuestion/.test(read('src/components/DepartmentWorkspacePanel.tsx')));

const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-cdq-'));
let E = null;
try {
  execFileSync(process.execPath, [tscBin, path.join(REPO, 'src', 'services', 'commerceDataQueryEngine.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe', cwd: os.tmpdir() });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  E = await import(pathToFileURL(path.join(tmp, 'commerceDataQueryEngine.js')).href);
} catch (e) { console.error('[smoke] compile failed:', e.stdout?.toString() || e.message); }

ok('엔진 런타임 로드', !!E?.answerCommerceQuestion && !!E?.executeCommerceDataQuery);

if (E) {
  const answer = E.answerCommerceQuestion;   // (message, dataset, {callLlm,team}) → Promise<res|null>
  const exec = E.executeCommerceDataQuery;   // (query, dataset) → res|null

  // 월별 매출 dataset: 2024 m→m*100000(최고 12월), 2025 m→(13-m)*90000(최고 1월, 최저 12월 90000). 통틀어 최고=2024-12, 최저=2025-12.
  const mkOrder = (y, m, amt) => ({ orderNo: `${y}${m}`, orderDate: `${y}-${String(m).padStart(2, '0')}-15 10:00:00`, sourceType: 'synthetic_test', paid: true, canceled: false, totalAmount: amt, lines: [{ goodsNo: 'G1', goodsName: '상품', quantity: 1, lineRevenue: amt, categoryCode: '001' }] });
  const orders = [];
  for (let m = 1; m <= 12; m++) orders.push(mkOrder(2024, m, m * 100000));
  for (let m = 1; m <= 12; m++) orders.push(mkOrder(2025, m, (13 - m) * 90000));
  const ds = { orders };

  // ── extremes: 통틀어 최고/최저 딱 2개 ──
  const a1 = await answer('2024년과 2025년 통틀어 매출이 가장 높았던 달과 낮았던 달을 비교해줘', ds, {});
  ok('extremes handled', !!a1 && a1.handled);
  ok('extremes 최고=2024년 12월 · 최저=2025년 12월', !!a1 && /최고: 2024년 12월/.test(a1.reply) && /최저: 2025년 12월/.test(a1.reply));
  ok('extremes 차이 표기 + 종합덤프 없음(카테고리/고객/쿠폰 X)', !!a1 && /차이:/.test(a1.reply) && !/카테고리 관찰|고객 관찰|쿠폰\/채널/.test(a1.reply));
  ok('extremes 차트=2개 항목(최고·최저)', !!a1 && !!a1.artifact && a1.artifact.chartSpec.series.length === 2);

  // ── argmax/argmin 단일연도 ──
  const a2 = await answer('2025년 중 매출이 가장 높았던 달은?', ds, {});
  ok('argmax 2025 최고=1월(1,080,000원)', !!a2 && a2.handled && /1월/.test(a2.reply) && /1,080,000/.test(a2.reply));
  const a3 = await answer('2024년 중 매출이 가장 낮았던 달은?', ds, {});
  ok('argmin 2024 최저=1월(100,000원)', !!a3 && a3.handled && /1월/.test(a3.reply) && /100,000/.test(a3.reply));

  // ── trend ──
  const a4 = await answer('2025년 월별 매출 추이 보여줘', ds, {});
  ok('trend handled + 차트 line(세로 combo) 12점', !!a4 && a4.handled && !!a4.artifact && a4.artifact.chartSpec.chartType === 'line' && a4.artifact.chartSpec.series[0].points.length === 12);

  // ── 없으면 없다 ──
  const a5 = await answer('2030년 매출 알려줘', ds, {});
  ok('없는 기간 → "데이터가 없습니다"(거짓말/전체합 아님)', !!a5 && a5.handled && /없습니다/.test(a5.reply) && !/99,|88,|전체/.test(a5.reply));

  // ── unsupported ──
  const a6 = await answer('ROAS 알려줘', ds, {});
  ok('ROAS → unsupported(fake 없음) + 대체 안내', !!a6 && a6.handled && !a6.artifact && /ROAS|광고/.test(a6.reply) && /매출|주문수|객단가/.test(a6.reply));

  // ── 열린 질문은 엔진이 안 잡음(null → 기존 경로) ──
  const a7 = await answer('왜 3월 매출이 떨어졌어?', ds, {});
  ok('열린 질문(왜) → null(엔진 미처리)', a7 === null);
  const a8 = await answer('마케팅 전략 제안해줘', ds, {});
  ok('열린 질문(전략) → null', a8 === null);

  // ── 상품/카테고리 dataset ──
  const L = (g, n, q, r, c) => ({ goodsNo: g, goodsName: n, quantity: q, lineRevenue: r, categoryCode: c });
  const O = (no, d, memberGroupName, lines) => ({ orderNo: no, orderDate: d, sourceType: 'synthetic_test', paid: true, canceled: false, memberGroupName, discountSummary: { hasCoupon: no === 'B' }, totalAmount: lines.reduce((s, l) => s + l.lineRevenue, 0), lines });
  const dsP = { orders: [
    O('A', '2024-07-05 10:00:00', 'VIP', [L('G1', '선풍기', 2, 20000, '001')]),
    O('B', '2024-07-10 10:00:00', 'VIP', [L('G2', '가습기', 1, 50000, '003')]),
    O('C', '2024-07-20 10:00:00', '신규회원', [L('G1', '선풍기', 1, 10000, '001'), L('G3', '청소기', 1, 15000, '001')]),
    O('F', '2024-07-25 10:00:00', '신규회원', [L('G4', '공기청정기', 1, 25000, '006')])
  ] };
  // July: 가습기50000, 선풍기30000, 공기청정기25000, 청소기15000. 카테고리 003=50000,001=45000,006=25000.
  const p1 = await answer('2024년 7월 상품별 매출 순위 알려줘', dsP, {});
  ok('product rank 1위=가습기, 차트 항목당1', !!p1 && p1.handled && /1위 가습기/.test(p1.reply) && p1.artifact.chartSpec.series[0].label === '가습기');
  const p2 = await answer('2024년 7월 카테고리별 매출 비중 보여줘', dsP, {});
  ok('category share: 표시명(주방가전) · raw code 미노출 · %', !!p2 && p2.handled && /주방가전/.test(p2.reply) && !/00[136]/.test(p2.reply) && /%/.test(p2.reply));

  // ── 다중 조건 필터(직접 query 주입: LLM이 filters를 채운 경우) ──
  const q = { originalQuestion: 'x', team: 'marketing', metric: 'revenue', dimension: 'time', aggregation: 'summarize', comparison: 'none', period: { type: 'singleMonth', year: 2024, month: 7 }, filters: { memberGroup: 'VIP' }, chartRequested: false, chartSuppressed: true, tableRequested: false, confidence: 'high' };
  const f1 = exec(q, dsP, {});
  ok('filter(VIP) 적용: VIP 매출 70000(선풍기20000+가습기50000)만', !!f1 && f1.handled && /70,000/.test(f1.reply));

  // ── 다연도 월범위(1~5월) 필터 보존 ──
  const a9 = await answer('2024년과 2025년 1월부터 5월까지 월별 매출 비교해줘', ds, {});
  ok('다연도 1~5월: 6월 이상 미포함(월범위 보존)', !!a9 && a9.handled && !!a9.artifact && a9.artifact.chartSpec.series[0].points.every((p) => { const mm = Number(String(p.bucketKey).slice(5, 7)); return mm >= 1 && mm <= 5; }));
}

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
