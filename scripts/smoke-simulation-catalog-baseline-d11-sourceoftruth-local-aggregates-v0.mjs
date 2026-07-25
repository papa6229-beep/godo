#!/usr/bin/env node
/*
 * scripts/smoke-simulation-catalog-baseline-d11-sourceoftruth-local-aggregates-v0.mjs
 * SIMULATION-CATALOG-BASELINE-01 D-1.1 — SourceOfTruth 지역 집계 회귀 가드 보완
 *
 * 배경(감사 D-1.1 결론): RC-2 S29 파일 단위 가드에서 departmentDataSourceOfTruth 를 제거한 방향은
 *   적합하나, 이 파일은 공식을 위임만 하는 것이 아니라 **자체 지역 집계**(취소/미결제/반품 건수,
 *   배송·환불 매출, 반복/위험 고객, 미처리 문의, 자동응답 후보)를 직접 계산한다. 감사 N2a 에서
 *   이 지역 집계값들은 어떤 스모크도 값으로 잠그지 않아 **무보호**임이 실증됐다.
 *
 * 본 스모크는 S29 를 다시 넓히지 않고, 작고 손으로 검산 가능한 전용 fixture 로 그 지역 집계값을
 *   **값 기준**으로 잠근다(1층: 정상 회귀). 결함 검출력(2층)은 각 집계식에 임시 변형을 넣어
 *   해당 단언이 실제 실패함을 별도로 증명한다(변형은 원복, 제품 소스 변경 0).
 *
 * fixture 원칙: 대형 가상자료·현재 기준값에 의존하지 않음. 기대값은 이 파일 주석의 손검산 결과이며
 *   제품 함수 출력을 기대값으로 되쓰지 않는다. 실제 PII 없음 — 익명 시험값(A/B 주문번호, m1..m4 등).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd().replace(/\\/g, '/');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
let pass = 0, fail = 0;
const T = (n, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${d ? `  — ${d}` : ''}`); ok ? pass++ : fail++; };
console.log('=== SIMULATION-CATALOG-BASELINE-01 D-1.1 — SourceOfTruth 지역 집계 회귀 가드 ===');

// ── 컴파일 (departmentDataSourceOfTruth + 런타임 의존 계약) ────────────────────
const outSrc = mkdtempSync(path.join(os.tmpdir(), 'd11-src-'));
execFileSync(process.execPath, [TSC,
  path.join(REPO, 'src', 'services', 'departmentDataSourceOfTruth.ts'),
  path.join(REPO, 'src', 'services', 'revenueMetricContract.ts'),
  path.join(REPO, 'src', 'services', 'inventoryRiskContract.ts'),
  path.join(REPO, 'src', 'services', 'inquiryStatusContract.ts'),
  path.join(REPO, 'src', 'services', 'revenueScreenState.ts'),
  path.join(REPO, 'src', 'services', 'dataSourceProvenanceContract.ts'),
  '--outDir', outSrc, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'],
  { stdio: 'pipe', cwd: os.tmpdir() });
for (const f of readdirSync(outSrc).filter((x) => x.endsWith('.js'))) {
  const p = path.join(outSrc, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const DS = await import(pathToFileURL(path.join(outSrc, 'departmentDataSourceOfTruth.js')).href);

// ── 전용 fixture (작고 손검산 가능) ───────────────────────────────────────────
// 주문 7건. sourceType: synthetic_test ×4 (A1..A4) · real_godomall ×3 (B5..B7).
//   isValidOrder(RevenueOrderLite) = paid && !canceled.
const orders = [
  // 정상 유효 · 배송비 · 라인 (claim 없음)
  { orderNo: 'A1', sourceType: 'synthetic_test', paid: true,  unpaid: false, canceled: false, deliveryFee: 2500, totalAmount: 12500, lines: [{ lineRevenue: 10000, quantity: 1 }] },
  // 취소 주문
  { orderNo: 'A2', sourceType: 'synthetic_test', paid: false, unpaid: false, canceled: true,  deliveryFee: 3000, totalAmount: 5000,  lines: [{ lineRevenue: 4000,  quantity: 1 }] },
  // 미결제(명시 플래그) — unpaid=true, paid/canceled=false
  { orderNo: 'A3', sourceType: 'synthetic_test', paid: false, unpaid: true,  canceled: false, deliveryFee: 2000, totalAmount: 8000,  lines: [{ lineRevenue: 7000,  quantity: 1 }] },
  // 환불 claim(refund_only, 완료) · 유효 주문 — D-1.2: RAW 근거(handleMode r · r3 · handleCompleteFl y) 동반
  { orderNo: 'A4', sourceType: 'synthetic_test', paid: true,  unpaid: false, canceled: false, deliveryFee: 2500, totalAmount: 20000, lines: [{ lineRevenue: 17500, quantity: 2 }], claim: { hasClaim: true, claimTypes: ['refund'], handleModes: ['r'], rawStatuses: ['r3'], handleCompleteFl: 'y', claimAmount: 15000, requestedRefundAmount: 15000 } },
  // 반품 claim(return, 접수·환불 대기) · 유효 주문 · 배송비 0 — D-1.2: handleMode b · b4(회수완료)·환불 미완료
  { orderNo: 'B5', sourceType: 'real_godomall',  paid: true,  unpaid: false, canceled: false, deliveryFee: 0,    totalAmount: 9000,  lines: [{ lineRevenue: 9000,  quantity: 1 }], claim: { hasClaim: true, claimTypes: ['return'], handleModes: ['b'], rawStatuses: ['b4'], claimAmount: 9000, requestedRefundAmount: 9000 } },
  // 취소 claim('cancel', 완료) · 유효 주문 — D-1.2: 취소는 반품 건수에 미포함(분류기), 환불 완료금액엔 포함
  { orderNo: 'B6', sourceType: 'real_godomall',  paid: true,  unpaid: false, canceled: false, deliveryFee: 1000, totalAmount: 7000,  lines: [{ lineRevenue: 6000,  quantity: 1 }], claim: { hasClaim: true, claimTypes: ['cancel'], handleModes: ['c'], rawStatuses: ['c4'], handleCompleteFl: 'y', claimAmount: 7000, requestedRefundAmount: 7000 } },
  // 암묵 미결제 — unpaid 플래그 false 이나 !paid && !canceled(폴백 절) → 미결제로 계수
  { orderNo: 'B7', sourceType: 'real_godomall',  paid: false, unpaid: false, canceled: false, deliveryFee: 500,  totalAmount: 3000,  lines: [{ lineRevenue: 2500,  quantity: 1 }] }
];
// 손검산:
//   totalOrders=7 · validOrders(paid&&!canceled)=A1,A4,B5,B6=4
//   unpaidOrders=A3(flag)+B7(폴백)=2
//   ── D-1.2 GREEN 재정의(폐기·교체 단언, RED 증거는 아래 주석) ──
//   cancelledOrders(취소 사건=eventKind cancel)=B6=1  [옛: o.canceled=A2=1 — 근거만 바뀜, 값 동일]
//   returnReceivedOrders(반품 사건=eventKind return)=B5=1  [옛 returnedOrders=A4·B5·B6=3 폐기: 취소·환불을 반품으로 오집계했음(D-1.2 RED F1)]
//   completedRefundRevenue(완료 근거 있는 환불만)=A4(15000)+B6(7000)=22000  [옛 refundedRevenue=A4·B5=24000 폐기: 완료여부 무시·반품접수 요청금액 합산(D-1.2 RED F3)]
//   pendingRefundRevenue(반품 접수·환불 대기)=B5(9000)
//   gross(전 라인합)=10000+4000+7000+17500+9000+6000+2500=56000
//   net(유효 totalAmount)=12500+20000+9000+7000=48500 · AOV=round(48500/4)=12125
//   orders deliveryFee 합=2500+3000+2000+2500+0+1000+500=11500

// 고객 보조자료: 반복(orderCount>1)=m1,m3 · 위험(claimCount>0)=m2,m3
const customers = [
  { memberKey: 'm1', segment: 's', orderCount: 3, claimCount: 0, reviewCount: 0, inquiryCount: 0, totalRevenue: 0, totalPaidAmount: 0, averageOrderValue: 0, firstOrderDate: '', lastOrderDate: '' },
  { memberKey: 'm2', segment: 's', orderCount: 1, claimCount: 2, reviewCount: 0, inquiryCount: 0, totalRevenue: 0, totalPaidAmount: 0, averageOrderValue: 0, firstOrderDate: '', lastOrderDate: '' },
  { memberKey: 'm3', segment: 's', orderCount: 5, claimCount: 1, reviewCount: 0, inquiryCount: 0, totalRevenue: 0, totalPaidAmount: 0, averageOrderValue: 0, firstOrderDate: '', lastOrderDate: '' },
  { memberKey: 'm4', segment: 's', orderCount: 1, claimCount: 0, reviewCount: 0, inquiryCount: 0, totalRevenue: 0, totalPaidAmount: 0, averageOrderValue: 0, firstOrderDate: '', lastOrderDate: '' }
];
// 문의: answered=I1 · unanswered=I2,I4 · in_progress=I3 · unknown=I5(미매핑)
//   unresolved(=answered 제외 전부)=I2,I3,I4,I5=4 · resolved=1 · unknown=1 · total=5
//   autoCandidate(unresolved && 배송/delivery topic)=I2,I3,I5=3
const inquiries = [
  { inquiryId: 'I1', status: 'answered',    topic: '배송',       urgency: 'low', createdAt: '', title: '', excerpt: '' },
  { inquiryId: 'I2', status: 'unanswered',  topic: '배송지연',   urgency: 'low', createdAt: '', title: '', excerpt: '' },
  { inquiryId: 'I3', status: 'in_progress', topic: 'delivery late', urgency: 'low', createdAt: '', title: '', excerpt: '' },
  { inquiryId: 'I4', status: 'unanswered',  topic: '환불문의',   urgency: 'low', createdAt: '', title: '', excerpt: '' },
  { inquiryId: 'I5', status: 'zzz_unmapped', topic: '배송',      urgency: 'low', createdAt: '', title: '', excerpt: '' }
];
// 리뷰 2건 → totalReviews=2 · autoCandidates=reviews(2)+delivery미처리문의(3)=5
const reviews = [
  { reviewId: 'R1', orderNo: 'A1', goodsNo: 'g1', productId: 'p1', rating: 5, sentiment: 'pos', topic: '만족', createdAt: '', excerpt: '' },
  { reviewId: 'R2', orderNo: 'A4', goodsNo: 'g2', productId: 'p2', rating: 3, sentiment: 'neu', topic: '보통', createdAt: '', excerpt: '' }
];
const universeAux = { customers, reviews, inquiries, meta: { syntheticProfile: 'd11-test' } };

// summary(있음): 배송비 총액은 주문 합(11500)과 **일부러 다른** 40000 으로 지정 →
//   shippingRevenue 가 summary 분기를 읽는지(주문 reduce 폴백이 아니라) 판별.
const summaryPresent = {
  orderCount: 0, lineCount: 0, productRevenueByHeader: 0, productRevenueByLines: 0,
  deliveryFeeTotal: 40000, totalAmount: 0, paidOrderCount: 0, unpaidOrderCount: 0,
  confirmedOrderCount: 0, canceledOrderCount: 0, realOrderCount: 3, syntheticOrderCount: 4,
  syntheticTrackedProductCount: 0, syntheticUnlimitedProductCount: 0,
  syntheticTotalSoldQuantity: 0, syntheticTotalRestoredQuantity: 0, syntheticTotalNetSoldQuantity: 30
};

const baseRevenue = (extra) => ({
  count: 7, source: 'godomall', live: false,
  realOrdersStatus: 'success', syntheticStatus: 'success',
  stockImpact: [], orders, universeAux, ...extra
});

// ── 시나리오 P: summary 있음(실제3+시험4 혼재) ───────────────────────────────
const P = DS.buildDepartmentSourceOfTruthSnapshot(baseRevenue({ summary: summaryPresent }));
// ── 시나리오 Q: summary=null(지역 폴백 분기 — 배송 reduce·synthetic 필터·real 차감) ──
const Q = DS.buildDepartmentSourceOfTruthSnapshot(baseRevenue({ summary: null }));

console.log('');
console.log('  --- 1층: 정상 회귀(현재 제품 코드에서 지역 집계값 = 손검산 기대값) ---');

// 필수 10개 지역 집계값 — 값 잠금
T('L1. shippingRevenue(P, summary 분기)=40000', P.revenueUniverse.shippingRevenue === 40000, `got=${P.revenueUniverse.shippingRevenue}`);
// D-1.2 교체: refundedRevenue(완료무관 요청금액 합) 폐기 → completedRefundRevenue(완료 근거만).
T('L2. completedRefundRevenue=22000 (A4 환불완료15000+B6 취소환불완료7000, B5 반품접수 대기 제외)', P.revenueUniverse.completedRefundRevenue === 22000, `got=${P.revenueUniverse.completedRefundRevenue}`);
T('L2b. requestedRefundAmount=31000 · pendingRefundRevenue=9000 (요청·대기 분리)', P.revenueUniverse.requestedRefundAmount === 31000 && P.revenueUniverse.pendingRefundRevenue === 9000, `req=${P.revenueUniverse.requestedRefundAmount} pending=${P.revenueUniverse.pendingRefundRevenue}`);
T('L3. cancelledOrders=1 (취소 사건 eventKind cancel = B6)', P.orderUniverse.cancelledOrders === 1, `got=${P.orderUniverse.cancelledOrders}`);
T('L4. unpaidOrders=2 (명시 플래그+폴백절)', P.orderUniverse.unpaidOrders === 2, `got=${P.orderUniverse.unpaidOrders}`);
// D-1.2 교체: returnedOrders(취소·환불을 반품으로 오집계) 폐기 → returnReceivedOrders(반품 사건만).
T('L5. returnReceivedOrders=1 (B5 반품만 · 취소B6·환불A4 제외)', P.orderUniverse.returnReceivedOrders === 1, `got=${P.orderUniverse.returnReceivedOrders}`);
T('L6. totalQuantitySold(P, summary 분기)=30', P.productUniverse.totalQuantitySold === 30, `got=${P.productUniverse.totalQuantitySold}`);
T('L7. repeatCustomers=2 (orderCount>1)', P.customerUniverse.repeatCustomers === 2, `got=${P.customerUniverse.repeatCustomers}`);
T('L8. highRiskCustomers=2 (claimCount>0)', P.customerUniverse.highRiskCustomers === 2, `got=${P.customerUniverse.highRiskCustomers}`);
T('L9. unresolvedInquiries=4 (answered 제외 전부)', P.csUniverse.unresolvedInquiries === 4, `got=${P.csUniverse.unresolvedInquiries}`);
T('L10. autoCandidates=5 (리뷰2+배송미처리문의3)', P.csUniverse.autoCandidates === 5, `got=${P.csUniverse.autoCandidates}`);

// 보강: 같은 계열 지역 집계값(전수표 근거)도 함께 잠금
T('L11. totalOrders=7', P.orderUniverse.totalOrders === 7, `got=${P.orderUniverse.totalOrders}`);
T('L12. validOrders=4', P.orderUniverse.validOrders === 4, `got=${P.orderUniverse.validOrders}`);
T('L13. grossProductRevenue=56000', P.revenueUniverse.grossProductRevenue === 56000, `got=${P.revenueUniverse.grossProductRevenue}`);
T('L14. netOrderRevenue=48500', P.revenueUniverse.netOrderRevenue === 48500, `got=${P.revenueUniverse.netOrderRevenue}`);
T('L15. totalCustomers=4', P.customerUniverse.totalCustomers === 4, `got=${P.customerUniverse.totalCustomers}`);
T('L16. totalInquiries=5 · resolved=1 · unknown=1', P.csUniverse.totalInquiries === 5 && P.csUniverse.resolvedInquiries === 1 && P.csUniverse.unknownInquiries === 1, `total=${P.csUniverse.totalInquiries} resolved=${P.csUniverse.resolvedInquiries} unknown=${P.csUniverse.unknownInquiries}`);
T('L17. totalReviews=2', P.csUniverse.totalReviews === 2, `got=${P.csUniverse.totalReviews}`);
T('L18. includesSynthetic=true · syntheticOrderCount(P)=4', P.metadata.includesSynthetic === true && P.metadata.syntheticOrderCount === 4, `inc=${P.metadata.includesSynthetic} syn=${P.metadata.syntheticOrderCount}`);

console.log('');
console.log('  --- 1층: 기존 판정 불변(sourceMode·realOrders·운영 순매출·시험 데이터) ---');
T('L19. sourceMode(P)=mixed (실제3+시험4)', P.sourceMode === 'mixed', `got=${P.sourceMode}`);
T('L20. realOrders(P)=known count 3', P.metadata.realOrders.kind === 'known' && P.metadata.realOrders.count === 3, `got=${JSON.stringify(P.metadata.realOrders)}`);
T('L21. realOrderCount(P)=3 · operationalRevenue=48500 · AOV=12125', P.metadata.realOrderCount === 3 && P.operationalRevenue === 48500 && P.operationalAOV === 12125, `real=${P.metadata.realOrderCount} op=${P.operationalRevenue} aov=${P.operationalAOV}`);
T('L22. 시험 데이터 판정: basisDescription 에 "실데이터 아님" 포함', /실데이터 아님/.test(P.metadata.basisDescription), `basis="${P.metadata.basisDescription.slice(-40)}"`);

console.log('');
console.log('  --- 1층: 폴백 분기(Q, summary=null) 지역 집계 ---');
T('L23. shippingRevenue(Q, 주문 reduce 폴백)=11500', Q.revenueUniverse.shippingRevenue === 11500, `got=${Q.revenueUniverse.shippingRevenue}`);
T('L24. totalQuantitySold(Q, summary 없음)=0', Q.productUniverse.totalQuantitySold === 0, `got=${Q.productUniverse.totalQuantitySold}`);
T('L25. syntheticOrderCount(Q, sourceType 필터)=4', Q.metadata.syntheticOrderCount === 4, `got=${Q.metadata.syntheticOrderCount}`);
T('L26. realOrderCount(Q, total-synthetic)=3', Q.metadata.realOrderCount === 3, `got=${Q.metadata.realOrderCount}`);
// D-1.2 교체: 반품3/환불24000(옛 오집계) → 반품접수1/완료환불22000(사건 분류·완료 근거).
T('L27. Q 지역 집계(취소1/미결제2/반품접수1/완료환불22000) summary 무관 동일', Q.orderUniverse.cancelledOrders === 1 && Q.orderUniverse.unpaidOrders === 2 && Q.orderUniverse.returnReceivedOrders === 1 && Q.revenueUniverse.completedRefundRevenue === 22000, `c=${Q.orderUniverse.cancelledOrders} u=${Q.orderUniverse.unpaidOrders} r=${Q.orderUniverse.returnReceivedOrders} refund=${Q.revenueUniverse.completedRefundRevenue}`);

// ── 입력 fixture 무변형 확인(참조 함수가 입력을 mutate 하지 않음) ─────────────
const inputUnmutated = orders.length === 7 && orders[0].totalAmount === 12500 && customers.length === 4 && inquiries.length === 5 && reviews.length === 2 &&
  orders[3].claim.claimAmount === 15000 && customers[2].orderCount === 5;
T('L28. 입력 fixture 무변형(orders/customers/inquiries/reviews)', inputUnmutated, `orders=${orders.length} cust=${customers.length} inq=${inquiries.length} rev=${reviews.length}`);

console.log('');
console.log(`--- ${pass} pass / ${fail} fail ---`);
rmSync(outSrc, { recursive: true, force: true });
if (fail > 0) { console.log('\n✗ D-1.1 SourceOfTruth 지역 집계 회귀 미충족'); process.exit(1); }
console.log('\n✓ D-1.1 — SourceOfTruth 지역 집계값 값-잠금(정상 회귀).');
