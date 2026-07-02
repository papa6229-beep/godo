#!/usr/bin/env node
/*
 * scripts/smoke-department-analytics-query-layer-v0.mjs
 * Department Analytics Query Layer v0 검증.
 *  - 공통 parser: 기간/차원/집계/비교/월범위 보존
 *  - 공통 executor: 상품 순위/카테고리 비중/추이/기간 필터 (상품 라인매출 gross 기준)
 *  - 대시보드=채팅 계산 parity: aggregateProductRanking == executor 결과
 *  - 행동 보존: ProductTeamDashboard가 추출 함수를 import (인라인 aggregateProducts 제거)
 *  - fallback: 월 미지정 순위 = 전체 기간 / unsupported(ROAS)는 fake 없이 안내
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const has = (rel) => existsSync(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
console.log('=== Department Analytics Query Layer v0 smoke ===');

// ── 정적 파일 존재/구조 ──
ok('analyticsQueryTypes.ts 존재', has('src/services/analyticsQueryTypes.ts'));
ok('analyticsQueryParser.ts 존재', has('src/services/analyticsQueryParser.ts'));
ok('analyticsQueryExecutor.ts 존재', has('src/services/analyticsQueryExecutor.ts'));
ok('productSalesAggregation.ts 존재', has('src/services/productSalesAggregation.ts'));
ok('analyticsQueryToMarketingPlan.ts(adapter stub) 존재', has('src/services/analyticsQueryToMarketingPlan.ts'));

const DASH = read('src/components/ProductTeamDashboard.tsx');
ok('대시보드가 productSalesAggregation import', /from '\.\.\/services\/productSalesAggregation'/.test(DASH));
ok('대시보드 인라인 aggregateProducts 제거됨', !/const aggregateProducts = \(/.test(DASH));
const PF = read('src/services/productTeamChatFacts.ts');
ok('상품팀 채팅이 parseAnalyticsQuery/executeAnalyticsQuery 사용', /parseAnalyticsQuery/.test(PF) && /executeAnalyticsQuery/.test(PF));
const ADP = read('src/services/analyticsQueryToMarketingPlan.ts');
ok('adapter stub는 수렴 방향(TODO) 표식 + v0 null', /return null/.test(ADP) && /TODO/.test(ADP));

// ── 런타임 컴파일(tsc) ──
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-aql-'));
let P = null, X = null;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'productTeamChatFacts.ts'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'],
    { stdio: 'pipe', cwd: os.tmpdir() });
  for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
    const p = path.join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  P = await import(pathToFileURL(path.join(tmp, 'analyticsQueryParser.js')).href);
  X = await import(pathToFileURL(path.join(tmp, 'analyticsQueryExecutor.js')).href);
} catch (e) { console.error('[smoke] compile failed:', e.stdout?.toString() || e.message); }

ok('parser/executor 런타임 로드', !!P?.parseAnalyticsQuery && !!X?.executeAnalyticsQuery);

if (P && X) {
  const { parseAnalyticsQuery } = P;
  const { executeAnalyticsQuery } = X;

  // ── 1) parser: 특정월 + 상품순위 ──
  const q1 = parseAnalyticsQuery('2024년 7월 상품별 매출 순위', { team: 'product' });
  ok('q1 period=singleMonth 2024-07', q1.period.type === 'singleMonth' && q1.period.year === 2024 && q1.period.month === 7);
  ok('q1 dimension=product & aggregation=rank & sort=desc', q1.dimension === 'product' && q1.aggregation === 'rank' && q1.sort === 'desc');
  ok('q1 metric=revenue', q1.metric === 'revenue');

  // ── 2) parser: 일 범위 + "가장 많이 판매된" ──
  const q2 = parseAnalyticsQuery('2024년 7월 1일부터 7월 31일까지 가장 많이 판매된 상품', { team: 'product' });
  ok('q2 period=dayRange 2024-07-01~2024-07-31', q2.period.type === 'dayRange' && q2.period.startDate === '2024-07-01' && q2.period.endDate === '2024-07-31');
  ok('q2 dimension=product & rank & topN=1', q2.dimension === 'product' && q2.aggregation === 'rank' && q2.topN === 1);

  // ── 3) parser: 다연도 + 월범위 + 월별 → 12개월 확장 금지 ──
  const q3 = parseAnalyticsQuery('2024년과 2025년 1월부터 5월까지 월별 매출 비교', { team: 'product' });
  ok('q3 monthRange 1~5 보존(12개월 확장 아님)', q3.period.type === 'monthRange' && q3.period.startMonth === 1 && q3.period.endMonth === 5);
  ok('q3 years=[2024,2025] 보존', Array.isArray(q3.period.years) && q3.period.years.includes(2024) && q3.period.years.includes(2025));
  ok('q3 comparison=monthlyTrend & metric=revenue', q3.comparison === 'monthlyTrend' && q3.metric === 'revenue');

  // ── 데이터셋(결정적) ──
  const line = (goodsNo, goodsName, quantity, lineRevenue, categoryCode) => ({ goodsNo, goodsName, quantity, lineRevenue, categoryCode, categoryLabel: categoryCode });
  const order = (orderNo, orderDate, lines) => ({ orderNo, orderDate, sourceType: 'synthetic_test', deliveryFee: 0, totalAmount: lines.reduce((s, l) => s + l.lineRevenue, 0), productRevenueByLines: lines.reduce((s, l) => s + l.lineRevenue, 0), paid: true, unpaid: false, confirmed: true, canceled: false, lines });
  const orders = [
    order('A', '2024-07-05 10:00:00', [line('G1', '선풍기', 2, 20000, '001')]),
    order('B', '2024-07-10 11:00:00', [line('G2', '가습기', 1, 50000, '003')]),
    order('C', '2024-07-20 12:00:00', [line('G1', '선풍기', 1, 10000, '001'), line('G3', '청소기', 1, 15000, '001')]),
    order('E', '2024-04-10 09:00:00', [line('G2', '가습기', 1, 30000, '003')]),
    order('D', '2025-03-15 09:00:00', [line('G1', '선풍기', 5, 100000, '001')])
  ];
  const dataset = { orders };

  // ── 4) executor: 2024-07 상품 순위 (기간 필터 + gross 라인매출) ──
  const r1 = executeAnalyticsQuery(parseAnalyticsQuery('2024년 7월 상품별 매출 순위', { team: 'product' }), dataset);
  ok('r1 handled', !!r1 && !r1.unsupported);
  ok('r1 top = 가습기 50000 (7월만, 2025 제외)', !!r1 && r1.rows[0]?.label === '가습기' && r1.rows[0]?.revenue === 50000);
  ok('r1 순위 = 가습기>선풍기(30000)>청소기(15000)', !!r1 && r1.rows[1]?.label === '선풍기' && r1.rows[1]?.revenue === 30000 && r1.rows[2]?.label === '청소기');
  ok('r1 요약에 기간(7월) 명시 & 총매출로 축소 안 함', !!r1 && /7월/.test(r1.summaryText) && /가습기/.test(r1.summaryText));

  // ── 5) 대시보드=채팅 parity: aggregateProductRanking(July) == executor ──
  // (대시보드가 동일 함수를 쓰므로, 함수 결과가 executor 결과와 일치하면 화면=채팅 값 일치)
  const AGG = await import(pathToFileURL(path.join(tmp, 'productSalesAggregation.js')).href);
  const julyOrders = AGG.filterProductOrdersByPeriod(orders, { start: '2024-07-01', end: '2024-07-31', source: 'all' });
  const julyMap = AGG.aggregateProductRanking(julyOrders, 'all');
  const g2 = julyMap.get('G2');
  ok('parity: 서비스 집계 가습기 매출 50000 (대시보드 계산 기준 동일)', g2?.revenue === 50000 && g2?.quantity === 1);
  ok('parity: executor top revenue == 서비스 집계 top revenue', !!r1 && r1.rows[0]?.revenue === g2?.revenue);

  // ── 6) 카테고리 비중 기간 필터 (2024 3~5월 = order E만 → 003 100%) ──
  const r2 = executeAnalyticsQuery(parseAnalyticsQuery('2024년 3월부터 5월까지 카테고리별 매출 비중 보여줘', { team: 'product' }), dataset);
  ok('r2 handled(category share)', !!r2 && !r2.unsupported && r2.query.dimension === 'category');
  ok('r2 3~5월만 반영(code=003 단일, 001 없음)', !!r2 && r2.rows.length === 1 && r2.rows[0].key === '003' && r2.rows[0].revenue === 30000);

  // ── 6-b) 표시 정합성: label=표시명, raw code 미노출, 공유 formatter ──
  const DISP = await import(pathToFileURL(path.join(tmp, 'productCategoryDisplay.js')).href);
  const rCat = executeAnalyticsQuery(parseAnalyticsQuery('2024년 7월 카테고리별 매출 비중 보여줘', { team: 'product' }), dataset);
  // July 2024: 003=50000, 001=45000(20000+10000+15000), total=95000 → 003 52.6%, 001 47.4%
  ok('rCat label=표시명(주방가전/생활가전), raw code 미노출',
    !!rCat && rCat.rows[0].label === '주방가전' && rCat.rows[1].label === '생활가전' && !rCat.rows.some((r) => /^\d{3}$/.test(r.label)));
  ok('rCat key/metadata에 code 보존', !!rCat && rCat.rows[0].key === '003' && rCat.rows[0].metadata?.categoryCode === '003');
  ok('rCat summary에 raw code 없음 & 표시명 사용', !!rCat && !/00[13]/.test(rCat.summaryText) && /주방가전/.test(rCat.summaryText));
  // 공유 formatter == 대시보드 pctStr((n*100).toFixed(1)+'%')
  ok('formatSharePercent 대시보드와 동일 포맷', DISP.formatSharePercent(0.5263) === '52.6%' && DISP.formatSharePercent(0.474) === '47.4%');
  ok('rCat 비중이 공유 formatter로 표기(52.6%/47.4%)',
    !!rCat && DISP.formatSharePercent(rCat.rows[0].share) === '52.6%' && DISP.formatSharePercent(rCat.rows[1].share) === '47.4%');
  ok('categoryDisplayName(uncategorized)=미분류', DISP.categoryDisplayName('uncategorized') === '미분류');

  // ── 7) fallback: 월 미지정 상품 순위 = 전체 기간 (G1 130000 최상위) ──
  const r3 = executeAnalyticsQuery(parseAnalyticsQuery('상품별 매출 순위 알려줘', { team: 'product' }), dataset);
  ok('r3 전체 기간 순위 top = 선풍기 130000', !!r3 && r3.rows[0]?.label === '선풍기' && r3.rows[0]?.revenue === 130000);
  ok('r3 periodLabel=전체 기간', !!r3 && r3.periodLabel === '전체 기간');

  // ── 8) unsupported: ROAS는 fake 없이 안내 ──
  const q4 = parseAnalyticsQuery('ROAS 비교해줘', { team: 'product' });
  const r4 = executeAnalyticsQuery(q4, dataset);
  ok('q4 unsupportedReason 세팅', !!q4.unsupportedReason);
  ok('r4 unsupported=true & rows 비어있음(fake 없음)', !!r4 && r4.unsupported === true && r4.rows.length === 0);

  // ── 9) not-handled: 미지원 team/dimension은 null(fallback) ──
  const r5 = executeAnalyticsQuery(parseAnalyticsQuery('쿠폰 사용 매출', { team: 'product' }), dataset);
  ok('r5 reserved dimension(coupon) → null(fallback)', r5 === null);
  const r6 = executeAnalyticsQuery({ ...q1, team: 'cs' }, dataset);
  ok('r6 team=cs → null(fallback)', r6 === null);

  // ── 10) 추이(trend) 기간 필터 ──
  const r7 = executeAnalyticsQuery(parseAnalyticsQuery('2024년 상품 매출 월별 추이 보여줘', { team: 'product' }), dataset);
  ok('r7 handled(trend)', !!r7 && !r7.unsupported && r7.query.aggregation === 'trend');
  ok('r7 2024년만(2025-03 100000 제외 → 4월/7월 값만)', !!r7 && r7.rows.every((x) => /^\d+월$/.test(x.label)) && r7.rows.reduce((s, x) => s + (x.revenue || 0), 0) === 125000);
}

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
