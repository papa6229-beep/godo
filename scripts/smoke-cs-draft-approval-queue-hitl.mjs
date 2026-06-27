#!/usr/bin/env node
/*
 * scripts/smoke-cs-draft-approval-queue-hitl.mjs
 * CS Draft → Approval Queue HITL v0 검증.
 *  - csApprovalQueueBridge(순수) + 컴포넌트 소스 마커(승인요청 버튼/배지/큐 팝업).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const TSX = read('src/components/CsTeamDashboard.tsx');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'godo-csaq-'));
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'services', 'csApprovalQueueBridge.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src', 'services'),
    '--outDir', tmp, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'
  ], { stdio: 'pipe' });
} catch (e) { console.error('[smoke] tsc emit failed:\n', e.stdout?.toString() || e.message); process.exit(1); }
for (const f of readdirSync(tmp).filter((x) => x.endsWith('.js'))) {
  const p = path.join(tmp, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
}
const B = await import(pathToFileURL(path.join(tmp, 'csApprovalQueueBridge.js')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const PII_RE = /010-0000|@example|샘플로|테스트구|전화|연락처/i;

console.log('=== CS Draft → Approval Queue HITL smoke ===');

// 컴포넌트 소스
ok('1. 미처리 상세 승인요청 버튼', /승인요청<\/button>/.test(TSX) && /onRequestApproval/.test(TSX));
ok('4+5. AI함 선택/전체 승인요청 버튼', /선택 승인요청/.test(TSX) && /전체 승인요청/.test(TSX) && /onRequestApprovalBatch/.test(TSX));
ok('15. 원본 항목 승인 상태 배지(승인 대기/승인됨/반려됨)', /승인 대기/.test(TSX) && /승인됨/.test(TSX) && /반려됨/.test(TSX) && /approvalStatus/.test(TSX));
ok('16. Approval Queue UI(CS 항목 표시)', /CsApprovalQueuePopup/.test(TSX) && /CS 승인 큐/.test(TSX));
ok('17+18. 승인/반려 핸들러 연결', /approveCsApprovalItem/.test(TSX) && /rejectCsApprovalItem/.test(TSX));
ok('19. 실제 WRITE/네트워크 호출 없음', !/fetch\(|axios|\.post\(|\.put\(|\.delete\(/i.test(TSX));

// bridge 동작
const target = { originalId: 'q1', orderNo: 'O1', productName: '드라이기', customerId: 'cust_1', memberId: 'cust_1' };
const a1 = B.buildCsApprovalItem({ sourceType: 'inquiry_reply', title: '결제 문의', answerText: '직접 답변입니다.', target, context: { originalText: '원문', assignee: 'CS팀장', completionMethod: 'manual_reply' }, createdAt: '2026-06-27 12:00:00' });
ok('2+3. 직접답변/AI초안 승인요청 item 생성', !!a1 && a1.answerText === '직접 답변입니다.' && a1.source === 'cs');
ok('11. status 기본값 pending_approval', a1.status === 'pending_approval');
ok('12. writeStatus not_connected', a1.writeStatus === 'not_connected');
ok('13. writeTarget 존재(inquiry_reply)', a1.writeTarget && a1.writeTarget.targetType === 'inquiry_reply' && a1.writeTarget.platform === 'godomall');
const rev = B.buildCsApprovalItem({ sourceType: 'review_reply', title: '모자 리뷰', answerText: '감사합니다', target: { originalId: 'rv1' }, createdAt: '2026-06-27 12:00:00' });
const dlv = B.buildCsApprovalItem({ sourceType: 'delivery_reply', title: '배송 문의', answerText: '배송 안내', target: { originalId: 'q2', orderNo: 'O2' }, createdAt: '2026-06-27 12:00:00' });
ok('6+7. 리뷰답글/배송안내 큐 대상(sourceType)', rev.sourceType === 'review_reply' && rev.writeTarget.targetType === 'review_reply' && dlv.sourceType === 'delivery_reply' && dlv.writeTarget.targetType === 'inquiry_reply');

// dedup
const list1 = B.addCsApprovalItems([], [a1]);
const list2 = B.addCsApprovalItems(list1, [a1]); // 동일 답변 중복
ok('14. 중복 승인요청 방지(동일 sourceType+originalId+answerText)', list1.length === 1 && list2.length === 1);
const a1b = B.buildCsApprovalItem({ sourceType: 'inquiry_reply', title: '결제 문의', answerText: '내용이 바뀐 답변', target, createdAt: '2026-06-27 13:00:00' });
ok('   답변이 바뀌면 새 요청 허용', B.addCsApprovalItems(list1, [a1b]).length === 2);

// 승인/반려
const approved = B.approveCsApprovalItem(list1, a1.id);
const rejected = B.rejectCsApprovalItem(list1, a1.id, '문구 수정 필요');
ok('17. 승인 시 approved_local', approved[0].status === 'approved_local' && approved[0].writeStatus === 'not_connected');
ok('18. 반려 시 rejected + 사유', rejected[0].status === 'rejected' && rejected[0].rejectReason === '문구 수정 필요');

// 배지 맵
const statusMap = B.csApprovalStatusByOriginalId(list1);
ok('15b. originalId→status 맵(배지)', statusMap['q1'] === 'pending_approval');

// PII 제한
ok('20. Approval item에 전화/이메일/주소 없음', !PII_RE.test(JSON.stringify([a1, rev, dlv])) && a1.target.phone === undefined && a1.target.email === undefined && a1.target.address === undefined);
ok('   고객명 대신 memberId/customerId만(최소 정보)', a1.target.memberId === 'cust_1' && !('name' in a1.target));

// 기존 흐름 유지(소스 마커)
ok('22. 고객관리 Profile Hub 유지', /CsCustomerProfilePopup/.test(TSX));
ok('23. 기존 처리완료 흐름 유지(처리 완료 버튼/onCompleteItem)', /처리 완료<\/button>/.test(TSX) && /onCompleteItem/.test(TSX) && /선택 처리완료/.test(TSX));

console.log('\n--- approval sample ---');
console.log(JSON.stringify({ id: a1.id, status: a1.status, writeStatus: a1.writeStatus, wt: a1.writeTarget.targetType, target: a1.target }));

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
