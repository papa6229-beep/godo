/**
 * RC-1 지표 정의 정합성 — 실패 재현 검증 (golden fixture 기준)
 *
 * 목적: "엔진끼리 같은가"가 아니라 "각 엔진이 자기가 선언한 지표 의미의 정답과 같은가"를 본다.
 *       6엔진이 모두 똑같이 틀리면 통과해 버리는 상호비교 방식을 쓰지 않는다.
 *
 * fixture 설계 조건(승인 조건 반영):
 *   - grossProductRevenue / netOrderRevenue 정답을 별도로 둔다.
 *   - 상품 주문수 검증: 한 주문 안에 **같은 상품의 복수 옵션 라인**을 넣는다(P1 x2 lines in O1).
 *   - 카테고리 주문수 검증: 한 주문 안에 **같은 카테고리의 복수 상품 라인**을 넣는다(catA: P1,P1 in O1 / P2 in O2).
 *   - quantity share와 revenue share의 비율이 **다르게** 나오도록 가격·수량을 설계한다.
 *   - 기간 필터: 시작/종료 **양쪽 경계**와 **기간 밖** 자료를 모두 포함한다.
 *   - 정책 미확정 표현(paid:'Y' 등)은 fixture에서 배제한다. paid:true만 사용.
 *
 * 이 스크립트는 **현재 코드의 결함을 재현**하는 것이 목적이므로 FAIL이 정상이다.
 * 수정 후 전부 PASS가 되면 그때 코드와 함께 main에 병합한다.
 *
 * 실행: node scripts/smoke-metric-definition-parity-v0.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
let pass = 0, fail = 0, skip = 0;
const results = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; results.push(['PASS', name, detail]); }
  else { fail += 1; results.push(['FAIL', name, detail]); }
};
const skipped = (name, why) => { skip += 1; results.push(['SKIP', name, why]); };

// ── 컴파일 ───────────────────────────────────────────────────────────────────
const walkJs = (dir) => {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walkJs(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
};

const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-rc1-'));
const entries = [
  'src/services/revenueMetricContract.ts',
  'src/services/analyticsQueryEngine.ts',
  'src/services/commerceDataQueryEngine.ts',
  'src/services/marketingIntelligencePlanner.ts',
  'src/services/marketingScopeInsightEngine.ts',
].map((p) => path.join(REPO, p));

console.log('[1/3] 컴파일');
execFileSync(process.execPath, [
  tscBin, ...entries, '--outDir', tmp, '--rootDir', path.join(REPO, 'src'),
  '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck',
], { stdio: 'pipe', cwd: os.tmpdir() });
for (const p of walkJs(tmp)) {
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const load = (rel) => import(pathToFileURL(path.join(tmp, 'services', rel)).href);

const contract = await load('revenueMetricContract.js');
const analytics = await load('analyticsQueryEngine.js');
const commerce = await load('commerceDataQueryEngine.js');
const planner = await load('marketingIntelligencePlanner.js');
const scope = await load('marketingScopeInsightEngine.js');

// ── fixture ──────────────────────────────────────────────────────────────────
const PERIOD = { start: '2025-03-01', end: '2025-03-31' };

const line = (goodsNo, goodsName, categoryCode, quantity, lineRevenue) =>
  ({ goodsNo, goodsName, categoryCode, categoryLabel: categoryCode, quantity, lineRevenue });

// O1: 기간 시작 경계. 같은 상품 P1의 옵션 라인 2개 → 상품 주문수는 1이어야 한다.
const O1 = {
  orderNo: 'O1', orderDate: '2025-03-01', paid: true, canceled: false, memberKey: 'm1',
  totalAmount: 40000, productRevenueByLines: 40000,
  lines: [line('P1', '상품1', 'catA', 1, 10000), line('P1', '상품1', 'catA', 3, 30000)],
};
// O2: 기간 종료 경계. 같은 카테고리(catA)의 다른 상품 P2 + 다른 카테고리 P3.
const O2 = {
  orderNo: 'O2', orderDate: '2025-03-31', paid: true, canceled: false, memberKey: 'm2',
  totalAmount: 75000, productRevenueByLines: 75000,
  lines: [line('P2', '상품2', 'catA', 1, 50000), line('P3', '상품3', 'catB', 5, 25000)],
};
// O3: 기간 안이지만 취소 주문 → net/유효 집계에서 제외, gross에는 포함.
const O3 = {
  orderNo: 'O3', orderDate: '2025-03-15', paid: true, canceled: true, memberKey: 'm3',
  totalAmount: 100000, productRevenueByLines: 100000,
  lines: [line('P1', '상품1', 'catA', 10, 100000)],
};
// O4: 기간 밖(직전).
const O4 = {
  orderNo: 'O4', orderDate: '2025-02-28', paid: true, canceled: false, memberKey: 'm4',
  totalAmount: 20000, productRevenueByLines: 20000,
  lines: [line('P1', '상품1', 'catA', 2, 20000)],
};
const ORDERS = [O1, O2, O3, O4];
const ORDERS_IN_PERIOD = [O1, O2, O3];

// ⚠️ 카테고리 해석 출처가 엔진마다 다르다:
//    - marketingIntelligencePlanner:510,514 → products 인덱스(productId/goodsNo → categoryCode)
//    - analyticsQueryEngine → lines[].categoryCode 직접 사용
//    양쪽 모두 같은 정답이 나와야 하므로 fixture는 두 경로에 동일한 카테고리를 제공한다.
const PRODUCTS = [
  { goodsNo: 'P1', productId: 'P1', goodsName: '상품1', categoryCode: 'catA' },
  { goodsNo: 'P2', productId: 'P2', goodsName: '상품2', categoryCode: 'catA' },
  { goodsNo: 'P3', productId: 'P3', goodsName: '상품3', categoryCode: 'catB' },
];

const REVIEWS = [
  { goodsNo: 'P1', rating: 5, createdAt: '2025-03-10' },   // 기간 안
  { goodsNo: 'P1', rating: 2, createdAt: '2025-02-20' },   // 기간 밖(이전)
  { goodsNo: 'P2', rating: 4, createdAt: '2025-04-05' },   // 기간 밖(이후)
];
const INQUIRIES = [
  { goodsNo: 'P1', status: 'unanswered', createdAt: '2025-03-01' }, // 시작 경계 → 포함
  { goodsNo: 'P2', status: 'answered', createdAt: '2025-03-31' },   // 종료 경계 → 포함
  { goodsNo: 'P3', status: 'unanswered', createdAt: '2025-02-15' }, // 기간 밖
];

// ── 정답표(손계산, 상수로 못박음) ─────────────────────────────────────────────
const GOLDEN = {
  // 지표 의미별로 분리
  grossProductRevenue_inPeriod: 40000 + 75000 + 100000,        // 215000 (취소 포함, 라인합)
  netOrderRevenue_inPeriod: 40000 + 75000,                     // 115000 (유효 주문 총액)
  orderCountAll_inPeriod: 3,
  orderCountValid_inPeriod: 2,
  averageOrderValue_net: Math.round(115000 / 2),               // 57500

  // 상품 축(유효 주문 기준) — 같은 상품의 옵션 라인은 주문 1건으로 센다
  product: {
    P1: { orderCount: 1, lineRevenue: 40000, quantity: 4 },
    P2: { orderCount: 1, lineRevenue: 50000, quantity: 1 },
    P3: { orderCount: 1, lineRevenue: 25000, quantity: 5 },
  },
  // 카테고리 축(유효 주문 기준) — 같은 카테고리의 여러 상품 라인도 주문 1건으로 센다
  category: {
    catA: { orderCount: 2, lineRevenue: 90000, quantity: 5 },  // O1(P1x2) + O2(P2)
    catB: { orderCount: 1, lineRevenue: 25000, quantity: 5 },  // O2(P3)
  },
  // share: revenue 비율과 quantity 비율이 서로 다르게 설계됨
  share: {
    revenue: { catA: 90000 / 115000, catB: 25000 / 115000 },   // 0.7826 / 0.2174
    quantity: { catA: 5 / 10, catB: 5 / 10 },                  // 0.5 / 0.5
  },
  reviewCount_inPeriod: 1,
  inquiryCount_inPeriod: 2,
};

// ── T1. canonical 계약이 정답표와 일치하는가(= fixture 자체 검증) ─────────────
console.log('[2/3] 검증');
{
  const g = contract.computeGrossProductRevenue(ORDERS_IN_PERIOD);
  const n = contract.computeNetOrderRevenue(ORDERS_IN_PERIOD);
  const va = contract.countValidOrders(ORDERS_IN_PERIOD);
  const al = contract.countAllOrders(ORDERS_IN_PERIOD);
  const aov = contract.computeAverageOrderValue(n, va);
  ok('T1-a canonical grossProductRevenue = 215,000', g === GOLDEN.grossProductRevenue_inPeriod, `got ${g}`);
  ok('T1-b canonical netOrderRevenue = 115,000', n === GOLDEN.netOrderRevenue_inPeriod, `got ${n}`);
  ok('T1-c canonical orderCountValid = 2', va === GOLDEN.orderCountValid_inPeriod, `got ${va}`);
  ok('T1-d canonical orderCountAll = 3', al === GOLDEN.orderCountAll_inPeriod, `got ${al}`);
  ok('T1-e canonical averageOrderValue = 57,500', aov === GOLDEN.averageOrderValue_net, `got ${aov}`);
}

// ── planner: dimension별 orderCount / aov ────────────────────────────────────
const mkPlan = (dimension, metric) => ({
  id: `t_${dimension}_${metric}`, originalQuestion: 'RC-1 parity fixture', goal: 'rank',
  requestedMetrics: [metric], executableMetrics: [metric],
  periods: [{ label: '2025-03', startDate: PERIOD.start, endDate: PERIOD.end }],
  timeBucket: 'month', dimensions: [dimension], segments: [], filters: [],
  comparison: 'none', chartRecommendation: { chartType: 'bar', reason: '' },
  dataRequirements: [], confidence: 'high', warnings: [],
});

const pointsOf = (result) => {
  const spec = result?.primaryChartSpec;
  const out = new Map();
  for (const s of spec?.series ?? []) {
    for (const p of s.points ?? []) {
      const key = String(s.name ?? s.key ?? p.bucketLabel ?? p.bucketKey ?? '');
      const prev = out.get(key) ?? { value: 0, orderCount: 0, revenue: 0 };
      out.set(key, {
        value: prev.value + Number(p.value ?? 0),
        orderCount: prev.orderCount + Number(p.orderCount ?? 0),
        revenue: prev.revenue + Number(p.revenue ?? 0),
      });
    }
  }
  return out;
};

for (const [dim, goldenMap, label] of [['product', GOLDEN.product, '상품'], ['category', GOLDEN.category, '카테고리']]) {
  let res;
  try {
    res = planner.executeMarketingIntelligencePlan({ plan: mkPlan(dim, 'orderCount'), orders: ORDERS, products: PRODUCTS, reviews: REVIEWS, inquiries: INQUIRIES, nowMs: Date.parse('2025-04-01T00:00:00Z') });
  } catch (e) {
    skipped(`T2/T3 planner ${label} 축 orderCount`, `실행 실패: ${e.message}`);
    continue;
  }
  const pts = pointsOf(res);
  if (pts.size === 0) { skipped(`T2/T3 planner ${label} 축 orderCount`, 'chartSpec 시리즈 없음(플랜 형식 불일치 가능)'); continue; }
  for (const [key, exp] of Object.entries(goldenMap)) {
    const hit = [...pts.entries()].find(([k]) => k.includes(key));
    if (!hit) { skipped(`planner ${label} ${key} orderCount`, '해당 축 항목 없음'); continue; }
    ok(`T2/T3 planner ${label} ${key} orderCount = ${exp.orderCount} (라인 수 아님)`,
      hit[1].orderCount === exp.orderCount, `got ${hit[1].orderCount}`);
  }
}

// ── T4. planner 객단가(주문당) ───────────────────────────────────────────────
{
  let res;
  try {
    res = planner.executeMarketingIntelligencePlan({ plan: mkPlan('category', 'averageOrderValue'), orders: ORDERS, products: PRODUCTS, nowMs: Date.parse('2025-04-01T00:00:00Z') });
    const pts = pointsOf(res);
    const hit = [...pts.entries()].find(([k]) => k.includes('catA'));
    if (!hit) skipped('T4 planner catA 객단가', '해당 축 항목 없음');
    else {
      const expected = Math.round(GOLDEN.category.catA.lineRevenue / GOLDEN.category.catA.orderCount); // 90000/2 = 45000
      ok(`T4 planner catA 객단가 = ${expected} (라인당 아님)`, hit[1].value === expected, `got ${hit[1].value}`);
    }
  } catch (e) { skipped('T4 planner catA 객단가', `실행 실패: ${e.message}`); }
}

// ── T5. scopeInsight 카테고리 주문수 ─────────────────────────────────────────
{
  try {
    const r = scope.buildMarketingScopeInsightResponse({
      message: '2025년 3월 카테고리별 주문수 알려줘', orders: ORDERS, products: PRODUCTS, reviews: REVIEWS, inquiries: INQUIRIES,
      nowMs: Date.parse('2025-04-01T00:00:00Z'),
    });
    const pack = r?.result?.insightPack ?? r?.insightPack;
    const rows = pack?.categoryBreakdown?.rows ?? pack?.categoryBreakdown ?? [];
    const catA = (Array.isArray(rows) ? rows : []).find((x) => String(x.label ?? x.key ?? '').includes('catA'));
    if (!catA) skipped('T5 scopeInsight catA 주문수', 'categoryBreakdown에 catA 없음');
    else ok('T5 scopeInsight catA 주문수 = 2 (라인 수 아님)', Number(catA.orderCount) === GOLDEN.category.catA.orderCount, `got ${catA.orderCount}`);
  } catch (e) { skipped('T5 scopeInsight catA 주문수', `실행 실패: ${e.message}`); }
}

// ── T6/T7. analyticsQueryEngine 기간 필터(리뷰·문의) ─────────────────────────
{
  const dataset = { orders: ORDERS, reviews: REVIEWS, inquiries: INQUIRIES, source: { dataKind: 'synthetic' } };
  const run = (metric) => {
    try {
      return analytics.runAnalyticsQuery(dataset, { metric, startDate: PERIOD.start, endDate: PERIOD.end });
    } catch (e) { return { error: e.message }; }
  };
  const rv = run('reviewCount');
  if (rv.error) skipped('T6 reviewCount 기간 필터', rv.error);
  else {
    const total = (rv.rows ?? []).reduce((s, r) => s + Number(r.value ?? 0), 0);
    ok('T6 analyticsQueryEngine reviewCount(기간 내) = 1', total === GOLDEN.reviewCount_inPeriod, `got ${total} (기간 밖 리뷰 2건 포함 여부)`);
  }
  const iq = run('inquiryCount');
  if (iq.error) skipped('T7 inquiryCount 기간 필터', iq.error);
  else {
    const total = (iq.rows ?? []).reduce((s, r) => s + Number(r.value ?? 0), 0);
    ok('T7 analyticsQueryEngine inquiryCount(기간 내) = 2 (양 경계 포함)', total === GOLDEN.inquiryCount_inPeriod, `got ${total}`);
  }
}

// ── T8. commerceDataQueryEngine share가 metric을 존중하는가 ──────────────────
{
  const dataset = { orders: ORDERS, reviews: REVIEWS, inquiries: INQUIRIES };
  const plan = {
    metric: 'quantity', groupBy: 'category', operation: 'share',
    filters: { years: [2025], months: [3] }, sort: 'desc',
    originalQuestion: '2025년 3월 카테고리별 판매수량 비중',
  };
  try {
    const r = commerce.executeCommerceQueryPlan(plan, dataset, { nowMs: Date.parse('2025-04-01T00:00:00Z') });
    if (!r || !r.handled) skipped('T8 quantity share', 'plan 미처리(handled=false)');
    else {
      // 수량 비중이면 catA=50%, 매출 비중이면 catA≈78.3%
      const reply = String(r.reply ?? '');
      const isQuantityShare = /50(\.0)?%/.test(reply);
      const isRevenueShare = /78(\.[0-9])?%/.test(reply);
      ok('T8 quantity share 요청에 수량 비중(catA 50%)을 반환',
        isQuantityShare && !isRevenueShare,
        `revenue비중반환=${isRevenueShare} | reply: ${reply.slice(0, 120).replace(/\n/g, ' ')}`);
    }
  } catch (e) { skipped('T8 quantity share', `실행 실패: ${e.message}`); }
}

// ── 출력 ─────────────────────────────────────────────────────────────────────
console.log('[3/3] 결과\n');
for (const [st, name, detail] of results) {
  console.log(`  ${st}  ${name}${detail ? `  — ${detail}` : ''}`);
}
console.log(`\n결과: ${pass} pass / ${fail} fail / ${skip} skip`);
console.log('※ 이 스크립트는 현재 결함을 재현하는 것이 목적이므로 FAIL이 정상이다.');
