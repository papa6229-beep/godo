#!/usr/bin/env node
/*
 * scripts/smoke-cs-inquiry-order-grounding-audit.mjs
 * CS Inquiry Order Grounding Audit v0 검증.
 *  - 실제 Synthetic Commerce Universe(safe inquiries + orders)를 생성해 audit을 돌린다.
 *  - inquiry.orderNo → revenue.orders 매칭률, 추출 가능한 facts, 중복결제 후보 탐지,
 *    PII 격리, facts 없을 때 확정표현 금지 policy를 검증한다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');

// ── 1) helper(front, esnext/bundler) emit ────────────────────────────────────
const tmpFront = mkdtempSync(path.join(os.tmpdir(), 'godo-csgrnd-front-'));
// ── 2) universe + aux(api/_shared, nodenext) emit ────────────────────────────
const tmpApi = mkdtempSync(path.join(os.tmpdir(), 'godo-csgrnd-api-'));
try {
  execFileSync(process.execPath, [
    tscBin, path.join(REPO, 'src', 'services', 'csInquiryOrderGrounding.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmpFront, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
  execFileSync(process.execPath, [
    tscBin, path.join(REPO, 'api', '_shared', 'commerceUniverseAux.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'api', '_shared'),
    '--outDir', tmpApi, '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmpFront).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmpFront, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}

const G = await import(pathToFileURL(path.join(tmpFront, 'csInquiryOrderGrounding.js')).href);
const U = await import(pathToFileURL(path.join(tmpApi, 'syntheticCommerceUniverse.js')).href);
const AX = await import(pathToFileURL(path.join(tmpApi, 'commerceUniverseAux.js')).href);

// ── 가상 상품 + universe 생성(결정적) ─────────────────────────────────────────
const products = [
  { productId: '1001', productCode: 'A-1001', productName: '티셔츠', price: 19000, fixedPrice: 25000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '003', allCategoryCode: '003', brandCode: '001', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' },
  { productId: '1002', productCode: 'A-1002', productName: '모자', price: 12000, fixedPrice: 15000, stock: 0, stockEnabled: false, soldOut: false, displayPc: true, displayMobile: true, sellPc: true, sellMobile: true, categoryCode: '004', allCategoryCode: '004', brandCode: '002', registeredAt: '', modifiedAt: '', makerName: '', originName: '', optionName: '' }
];
const universe = U.buildSyntheticCommerceUniverse(products, { seed: 20260627, endDate: '2026-06-27' });
const aux = AX.buildUniverseAux(universe, { includeCsFakeContacts: true, generatedAt: '2026-06-27' });

// 서버 RevenueOrder → 프론트 RevenueOrderLite 호환(GroundingOrder)으로 평탄화(departmentDataService 미러).
const orders = universe.orders.map((o) => ({
  orderNo: o.orderNo, orderDate: o.orderDate, sourceType: o.sourceType,
  deliveryFee: o.deliveryFee, totalAmount: o.totalAmount, productRevenueByLines: o.productRevenueByLines,
  paid: o.state.paid, unpaid: o.state.unpaid, confirmed: o.state.confirmed, canceled: o.state.canceled,
  lines: o.lines.map((l) => ({ goodsNo: l.goodsNo, goodsName: l.goodsName, quantity: l.quantity, lineRevenue: l.lineRevenue })),
  memberKey: o.memberKey, paymentMethodCode: o.paymentMethodCode || o.settleKind, orderChannel: o.orderChannel,
  claim: o.claimSummary ? { hasClaim: o.claimSummary.hasClaim, claimTypes: o.claimSummary.claimTypes, claimAmount: o.claimSummary.claimAmount } : undefined
}));
const inquiries = aux.inquiries; // SafeSyntheticInquiry(연락처 없음, orderNo 보유)

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== CS Inquiry Order Grounding Audit smoke ===');

// 1. safe inquiries 읽기
ok('1. safe inquiries 배열을 읽을 수 있다', Array.isArray(inquiries) && inquiries.length > 0);

// 감사 실행
const audit = G.auditInquiryOrderGrounding({ inquiries, orders });

// 2. orderNo 보유 inquiry 수 계산
const manualWithOrderNo = inquiries.filter((q) => q.orderNo && q.orderNo.trim()).length;
ok('2. orderNo 보유 inquiry 수 계산', audit.inquiriesWithOrderNo === manualWithOrderNo && audit.inquiriesWithOrderNo > 0);

// 3. matched/unmatched 계산(합 = total)
ok('3. matched/unmatched 계산 일관', audit.matchedInquiries + audit.unmatchedInquiries === audit.totalInquiries && audit.matchRate >= 0 && audit.matchRate <= 1);

// 매칭된 문의 하나 선택
const matchedInq = inquiries.find((q) => orders.some((o) => o.orderNo === q.orderNo));
const facts = G.buildAssociatedOrderFacts(matchedInq, orders);

// 4. matched order에서 payment/order amount/date facts 추출
ok('4. matched order facts(결제상태/금액/주문일) 추출', facts.matched === true && typeof facts.paid === 'boolean' && typeof facts.orderAmount === 'number' && !!facts.orderDate);

// 5. cancel/refund/claim facts 추출 또는 missingData 표시
const claimInq = inquiries.find((q) => { const o = orders.find((x) => x.orderNo === q.orderNo); return o && o.claim && o.claim.hasClaim; });
const claimFacts = claimInq ? G.buildAssociatedOrderFacts(claimInq, orders) : facts;
ok('5. cancel/refund/claim facts 추출 + 완료여부 missingData', (!!claimFacts.claimSummary || claimFacts.canceled || claimFacts.refunded || claimFacts.returned || claimFacts.exchanged) && claimFacts.missingData.some((m) => /claimCompletionStatus/.test(m)));

// 6. duplicatePaymentCandidate 탐지 동작(결정적 시나리오)
const dupOrders = [
  { orderNo: 'DUP-A1', orderDate: '2026-06-20 10:00:00', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, canceled: false, memberKey: 'syn_member_777', lines: [{ goodsNo: '1001', goodsName: '티셔츠', quantity: 1, lineRevenue: 10000 }] },
  { orderNo: 'DUP-A2', orderDate: '2026-06-20 10:06:00', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, canceled: false, memberKey: 'syn_member_777', lines: [{ goodsNo: '1001', goodsName: '티셔츠', quantity: 1, lineRevenue: 10000 }] },
  { orderNo: 'OTHER-B1', orderDate: '2026-06-20 10:00:00', deliveryFee: 0, totalAmount: 99999, productRevenueByLines: 99999, paid: true, canceled: false, memberKey: 'syn_member_000', lines: [{ goodsNo: '1002', goodsName: '모자', quantity: 1, lineRevenue: 99999 }] }
];
const dup = G.findDuplicatePaymentCandidates({ inquiryId: 'qd', orderNo: 'DUP-A1', goodsNo: '1001', topic: 'payment' }, dupOrders);
ok('6. duplicatePaymentCandidate 탐지 함수 동작', dup.anchorMatched === true && dup.candidates.some((c) => c.orderNo === 'DUP-A2') && !dup.candidates.some((c) => c.orderNo === 'OTHER-B1'));

// 7. PG/transaction id 없으면 missingData/confirmationLimits 명시
ok('7. PG/transaction 한계가 missingData/confirmationLimits에 명시', facts.missingData.includes('pgApprovalNo') && facts.missingData.includes('transactionId') && dup.confirmationLimits.includes('pgApprovalNo') && dup.confirmationLimits.includes('transactionId'));

// 8. associatedOrderFacts에 PII 없음
const PII_RE = /customerName|receiverName|refundAccount|refundBank|deliveryMemo|010-0000|@example|샘플로|가상고객|가상수령자|phone|email|address/i;
const factsJson = JSON.stringify([facts, claimFacts]);
ok('8. associatedOrderFacts에 PII 없음', !PII_RE.test(factsJson));

// 9. fake contact가 associatedOrderFacts에 섞이지 않음
const hasFakeContacts = Array.isArray(aux.csOnlyFakeContacts) && aux.csOnlyFakeContacts.length > 0;
const sampleContactName = hasFakeContacts ? aux.csOnlyFakeContacts[0].customerName : '가상고객 000001';
ok('9. fake contact가 facts에 혼입되지 않음', hasFakeContacts && !factsJson.includes(sampleContactName) && !/isFakePii/i.test(factsJson));

// 10. facts 없을 때 "확인한 결과" 류 확정 표현 금지 policy
const unmatchedFacts = G.buildAssociatedOrderFacts({ inquiryId: 'qx', orderNo: 'NO-SUCH-ORDER', topic: 'payment' }, orders);
const policyNoFacts = G.evaluateResponseEvidencePolicy(unmatchedFacts);
const fb = policyNoFacts.forbiddenClaims.join(' | ');
const allowedNoFacts = policyNoFacts.allowedClaims.join(' | ');
ok('10. facts 없을 때 확정표현 금지(확인한 결과/중복결제 아닙니다/환불·취소 완료)',
  unmatchedFacts.matched === false &&
  /확인한 결과/.test(fb) && /중복결제가 아닙니다/.test(fb) && /환불 처리되었습니다/.test(fb) && /취소 완료되었습니다/.test(fb) &&
  !/확인한 결과|중복결제가 아닙니다|환불 처리되었습니다|취소 완료되었습니다/.test(allowedNoFacts));

// ── 추가 검증 ────────────────────────────────────────────────────────────────
ok('11. matched facts에서 결제완료여도 PG 확정표현은 forbidden', (() => { const p = G.evaluateResponseEvidencePolicy(facts); return p.hasMatchedOrder && p.forbiddenClaims.some((x) => /PG 승인내역/.test(x)) && p.allowedClaims.length > 0; })());
ok('12. orderNo 매칭률 산출(합리적)', audit.matchRate > 0 && audit.matchRateAmongWithOrderNo > 0 && audit.matchRateAmongWithOrderNo <= 1);
ok('13. 요약 문자열 생성', /총 문의 .*orderNo 보유 .*매칭/.test(G.summarizeInquiryOrderGroundingAudit(audit)));
ok('14. samples에 matched/missingReason 정보 포함', audit.samples.length > 0 && audit.samples.every((s) => typeof s.matched === 'boolean') && audit.samples.some((s) => s.matched === true));
ok('15. memberKey(가명)는 facts에 통과(중복후보 anchor용)', !!facts.memberKey && /^syn_member_/.test(facts.memberKey));

console.log(`\n--- 감사 실측치(문서 반영용) ---`);
console.log(G.summarizeInquiryOrderGroundingAudit(audit));
console.log(`orders=${orders.length}, inquiries=${audit.totalInquiries}, withOrderNo=${audit.inquiriesWithOrderNo}, matched=${audit.matchedInquiries}, unmatched=${audit.unmatchedInquiries}`);
console.log(`샘플 매칭 facts: orderNo=${facts.orderNo} paid=${facts.paid} orderAmount=${facts.orderAmount} goodsAmount=${facts.goodsAmount} delivery=${facts.deliveryCharge} canceled=${facts.canceled} refunded=${facts.refunded} returned=${facts.returned} exchanged=${facts.exchanged}`);
console.log(`claim 샘플: ${claimInq ? `orderNo=${claimFacts.orderNo} claimTypes=${JSON.stringify(claimFacts.claimSummary?.claimTypes)} claimAmount=${claimFacts.claimSummary?.claimAmount}` : '(클레임 연결 문의 없음)'}`);
console.log(`missingData(공통): ${JSON.stringify(facts.missingData)}`);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmpFront, { recursive: true, force: true });
rmSync(tmpApi, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
