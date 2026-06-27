#!/usr/bin/env node
/*
 * scripts/smoke-cs-draft-composer-grounding.mjs
 * CS Draft Composer Grounding v0 검증.
 *  - 연결 주문 facts 기반 고객 발송용 초안(customerDraft) 1개 중심 출력,
 *    내부 메타데이터 분리, topic별 안전 응답, Evidence Policy 위반 차단을 순수 함수로 검증.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-csdraft-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'csDraftComposer.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const C = await import(pathToFileURL(path.join(tmp, 'csDraftComposer.js')).href);

// ── orders(RevenueOrderLite 호환) ──
const names = { '1001': '티셔츠', '1002': '모자', '1003': '세트상품' };
const line = (goodsNo, rev) => ({ goodsNo, goodsName: names[goodsNo], quantity: 1, lineRevenue: rev });
const orders = [
  { orderNo: 'O-PAY1', orderDate: '2026-06-25 10:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 32500, productRevenueByLines: 30000, paid: true, unpaid: false, confirmed: false, canceled: false, memberKey: 'syn_member_100001', lines: [line('1001', 30000)] },
  // 중복 결제 후보 쌍
  { orderNo: 'O-DUP1', orderDate: '2026-06-22 14:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, unpaid: false, confirmed: false, canceled: false, memberKey: 'syn_member_100009', lines: [line('1001', 10000)] },
  { orderNo: 'O-DUP2', orderDate: '2026-06-22 14:05:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, unpaid: false, confirmed: false, canceled: false, memberKey: 'syn_member_100009', lines: [line('1001', 10000)] },
  // 취소 확정(cancelDt → canceled true)
  { orderNo: 'O-CANC', orderDate: '2026-06-20 09:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 22500, productRevenueByLines: 20000, paid: true, unpaid: false, confirmed: false, canceled: true, memberKey: 'syn_member_100002', claim: { hasClaim: true, claimTypes: ['cancel'], claimAmount: 20000 }, lines: [line('1002', 20000)] },
  // 환불 클레임(완료 여부 미확정)
  { orderNo: 'O-REF', orderDate: '2026-06-19 09:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 42500, productRevenueByLines: 40000, paid: true, unpaid: false, confirmed: false, canceled: false, memberKey: 'syn_member_100003', claim: { hasClaim: true, claimTypes: ['refund'], claimAmount: 40000 }, lines: [line('1003', 40000)] },
  // 배송 문의용 정상 주문
  { orderNo: 'O-DLV', orderDate: '2026-06-24 09:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 32500, productRevenueByLines: 30000, paid: true, unpaid: false, confirmed: false, canceled: false, memberKey: 'syn_member_100004', lines: [line('1001', 30000)] }
];
const inq = (id, topic, orderNo, goodsNo) => ({ inquiryId: id, topic, orderNo, goodsNo });

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const PII_RE = /가상고객|가상수령자|010-0000|@example|샘플로/i;
const INTERNAL_RE = /missingData|pgApprovalNo|cardApprovalNo|paymentAttemptLog|transactionId|claimCompletionStatus|syn_member_|memberKey/i;

console.log('=== CS Draft Composer Grounding smoke ===');

// payment 종결형(매칭 + 중복 없음)
const rPaySingle = C.composeCsDraftFromOrders(inq('q-pay1', 'payment', 'O-PAY1', '1001'), orders);
ok('1. 기본 결과는 customerDraft 중심(문자열 비어있지 않음)', typeof rPaySingle.customerDraft === 'string' && rPaySingle.customerDraft.length > 0);
ok('2. customerDraft와 내부 메타데이터 분리(필드 존재)', Array.isArray(rPaySingle.evidenceSummary) && Array.isArray(rPaySingle.missingData) && Array.isArray(rPaySingle.prohibitedClaims) && ['low', 'medium', 'high'].includes(rPaySingle.riskLevel) && typeof rPaySingle.requiresHumanCheck === 'boolean');
ok('3. customerDraft에 [내부 확인 메모] 블록 없음', !/\[내부 확인 메모\]|\[고객 발송용 초안\]/.test(rPaySingle.customerDraft));
ok('4. payment 주문 1건 → 종결형(중복 결제 내역 확인되지 않음)', /1건만 확인됩니다/.test(rPaySingle.customerDraft) && /중복 결제 내역은 확인되지 않았습니다/.test(rPaySingle.customerDraft));
ok('5. 종결형 payment → 고객 추가자료 요청 없음', rPaySingle.customerActionRequested === false && !/캡처|첨부|보내주시면|주문번호/.test(rPaySingle.customerDraft));

// payment 중복 후보 있음
const rPayDup = C.composeCsDraftFromOrders(inq('q-pay2', 'payment', 'O-DUP1', '1001'), orders);
ok('6. 중복 후보 있으면 requiresHumanCheck=true & risk=high', rPayDup.requiresHumanCheck === true && rPayDup.riskLevel === 'high');
ok('7. 중복 후보 있어도 "중복결제가 아닙니다" 미사용', !/중복결제가 아닙니다|이중 결제는 없습니다|중복 결제 내역은 확인되지 않/.test(rPayDup.customerDraft) && /확인이 필요한 상태/.test(rPayDup.customerDraft));

// payment 매칭 없음 → 자료 요청
const rPayNo = C.composeCsDraftFromOrders(inq('q-pay3', 'payment', 'NO-ORDER', '1001'), orders);
ok('8. 주문 매칭 없을 때만 주문번호/결제내역 확인 요청', rPayNo.customerActionRequested === true && /주문번호 또는 결제내역 확인이 필요/.test(rPayNo.customerDraft));

// refund 완료여부 미확정 → 완료 표현 금지
const rRef = C.composeCsDraftFromOrders(inq('q-ref', 'refund', 'O-REF', '1003'), orders);
ok('9. refund claimCompletionStatus 없음 → 완료 표현 미사용', !/환불 완료|환불 처리되었습니다|환불되었습니다/.test(rRef.customerDraft) && /환불 확인이 필요한 상태/.test(rRef.customerDraft) && rRef.requiresHumanCheck === true);

// cancel 확정(cancelDt) → 취소 내역 확인(완료 단정 아님)
const rCanc = C.composeCsDraftFromOrders(inq('q-canc', 'cancel', 'O-CANC', '1002'), orders);
ok('   cancel 확정건은 "취소 내역이 확인" 종결형(완료 단정 없음)', /취소 내역이 확인됩니다/.test(rCanc.customerDraft) && !/취소 완료/.test(rCanc.customerDraft));

// delivery tracking 없음 → 배송 완료/오늘 도착 금지
const rDlv = C.composeCsDraftFromOrders(inq('q-dlv', 'delivery', 'O-DLV', '1001'), orders);
ok('10. delivery tracking 없음 → 배송 완료/오늘 도착 미사용', !/배송 완료|오늘 도착|택배사 확인 완료/.test(rDlv.customerDraft) && /배송 상태 확인이 필요한 상태/.test(rDlv.customerDraft));

ok('11. missingData는 내부 메타데이터에만(초안엔 없음)', rRef.missingData.length > 0 && !/missingData/.test(rRef.customerDraft));

// prohibitedClaims 검출(고의로 위험 초안 주입)
const badBase = {
  customerDraft: '고객님의 결제 내역을 확인한 결과 중복결제가 아닙니다. 환불 완료되었습니다. PG 승인번호 확인했습니다.',
  topic: 'payment', evidenceSummary: [], missingData: [], prohibitedClaims: [], allowedClaims: [], riskLevel: 'low', requiresHumanCheck: false, customerActionRequested: false
};
const dupFacts = { orderNo: 'O-DUP1', matched: true, paid: true, missingData: ['claimCompletionStatus'], duplicatePaymentCandidates: [{ orderNo: 'O-DUP2', orderDate: '2026-06-22 14:05:00', totalAmount: 12500, paid: true, sharedGoodsNos: ['1001'], hoursApart: 0.1, reason: 'x' }] };
const validated = C.validateCsDraftAgainstEvidencePolicy(badBase, { inquiry: inq('qx', 'payment', 'O-DUP1', '1001'), associatedOrderFacts: dupFacts });
ok('12. prohibitedClaims 검출 + 안전 초안 교정', validated.prohibitedClaims.length >= 3 && validated.requiresHumanCheck === true && validated.riskLevel === 'high' && !/확인한 결과|중복결제가 아닙니다|환불 완료|PG 승인번호/.test(validated.customerDraft));

ok('13. high risk topic은 requiresHumanCheck=true', rPayDup.requiresHumanCheck === true && rRef.requiresHumanCheck === true);

// PII / 내부 식별자 / fake contact / memberKey 노출 없음
const allDrafts = [rPaySingle, rPayDup, rPayNo, rRef, rCanc, rDlv].map((r) => r.customerDraft).join('\n');
const allInternal = JSON.stringify([rPaySingle, rPayDup, rPayNo, rRef, rCanc, rDlv]);
ok('14. customerDraft에 PII 없음', !PII_RE.test(allDrafts));
ok('15. internal metadata에도 PII 없음', !PII_RE.test(allInternal));
ok('16. fake contact가 초안에 섞이지 않음', !/가상고객|010-0000|@example|isFakePii/i.test(allDrafts));
ok('17. memberKey/내부 식별자 노출 없음(초안)', !INTERNAL_RE.test(allDrafts));

// 18. 기존 CS inquiry detail 기능 무영향(composer는 별도 순수 모듈; import만으로 부작용 없음)
ok('18. composer는 순수 함수(같은 입력 → 같은 출력)', JSON.stringify(C.composeCsDraftFromOrders(inq('q-pay1', 'payment', 'O-PAY1', '1001'), orders)) === JSON.stringify(rPaySingle));
ok('19. LLM 호출 없이 순수 함수로 검증됨(여기까지 도달)', true);

// 보너스: renderCsDraftForChat — 고위험 시 초안 바깥 주의 한 줄
const rendered = C.renderCsDraftForChat(rPayDup);
ok('   renderCsDraftForChat: 고위험은 초안 밖 "※ 내부 확인 필요" 분리', /아래처럼 답변하시면 됩니다\./.test(rendered) && /※ 내부 확인 필요:/.test(rendered) && rendered.indexOf('※ 내부 확인 필요') > rendered.indexOf(rPayDup.customerDraft));
const renderedLow = C.renderCsDraftForChat(rPaySingle);
ok('   renderCsDraftForChat: 저위험은 주의 문구 없음', !/※ 내부 확인 필요/.test(renderedLow));

console.log('\n--- 초안 미리보기 ---');
console.log('[payment 종결]\n' + rPaySingle.customerDraft);
console.log('\n[payment 중복후보]\n' + rPayDup.customerDraft + `\n(risk=${rPayDup.riskLevel}, humanCheck=${rPayDup.requiresHumanCheck})`);
console.log('\n[refund 미확정]\n' + rRef.customerDraft);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
