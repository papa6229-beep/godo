#!/usr/bin/env node
/*
 * scripts/smoke-godo-order-mapping-01-d2-legacy-ghost-v0.mjs
 * GODO-ORDER-MAPPING-01 (D-2) — LEGACY 저장자료의 유령 주문 청소 (RED→GREEN)
 *
 * 배경(D-1까지의 상태):
 *   D-1에서 서버 매퍼가 근거 없는 수량1·금액0·결제완료·배송대기·단품을 **앞으로** 만들지 않게 닫았다.
 *   그러나 과거 Production 동기화가 이미 만들어 localStorage(godo.data.activeSnapshot)에
 *   저장해 둔 유령 주문은 그대로 남는다. App hydration의 withCanonicalInquiries는
 *   문의·출처만 보정하고 snapshot.orders 는 그대로 복원하기 때문이다.
 *   → 사용자가 Sync 를 누르기 전 "첫 화면"에 유령 주문 1건이 계속 보인다.
 *
 * D-2 범위(딱 이것만):
 *   "과거 코드가 만든 정확한 유령 주문 서명만 첫 hydration 에서 제거하고,
 *    출처 건수도 함께 0건으로 맞추는 일회성·멱등 마이그레이션"
 *
 * 유령 서명(과거 mapOrderList 기본값 조합 — 4266547 이전 코드):
 *   orderNo '' · orderDate '' · productName ''  (신원 필드 전부 없음)
 *   optionName '단품' 또는 '기본옵션' · quantity 1 · amount 0
 *   paymentStatus '결제완료' · deliveryStatus '배송대기' · invoiceNo ''
 *
 * 절대 금지:
 *   - 단순히 amount=0 이라는 이유로 제거 (진짜 0원 주문은 실재한다)
 *   - 주문번호·일자·상품명이 있는 실제 주문 제거
 *   - 시험 데이터·CSV·수기 자료 건드리기
 *   - '연결 안 됨' 또는 '시험 데이터'로 강등 (실제 성공 응답이므로 '실제 데이터 0건'이어야 한다)
 *   - 특정 주문번호·날짜·개인정보·현재 건수(1)의 하드코딩
 *
 * 실행: node scripts/smoke-godo-order-mapping-01-d2-legacy-ghost-v0.mjs  (RED 단계에서는 exit 1)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-d2-'));

const MIGRATION_SRC = path.join(REPO, 'src', 'services', 'legacyOrderSnapshotMigration.ts');
const PROVENANCE_SRC = path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts');
const INQUIRY_SRC = path.join(REPO, 'src', 'services', 'inquiryStatusContract.ts');
const APP_SRC = path.join(REPO, 'src', 'App.tsx');

// 클라이언트 TS 모듈을 tsc 로 emit 후 ESM 로드 (다른 스모크와 동일 방식)
const emit = (files) => {
  execFileSync(
    process.execPath,
    [tscBin, ...files, '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', tmp,
     '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'],
    { stdio: 'pipe' }
  );
  const dir = path.join(tmp, 'services');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const p = path.join(dir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
};

const hasMigration = existsSync(MIGRATION_SRC);
let P = null;   // provenance contract
let Q = null;   // inquiry status contract
let M = null;   // legacy ghost migration (D-2 대상 — RED 단계에는 없음)
try {
  emit(hasMigration ? [PROVENANCE_SRC, INQUIRY_SRC, MIGRATION_SRC] : [PROVENANCE_SRC, INQUIRY_SRC]);
  const load = async (n) => import(pathToFileURL(path.join(tmp, 'services', n)).href);
  P = await load('dataSourceProvenanceContract.js');
  Q = await load('inquiryStatusContract.js');
  if (hasMigration) M = await load('legacyOrderSnapshotMigration.js');
} catch (e) {
  console.error('[smoke] 클라이언트 tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const appSource = readFileSync(APP_SRC, 'utf8');

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
// cur: 미충족일 때 보여줄 현재 상태. met: 충족일 때 보여줄 근거(없으면 cur 을 쓰지 않는다).
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? (met ?? cur ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== GODO-ORDER-MAPPING-01 (D-2) — LEGACY 저장 유령 주문 청소 (RED→GREEN) ===');

// ── fixture: 과거 코드가 저장한 구버전 스냅샷 재현 (익명 — PII·실주문번호 없음) ─────
// 유령 주문 1건. 과거 mapOrderList 기본값 조합 그대로.
const ghostOrder = () => ({
  id: 'order-legacy-0',
  orderNo: '',
  orderDate: '',
  customerNameMasked: '고*',
  productName: '',
  optionName: '단품',
  quantity: 1,
  paymentStatus: '결제완료',
  deliveryStatus: '배송대기',
  invoiceNo: '',
  amount: 0,
  riskFlags: []
});
// 같은 유령 서명이지만 optionName 만 클라이언트 기본값('기본옵션')인 변종
const ghostOrderAltOption = () => ({ ...ghostOrder(), id: 'order-legacy-1', optionName: '기본옵션' });

// 진짜 실제 주문(0원) — 주문번호·일자·상품명이 있으므로 절대 제거 대상이 아니다.
const realZeroAmountOrder = () => ({
  id: 'order-real-0',
  orderNo: 'ANON-ORDER-0009',
  orderDate: '2026-07-09',
  customerNameMasked: '김*',
  productName: '(익명 상품명)',
  optionName: '단품',
  quantity: 1,
  paymentStatus: '결제완료',
  deliveryStatus: '배송대기',
  invoiceNo: '',
  amount: 0,
  riskFlags: []
});

const provRecord = (count) => ({
  resource: 'orders',
  status: 'success',
  provenance: 'actual',
  userLabel: '실제 데이터',
  count,
  substitutionBlocked: false
});

const legacySnapshot = (orders, sourceType = 'api_proxy_real', extra = {}) => ({
  id: 'snapshot-legacy',
  sourceType,
  importedAt: '2026-07-20T00:00:00.000Z',
  orders,
  inquiries: [{ id: 'inq-1', inquiryDate: '2026-07-01', category: '배송', customerNameMasked: '이*', title: 't', content: 'c', status: '답변대기', priority: 'medium', sentiment: 'neutral', riskFlags: [] }],
  reviews: [{ id: 'rev-1', reviewDate: '2026-07-01', productName: '(익명 상품명)', rating: 5, content: 'c', sentiment: 'positive', needsReply: false, riskFlags: [] }],
  inventory: [{ id: 'inv-1', productName: '(익명 상품명)', optionName: '단품', stock: 3, safetyStock: 5, status: 'warning', riskFlags: ['low_stock'] }],
  sales: [{ date: '2026-07-01', totalSales: 0, orderCount: 0, conversionRate: 0, topProducts: [] }],
  // 과거 정규화 결과: 유령 1건은 필수값 누락이라 오류 행으로 집계돼 있었다.
  qualityReport: {
    totalRows: orders.length,
    validRows: orders.filter((o) => o.orderNo).length,
    warningRows: 0,
    errorRows: orders.filter((o) => !o.orderNo).length,
    missingRequiredFields: orders.filter((o) => !o.orderNo).map((_, i) => `[Row ${i + 1}] 주문 필수값 누락 (주문번호, 주문일자, 상품명 필수)`),
    duplicateRows: 0,
    privacyMaskedCount: orders.length,
    riskFlagCount: 0,
    qualityScore: 20,
    notes: []
  },
  resourceProvenance: { orders: provRecord(orders.length) },
  ...extra
});

// ── App.tsx hydration 경계 재현 ────────────────────────────────────────────────
// withCanonicalInquiries 는 App.tsx 의 것과 동일 조립(문의 canonical화 + 출처 마이그레이션).
const withCanonicalInquiries = (snapshot) => {
  if (!snapshot) return snapshot;
  const inquiries = Array.isArray(snapshot.inquiries) ? Q.normalizeInquiryRecords(snapshot.inquiries) : snapshot.inquiries;
  const counts = {
    orders: snapshot.orders?.length ?? 0,
    inquiries: snapshot.inquiries?.length ?? 0,
    reviews: snapshot.reviews?.length ?? 0,
    inventory: snapshot.inventory?.length ?? 0,
    sales: snapshot.sales?.length ?? 0
  };
  const resourceProvenance = P.migrateResourceProvenance(snapshot.sourceType, snapshot.resourceProvenance, counts);
  return { ...snapshot, inquiries, resourceProvenance };
};
// D-2 이후의 hydration = 유령 청소 → 기존 경계. 마이그레이션이 없으면(RED) 항등.
const hydrate = (saved) => {
  const cleaned = M ? M.migrateLegacyGhostOrders(saved).snapshot : saved;
  return withCanonicalInquiries(cleaned);
};

// ── [BASE] D-2 이전/이후 모두 참인 사실 ───────────────────────────────────────
base('B1. 유령 fixture 는 과거 매퍼 기본값 조합과 정확히 일치한다',
  (() => { const g = ghostOrder(); return g.orderNo === '' && g.orderDate === '' && g.productName === ''
    && g.optionName === '단품' && g.quantity === 1 && g.amount === 0
    && g.paymentStatus === '결제완료' && g.deliveryStatus === '배송대기'; })(),
  '주문번호·일자·상품명 없음 + 단품/1/0원/결제완료/배송대기');

base('B2. withCanonicalInquiries 단독은 orders 를 건드리지 않는다 (문의·출처만 보정 — 범위 불변)',
  withCanonicalInquiries(legacySnapshot([ghostOrder()])).orders.length === 1,
  'orders 그대로 복원');

base('B3. 진짜 0원 주문은 유령과 구조가 다르다 (신원 필드 존재)',
  (() => { const r = realZeroAmountOrder(); return r.amount === 0 && r.orderNo !== '' && r.orderDate !== '' && r.productName !== ''; })(),
  'amount=0 이지만 주문번호·일자·상품명 있음');

base('B4. 실제 성공 응답의 0건은 계약상 actual(실제 데이터) — 연결 안 됨이 아니다',
  (() => { const c = P.classifyResource({ sourceType: 'api_proxy_real', count: 0, requested: 'real' });
    return c.kind === 'actual' && c.userLabel === '실제 데이터'; })(),
  'classifyResource(api_proxy_real,0건)=실제 데이터');

base('B5. 유효 출처 레코드는 hydration 출처 마이그레이션이 그대로 보존한다(건수 포함)',
  withCanonicalInquiries(legacySnapshot([ghostOrder()])).resourceProvenance.orders.count === 1,
  '기존 count 를 그대로 유지 → 유령을 지우면 건수 정정은 마이그레이션 몫');

// ── [RED] D-2 계약 ────────────────────────────────────────────────────────────
console.log('');

// 재현: 구버전 저장 스냅샷 hydration
const hydratedGhost = hydrate(legacySnapshot([ghostOrder()]));

red('G1. 첫 hydration 후 유령 주문이 남지 않는다 (Sync 전부터 0건)',
  Array.isArray(hydratedGhost.orders) && hydratedGhost.orders.length === 0,
  `orders=${hydratedGhost.orders?.length}건`);

red('G2. orders 출처 건수도 0건으로 정정된다 (건수 모순 제거)',
  hydratedGhost.resourceProvenance?.orders?.count === 0,
  `count=${hydratedGhost.resourceProvenance?.orders?.count}`);

red('G3. 출처는 실제 데이터로 유지 — 연결 안 됨/시험 데이터로 바꾸지 않는다',
  hydratedGhost.resourceProvenance?.orders?.provenance === 'actual' &&
  hydratedGhost.resourceProvenance?.orders?.userLabel === '실제 데이터',
  `provenance=${hydratedGhost.resourceProvenance?.orders?.provenance} · label=${hydratedGhost.resourceProvenance?.orders?.userLabel}`);

red('G4. 상태는 success 유지 (실제 데이터 0건 — 실패로 표시하지 않음)',
  hydratedGhost.resourceProvenance?.orders?.status === 'success' &&
  hydratedGhost.resourceProvenance?.orders?.substitutionBlocked === false,
  `status=${hydratedGhost.resourceProvenance?.orders?.status}`);

// optionName 변종(클라이언트 기본값 '기본옵션')도 같은 유령이다
const hydratedGhostAlt = hydrate(legacySnapshot([ghostOrderAltOption()]));
red('G5. optionName 이 기본옵션인 변종 유령도 제거된다',
  hydratedGhostAlt.orders.length === 0, `orders=${hydratedGhostAlt.orders.length}건`);

// 실제 0원 주문 보존
const hydratedReal = hydrate(legacySnapshot([realZeroAmountOrder()]));
red('G6. 실제 0원 주문(주문번호·일자·상품명 있음)은 절대 제거하지 않는다',
  hydratedReal.orders.length === 1 && hydratedReal.orders[0].amount === 0,
  `orders=${hydratedReal.orders.length}건`);

red('G7. amount=0 이라는 이유만으로 제거하지 않는다 (출처 건수도 1 유지)',
  hydratedReal.resourceProvenance?.orders?.count === 1,
  `count=${hydratedReal.resourceProvenance?.orders?.count}`);

// 혼재: 유령 + 정상
const hydratedMixed = hydrate(legacySnapshot([ghostOrder(), realZeroAmountOrder()]));
red('G8. 유령과 정상 주문이 함께 있으면 유령만 제거한다',
  hydratedMixed.orders.length === 1 && hydratedMixed.orders[0].orderNo === 'ANON-ORDER-0009',
  `남은=${hydratedMixed.orders.length}건 · orderNo=${hydratedMixed.orders[0]?.orderNo || '빈 문자열'}`);

red('G9. 혼재 시 출처 건수도 실제 남은 건수와 일치한다',
  hydratedMixed.resourceProvenance?.orders?.count === 1,
  `count=${hydratedMixed.resourceProvenance?.orders?.count}`);

// 시험 데이터·업로드 자료 불변
const testSnap = hydrate(legacySnapshot([ghostOrder()], 'demo'));
red('G10. 시험 데이터(demo) 스냅샷의 동일 서명 주문은 건드리지 않는다',
  testSnap.orders.length === 1, `orders=${testSnap.orders.length}건`);

const csvSnap = hydrate(legacySnapshot([ghostOrder()], 'csv'));
const manualSnap = hydrate(legacySnapshot([ghostOrder()], 'manual'));
red('G11. CSV·수기 업로드 자료는 건드리지 않는다',
  csvSnap.orders.length === 1 && manualSnap.orders.length === 1,
  `csv=${csvSnap.orders.length}건 · manual=${manualSnap.orders.length}건`);

// 멱등
const once = hydrate(legacySnapshot([ghostOrder(), realZeroAmountOrder()]));
const twice = hydrate(once);
red('G12. 두 번 실행해도 결과가 같다 (idempotent)',
  JSON.stringify(once) === JSON.stringify(twice),
  once.orders.length === twice.orders.length ? '길이는 같으나 내용 상이' : `1회=${once.orders.length} vs 2회=${twice.orders.length}`,
  `1회=2회 (orders ${twice.orders.length}건 · 재실행 무변경)`);

// ── 품질보고서 불변 (D-2.1) ───────────────────────────────────────────────────
// qualityReport 에는 "어느 도메인의 보고서인가" 식별자가 없다(마지막 import 도메인 한 벌).
// 따라서 주문 유령을 지웠다고 그 보고서를 주문 보고서로 단정하고 차감하면 안 된다.
// 후속: DATA-QUALITY-DOMAIN-01.
// 재고 13건을 뜻하는 품질보고서 + 유령 주문 1건이 함께 있는 스냅샷(실제로 가능한 조합)
const inventoryQualityReport = () => ({
  totalRows: 13,
  validRows: 13,
  warningRows: 2,
  errorRows: 0,
  missingRequiredFields: [],
  duplicateRows: 0,
  privacyMaskedCount: 0,
  riskFlagCount: 2,
  qualityScore: 97,
  notes: ['상품 재고가 안전재고 수량(5개) 이하입니다.']
});
const invSnapInput = legacySnapshot([ghostOrder()], 'api_proxy_real', { qualityReport: inventoryQualityReport() });
const hydratedInv = hydrate(invSnapInput);

red('G13. 재고 13건을 뜻하는 품질보고서는 주문 유령 제거로 바뀌지 않는다 (도메인 근거 없음)',
  JSON.stringify(hydratedInv.qualityReport) === JSON.stringify(inventoryQualityReport()),
  `totalRows=${hydratedInv.qualityReport?.totalRows} (입력 13에서 변경됨)`,
  'totalRows=13 그대로 · 전 필드 동일');

red('G14. 그 스냅샷에서도 유령 주문은 제거되고 출처 건수는 0으로 정정된다',
  hydratedInv.orders.length === 0 && hydratedInv.resourceProvenance?.orders?.count === 0,
  `orders=${hydratedInv.orders.length}건 · count=${hydratedInv.resourceProvenance?.orders?.count}`,
  'orders=0건 · count=0 (핵심 해결 유지)');

red('G15. 주문 전용처럼 보이는 품질보고서도 임의 수정하지 않는다 (바이트 단위 보존)',
  JSON.stringify(hydratedGhost.qualityReport) === JSON.stringify(legacySnapshot([ghostOrder()]).qualityReport) &&
  JSON.stringify(hydratedMixed.qualityReport) === JSON.stringify(legacySnapshot([ghostOrder(), realZeroAmountOrder()]).qualityReport),
  `유령전용=${JSON.stringify(hydratedGhost.qualityReport?.totalRows)} · 혼재=${JSON.stringify(hydratedMixed.qualityReport?.totalRows)}`,
  '입력 품질보고서와 완전히 동일');

// 남은 주문은 원본 그대로 (PII·필드 추가 없음)
red('G16. 살아남은 주문 레코드에 새 필드·문자열을 추가하지 않는다 (PII 출력·저장 추가 없음)',
  JSON.stringify(hydratedMixed.orders[0]) === JSON.stringify(realZeroAmountOrder()),
  '남은 주문이 원본과 다름', '남은 주문 = 저장 원본과 동일(필드 추가·변형 없음)');

// 다른 도메인 불변
red('G17. 문의·리뷰·재고·매출 등 다른 도메인은 건드리지 않는다',
  hydratedGhost.inquiries.length === 1 && hydratedGhost.reviews.length === 1 &&
  hydratedGhost.inventory.length === 1 && hydratedGhost.sales.length === 1,
  `문의=${hydratedGhost.inquiries.length} 리뷰=${hydratedGhost.reviews.length} 재고=${hydratedGhost.inventory.length} 매출=${hydratedGhost.sales.length}`);

// 순수 함수 계약 (원본 불변 + 제거 건수 보고)
const src = legacySnapshot([ghostOrder(), realZeroAmountOrder()]);
const beforeJson = JSON.stringify(src);
const result = M ? M.migrateLegacyGhostOrders(src) : null;
red('G18. 순수 함수: 입력 스냅샷을 변형하지 않고 제거 건수를 보고한다',
  !!result && result.removed === 1 && JSON.stringify(src) === beforeJson,
  result ? `removed=${result.removed} · 입력변형=${JSON.stringify(src) !== beforeJson}` : '마이그레이션 함수 없음');

// App hydration 경계 연결
const wired = /migrateLegacyGhostOrders/.test(appSource) &&
  /godo\.data\.activeSnapshot/.test(appSource) &&
  /migrateLegacyGhostOrders\([\s\S]{0,200}?\)\s*\.snapshot/.test(appSource);
red('G19. App hydration(저장 스냅샷 복원) 경계에 실제로 연결돼 있다',
  wired, 'App.tsx 에서 migrateLegacyGhostOrders 호출을 찾지 못함',
  'App.tsx activeSnapshot 복원 경로에서 호출 확인');

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (기준선 — fail>0이면 회귀)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (계약 목표 — GREEN 전이므로 unmet>0 정상)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0 || redUnmet > 0) {
  console.log('\n✗ 미충족 — D-2 미완료');
  process.exit(1);
}
console.log('\n✓ 전부 충족 — GREEN 도달');
