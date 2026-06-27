#!/usr/bin/env node
/*
 * scripts/smoke-cs-work-completion-flow.mjs
 * CS Work Completion Flow v0 검증.
 *  - completion state helper(순수) + 컴포넌트 소스 마커(버튼/필터/콜백).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const TSX = read('src/components/CsTeamDashboard.tsx');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-cscompl-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'csWorkCompletionState.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const W = await import(pathToFileURL(path.join(tmp, 'csWorkCompletionState.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };

console.log('=== CS Work Completion Flow smoke ===');

// 컴포넌트 소스 마커
ok('1. 미처리 상세에 처리 완료 버튼', /처리 완료<\/button>/.test(TSX) && /onCompleteItem/.test(TSX));
ok('2. 답변/AI초안 없으면 완료 불가 안내', /답변 내용 또는 AI 초안이 필요합니다/.test(TSX));
ok('15. AI 자동처리함 선택 처리완료 버튼', /선택 처리완료/.test(TSX));
ok('16. AI 자동처리함 전체 처리완료 버튼', /전체 처리완료/.test(TSX));
ok('23. 실제 WRITE/네트워크 호출 없음', !/fetch\(|axios|\.post\(|\.put\(|\.delete\(/i.test(TSX));
ok('24. 고객관리 팝업 호출에 완료 콜백 없음(미변경)', (() => { const m = TSX.match(/<CsCustomerPopup[\s\S]*?\/>/); return !!m && !/onComplete(Item|Batch)/.test(m[0]); })());

// helper 동작
const orderBlock = { orderNo: 'O1', orderDate: '2026-05-29 10:00:00', paymentState: '결제완료', orderAmount: 62500, goodsAmount: 60000, deliveryCharge: 2500, items: [{ productName: '드라이기', quantity: 1, amount: 60000 }], matched: true };
const customerBlock = { isSynthetic: true, memberType: '회원', memberId: 'cust_1', name: '가상고객 1', phone: '010-0000-0001', email: 's1@example.test', recentOrderCount: 2 };

const c1 = W.buildCompletedWorkItem({ sourceType: 'inquiry', originalId: 'q1', title: '결제 문의', type: '결제', productName: '드라이기', orderNo: 'O1', originalText: '결제가 두 번 됐어요', answerText: '직접 작성한 답변입니다.', assignee: 'CS팀장', completedAt: '2026-06-27 12:00:00', completionMethod: 'manual_reply', order: orderBlock, customer: customerBlock });
ok('3+4. 직접답변/AI초안으로 완료 item 생성', !!c1 && c1.answerText === '직접 작성한 답변입니다.' && c1.completionMethod === 'manual_reply');
ok('5. 완료 item에 originalId/sourceType/title/productName/orderNo', c1.originalId === 'q1' && c1.sourceType === 'inquiry' && c1.title === '결제 문의' && c1.productName === '드라이기' && c1.orderNo === 'O1');
ok('6. 완료 item에 answerText', typeof c1.answerText === 'string' && c1.answerText.length > 0);
ok('7. 완료 item에 assignee', c1.assignee === 'CS팀장');
ok('8. 완료 item에 completedAt', c1.completedAt === '2026-06-27 12:00:00');
ok('9. writeStatus=not_connected + writeTarget(inquiry_reply)', c1.writeStatus === 'not_connected' && c1.writeTarget.targetType === 'inquiry_reply' && c1.writeTarget.platform === 'godomall');
ok('12+13. resolved 매핑에 answerText + assignee', (() => { const ri = W.toResolvedItem(c1); return ri.answerText === c1.answerText && ri.handledBy === 'CS팀장' && ri.localCompleted === true; })());
ok('14. assignee 없으면 처리완료 표시에서 handledBy 미설정(UI 미기록 fallback)', (() => { const c = W.buildCompletedWorkItem({ sourceType: 'inquiry', originalId: 'qx', title: 'x', answerText: 'a', completedAt: 't', completionMethod: 'ai_draft' }); const ri = W.toResolvedItem(c); return !ri.handledBy; })());

// AI 자동처리함 helper
ok('17. draftPreview 없는 항목은 완료 대상 제외(isAiAutoCompletable)', W.isAiAutoCompletable('review', '답글') === true && W.isAiAutoCompletable('review', '') === false && W.isAiAutoCompletable('delivery', '안내') === true);
ok('20+21. 리뷰/배송만 완료 대상(inquiry는 false)', W.isAiAutoCompletable('inquiry', '내용') === false);

const review = W.buildCompletedWorkItem({ sourceType: 'review', originalId: 'rv1', title: '모자 리뷰', type: '리뷰', productName: '모자', answerText: '감사합니다', completedAt: 't', completionMethod: 'ai_auto_batch' });
ok('19. review 완료 item writeTarget=review_reply + 처리완료 매핑', review.writeTarget.targetType === 'review_reply' && W.toResolvedItem(review).localCompleted === true);

// dedup
const list1 = W.addCompletedWorkItems([], [c1]);
const list2 = W.addCompletedWorkItems(list1, [c1]); // 중복
ok('22. 중복 완료 방지(addCompletedWorkItems)', list1.length === 1 && list2.length === 1);
const ids = W.completedOriginalIdSet(list1);
ok('10+11. originalId set으로 미처리 제외 / 처리완료 추가 가능', ids.has('q1') && W.toResolvedItem(list1[0]).inquiryId === 'q1');

console.log('\n--- completed sample ---');
console.log(JSON.stringify({ id: c1.id, writeStatus: c1.writeStatus, method: c1.completionMethod, hasAnswer: !!c1.answerText }));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
