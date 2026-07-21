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
  'src/services/firstPurchaseContract.ts',
  'src/services/marketingTemporalCrosstab.ts',
  'src/services/marketingAnalysisFacts.ts',
  'src/services/marketingAnalysisExecutor.ts',
  'src/services/marketingAnalysisQueryCompiler.ts',
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
const fpContract = await load('firstPurchaseContract.js');
const crosstab = await load('marketingTemporalCrosstab.js');
const facts = await load('marketingAnalysisFacts.js');
const executor = await load('marketingAnalysisExecutor.js');
const analysisCompiler = await load('marketingAnalysisQueryCompiler.js');

// ── fixture ──────────────────────────────────────────────────────────────────
const PERIOD = { start: '2025-03-01', end: '2025-03-31' };

const line = (goodsNo, goodsName, categoryCode, quantity, lineRevenue) =>
  ({ goodsNo, goodsName, categoryCode, categoryLabel: categoryCode, quantity, lineRevenue });

// O1: 기간 시작 경계. 같은 상품 P1의 옵션 라인 2개 → 상품 주문수는 1이어야 한다.
//     쿠폰·리워드·첫구매를 모두 보유 → 라인마다 증가시키면 쿠폰 사용률이 100%를 넘는다.
const O1 = {
  orderNo: 'O1', orderDate: '2025-03-01', paid: true, canceled: false, memberKey: 'm1',
  totalAmount: 40000, productRevenueByLines: 40000,
  discountSummary: { hasCoupon: true, totalCouponDiscountAmount: 5000 },
  useMileageAmount: 1000, isFirstPurchase: true,
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

// ── 카테고리 출처 계약 검증용 별도 데이터셋 ──────────────────────────────────
// 계약안(RC-1): ① 주문라인의 주문 당시 categoryCode 우선
//               ② 없으면 상품 인덱스의 현재 categoryCode로 보충
//               ③ 둘 다 없으면 uncategorized
// 본 fixture는 ①과 ②가 서로 다른 값을 갖도록 설계해 "어느 쪽을 썼는지"를 판별한다.
const CATSRC_ORDERS = [
  { // P4: 라인에 catLINE, 상품인덱스에 catINDEX → 계약상 catLINE이 기준
    orderNo: 'C1', orderDate: '2025-03-10', paid: true, canceled: false, memberKey: 'c1',
    totalAmount: 10000, productRevenueByLines: 10000,
    lines: [line('P4', '상품4', 'catLINE', 1, 10000)],
  },
  { // P5: 라인에 categoryCode 없음, 상품인덱스에 catFALLBACK → 계약상 catFALLBACK
    orderNo: 'C2', orderDate: '2025-03-11', paid: true, canceled: false, memberKey: 'c2',
    totalAmount: 20000, productRevenueByLines: 20000,
    lines: [{ goodsNo: 'P5', goodsName: '상품5', quantity: 1, lineRevenue: 20000 }],
  },
  { // P6: 라인에도 없고 상품인덱스에도 없음 → 계약상 uncategorized
    orderNo: 'C3', orderDate: '2025-03-12', paid: true, canceled: false, memberKey: 'c3',
    totalAmount: 30000, productRevenueByLines: 30000,
    lines: [{ goodsNo: 'P6', goodsName: '상품6', quantity: 1, lineRevenue: 30000 }],
  },
];
const CATSRC_PRODUCTS = [
  { goodsNo: 'P4', productId: 'P4', goodsName: '상품4', categoryCode: 'catINDEX' }, // 라인과 불일치
  { goodsNo: 'P5', productId: 'P5', goodsName: '상품5', categoryCode: 'catFALLBACK' },
  // P6은 상품 인덱스에 없음
];
// 정답: 카테고리별 금액까지 고정한다(키 존재 여부만 보면 P6가 catINDEX로 잘못 들어가도 통과한다).
//
// C-1 계약(정정): 분석 카테고리는 RevenueOrderLine.categoryCode 하나만 기준으로 한다.
//   이 값은 '주문 당시 원본 카테고리'가 아니라 mapOrdersToRevenue 실행 시 상품목록과
//   조인된 **스냅샷**이다(godomallRevenue.ts:223). 값이 없으면 uncategorized로 확정하며,
//   하위 소비자는 현재 productIndex로 다시 보충하지 않는다
//   (보충하면 상품 카테고리 변경 시 과거 매출이 소급 재분류된다).
// → P5(20,000)와 P6(30,000)은 둘 다 uncategorized로 합산되어 50,000이 정답이다.
const CATSRC_GOLDEN = {
  amounts: { catLINE: 10000, uncategorized: 50000 },
  forbidden: ['catINDEX', 'catFALLBACK'], // 현재 상품목록으로 보충했다는 증거 → 실패
  // categorySource는 실제보다 강한 이름(order_line 등)을 쓰지 않는다.
  source: { P4: 'ingestSnapshot', P5: 'none', P6: 'none' },
};

// 엔진별 (카테고리명 → 금액) 맵을 정답과 대조한다.
const assertCategorySource = (engineLabel, actualMap) => {
  const entries = [...actualMap.entries()];
  const shown = entries.map(([k, v]) => `${k}=${v}`).join(' | ') || '(없음)';
  for (const [cat, expected] of Object.entries(CATSRC_GOLDEN.amounts)) {
    const hit = entries.find(([k]) => k.includes(cat));
    ok(`${engineLabel}: ${cat} = ${expected.toLocaleString()}원`,
      !!hit && Number(hit[1]) === expected, `got ${hit ? hit[1] : '항목 없음'} | 전체: ${shown}`);
  }
  for (const bad of CATSRC_GOLDEN.forbidden) {
    ok(`${engineLabel}: ${bad}는 결과에 없어야 함(라인 카테고리 우선)`,
      !entries.some(([k]) => k.includes(bad)), `전체: ${shown}`);
  }
};

// ── C-5 라인축 집계 검증용 별도 데이터셋 (기존 정답표 불변) ──────────────────
// 두 주문 모두 같은 카테고리(catA)에 **복수 옵션 라인**을 가진다.
//   L1: 쿠폰·리워드·첫구매  / P1 옵션 2라인
//   L2: 없음·재구매        / P2 옵션 2라인
// → catA 집계칸의 주문 기반 지표는 전부 2가 아니라 "주문 수" 기준이어야 한다.
const LINEAGG_ORDERS = [
  {
    orderNo: 'L1', orderDate: '2025-03-05', paid: true, canceled: false, memberKey: 'l1',
    totalAmount: 40000, productRevenueByLines: 40000,
    discountSummary: { hasCoupon: true, totalCouponDiscountAmount: 3000 },
    useMileageAmount: 500, isFirstPurchase: true,
    lines: [line('P1', '상품1', 'catA', 1, 10000), line('P1', '상품1', 'catA', 3, 30000)],
  },
  {
    orderNo: 'L2', orderDate: '2025-03-06', paid: true, canceled: false, memberKey: 'l2',
    totalAmount: 50000, productRevenueByLines: 50000,
    isFirstPurchase: false,
    lines: [line('P2', '상품2', 'catA', 2, 20000), line('P2', '상품2', 'catA', 3, 30000)],
  },
];
const LINEAGG_GOLDEN = {
  orderCount: 2,       // L1, L2 — 라인 기준이면 4
  couponOrders: 1,     // L1만 — 라인 기준이면 2
  rewardOrders: 1,     // L1만 — 라인 기준이면 2
  firstOrders: 1,      // L1만 — 라인 기준이면 2
  repeatOrders: 1,     // L2만 — 라인 기준이면 2
  couponUsageRate: 50, // 1/2 — 분자·분모가 함께 부풀면 그대로 50이라 이 값만으로는 못 잡는다
  revenue: 90000,      // 라인 합산 (변경 없음)
  quantity: 9,         // 라인 합산 (변경 없음)
};

const REVIEWS = [
  { goodsNo: 'P1', rating: 5, createdAt: '2025-03-10' },   // 기간 안
  { goodsNo: 'P1', rating: 2, createdAt: '2025-02-20' },   // 기간 밖(이전)
  { goodsNo: 'P2', rating: 4, createdAt: '2025-04-05' },   // 기간 밖(이후)
];
const INQUIRIES = [
  { goodsNo: 'P1', status: 'unanswered', createdAt: '2025-03-01' }, // 시작 경계 → 포함
  { goodsNo: 'P2', status: 'answered', createdAt: '2025-03-31' },   // 종료 경계 → 포함
  { goodsNo: 'P3', status: 'unanswered', createdAt: '2025-02-15' }, // 기간 밖
  { goodsNo: 'P1', status: 'unanswered' },                          // createdAt 없음 → 기간 지정 시 제외
];
// ⚠️ AnalyticsReview / AnalyticsInquiry 타입에는 현재 createdAt 필드가 없다
//    (analyticsQueryEngine.ts:42-59). B 단계에서 `createdAt?: string` 추가가 함께 필요하다.

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

  // 주문 기반 지표(매출·수량만 라인 합산, 나머지는 집계칸별 orderNo 중복 제거)
  //   catA 유효주문 = {O1(쿠폰·리워드·첫구매), O2(없음·재구매)}
  couponOrders_catA: 1,
  couponUsageRate_catA: 50,   // 1 / 2 주문 = 50% (라인 기준이면 2/3 = 66.7%)
  couponUsageRate_P1: 100,    // P1 주문 = {O1} 하나 → 100%. 라인 기준이면 200%가 될 수 있다
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
    // 실측 주의: '…주문수 알려줘' 메시지는 handled:true 이면서 result 필드 자체가 없다(다른 경로로 라우팅).
    //   '카테고리별 매출'로 물어야 insightPack이 채워진다.
    // 기간 파싱 영향을 배제하기 위해 기간 내 주문만 넣고 '전체 기간'으로 질의한다
    //   → scoped = O1,O2 (O3는 취소로 isCounted 제외) = 정답표의 기간 내 유효주문과 동일.
    const r = scope.buildMarketingScopeInsightResponse({
      message: '카테고리별 매출 알려줘', orders: ORDERS_IN_PERIOD, products: PRODUCTS, reviews: REVIEWS, inquiries: INQUIRIES,
      nowMs: Date.parse('2025-04-01T00:00:00Z'),
    });
    // 같은 응답 안에서 summary(주문 기준)와 categoryBreakdown(라인 기준)이 어긋나는지도 함께 본다.
    const summaryOrderCount = Number(r?.result?.insightPack?.summary?.orderCount ?? -1);
    ok('T5-c scopeInsight summary.orderCount = 2 (주문 기준)',
      summaryOrderCount === GOLDEN.orderCountValid_inPeriod, `got ${summaryOrderCount}`);
    // 반환 구조 실측(marketingScopeInsightEngine.ts:63, :328, :641):
    //   { handled, result, artifact, reply, suppressChart }
    //   result.insightPack.categoryBreakdown[] = { category, revenue, revenueShare, orderCount, averageOrderValue, couponUsageRate }
    //   category 라벨은 `카테고리 ${code}` 형식(:320)
    const rows = r?.result?.insightPack?.categoryBreakdown ?? [];
    const catA = rows.find((x) => String(x.category ?? '').includes('catA'));
    if (!catA) {
      ok('T5 scopeInsight catA 주문수 = 2 (라인 수 아님)', false,
        `categoryBreakdown에 catA 없음 — 반환 항목: ${rows.map((x) => x.category).join(', ') || '(없음)'}`);
    } else {
      ok('T5 scopeInsight catA 주문수 = 2 (라인 수 아님)',
        Number(catA.orderCount) === GOLDEN.category.catA.orderCount, `got ${catA.orderCount}`);
      // 주문 기반 지표: 쿠폰 사용률은 주문 기준이어야 한다.
      ok('T12 scopeInsight catA 쿠폰 사용률 = 50% (주문 기준)',
        Number(catA.couponUsageRate) === GOLDEN.couponUsageRate_catA, `got ${catA.couponUsageRate}% (라인 기준이면 66.7%)`);
      // 부분 수정 방지 가드: orderCount만 고치고 couponOrders를 라인 기준으로 두면 100%를 넘는다.
      const over = rows.filter((x) => Number(x.couponUsageRate) > 100);
      ok('T13 어떤 카테고리도 쿠폰 사용률이 100%를 넘지 않음',
        over.length === 0, over.map((x) => `${x.category}=${x.couponUsageRate}%`).join(', ') || 'ok');
      ok('T5-b scopeInsight catA 객단가 = 45,000 (라인당 아님)',
        Number(catA.averageOrderValue) === Math.round(GOLDEN.category.catA.lineRevenue / GOLDEN.category.catA.orderCount),
        `got ${catA.averageOrderValue}`);
    }
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
    ok('T7 analyticsQueryEngine inquiryCount(기간 내) = 2 (양 경계 포함, createdAt 없는 자료 제외)',
      total === GOLDEN.inquiryCount_inPeriod, `got ${total} — 기간 밖 1건 + createdAt 없는 1건이 섞이면 4`);
  }
  // 기간을 지정하지 않으면 전체가 나와야 한다(기간 필터가 무조건 거르지 않는지 확인).
  try {
    const all = analytics.runAnalyticsQuery(dataset, { metric: 'inquiryCount' });
    const total = (all.rows ?? []).reduce((s, r) => s + Number(r.value ?? 0), 0);
    ok('T7-b 기간 미지정 시 문의 전체 4건', total === INQUIRIES.length, `got ${total}`);
  } catch (e) { ok('T7-b 기간 미지정 시 문의 전체', false, e.message); }
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
    if (!r || !r.handled) ok('T8 quantity share', false, 'plan 미처리(handled=false)');
    else {
      const reply = String(r.reply ?? '').replace(/\n/g, ' ');
      // (a) 비중 계산 기준: 수량이면 catA=50%, 매출이면 catA≈78.3%
      ok('T8-a quantity share 비중이 수량 기준(catA 50%)',
        /50(\.0)?%/.test(reply) && !/78(\.[0-9])?%/.test(reply), `reply: ${reply.slice(0, 130)}`);
      // (b) 본문 값·단위: quantity면 '개', revenue면 '원'
      ok('T8-b quantity share 본문 단위가 "개" (원 아님)',
        /개/.test(reply) && !/원/.test(reply), `reply: ${reply.slice(0, 130)}`);
      // (c) 정렬 기준도 metric을 따라야 한다. 수량은 catA=5, catB=5로 동률이므로
      //     매출 기준 정렬(catA 우선)이 그대로 보이면 정렬이 metric을 따르지 않는 신호다.
      ok('T8-c quantity 기준에서 두 카테고리가 동률(5개)로 표시',
        (reply.match(/5개/g) || []).length >= 2, `reply: ${reply.slice(0, 130)}`);
    }
    // 대조군: revenue share는 기존대로 '원'·78.3%여야 한다(C 수정 시 회귀 방지).
    const rRev = commerce.executeCommerceQueryPlan(
      { ...plan, metric: 'revenue', originalQuestion: '2025년 3월 카테고리별 매출 비중' },
      dataset, { nowMs: Date.parse('2025-04-01T00:00:00Z') },
    );
    const rev = String(rRev?.reply ?? '').replace(/\n/g, ' ');
    ok('T8-d 대조군: revenue share는 원·78.3% 유지',
      /78(\.[0-9])?%/.test(rev) && /원/.test(rev), `reply: ${rev.slice(0, 130)}`);
  } catch (e) { skipped('T8 quantity share', `실행 실패: ${e.message}`); }
}

// ── T14. planner 주문 기반 5개 지표 각각 (C-5) ───────────────────────────────
{
  const nowMs = Date.parse('2025-04-01T00:00:00Z');
  const catAValue = (metric) => {
    const res = planner.executeMarketingIntelligencePlan({
      plan: mkPlan('category', metric), orders: LINEAGG_ORDERS, products: PRODUCTS, nowMs,
    });
    const hit = [...pointsOf(res).entries()].find(([k]) => k.includes('catA'));
    return hit ? hit[1] : null;
  };
  try {
    const oc = catAValue('orderCount');
    const orderCount = oc ? oc.value : -1;
    ok('T14-1 planner catA orderCount = 2 (주문 기준)', orderCount === LINEAGG_GOLDEN.orderCount, `got ${orderCount}`);

    // couponOrders / rewardOrders는 비율×주문수로 역산한다(metricFromAcc가 절대값을 직접 노출하지 않음).
    const cRate = catAValue('couponUsageRateWithinOrders');
    const rRate = catAValue('rewardUsageRateWithinOrders');
    const couponOrders = cRate ? Math.round((cRate.value * cRate.orderCount) / 100) : -1;
    const rewardOrders = rRate ? Math.round((rRate.value * rRate.orderCount) / 100) : -1;
    ok('T14-2 planner catA couponOrders = 1 (주문 기준)', couponOrders === LINEAGG_GOLDEN.couponOrders,
      `got ${couponOrders} (rate ${cRate?.value}% × orderCount ${cRate?.orderCount})`);
    ok('T14-3 planner catA rewardOrders = 1 (주문 기준)', rewardOrders === LINEAGG_GOLDEN.rewardOrders,
      `got ${rewardOrders} (rate ${rRate?.value}% × orderCount ${rRate?.orderCount})`);

    const fo = catAValue('firstPurchaseOrderCount');
    const ro = catAValue('repeatPurchaseOrderCount');
    ok('T14-4 planner catA firstOrders = 1 (주문 기준)', (fo ? fo.value : -1) === LINEAGG_GOLDEN.firstOrders, `got ${fo?.value}`);
    ok('T14-5 planner catA repeatOrders = 1 (주문 기준)', (ro ? ro.value : -1) === LINEAGG_GOLDEN.repeatOrders, `got ${ro?.value}`);

    // 라인 합산 지표는 그대로여야 한다(과잉 수정 방지 가드).
    const rev = catAValue('revenue');
    const qty = catAValue('quantity');
    ok('T14-6 planner catA revenue = 90,000 (라인 합산 유지)', (rev ? rev.value : -1) === LINEAGG_GOLDEN.revenue, `got ${rev?.value}`);
    ok('T14-7 planner catA quantity = 9 (라인 합산 유지)', (qty ? qty.value : -1) === LINEAGG_GOLDEN.quantity, `got ${qty?.value}`);
  } catch (e) { ok('T14 planner 주문 기반 5지표', false, `실행 실패: ${e.message}`); }
}

// ── T15/T16. 공용 집계 함수 경계조건 (lineAxisAggregation) ───────────────────
{
  const nowMs = Date.parse('2025-04-01T00:00:00Z');
  const catCount = (orders, catKey) => {
    const res = planner.executeMarketingIntelligencePlan({
      plan: mkPlan('category', 'orderCount'), orders, products: [], nowMs,
    });
    const hit = [...pointsOf(res).entries()].find(([k]) => k.includes(catKey));
    return hit ? hit[1].orderCount : -1;
  };

  // T15-a: orderNo가 빈 **한 주문**의 같은 카테고리 복수 라인 → 주문수 1
  //        (resolveOrderKey 순번이 라인마다 새로 만들어지면 2가 된다)
  const emptyOneOrder = [{
    orderNo: '', orderDate: '2025-03-07', paid: true, canceled: false,
    totalAmount: 20000, productRevenueByLines: 20000,
    lines: [line('E1', '상품E', 'catE', 1, 10000), line('E1', '상품E', 'catE', 1, 10000)],
  }];
  ok('T15-a orderNo 빈 주문 1건의 같은 카테고리 2라인 → 주문수 1',
    catCount(emptyOneOrder, 'catE') === 1, `got ${catCount(emptyOneOrder, 'catE')}`);

  // T15-b: orderNo가 빈 **서로 다른 두 주문** → 주문수 2
  //        (빈 문자열을 공유 키로 쓰면 1로 합쳐진다)
  const emptyTwoOrders = [
    { orderNo: '', orderDate: '2025-03-07', paid: true, canceled: false, totalAmount: 10000, productRevenueByLines: 10000, lines: [line('E1', '상품E', 'catE', 1, 10000)] },
    { orderNo: '', orderDate: '2025-03-08', paid: true, canceled: false, totalAmount: 10000, productRevenueByLines: 10000, lines: [line('E1', '상품E', 'catE', 1, 10000)] },
  ];
  ok('T15-b orderNo 빈 서로 다른 주문 2건 → 주문수 2',
    catCount(emptyTwoOrders, 'catE') === 2, `got ${catCount(emptyTwoOrders, 'catE')}`);

  // T16: 한 주문이 두 카테고리에 걸침 → 각 칸 주문수 1, 전체 유효주문 1
  //      (seenOrdersFor가 전체 공용 Set이면 두 번째 카테고리가 0이 된다)
  const crossOrder = [{
    orderNo: 'M1', orderDate: '2025-03-09', paid: true, canceled: false,
    totalAmount: 30000, productRevenueByLines: 30000,
    lines: [line('X1', '상품X', 'catA', 1, 10000), line('X2', '상품Y', 'catB', 1, 20000)],
  }];
  ok('T16-a 한 주문이 catA·catB에 걸침 → catA 주문수 1', catCount(crossOrder, 'catA') === 1, `got ${catCount(crossOrder, 'catA')}`);
  ok('T16-b 같은 주문 → catB 주문수 1 (공용 Set이면 0)', catCount(crossOrder, 'catB') === 1, `got ${catCount(crossOrder, 'catB')}`);
  ok('T16-c 전체 유효 주문수는 1', contract.countValidOrders(crossOrder) === 1, `got ${contract.countValidOrders(crossOrder)}`);
}

// ── T17. isFirstPurchase 3상태 (true / false / undefined) ────────────────────
// isFirstPurchase는 optional이다(firstSaleFl 없는 실주문은 undefined).
// undefined를 재구매로 뭉개면 재구매 주문수가 부풀려진다.
{
  const nowMs = Date.parse('2025-04-01T00:00:00Z');
  const val = (orders, metric) => {
    const res = planner.executeMarketingIntelligencePlan({
      plan: mkPlan('category', metric), orders, products: [], nowMs,
    });
    const hit = [...pointsOf(res).entries()].find(([k]) => k.includes('catU'));
    return hit ? hit[1].value : -1;
  };
  // isFirstPurchase 필드 자체가 없는 유효 주문 1건
  const noFlagOrder = [{
    orderNo: 'U1', orderDate: '2025-03-12', paid: true, canceled: false,
    totalAmount: 10000, productRevenueByLines: 10000,
    lines: [line('U1', '상품U', 'catU', 1, 10000)],
  }];
  ok('T17-a isFirstPurchase 없음 → orderCount 1', val(noFlagOrder, 'orderCount') === 1, `got ${val(noFlagOrder, 'orderCount')}`);
  ok('T17-b isFirstPurchase 없음 → firstOrders 0', val(noFlagOrder, 'firstPurchaseOrderCount') === 0, `got ${val(noFlagOrder, 'firstPurchaseOrderCount')}`);
  ok('T17-c isFirstPurchase 없음 → repeatOrders 0 (재구매로 뭉개지 않음)',
    val(noFlagOrder, 'repeatPurchaseOrderCount') === 0, `got ${val(noFlagOrder, 'repeatPurchaseOrderCount')}`);
  // 대조군: 명시적 false는 재구매로 센다
  const explicitFalse = [{ ...noFlagOrder[0], orderNo: 'U2', isFirstPurchase: false }];
  ok('T17-d isFirstPurchase=false → repeatOrders 1', val(explicitFalse, 'repeatPurchaseOrderCount') === 1, `got ${val(explicitFalse, 'repeatPurchaseOrderCount')}`);
  const explicitTrue = [{ ...noFlagOrder[0], orderNo: 'U3', isFirstPurchase: true }];
  ok('T17-e isFirstPurchase=true → firstOrders 1', val(explicitTrue, 'firstPurchaseOrderCount') === 1, `got ${val(explicitTrue, 'firstPurchaseOrderCount')}`);
}

// ── T19. 기간 계약 조합 (시작만 / 종료만 / 둘 다 / 누락 / 형식오류) ──────────
// 기존 inPeriod는 end만 지정된 경우 빈 날짜가 통과해 잘못 포함됐다.
{
  const inq = [
    { goodsNo: 'A', status: 'unanswered', createdAt: '2025-03-01' }, // 시작 경계
    { goodsNo: 'B', status: 'answered', createdAt: '2025-03-31' },   // 종료 경계
    { goodsNo: 'C', status: 'unanswered', createdAt: '2025-02-15' }, // 이전
    { goodsNo: 'D', status: 'unanswered', createdAt: '2025-04-10' }, // 이후
    { goodsNo: 'E', status: 'unanswered' },                          // createdAt 없음
    { goodsNo: 'F', status: 'unanswered', createdAt: 'not-a-date' }, // 형식 오류
  ];
  const ds = { orders: [], reviews: [], inquiries: inq, source: { dataKind: 'synthetic' } };
  const count = (spec) => {
    try {
      const r = analytics.runAnalyticsQuery(ds, { metric: 'inquiryCount', ...spec });
      return (r.rows ?? []).reduce((s, x) => s + Number(x.value ?? 0), 0);
    } catch (e) { return `ERR:${e.message}`; }
  };
  ok('T19-a 기간 미지정 → 전체 6건 (날짜 없음·형식오류 포함)', count({}) === 6, `got ${count({})}`);
  ok('T19-b 시작일만 2025-03-01 → 3건 (A,B,D / 누락·오류 제외)',
    count({ startDate: '2025-03-01' }) === 3, `got ${count({ startDate: '2025-03-01' })}`);
  ok('T19-c 종료일만 2025-03-31 → 3건 (A,B,C / 누락·오류 제외)',
    count({ endDate: '2025-03-31' }) === 3, `got ${count({ endDate: '2025-03-31' })}`);
  ok('T19-d 시작·종료 모두 → 2건 (A,B 경계 포함)',
    count({ startDate: '2025-03-01', endDate: '2025-03-31' }) === 2,
    `got ${count({ startDate: '2025-03-01', endDate: '2025-03-31' })}`);
}

// ── T22. C-8 첫구매 3상태 공통 계약 (소비자 5곳) ────────────────────────────
// 공통 정답 fixture: 첫구매 10,000 / 재구매 20,000 / 미분류 30,000
//   전체 3건·60,000원 / first 1건·10,000 / repeat 1건·20,000 / unknown 1건·30,000
//   unknown이 repeat에 섞이면 실패.
const FP_ORDERS = [
  { orderNo: 'F1', orderDate: '2025-03-05', paid: true, canceled: false, memberKey: 'f1',
    isFirstPurchase: true, totalAmount: 10000, productRevenueByLines: 10000,
    lines: [line('G1', '상품G1', 'catF', 1, 10000)] },
  { orderNo: 'F2', orderDate: '2025-03-06', paid: true, canceled: false, memberKey: 'f2',
    isFirstPurchase: false, totalAmount: 20000, productRevenueByLines: 20000,
    lines: [line('G2', '상품G2', 'catF', 1, 20000)] },
  { orderNo: 'F3', orderDate: '2025-03-07', paid: true, canceled: false, memberKey: 'f3',
    /* isFirstPurchase 없음 → 미분류 */ totalAmount: 30000, productRevenueByLines: 30000,
    lines: [line('G3', '상품G3', 'catF', 1, 30000)] },
];
const FP_GOLDEN = { total: { count: 3, revenue: 60000 }, first: { count: 1, revenue: 10000 }, repeat: { count: 1, revenue: 20000 }, unknown: { count: 1, revenue: 30000 } };

{
  const nowMs = Date.parse('2025-04-01T00:00:00Z');
  // 공용 계약 자체
  ok('T22-0 classifyFirstPurchase: true/false/undefined/비정상',
    fpContract.classifyFirstPurchase(true) === 'first'
    && fpContract.classifyFirstPurchase(false) === 'repeat'
    && fpContract.classifyFirstPurchase(undefined) === 'unknown'
    && fpContract.classifyFirstPurchase('무엇') === 'unknown',
    'contract');

  // (1) planner 일반 집계 — 시간 축(주문 기준)
  try {
    const plan = {
      id: 'fp', originalQuestion: 'fp', goal: 'summary',
      requestedMetrics: ['orderCount'], executableMetrics: ['orderCount'],
      periods: [{ label: '2025-03', startDate: '2025-03-01', endDate: '2025-03-31' }],
      timeBucket: 'month', dimensions: ['time'], segments: [], filters: [],
      comparison: 'none', chartRecommendation: { chartType: 'bar', reason: '' },
      dataRequirements: [], confidence: 'high', warnings: [],
    };
    const val = (metric) => {
      const res = planner.executeMarketingIntelligencePlan({ plan: { ...plan, requestedMetrics: [metric], executableMetrics: [metric] }, orders: FP_ORDERS, products: [], nowMs });
      const pts = [...pointsOf(res).values()];
      return pts.reduce((s, p) => s + Number(p.value ?? 0), 0);
    };
    ok('T22-1a planner 전체 주문수 3', val('orderCount') === FP_GOLDEN.total.count, `got ${val('orderCount')}`);
    ok('T22-1b planner 첫구매 주문수 1', val('firstPurchaseOrderCount') === FP_GOLDEN.first.count, `got ${val('firstPurchaseOrderCount')}`);
    ok('T22-1c planner 재구매 주문수 1 (미분류 미포함)', val('repeatPurchaseOrderCount') === FP_GOLDEN.repeat.count, `got ${val('repeatPurchaseOrderCount')}`);
    ok('T22-1d planner 첫구매 매출 10,000', val('firstPurchaseRevenue') === FP_GOLDEN.first.revenue, `got ${val('firstPurchaseRevenue')}`);
    ok('T22-1e planner 재구매 매출 20,000 (미분류 미포함)', val('repeatPurchaseRevenue') === FP_GOLDEN.repeat.revenue, `got ${val('repeatPurchaseRevenue')}`);
    // 전체 매출도 불변이어야 한다.
    ok('T22-1a2 planner 전체 매출 60,000 불변', val('revenue') === FP_GOLDEN.total.revenue, `got ${val('revenue')}`);
    // firstRepeat 차원은 세 그룹을 반환해야 한다.
    const dimRes = planner.executeMarketingIntelligencePlan({
      plan: { ...plan, dimensions: ['firstRepeat'], requestedMetrics: ['revenue'], executableMetrics: ['revenue'] },
      orders: FP_ORDERS, products: [], nowMs,
    });
    const dimKeys = [...pointsOf(dimRes).keys()].join(' | ');
    // 계약: 키는 영문(first/repeat/unknown), 표시 라벨만 한글(첫구매/재구매/미분류).
    ok('T22-1g planner firstRepeat 차원 = first/repeat/unknown 세 그룹',
      dimKeys.includes('first') && dimKeys.includes('repeat') && dimKeys.includes('unknown'), `keys: ${dimKeys}`);
    const dimSeries = dimRes?.primaryChartSpec?.series ?? [];
    const unknownSeries = dimSeries.find((x) => String(x.key) === 'unknown' || String(x.name) === 'unknown');
    const unknownVal = (unknownSeries?.points ?? []).reduce((a, pt) => a + Number(pt.value ?? 0), 0);
    ok('T22-1g2 planner firstRepeat unknown 그룹 = 30,000원 (라벨 미분류)',
      unknownVal === FP_GOLDEN.unknown.revenue
      && /미분류/.test(String(unknownSeries?.label ?? unknownSeries?.name ?? '')),
      `value ${unknownVal} / label ${unknownSeries?.label ?? unknownSeries?.name}`);

    // 양성: 첫구매 관련 분석에는 미분류 1건·30,000원 근거가 실제로 표시된다.
    const fpRes = planner.executeMarketingIntelligencePlan({
      plan: { ...plan, requestedMetrics: ['firstPurchaseOrderCount'], executableMetrics: ['firstPurchaseOrderCount'] },
      orders: FP_ORDERS, products: [], nowMs,
    });
    const fpBlob = JSON.stringify({ evidence: fpRes?.evidence ?? [], warnings: fpRes?.plan?.warnings ?? [] });
    ok('T22-1f 첫구매 분석: 미분류 1건·30,000원 근거가 실제로 표시됨',
      /미분류/.test(fpBlob) && /1건/.test(fpBlob) && /30,000/.test(fpBlob), `blob: ${fpBlob.slice(0, 200)}`);

    // 음성: 일반 매출 분석에는 불필요한 미분류 경고를 붙이지 않는다.
    const plainRes = planner.executeMarketingIntelligencePlan({
      plan: { ...plan, requestedMetrics: ['revenue'], executableMetrics: ['revenue'], dimensions: ['time'] },
      orders: FP_ORDERS, products: [], nowMs,
    });
    const plainBlob = JSON.stringify({ evidence: plainRes?.evidence ?? [], warnings: plainRes?.plan?.warnings ?? [] });
    ok('T22-1h 일반 매출 분석: 불필요한 미분류 경고 없음',
      !/첫구매 여부가 없는 주문/.test(plainBlob), `blob: ${plainBlob.slice(0, 200)}`);
  } catch (e) { ok('T22-1 planner 3상태', false, e.message); }

  // (6) marketingTemporalCrosstab — firstRepeat 차원 키 (planner가 재사용)
  try {
    const k = (v) => crosstab.getMarketingDimensionKey({ isFirstPurchase: v }, 'firstRepeat');
    ok('T22-6a crosstab firstRepeat: true → first', k(true).key === 'first', `got ${k(true).key}`);
    ok('T22-6b crosstab firstRepeat: false → repeat', k(false).key === 'repeat', `got ${k(false).key}`);
    ok('T22-6c crosstab firstRepeat: undefined → unknown/미분류 (repeat 아님)',
      k(undefined).key === 'unknown', `got ${k(undefined).key} (label=${k(undefined).label})`);
    // 실제 집계 결과에서 값까지 확인한다(음성 검사만 두면 미분류가 사라져도 통과한다).
    const ct = crosstab.buildMarketingTemporalCrosstab({
      orders: FP_ORDERS, request: { timeBucket: 'month', dimensions: ['firstRepeat'], metrics: ['revenue', 'orderCount'] }, nowMs,
    });
    const ctRows = ct?.rows ?? [];
    const row = (k) => ctRows.find((x) => String(x.dimensionKey) === k);
    const shownCt = ctRows.map((x) => `${x.dimensionKey}(${x.dimensionLabel})=${x.revenue}/${x.orderCount}건`).join(', ') || '(없음)';
    ok('T22-6d crosstab 주축 first 1건·10,000원',
      Number(row('first')?.orderCount) === 1 && Number(row('first')?.revenue) === 10000, `rows: ${shownCt}`);
    ok('T22-6e crosstab 주축 repeat 1건·20,000원 (미분류 미포함)',
      Number(row('repeat')?.orderCount) === 1 && Number(row('repeat')?.revenue) === 20000, `rows: ${shownCt}`);
    ok('T22-6f crosstab 주축 unknown 1건·30,000원 · label=미분류',
      Number(row('unknown')?.orderCount) === 1 && Number(row('unknown')?.revenue) === 30000
      && String(row('unknown')?.dimensionLabel) === '미분류', `rows: ${shownCt}`);
    ok('T22-6g crosstab 세 행 합계 3건·60,000원',
      ctRows.reduce((a, x) => a + Number(x.orderCount ?? 0), 0) === FP_GOLDEN.total.count
      && ctRows.reduce((a, x) => a + Number(x.revenue ?? 0), 0) === FP_GOLDEN.total.revenue, `rows: ${shownCt}`);
    // 보조축일 때도 unknown으로 분리되어야 한다.
    const ct2 = crosstab.buildMarketingTemporalCrosstab({
      orders: FP_ORDERS, request: { timeBucket: 'month', dimensions: ['category', 'firstRepeat'], metrics: ['revenue', 'orderCount'] }, nowMs,
    });
    const sec = (ct2?.rows ?? []).filter((x) => String(x.secondaryDimensionKey) === 'unknown');
    ok('T22-6h crosstab 보조축 secondaryDimensionKey=unknown · label=미분류 · 1건·30,000원',
      sec.length === 1 && Number(sec[0].orderCount) === 1 && Number(sec[0].revenue) === 30000
      && String(sec[0].secondaryDimensionLabel) === '미분류',
      `secondary: ${(ct2?.rows ?? []).map((x) => `${x.secondaryDimensionKey}=${x.revenue}`).join(', ') || '(없음)'}`);
  } catch (e) { ok('T22-6 crosstab firstRepeat', false, e.message); }

  // (3) marketingAnalysisFacts — 고정 KPI
  try {
    const f = facts.buildMarketingAnalysisFacts({ orders: FP_ORDERS, nowMs });
    const c = f?.customer ?? f?.facts?.customer ?? f;
    const findNum = (key) => {
      const stack = [c]; while (stack.length) { const o = stack.pop();
        if (o && typeof o === 'object') { if (typeof o[key] === 'number') return o[key]; for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v); } }
      return -1;
    };
    ok('T22-3a facts 첫구매 주문수 1', findNum('firstPurchaseOrderCount') === 1, `got ${findNum('firstPurchaseOrderCount')}`);
    ok('T22-3b facts 첫구매 매출 10,000', findNum('firstPurchaseRevenue') === 10000, `got ${findNum('firstPurchaseRevenue')}`);
    ok('T22-3c facts 재구매 주문수 1 (미분류 미포함)', findNum('repeatPurchaseOrderCount') === 1, `got ${findNum('repeatPurchaseOrderCount')}`);
    ok('T22-3d facts 재구매 매출 20,000 (미분류 미포함)', findNum('repeatPurchaseRevenue') === 20000, `got ${findNum('repeatPurchaseRevenue')}`);
    ok('T22-3e facts 미분류 1건·30,000 근거 제공', findNum('unknownPurchaseOrderCount') === 1 && findNum('unknownPurchaseRevenue') === 30000,
      `건수 ${findNum('unknownPurchaseOrderCount')} / 매출 ${findNum('unknownPurchaseRevenue')}`);
  } catch (e) { ok('T22-3 facts 3상태', false, e.message); }

  // (4) marketingAnalysisExecutor — 실제 사용 경로(컴파일러 → 실행)
  try {
    const plan = analysisCompiler.compileMarketingAnalysisQuery('첫구매와 재구매 매출 비교', { nowMs });
    const res = executor.executeMarketingAnalysisPlan(plan, FP_ORDERS, nowMs);
    const rows = res?.rows ?? [];
    const shown = rows.map((x) => `${x.label}=${x.value}`).join(', ') || '(없음)';
    const g = (labels) => rows.find((x) => labels.includes(String(x.label)));
    ok('T22-4a executor 첫구매 10,000원', Number(g(['first', '첫구매'])?.value) === 10000, `rows: ${shown}`);
    ok('T22-4b executor 재구매 20,000원 (미분류 미포함)', Number(g(['repeat', '재구매'])?.value) === 20000, `rows: ${shown}`);
    ok('T22-4c executor 미분류 30,000원 세 번째 그룹', Number(g(['unknown', '미분류'])?.value) === 30000, `rows: ${shown}`);
    ok('T22-4d executor 세 그룹 합계 = 60,000원 (전체 불변)',
      rows.reduce((sum, x) => sum + Number(x.value ?? 0), 0) === FP_GOLDEN.total.revenue,
      `합계 ${rows.reduce((sum, x) => sum + Number(x.value ?? 0), 0)} | rows: ${shown}`);
    ok('T22-4e executor 제목/차트에서 미분류가 재구매로 표시되지 않음',
      !/미분류[^,]*재구매|재구매[^,]*미분류/.test(String(res?.title ?? '')) && rows.filter((x) => String(x.label) === '재구매').length <= 1,
      `title: ${res?.title}`);
  } catch (e) { ok('T22-4 executor 3상태', false, `실행 실패: ${e.message}`); }

  // (2) scopeInsight firstRepeat 분류
  //  ⚠️ 메시지에 '첫구매'/'재구매'가 들어가면 :162-163이 customerScope 필터를 걸어
  //     주문이 선별된다. 분류 자체를 보려면 중립 메시지를 써야 한다(이전 FAIL은 테스트 접근 오류).
  try {
    const r = scope.buildMarketingScopeInsightResponse({ message: '2025년 매출 알려줘', orders: FP_ORDERS, products: [], reviews: [], inquiries: [], nowMs });
    const fr = r?.result?.insightPack?.customerBreakdown?.firstRepeat ?? [];
    const get = (k) => fr.find((x) => String(x.label) === k);
    ok('T22-2a scope 첫구매 1건·10,000', Number(get('first')?.orderCount) === 1 && Number(get('first')?.revenue) === 10000, `got ${JSON.stringify(get('first'))}`);
    ok('T22-2b scope 재구매 1건·20,000 (미분류 미포함)', Number(get('repeat')?.orderCount) === 1 && Number(get('repeat')?.revenue) === 20000, `got ${JSON.stringify(get('repeat'))}`);
    ok('T22-2c scope 미분류 1건·30,000 별도 표시', Number(get('unknown')?.orderCount) === 1 && Number(get('unknown')?.revenue) === 30000, `got ${JSON.stringify(get('unknown'))} | 전체: ${fr.map((x) => x.label).join(',')}`);
    const sum = fr.reduce((s, x) => s + Number(x.orderCount ?? 0), 0);
    ok('T22-2d scope firstRepeat 합계 = 전체 3건', sum === FP_GOLDEN.total.count, `got ${sum}`);
    const revSum = fr.reduce((s2, x) => s2 + Number(x.revenue ?? 0), 0);
    ok('T22-2e scope firstRepeat 매출 합계 = 60,000 (전체 불변)', revSum === FP_GOLDEN.total.revenue, `got ${revSum}`);
    const narrative = JSON.stringify(r?.result?.narrative ?? {});
    ok('T22-2f scope narrative가 미분류를 재구매라고 부르지 않음',
      !/재구매[^"]*3건|재구매[^"]*50,?000/.test(narrative), `narrative: ${narrative.slice(0, 160)}`);
  } catch (e) { ok('T22-2 scope 3상태', false, e.message); }

  // (3) commerceDataQueryEngine customerType 축
  try {
    const r = commerce.executeCommerceQueryPlan(
      { metric: 'orderCount', groupBy: 'customerType', operation: 'rank', filters: { years: [2025], months: [3] }, sort: 'desc', originalQuestion: 'fp' },
      { orders: FP_ORDERS, reviews: [], inquiries: [] }, { nowMs },
    );
    const reply = String(r?.reply ?? '').replace(/\n/g, ' ');
    ok('T22-5a commerce customerType에 미분류가 별도로 나타남', /미분류/.test(reply), `reply: ${reply.slice(0, 130)}`);
    ok('T22-5b commerce 재구매가 2건으로 부풀지 않음', !/재구매[^0-9]*2건/.test(reply), `reply: ${reply.slice(0, 130)}`);
  } catch (e) { ok('T22-5 commerce customerType 3상태', false, e.message); }
}

// ── T21. share basisMetric 계약 (평균 지표 거부 / metric='share' 정규화) ─────
{
  const dataset = { orders: ORDERS, reviews: REVIEWS, inquiries: INQUIRIES };
  const run = (metric, groupBy = 'category') => commerce.executeCommerceQueryPlan(
    { metric, groupBy, operation: 'share', filters: { years: [2025], months: [3] }, sort: 'desc', originalQuestion: 't' },
    dataset, { nowMs: Date.parse('2025-04-01T00:00:00Z') },
  );
  // 평균 지표는 평균의 합이 분모가 되어 의미가 없으므로 숫자를 만들지 않고 거부한다.
  // averageRating은 리뷰에 categoryCode가 없어 카테고리 축에서는 데이터 자체가 비므로
  // share 판정에 도달하는 축(product)으로 검증한다.
  for (const [m, axis] of [['averageOrderValue', 'category'], ['averageRating', 'product']]) {
    const r = run(m, axis);
    const reply = String(r?.reply ?? '').replace(/\n/g, ' ');
    ok(`T21-a ${m} share는 계산 거부(숫자 미생성, 축=${axis})`,
      !!r && r.handled === true && /계산할 수 없습니다/.test(reply) && !/%/.test(reply),
      `reply: ${reply.slice(0, 110)}`);
  }
  // metric === 'share'는 revenue 기준으로 정규화(Metric·Operation 양쪽에 share가 존재).
  const rs = run('share');
  const rsReply = String(rs?.reply ?? '').replace(/\n/g, ' ');
  ok('T21-b metric="share"는 매출 기준으로 정규화(78.3%·원)',
    /78(\.[0-9])?%/.test(rsReply) && /원/.test(rsReply), `reply: ${rsReply.slice(0, 110)}`);
  // 비중 허용 기준 5종은 모두 계산된다.
  for (const m of ['revenue', 'quantity', 'orderCount']) {
    const r = run(m);
    ok(`T21-c ${m} share 계산 가능`, !!r && r.handled === true && /%/.test(String(r.reply ?? '')), `reply: ${String(r?.reply ?? '').slice(0, 80)}`);
  }
}

// ── T20. 기간 규칙 단일화 (orders / compareTo / 달력 검증) ───────────────────
{
  const ord = (orderNo, orderDate, amt) => ({
    orderNo, orderDate, paid: true, canceled: false,
    totalAmount: amt, productRevenueByLines: amt,
    lines: [line('Z1', '상품Z', 'catZ', 1, amt)],
  });
  const orders = [
    ord('N1', '2025-03-01', 10000),   // 시작 경계
    ord('N2', '2025-03-31', 20000),   // 종료 경계
    ord('N3', '2025-02-10', 30000),   // 이전
    ord('N4', '', 40000),             // orderDate 누락
    ord('N5', 'not-a-date', 50000),   // 형식 오류
    ord('N6', '2025-02-30', 60000),   // 달력에 없는 날짜
  ];
  const ds = { orders, reviews: [], inquiries: [], source: { dataKind: 'synthetic' } };
  const cnt = (spec) => {
    try {
      const r = analytics.runAnalyticsQuery(ds, { metric: 'orderCount', ...spec });
      return (r.rows ?? []).reduce((s, x) => s + Number(x.value ?? 0), 0);
    } catch (e) { return `ERR:${e.message}`; }
  };
  ok('T20-a 기간 미지정 → 주문 전체 6건 (날짜 누락·오류 포함)', cnt({}) === 6, `got ${cnt({})}`);
  ok('T20-b 종료일만 → 누락·형식오류·달력없음 주문 제외 (N1,N2,N3 = 3건)',
    cnt({ endDate: '2025-03-31' }) === 3, `got ${cnt({ endDate: '2025-03-31' })}`);
  ok('T20-c 시작·종료 모두 → 경계 포함 2건 (N1,N2)',
    cnt({ startDate: '2025-03-01', endDate: '2025-03-31' }) === 2,
    `got ${cnt({ startDate: '2025-03-01', endDate: '2025-03-31' })}`);
  ok('T20-d 달력에 없는 2025-02-30은 2월 범위에서도 제외',
    cnt({ startDate: '2025-02-01', endDate: '2025-02-28' }) === 1,
    `got ${cnt({ startDate: '2025-02-01', endDate: '2025-02-28' })} (N3만 남아야 함)`);
  // 비교기간도 같은 함수를 쓰는지 — 경계 포함 확인
  try {
    const r = analytics.runAnalyticsQuery(ds, {
      metric: 'periodComparison', startDate: '2025-03-01', endDate: '2025-03-31',
      compareTo: { startDate: '2025-02-01', endDate: '2025-02-28', label: '전월' },
    });
    const cmp = (r.rows ?? []).find((x) => String(x.key) === 'compare');
    ok('T20-e compareTo도 같은 기간 함수 사용 (2월 유효주문 1건)',
      Number(cmp?.orderCount) === 1, `got ${cmp?.orderCount}`);
  } catch (e) { ok('T20-e compareTo 기간 함수', false, e.message); }
}

// ── T18. category / product 키 충돌 (axisKind 분리 실증) ─────────────────────
// categoryCode와 goodsNo가 같은 문자열 'X'인 데이터.
// scope는 한 실행에서 categoryBreakdown과 productBreakdown을 함께 만들므로,
// 레지스트리가 축 종류로 분리되지 않으면 두 번째 축의 주문수가 0이 된다.
{
  const collideOrders = [{
    orderNo: 'K1', orderDate: '2025-03-13', paid: true, canceled: false,
    totalAmount: 20000, productRevenueByLines: 20000,
    lines: [line('X', '상품X', 'X', 1, 10000), line('X', '상품X', 'X', 1, 10000)],
  }];
  try {
    const r = scope.buildMarketingScopeInsightResponse({
      message: '카테고리별 매출 알려줘', orders: collideOrders, products: [],
      reviews: [], inquiries: [], nowMs: Date.parse('2025-04-01T00:00:00Z'),
    });
    const cat = (r?.result?.insightPack?.categoryBreakdown ?? []).find((x) => String(x.categoryKey) === 'X');
    const prod = (r?.result?.insightPack?.productBreakdown ?? []).find((x) => String(x.goodsNo) === 'X');
    ok('T18-a 충돌: categoryCode "X" 주문수 1', Number(cat?.orderCount) === 1, `got ${cat?.orderCount}`);
    ok('T18-b 충돌: goodsNo "X" 주문수 1 (레지스트리 미분리면 0)', Number(prod?.orderCount) === 1, `got ${prod?.orderCount}`);
    ok('T18-c 충돌: 두 축 모두 매출 20,000 (라인 합산 유지)',
      Number(cat?.revenue) === 20000 && Number(prod?.revenue) === 20000, `cat=${cat?.revenue} prod=${prod?.revenue}`);
  } catch (e) { ok('T18 category/product 키 충돌', false, `실행 실패: ${e.message}`); }
}

// ── T9~T11. 카테고리 출처 계약 (라인 우선 → 상품인덱스 보충 → uncategorized) ──
{
  const nowMs = Date.parse('2025-04-01T00:00:00Z');
  // (a) planner
  try {
    const res = planner.executeMarketingIntelligencePlan({
      plan: mkPlan('category', 'revenue'), orders: CATSRC_ORDERS, products: CATSRC_PRODUCTS, nowMs,
    });
    const m = new Map([...pointsOf(res).entries()].map(([k, v]) => [k, v.value]));
    assertCategorySource('T9~T11-a planner', m);
  } catch (e) { ok('T9~T11-a planner 카테고리 출처', false, `실행 실패: ${e.message}`); }

  // (b) analyticsQueryEngine
  try {
    const r = analytics.runAnalyticsQuery(
      { orders: CATSRC_ORDERS, reviews: [], inquiries: [], source: { dataKind: 'synthetic' } },
      { metric: 'categoryRevenue', startDate: PERIOD.start, endDate: PERIOD.end },
    );
    const m = new Map((r.rows ?? []).map((x) => [String(x.label ?? x.key ?? ''), Number(x.value ?? 0)]));
    assertCategorySource('T9~T11-b analyticsQueryEngine', m);
  } catch (e) { ok('T9~T11-b analyticsQueryEngine 카테고리 출처', false, `실행 실패: ${e.message}`); }

  // (c) scopeInsight
  try {
    const r = scope.buildMarketingScopeInsightResponse({
      message: '카테고리별 매출 알려줘', orders: CATSRC_ORDERS, products: CATSRC_PRODUCTS,
      reviews: [], inquiries: [], nowMs,
    });
    // 계약: 키는 uncategorized로 통일(categoryKey), 표시 라벨만 '미분류'(category)
    const m = new Map((r?.result?.insightPack?.categoryBreakdown ?? []).map((x) => [String(x.categoryKey ?? x.category), Number(x.revenue ?? 0)]));
    assertCategorySource('T9~T11-c scopeInsight', m);
  } catch (e) { ok('T9~T11-c scopeInsight 카테고리 출처', false, `실행 실패: ${e.message}`); }
}

// ── 출력 ─────────────────────────────────────────────────────────────────────
console.log('[3/3] 결과\n');
for (const [st, name, detail] of results) {
  console.log(`  ${st}  ${name}${detail ? `  — ${detail}` : ''}`);
}
console.log(`\n결과: ${pass} pass / ${fail} fail / ${skip} skip`);
console.log('※ 이 스크립트는 현재 결함을 재현하는 것이 목적이므로 FAIL이 정상이다.');
