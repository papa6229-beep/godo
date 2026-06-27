#!/usr/bin/env node
/*
 * scripts/smoke-cs-draft-composer-runtime-wiring.mjs
 * CS Draft Composer Runtime Wiring v0 검증.
 *  - draft intent 감지 / 대상 inquiry 선택 / composer 직접 호출 / customerDraft 중심 출력 /
 *    고위험 운영자 주의 분리 / PII·내부필드 미노출 을 순수 함수로 검증.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-csdraftrt-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'csDraftRuntime.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const RT = await import(pathToFileURL(path.join(tmp, 'csDraftRuntime.js')).href);

// ── orders(RevenueOrderLite 호환) ──
const names = { '1001': '티셔츠', '1002': '모자', '1003': '세트상품' };
const line = (goodsNo, rev) => ({ goodsNo, goodsName: names[goodsNo], quantity: 1, lineRevenue: rev });
const orders = [
  { orderNo: 'O-PAY1', orderDate: '2026-06-25 10:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 32500, productRevenueByLines: 30000, paid: true, canceled: false, memberKey: 'syn_member_100001', lines: [line('1001', 30000)] },
  { orderNo: 'O-DUP1', orderDate: '2026-06-22 14:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, canceled: false, memberKey: 'syn_member_100009', lines: [line('1001', 10000)] },
  { orderNo: 'O-DUP2', orderDate: '2026-06-22 14:05:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 12500, productRevenueByLines: 10000, paid: true, canceled: false, memberKey: 'syn_member_100009', lines: [line('1001', 10000)] },
  { orderNo: 'O-REF', orderDate: '2026-06-19 09:00:00', sourceType: 'synthetic_test', deliveryFee: 2500, totalAmount: 42500, productRevenueByLines: 40000, paid: true, canceled: false, memberKey: 'syn_member_100003', claim: { hasClaim: true, claimTypes: ['refund'], claimAmount: 40000 }, lines: [line('1003', 40000)] }
];
// inquiries(safe). createdAt 내림차순: q-dup(06-26) > q-pay(06-25) > q-ref(06-24) > q-urg(06-23)
const inq = (id, date, status, urgency, topic, orderNo, goodsNo) => ({ inquiryId: id, createdAt: date, status, urgency, topic, orderNo, goodsNo, title: topic });
const inquiries = [
  inq('q-dup', '2026-06-26 09:00:00', 'unanswered', 'medium', 'payment', 'O-DUP1', '1001'), // 중복 후보
  inq('q-pay', '2026-06-25 09:00:00', 'unanswered', 'low', 'payment', 'O-PAY1', '1001'),     // 종결형
  inq('q-ref', '2026-06-24 09:00:00', 'unanswered', 'high', 'refund', 'O-REF', '1003'),       // 환불 미확정
  inq('q-urg', '2026-06-23 09:00:00', 'needs_human', 'high', 'delivery', 'O-PAY1', '1001')    // 긴급
];

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const PII_RE = /가상고객|가상수령자|010-0000|@example|샘플로/i;
const INTERNAL_RE = /\[내부 확인 메모\]|evidenceSummary|missingData|pgApprovalNo|cardApprovalNo|paymentAttemptLog|transactionId|claimCompletionStatus|syn_member_|memberKey/i;

console.log('=== CS Draft Composer Runtime Wiring smoke ===');

// 1~2. intent 감지
ok('1. "1순위 미답변 문의 답변 써줘" draft 감지', RT.detectCsDraftRequestIntent('1순위 미답변 문의 답변 써줘').isDraftRequest === true);
ok('2. "답변 초안/답장/고객에게 보낼 답장" 감지', RT.detectCsDraftRequestIntent('답변 초안 만들어줘').isDraftRequest && RT.detectCsDraftRequestIntent('답장 작성해줘').isDraftRequest && RT.detectCsDraftRequestIntent('고객에게 보낼 답장 만들어줘').isDraftRequest);
// 단순 조회는 draft 아님
ok('   "답변 대기 문의만 정리해줘"는 draft 아님', RT.detectCsDraftRequestIntent('답변 대기 문의만 정리해줘').isDraftRequest === false);

// 3. rank 파싱
ok('3. rank 파싱(1순위/첫 번째/2번)', RT.detectCsDraftRequestIntent('1순위 문의 답변 써줘').rank === 1 && RT.detectCsDraftRequestIntent('첫 번째 문의 답장').rank === 1 && RT.detectCsDraftRequestIntent('2번 문의 답변 작성').rank === 2);

// 4. recentUnanswered 선택
const selUn = RT.selectCsDraftTargetInquiry({ inquiries, intent: RT.detectCsDraftRequestIntent('최근 미답변 문의 답장 써줘') });
ok('4. recentUnanswered 대상 선택(최신 unanswered = q-dup)', selUn.inquiry?.inquiryId === 'q-dup' && /미답변/.test(selUn.sourceListName));

// 5. urgent 선택
const selUrg = RT.selectCsDraftTargetInquiry({ inquiries, intent: RT.detectCsDraftRequestIntent('긴급 문의 답변 초안 써줘') });
ok('5. urgent 대상 선택(urgency high)', selUrg.inquiry && ['q-ref', 'q-urg'].includes(selUrg.inquiry.inquiryId) && /긴급/.test(selUrg.sourceListName));

// 6. topicHint 선택
const selTop = RT.selectCsDraftTargetInquiry({ inquiries, intent: RT.detectCsDraftRequestIntent('환불 문의 답변 초안 만들어줘') });
ok('6. topicHint(refund) 대상 선택', selTop.inquiry?.inquiryId === 'q-ref');

// 7. 대상 없음 → 안전 안내
const rtNone = RT.runCsDraftRequest({ userText: '1순위 미답변 문의 답변 써줘', inquiries: [], orders });
ok('7. 대상 없으면 안전 안내', rtNone.handled === true && /초안을 만들 수 있는 미답변 문의가 없습니다/.test(rtNone.reply) && !rtNone.composer);

// 8~9. composer 직접 호출 + customerDraft 출력 (종결형 payment)
const rtPay = RT.runCsDraftRequest({ userText: '1순위 결제 문의 답변 초안 만들어줘', inquiries, orders });
ok('8. composer 직접 호출 → customerDraft 생성', !!rtPay.composer && typeof rtPay.composer.customerDraft === 'string' && rtPay.composer.customerDraft.length > 0);
ok('9. 기본 출력에 customerDraft 포함("아래처럼 답변하시면 됩니다.")', /아래처럼 답변하시면 됩니다\./.test(rtPay.reply) && /안녕하세요, 고객님\./.test(rtPay.reply));

// 10~11. 내부 메타데이터 미노출
ok('10. 기본 출력에 [내부 확인 메모] 블록 없음', !/\[내부 확인 메모\]/.test(rtPay.reply));
ok('11. 기본 출력에 evidenceSummary/missingData 필드명 미노출', !INTERNAL_RE.test(rtPay.reply));

// 12~13. high risk → 운영자 주의 분리
const rtDup = RT.runCsDraftRequest({ userText: '결제 문의 답변 초안 만들어줘', inquiries, orders }); // q-dup이 최신 결제(중복후보)
ok('12. high risk/requiresHumanCheck면 "※ 내부 확인 필요" 별도 표시', rtDup.composer?.requiresHumanCheck === true && /※ 내부 확인 필요:/.test(rtDup.reply));
ok('13. 내부 확인 문구가 customerDraft 안에 섞이지 않음', !/※ 내부 확인 필요/.test(rtDup.composer.customerDraft) && rtDup.reply.indexOf('※ 내부 확인 필요') > rtDup.reply.indexOf(rtDup.composer.customerDraft));

// 14. payment 종결형 → 추가 행동 요청 없음
ok('14. payment 종결형 추가 행동 요청 없음', rtPay.composer.customerActionRequested === false && !/캡처|첨부|보내주시면|주문번호/.test(rtPay.composer.customerDraft));

// 15. 중복 후보 → "중복결제가 아닙니다" 미사용
ok('15. 중복 후보 문의 "중복결제가 아닙니다" 미사용', !/중복결제가 아닙니다|이중 결제는 없습니다/.test(rtDup.reply));

// 16. PII/fake contact/memberKey 미노출
const allReplies = [rtPay, rtDup, rtNone].map((r) => r.reply).join('\n');
ok('16. PII/fake contact/memberKey 미노출(출력)', !PII_RE.test(allReplies) && !/syn_member_|memberKey/i.test(allReplies));

// 17. 비-draft 텍스트 → handled=false (일반 채팅 흐름 유지, 타 동작 무회귀)
const rtAsk = RT.runCsDraftRequest({ userText: '미답변 문의 몇 건이야?', inquiries, orders });
ok('17. 비-draft 질문은 handled=false(일반 흐름 유지)', rtAsk.handled === false && rtAsk.reply === '');

// 18. 순수 함수(동일 입력 → 동일 출력)
ok('18. 순수 함수(deterministic)', JSON.stringify(RT.runCsDraftRequest({ userText: '1순위 결제 문의 답변 초안 만들어줘', inquiries, orders })) === JSON.stringify(rtPay));

console.log('\n--- 출력 미리보기 ---');
console.log('[종결형]\n' + rtPay.reply);
console.log('\n[중복후보 high risk]\n' + rtDup.reply);

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
