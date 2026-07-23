#!/usr/bin/env node
/*
 * scripts/smoke-godo-order-mapping-01-d3-provenance-gate-v0.mjs
 * GODO-ORDER-MAPPING-01 (D-3) — LEGACY 청소의 **입구 조건(게이트)** 재정의 (RED→GREEN)
 *
 * 배경(Production 실관측, 2026-07-23):
 *   D-2 배포 후에도 실제 저장상태의 유령 주문이 첫 hydration 에서 제거되지 않았다.
 *   원인: 청소 여부를 **전역 sourceType 하나로** 판정했는데, 실제 저장상태는
 *     전역 sourceType = 'api_mock_fallback'   (데모 기본 스냅샷 위에 쌓인 흔적)
 *     resourceProvenance.orders = actual / success   (주문만 실제 동기화된 권위 근거)
 *   인 혼합 자료였다. 게이트가 걸러내어 청소가 아예 실행되지 않았다.
 *
 *   dataSourceProvenanceContract 는 이미 "전역 sourceType 은 마지막 동기화 리소스 흔적이라
 *   리소스별을 증명하지 못한다"고 명시한다. D-2 게이트는 그 비권위 신호를 썼던 것이다.
 *
 * D-3 판정 원칙(사장 확정):
 *   ① 전역 출처가 **API 계보**인 경우만 대상: api_proxy_real · api_proxy_sandbox · api_mock_fallback
 *   ② 동시에 resourceProvenance.orders 가
 *      provenance='actual' · status='success' · substitutionBlocked !== true 인 경우만 대상
 *   count·userLabel 은 낡거나 표시용일 수 있으므로 **권위 판정에 쓰지 않는다**.
 *
 * 이 스모크는 게이트의 **경우의 수 전체**를 한 번에 잠근다(반대 사례 포함).
 * 특정 스냅샷 ID·건수·날짜·문구를 제품 코드가 하드코딩하지 않는지도 함께 본다.
 *
 * 실행: node scripts/smoke-godo-order-mapping-01-d3-provenance-gate-v0.mjs  (RED 단계에서는 exit 1)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-d3-'));

const MIGRATION_SRC = path.join(REPO, 'src', 'services', 'legacyOrderSnapshotMigration.ts');
const PROVENANCE_SRC = path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts');
const INQUIRY_SRC = path.join(REPO, 'src', 'services', 'inquiryStatusContract.ts');

let P = null, Q = null, M = null;
try {
  execFileSync(
    process.execPath,
    [tscBin, PROVENANCE_SRC, INQUIRY_SRC, MIGRATION_SRC, '--ignoreConfig',
     '--rootDir', path.join(REPO, 'src'), '--outDir', tmp,
     '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'],
    { stdio: 'pipe' }
  );
  const dir = path.join(tmp, 'services');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const p = path.join(dir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const load = async (n) => import(pathToFileURL(path.join(tmp, 'services', n)).href);
  P = await load('dataSourceProvenanceContract.js');
  Q = await load('inquiryStatusContract.js');
  M = await load('legacyOrderSnapshotMigration.js');
} catch (e) {
  console.error('[smoke] 클라이언트 tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const migrationSource = readFileSync(MIGRATION_SRC, 'utf8');

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== GODO-ORDER-MAPPING-01 (D-3) — LEGACY 청소 입구 조건 재정의 (RED→GREEN) ===');

// ── fixture (익명 — 실주문번호·PII·특정 날짜 없음) ────────────────────────────
const ghostOrder = () => ({
  id: 'order-legacy-0', orderNo: '', orderDate: '', customerNameMasked: '고*',
  productName: '', optionName: '단품', quantity: 1,
  paymentStatus: '결제완료', deliveryStatus: '배송대기', invoiceNo: '', amount: 0, riskFlags: []
});
const realZeroAmountOrder = () => ({
  id: 'order-real-0', orderNo: 'ANON-ORDER-0009', orderDate: '2026-07-09', customerNameMasked: '김*',
  productName: '(익명 상품명)', optionName: '단품', quantity: 1,
  paymentStatus: '결제완료', deliveryStatus: '배송대기', invoiceNo: '', amount: 0, riskFlags: []
});

// resourceProvenance.orders 레코드 조립기 — 권위 필드만 인자로 받는다.
const prov = ({ provenance = 'actual', status = 'success', substitutionBlocked = false, count = 1, userLabel = '실제 데이터' } = {}) =>
  ({ resource: 'orders', status, provenance, userLabel, count, substitutionBlocked });

const qualityReportFixture = () => ({
  totalRows: 13, validRows: 13, warningRows: 2, errorRows: 0, missingRequiredFields: [],
  duplicateRows: 0, privacyMaskedCount: 0, riskFlagCount: 2, qualityScore: 97,
  notes: ['상품 재고가 안전재고 수량(5개) 이하입니다.']
});

const snap = (orders, sourceType, ordersProv) => ({
  id: 'snapshot-anon', sourceType, importedAt: '2026-07-20T00:00:00.000Z',
  orders,
  inquiries: [{ id: 'inq-1', inquiryDate: '2026-07-01', category: '배송', customerNameMasked: '이*', title: 't', content: 'c', status: '답변대기', priority: 'medium', sentiment: 'neutral', riskFlags: [] }],
  reviews: [{ id: 'rev-1', reviewDate: '2026-07-01', productName: '(익명 상품명)', rating: 5, content: 'c', sentiment: 'positive', needsReply: false, riskFlags: [] }],
  inventory: [{ id: 'inv-1', productName: '(익명 상품명)', optionName: '단품', stock: 3, safetyStock: 5, status: 'warning', riskFlags: ['low_stock'] }],
  sales: [{ date: '2026-07-01', totalSales: 0, orderCount: 0, conversionRate: 0, topProducts: [] }],
  qualityReport: qualityReportFixture(),
  ...(ordersProv === undefined ? {} : { resourceProvenance: { orders: ordersProv } })
});

// App.tsx hydration 경계 재현 (복원 → 유령 청소 → 문의 canonical화 + 출처 마이그레이션)
const withCanonicalInquiries = (s) => {
  if (!s) return s;
  const inquiries = Array.isArray(s.inquiries) ? Q.normalizeInquiryRecords(s.inquiries) : s.inquiries;
  const counts = { orders: s.orders?.length ?? 0, inquiries: s.inquiries?.length ?? 0, reviews: s.reviews?.length ?? 0, inventory: s.inventory?.length ?? 0, sales: s.sales?.length ?? 0 };
  return { ...s, inquiries, resourceProvenance: P.migrateResourceProvenance(s.sourceType, s.resourceProvenance, counts) };
};
const hydrate = (saved) => withCanonicalInquiries(M.migrateLegacyGhostOrders(saved).snapshot);

// ── [BASE] D-3 전/후 모두 참 ──────────────────────────────────────────────────
// Production 실관측 조합을 그대로 재현한 스냅샷(개인정보 없음)
const prodShaped = () => snap([ghostOrder()], 'api_mock_fallback', prov({ count: 1 }));

base('B1. Production 관측 조합 재현: 전역 api_mock_fallback + orders actual/success',
  (() => { const s = prodShaped();
    return s.sourceType === 'api_mock_fallback' && s.resourceProvenance.orders.provenance === 'actual'
      && s.resourceProvenance.orders.status === 'success' && s.resourceProvenance.orders.substitutionBlocked === false; })(),
  '전역은 대체 흔적, orders 만 실제 성공 근거');

base('B2. 그 fixture 의 주문 1건은 과거 유령 서명과 일치한다',
  M.isLegacyGhostOrder(ghostOrder()) === true, 'isLegacyGhostOrder=true');

base('B3. 실제 신원 필드가 있는 0원 주문은 유령 서명이 아니다',
  M.isLegacyGhostOrder(realZeroAmountOrder()) === false, 'isLegacyGhostOrder=false');

base('B4. 계약상 전역 api_mock_fallback 은 리소스별 근거를 증명하지 못한다(혼합 저장자료 가능)',
  P.classifyResource({ sourceType: 'api_mock_fallback', requested: 'real' }).kind === 'unavailable',
  '전역만으로는 actual 로 승격 불가 → 리소스별 근거가 권위');

base('B5. 제품 코드가 특정 스냅샷 ID·건수·날짜·문구를 하드코딩하지 않는다',
  !/snapshot-demo-default|snapshot-anon|ANON-ORDER|2026-07-\d\d|count\s*===\s*1/.test(migrationSource),
  '하드코딩 없음');

// ── [RED] D-3 게이트 경우의 수 전체 ───────────────────────────────────────────
console.log('');

// (1) Production 실관측 조합 — 반드시 청소돼야 한다
const h1 = hydrate(prodShaped());
red('G1. 전역 api_mock_fallback + orders actual/success → 유령 제거 (Production 실관측 조합)',
  h1.orders.length === 0, `orders=${h1.orders.length}건`, 'orders=0건');
red('G2. 그 경우 orders 출처 건수도 0으로 정정',
  h1.resourceProvenance?.orders?.count === 0, `count=${h1.resourceProvenance?.orders?.count}`, 'count=0');
red('G3. 그 경우 출처 신분은 actual/success 유지 (연결 안 됨·시험 데이터로 강등 금지)',
  h1.resourceProvenance?.orders?.provenance === 'actual' && h1.resourceProvenance?.orders?.status === 'success',
  `provenance=${h1.resourceProvenance?.orders?.provenance} · status=${h1.resourceProvenance?.orders?.status}`,
  'actual / success 유지');

// (2) 기존 경로 — 전역이 실제 API 계보인 경우도 계속 청소
for (const st of ['api_proxy_real', 'api_proxy_sandbox']) {
  const h = hydrate(snap([ghostOrder()], st, prov()));
  red(`G4-${st}. 전역 ${st} + orders actual/success → 유령 제거 (D-2 동작 유지)`,
    h.orders.length === 0 && h.resourceProvenance?.orders?.count === 0,
    `orders=${h.orders.length}건 · count=${h.resourceProvenance?.orders?.count}`, 'orders=0건 · count=0');
}

// (3) 반대 사례 — orders 리소스 근거가 실제가 아니면 제거 금지
const keepCases = [
  ['G5. orders fixture → 제거 금지', 'api_mock_fallback', prov({ provenance: 'fixture', userLabel: '시험 데이터' })],
  ['G6. orders simulation → 제거 금지', 'api_proxy_real', prov({ provenance: 'simulation', userLabel: '시험 데이터' })],
  ['G7. orders unavailable → 제거 금지', 'api_proxy_real', prov({ provenance: 'unavailable', status: 'unavailable', userLabel: '연결 안 됨' })],
  ['G8. orders actual 이지만 status=unavailable → 제거 금지', 'api_proxy_real', prov({ status: 'unavailable' })],
  ['G9. orders actual 이지만 substitutionBlocked=true → 제거 금지', 'api_proxy_real', prov({ substitutionBlocked: true })],
  ['G10. orders 출처 근거 자체가 없음 → fail-closed 제거 금지', 'api_proxy_real', undefined],
  ['G11. 전역 demo → 제거 금지', 'demo', prov()],
  ['G12. 전역 mock → 제거 금지', 'mock', prov()],
  ['G13. 전역 synthetic_test → 제거 금지', 'synthetic_test', prov()],
  ['G14. 전역 csv → orders 표기가 actual 이어도 제거 금지', 'csv', prov()],
  ['G15. 전역 json → orders 표기가 actual 이어도 제거 금지', 'json', prov()],
  ['G16. 전역 manual(수기) → orders 표기가 actual 이어도 제거 금지', 'manual', prov()]
];
for (const [name, st, pv] of keepCases) {
  const out = M.migrateLegacyGhostOrders(snap([ghostOrder()], st, pv));
  red(name, out.snapshot.orders.length === 1 && out.removed === 0,
    `orders=${out.snapshot.orders.length}건 · removed=${out.removed}`, '유령 보존(removed=0)');
}

// (4) 정상 주문 보호 — 게이트가 열린 조합에서도
const h2 = hydrate(snap([realZeroAmountOrder()], 'api_mock_fallback', prov()));
red('G17. 게이트가 열려도 신원 있는 정상 0원 주문은 반드시 유지',
  h2.orders.length === 1 && h2.orders[0].amount === 0 && h2.orders[0].orderNo === 'ANON-ORDER-0009',
  `orders=${h2.orders.length}건`, 'orders=1건 · 0원 주문 보존');

const h3 = hydrate(snap([ghostOrder(), realZeroAmountOrder()], 'api_mock_fallback', prov({ count: 2 })));
red('G18. 유령+정상 혼재 → 유령만 제거하고 건수 정정',
  h3.orders.length === 1 && h3.orders[0].orderNo === 'ANON-ORDER-0009' && h3.resourceProvenance?.orders?.count === 1,
  `남은=${h3.orders.length}건 · count=${h3.resourceProvenance?.orders?.count}`, '남은 1건(정상) · count=1');

red('G19. 살아남은 주문은 저장 원본과 동일 (필드 추가·PII 변형 없음)',
  JSON.stringify(h3.orders[0]) === JSON.stringify(realZeroAmountOrder()),
  '남은 주문이 원본과 다름', '원본과 바이트 동일');

// (5) 주변 불변 — 품질보고서·타 도메인·멱등·무변형
red('G20. qualityReport 는 청소가 일어나도 불변 (도메인 근거 없음 — D-2.1 유지)',
  JSON.stringify(h1.qualityReport) === JSON.stringify(qualityReportFixture()),
  `totalRows=${h1.qualityReport?.totalRows}`, 'totalRows=13 · 전 필드 동일');

red('G21. 문의·리뷰·재고·매출 불변',
  h1.inquiries.length === 1 && h1.reviews.length === 1 && h1.inventory.length === 1 && h1.sales.length === 1,
  `문의=${h1.inquiries.length} 리뷰=${h1.reviews.length} 재고=${h1.inventory.length} 매출=${h1.sales.length}`,
  '문의1 리뷰1 재고1 매출1');

const once = hydrate(snap([ghostOrder(), realZeroAmountOrder()], 'api_mock_fallback', prov({ count: 2 })));
const twice = hydrate(once);
red('G22. 두 번 실행해도 동일 (idempotent)',
  JSON.stringify(once) === JSON.stringify(twice), '재실행 결과 상이', '1회 = 2회');

const src = snap([ghostOrder(), realZeroAmountOrder()], 'api_mock_fallback', prov({ count: 2 }));
const before = JSON.stringify(src);
const res = M.migrateLegacyGhostOrders(src);
red('G23. 순수 함수: 입력 무변형 + 제거 건수 보고',
  res.removed === 1 && JSON.stringify(src) === before,
  `removed=${res.removed} · 입력변형=${JSON.stringify(src) !== before}`, 'removed=1 · 입력 무변형');

// (6) count·userLabel 은 권위 신호가 아니다
const staleCount = M.migrateLegacyGhostOrders(snap([ghostOrder()], 'api_mock_fallback', prov({ count: 99, userLabel: '연결 안 됨' })));
red('G24. count·userLabel 이 낡아도 권위 판정에 쓰지 않는다 (provenance/status/substitutionBlocked 만)',
  staleCount.removed === 1 && staleCount.snapshot.resourceProvenance.orders.count === 0,
  `removed=${staleCount.removed} · count=${staleCount.snapshot.resourceProvenance?.orders?.count}`,
  'removed=1 · count=0 으로 정정');

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (기준선 — fail>0이면 회귀)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (계약 목표 — GREEN 전이므로 unmet>0 정상)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0 || redUnmet > 0) {
  console.log('\n✗ 미충족 — D-3 미완료');
  process.exit(1);
}
console.log('\n✓ 전부 충족 — GREEN 도달');
