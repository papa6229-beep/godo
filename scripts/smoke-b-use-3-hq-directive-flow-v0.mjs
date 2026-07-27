#!/usr/bin/env node
/*
 * scripts/smoke-b-use-3-hq-directive-flow-v0.mjs
 * B-use-3 — 네 승인 의미의 실제 경로 마감 검사
 *   A. HQ 지시 (hq_directive)  B. 팀 내부 (team_internal)
 *   C. 팀 간 협업 (collaboration)  D. 팀→HQ 확인 요청 (escalation, review-only)
 *
 * 배경(실제 단절): 오늘의 운영 화면의 주 사용 경로는
 *   HqDirectiveComposer → OfficeView.sendDirective 다.
 *   그런데 그 함수는 postTeamMessage + logActivity 만 실행하고
 *   createDirectiveTask 를 호출하지 않는다(OfficeView.tsx:81-84).
 *   HqDirectiveComposer 가 ChatConsole 의 기본 빠른 업무 추가 바를 quickBarSlot 으로
 *   대체하므로(OfficeView.tsx:133 · ChatConsole.tsx:646), 사용자가 "팀에 지시"를 보내도
 *   메시지만 생기고 담당 팀의 lifecycle 업무 카드는 만들어지지 않는다.
 *
 * 이 검사는 화면 문자열을 대조하지 않는다. **App 이 실제로 부르는 어댑터 함수**를 그대로 호출해
 *   지시 1건이 메시지 1건 + 업무 1건 + 원장 1건으로 이어지고,
 *   수행자 선택 → 결과 제출 → 팀장 확인 → HQ 최종 확인까지 상태가 흐르는지 검증한다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'buse3-'));

// localStorage shim — 저장 경계를 실제로 통과시킨다.
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  addEventListener() {}, removeEventListener() {}
};

let pass = 0, fail = 0;
const ok = (n, c, extra) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${extra ? `  ${extra}` : ''}`); c ? pass++ : fail++; };

console.log('=== B-use-3 HQ 지시 흐름 smoke ===');

let A = null, LEDGER = null, MSG = null, STORE = null;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'taskLifecycleAppAdapter.ts'),
    path.join(REPO, 'src', 'services', 'activityLedger.ts'),
    path.join(REPO, 'src', 'services', 'teamMessageCenter.ts'),
    path.join(REPO, 'src', 'services', 'taskLifecycleStore.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  const dir = path.join(tmp, 'services');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const p = path.join(dir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
  }
  const imp = async (n) => import(pathToFileURL(path.join(dir, n)).href);
  A = await imp('taskLifecycleAppAdapter.js');
  LEDGER = await imp('activityLedger.js');
  MSG = await imp('teamMessageCenter.js');
  STORE = await imp('taskLifecycleStore.js');
} catch (e) {
  console.error('[smoke] 모듈 컴파일 실패:', e.stdout?.toString() || e.message);
  process.exit(1);
}

// ── 시나리오 고정값 (deterministic) ────────────────────────────────────────
let seq = 0;
const ids = { newId: () => `t-${++seq}`, nowIso: () => `2026-07-27T09:0${seq}:00.000Z` };
const HQ = { kind: 'human', teamId: 'hq', label: '최고관리자', userId: 'u-hq', identitySource: 'demo_role' };
const PRODUCT_LEAD = { kind: 'human', teamId: 'product', label: '상품팀장', userId: 'u-product', identitySource: 'demo_role' };
const TITLE = '이번 주 재고 위험 상품 정리';
// 첨부 1건 — 원문(dataUrl)은 팀 메시지 저장소에만 남아야 하고 업무에 복제되면 안 된다.
const ATTACHMENT = {
  name: '재고위험목록.csv',
  size: 128,
  type: 'text/csv',
  dataUrl: 'data:text/csv;base64,VEVTVC1BVFRBQ0hNRU5ULUJPRFk='
};

// ── [1] 지시 1건 → 메시지 1건 + 업무 1건 + 원장 1건 ─────────────────────────
console.log('\n[1] HQ 지시 한 번 → 메시지·업무·원장');

// App 이 실제로 하는 일과 같은 순서로 부른다.
const posted = MSG.postTeamMessage({
  from: HQ, toTeam: 'product', kind: 'info', title: TITLE, body: '', attachments: [ATTACHMENT]
});
ok('1-1. 팀 메시지 1건 생성', MSG.loadTeamMessages().length === 1, `${MSG.loadTeamMessages().length}건`);

// ★ RED 지점: 이 경로에서 lifecycle 업무가 만들어져야 한다.
//   createDirectiveTask 가 원본 메시지 참조(inputRefs)를 받지 못하면 여기서 끊긴다.
let task = null;
try {
  task = A.createDirectiveTask(
    { title: TITLE, targetTeamId: 'product', instructedBy: HQ, inputRefs: [A.messageRef(posted.id)] },
    ids
  );
} catch (e) {
  console.log(`        (createDirectiveTask 호출 실패: ${e.message})`);
}
ok('1-2. lifecycle 업무 1건 생성', !!task, task ? task.ref.taskId : '없음');

const storedTasks = STORE.loadLifecycleTasks();
ok('1-3. 저장된 업무 정확히 1건(중복 없음)', storedTasks.length === 1, `${storedTasks.length}건`);

LEDGER.logActivity({
  teamId: 'hq', type: 'message_sent', status: 'info', title: TITLE,
  detail: '상품관리팀에 지시 · 첨부 1', actor: HQ, relatedTeam: 'product',
  refId: posted.id,
  ...(task ? { taskId: task.ref.taskId, correlationId: task.ref.correlationId } : {})
});
const ledger = LEDGER.loadActivity();
ok('1-4. 활동 원장 1건 생성', ledger.length === 1, `${ledger.length}건`);

// ── [2] 업무의 정본 속성 ────────────────────────────────────────────────────
console.log('\n[2] 생성된 업무의 정본 속성');
ok('2-1. 담당 팀 = 화면에서 고른 팀', task?.ownerTeamId === 'product', task?.ownerTeamId);
ok('2-2. 행위자 = 세션 actor(HQ)', task?.createdBy?.userId === 'u-hq' && task?.createdBy?.teamId === 'hq');
ok('2-3. 실제 로그인 미연결이 그대로 드러남', task?.createdBy?.identitySource === 'demo_role', task?.createdBy?.identitySource);
ok('2-4. 수행자 = unassigned (actor 와 합치지 않음)', task?.executorKind === 'unassigned' && !task?.executorId);
ok('2-5. 승인 경로 = 담당 팀장 확인 → 총괄 최종 확인',
  task?.approvalRoute?.stages?.length === 2 &&
  task.approvalRoute.stages[0].approverKind === 'owner_team_lead' &&
  task.approvalRoute.stages[1].approverKind === 'hq',
  (task?.approvalRoute?.stages ?? []).map((s) => s.approverKind).join('→'));

// ── [3] 원본 역참조 ─────────────────────────────────────────────────────────
console.log('\n[3] 원본 메시지 역참조');
const expectedRef = A.messageRef(posted.id);
ok('3-1. 업무가 원본 메시지 참조 보유(inputRefs)', (task?.inputRefs ?? []).includes(expectedRef), JSON.stringify(task?.inputRefs ?? []));
ok('3-2. 참조 형식은 기존 messageRef 그대로', expectedRef.startsWith('teammsg:'), expectedRef);
// 첨부·본문을 두 저장소에 복제하지 않는다.
const taskJson = JSON.stringify(task ?? {});
ok('3-3. 첨부·본문을 업무에 복제하지 않음',
  !taskJson.includes('dataUrl') && !taskJson.includes('TEST-ATTACHMENT-BODY') && !(task?.artifactRefs ?? []).length);
// 첨부의 정본은 팀 메시지 한 곳이다.
const storedMsg = MSG.loadTeamMessages()[0];
ok('3-3a. 첨부는 팀 메시지에 그대로 보존', (storedMsg?.attachments ?? []).length === 1, `${(storedMsg?.attachments ?? []).length}건`);
ok('3-3b. 팀 메시지가 첨부 원문(dataUrl)을 보유', typeof storedMsg?.attachments?.[0]?.dataUrl === 'string');
ok('3-4. 원장이 taskId·correlationId·메시지 refId 를 함께 보유',
  ledger[0]?.taskId === task?.ref.taskId && ledger[0]?.correlationId === task?.ref.correlationId && ledger[0]?.refId === posted.id,
  `taskId=${ledger[0]?.taskId} corr=${ledger[0]?.correlationId} refId=${ledger[0]?.refId}`);

// ── [4] 하류 흐름: 수행자 선택 → 제출 → 팀장 확인 → HQ 확인 ─────────────────
console.log('\n[4] 수행 → 확인 → 완료');
const taskId = task?.ref.taskId;
let r;
r = A.assignExecutor(taskId, { kind: 'human', executorId: PRODUCT_LEAD.userId, actor: PRODUCT_LEAD }, ids);
ok('4-1. 상품팀장이 사람 수행자 선택', r?.ok === true, r?.reason ?? '');
ok('4-2. 수행자가 actor 로 덮어써지지 않음', r?.task?.executorId === 'u-product' && r?.task?.executorKind === 'human', r?.task?.executorId);

r = A.submitResult(taskId, { resultSummary: '위험 상품 4건 정리 완료', actor: PRODUCT_LEAD }, ids);
ok('4-3. 같은 사람이 결과 제출', r?.ok === true, r?.reason ?? '');
ok('4-4. 상태 = 확인 대기', r?.task?.status === 'awaiting_approval', r?.task?.status);

// applyDecision 은 task 를 돌려주지 않는다(ApplyDecisionResult = {ok, reason, state, ...}).
//   상태는 저장소 정본에서 다시 읽는다.
const statusOf = () => STORE.loadLifecycleTasks().find((t) => t.ref.taskId === taskId)?.status;

r = A.applyDecision(taskId, { kind: 'approve', actor: PRODUCT_LEAD }, ids);
ok('4-5. 담당 팀장 확인 성공', r?.ok === true, r?.reason ?? '');
ok('4-6. 팀장 확인만으로는 아직 완료 아님', statusOf() !== 'completed', statusOf());

r = A.applyDecision(taskId, { kind: 'approve', actor: HQ }, ids);
ok('4-7. HQ 최종 확인 성공', r?.ok === true, r?.reason ?? '');
ok('4-8. HQ 확인 후 완료', statusOf() === 'completed', statusOf());

// ── [5] 완료 후 열람 ────────────────────────────────────────────────────────
console.log('\n[5] 완료 업무 열람(지난 업무 → 상세)');
// 저장소 정본에서 다시 읽는다 — 중간 단계가 실패해 r.task 가 없을 때 거짓 PASS 가 나지 않게 한다.
const finalTask = STORE.loadLifecycleTasks().find((t) => t.ref.taskId === taskId);
ok('5-1. 결과가 남아 있음', !!finalTask?.resultSummary, finalTask?.resultSummary ?? '없음');
ok('5-2. 결정 이력 2건(팀장·HQ)', (finalTask?.decisions ?? []).length === 2, `${(finalTask?.decisions ?? []).length}건`);
ok('5-3. 수행자 이력 보존', (finalTask?.executorHistory ?? []).length >= 1);
ok('5-4. 원본 메시지 참조 유지', (finalTask?.inputRefs ?? []).includes(expectedRef));
// 지난 업무 목록에 실제로 들어가는 조건(TeamTaskPanel 의 doneFlows 판정과 같은 식)
ok('5-5. 지난 업무 구간에 속함',
  !!finalTask && !['open', 'in_progress', 'awaiting_approval'].includes(finalTask.status), finalTask?.status ?? '업무 없음');

// ── [6] 중복 없음 ───────────────────────────────────────────────────────────
console.log('\n[6] 중복 생성 없음');
ok('6-1. 메시지 1건', MSG.loadTeamMessages().length === 1, `${MSG.loadTeamMessages().length}건`);
ok('6-2. 원장 1건', LEDGER.loadActivity().length === 1, `${LEDGER.loadActivity().length}건`);

// ── [7] 배선 가드: 화면 경로가 실제로 업무를 만드는가 ───────────────────────
console.log('\n[7] 화면 경로 배선');
const OFFICE = readFileSync(path.join(REPO, 'src', 'components', 'OfficeView.tsx'), 'utf8');
const APP = readFileSync(path.join(REPO, 'src', 'App.tsx'), 'utf8');
ok('7-1. OfficeView 가 하드코딩 HQ_ACTOR 를 기록 근거로 쓰지 않음', !/const HQ_ACTOR\s*=/.test(OFFICE));
ok('7-2. HQ 지시 경로가 App 의 세션 actor 를 쓴다', /onSendDirective/.test(OFFICE) && /onSendDirective=\{/.test(APP + OFFICE));
ok('7-3. App 의 지시 처리기가 createDirectiveTask 를 호출', /handleSendDirective/.test(APP) && /createDirectiveTask\(/.test(APP));
ok('7-4. 원본 참조를 messageRef 로 연결', /messageRef\(/.test(APP));
// 업무 상세에서 "원본 자료가 연결돼 있다"는 사실을 확인할 수 있어야 한다.
const DETAIL = readFileSync(path.join(REPO, 'src', 'components', 'TaskDetailModal.tsx'), 'utf8');
ok('7-5. 업무 상세가 resultOf.inputRefs 를 읽는다', /resultOf\.inputRefs/.test(DETAIL));
ok('7-6. 상세가 teammsg 참조를 사용자 문구로 표시', /teammsg:/.test(DETAIL) && /원본 팀 지시 연결됨/.test(DETAIL));
ok('7-7. 상세가 저장소를 직접 읽지 않음(참조만 표시)', !/localStorage/.test(DETAIL));


// ══════════════════════════════════════════════════════════════════════════
// B. 팀 내부 업무 — 원본 메시지가 없는 경로
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[B] 팀 내부 업무 (team_internal)');
const beforeB = STORE.loadLifecycleTasks().length;
const internal = A.createDirectiveTask(
  { title: '상품 상세 오탈자 정리', targetTeamId: 'product', instructedBy: PRODUCT_LEAD },
  ids
);
ok('B-1. 업무 1건만 생성', STORE.loadLifecycleTasks().length === beforeB + 1);
ok('B-2. 승인 경로 = team_internal(팀장 확인 1단계)',
  internal.approvalRoute.stages.length === 1 && internal.approvalRoute.stages[0].approverKind === 'owner_team_lead',
  internal.approvalRoute.stages.map((x) => x.approverKind).join('->'));
ok('B-3. 수행자 unassigned', internal.executorKind === 'unassigned' && !internal.executorId);
ok('B-4. 가짜 원본 참조를 만들지 않음', (internal.inputRefs ?? []).length === 0, JSON.stringify(internal.inputRefs ?? []));

LEDGER.logActivity({
  teamId: 'product', type: 'note', status: 'info', title: internal.title,
  detail: '상품관리팀에 업무 등록', actor: PRODUCT_LEAD, relatedTeam: 'product',
  taskId: internal.ref.taskId, correlationId: internal.ref.correlationId
});
const bLedger = LEDGER.loadActivity().find((e) => e.taskId === internal.ref.taskId);
ok('B-5. 활동 원장에서 taskId·correlationId 로 역추적', !!bLedger && bLedger.correlationId === internal.ref.correlationId);

const iid = internal.ref.taskId;
A.assignExecutor(iid, { kind: 'human', executorId: PRODUCT_LEAD.userId, actor: PRODUCT_LEAD }, ids);
A.submitResult(iid, { resultSummary: '오탈자 12건 수정', actor: PRODUCT_LEAD }, ids);
const rB = A.applyDecision(iid, { kind: 'approve', actor: PRODUCT_LEAD }, ids);
const iStatus = () => STORE.loadLifecycleTasks().find((t) => t.ref.taskId === iid)?.status;
ok('B-6. 수행->결과->팀장 확인으로 완료', rB?.ok === true && iStatus() === 'completed', iStatus());

// ══════════════════════════════════════════════════════════════════════════
// C. 팀 간 협업 요청
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[C] 팀 간 협업 (collaboration)');
const CS_LEAD = { kind: 'human', teamId: 'cs', label: 'CS팀장', userId: 'u-cs', identitySource: 'demo_role' };
const collabMsg = MSG.postTeamMessage({
  from: PRODUCT_LEAD, toTeam: 'cs', kind: 'support', title: '반품 문의 응대 지원',
  body: '', attachments: [ATTACHMENT]
});
ok('C-1. 지원요청 메시지 1건', MSG.loadTeamMessages().filter((m) => m.kind === 'support').length === 1);

const beforeC = STORE.loadLifecycleTasks().length;
const collab = A.createCollaborationRequest(
  {
    title: '반품 문의 응대 지원', requestingTeamId: 'product', targetTeamId: 'cs',
    instructedBy: PRODUCT_LEAD, inputRefs: [A.messageRef(collabMsg.id)]
  },
  ids
);
ok('C-2. tracking 부모 1건 + 수행 자식 1건', STORE.loadLifecycleTasks().length === beforeC + 2);
ok('C-3. 부모는 추적 전용', collab.parent.trackingOnly === true);
ok('C-4. 자식이 실제 수행 정본(수행팀 소유)', collab.child.ownerTeamId === 'cs' && collab.child.requestingTeamId === 'product');
ok('C-5. 자식에 원본 메시지 참조', (collab.child.inputRefs ?? []).includes(A.messageRef(collabMsg.id)), JSON.stringify(collab.child.inputRefs ?? []));
const collabJson = JSON.stringify(collab);
ok('C-6. 첨부 원문을 업무에 복제하지 않음', !collabJson.includes('dataUrl') && !collabJson.includes('TEST-ATTACHMENT-BODY'));
ok('C-7. 첨부는 메시지에만 보존',
  (MSG.loadTeamMessages().find((m) => m.id === collabMsg.id)?.attachments ?? []).length === 1);
ok('C-8. 승인 경로 = 수행 팀장 확인 -> 요청팀 확인',
  collab.child.approvalRoute.stages.length === 2 &&
  collab.child.approvalRoute.stages[0].approverKind === 'owner_team_lead' &&
  collab.child.approvalRoute.stages[1].approverKind === 'requesting_team',
  collab.child.approvalRoute.stages.map((x) => x.approverKind).join('->'));

// 같은 협업이 팀마다 카드 두 장이 아니라 한 흐름으로 보이는가
const corr = collab.child.ref.correlationId;
const csFlows = A.taskFlowsFor(CS_LEAD).filter((f) => f.task.ref.correlationId === corr);
const prodFlows = A.taskFlowsFor(PRODUCT_LEAD).filter((f) => f.task.ref.correlationId === corr);
const hqFlows = A.taskFlowsFor(HQ).filter((f) => f.task.ref.correlationId === corr);
ok('C-9. 수행팀에서 1흐름', csFlows.length === 1, String(csFlows.length));
ok('C-10. 요청팀에서 1흐름(추적)', prodFlows.length === 1 && !!prodFlows[0].tracking, String(prodFlows.length));
ok('C-11. 총괄에서 1흐름', hqFlows.length === 1, String(hqFlows.length));
ok('C-12. 요청팀 상세도 resultOf 규칙으로 같은 원본을 본다',
  ((prodFlows[0]?.tracking ?? prodFlows[0]?.task)?.inputRefs ?? []).includes(A.messageRef(collabMsg.id)));

LEDGER.logActivity({
  teamId: 'product', type: 'message_sent', status: 'info', title: '반품 문의 응대 지원',
  detail: 'CS팀에 지원요청', actor: PRODUCT_LEAD, relatedTeam: 'cs',
  refId: collabMsg.id, taskId: collab.child.ref.taskId, correlationId: collab.child.ref.correlationId
});
const cLedger = LEDGER.loadActivity().filter((e) => e.refId === collabMsg.id);
ok('C-13. 원장 1건에 메시지·실제 수행 업무가 함께', cLedger.length === 1 && cLedger[0].taskId === collab.child.ref.taskId);

const cid = collab.child.ref.taskId;
A.assignExecutor(cid, { kind: 'human', executorId: CS_LEAD.userId, actor: CS_LEAD }, ids);
A.submitResult(cid, { resultSummary: '반품 응대 지원 완료', actor: CS_LEAD }, ids);
const cStatus = () => STORE.loadLifecycleTasks().find((t) => t.ref.taskId === cid)?.status;
ok('C-14. 수행팀 확인만으로는 미완료',
  A.applyDecision(cid, { kind: 'approve', actor: CS_LEAD }, ids)?.ok === true && cStatus() !== 'completed', cStatus());
ok('C-15. 요청팀 확인으로 완료',
  A.applyDecision(cid, { kind: 'approve', actor: PRODUCT_LEAD }, ids)?.ok === true && cStatus() === 'completed', cStatus());

// ══════════════════════════════════════════════════════════════════════════
// D. 팀 -> HQ 확인 요청
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[D] 팀 -> HQ 확인 요청 (review-only)');
const reviewMsg = MSG.postTeamMessage({
  from: PRODUCT_LEAD, toTeam: 'hq', kind: 'confirm', title: '가격 인하안 확인',
  body: '베스트셀러 3종 10% 인하', attachments: [ATTACHMENT]
});
ok('D-1. 확인요청 메시지 1건', MSG.loadTeamMessages().filter((m) => m.kind === 'confirm').length === 1);

const beforeD = STORE.loadLifecycleTasks().length;
const rev1 = A.createHqReviewRequest({ message: reviewMsg, actor: PRODUCT_LEAD }, ids);
ok('D-2. review-only 카드 1건', rev1.ok === true && STORE.loadLifecycleTasks().length === beforeD + 1);
ok('D-3. reviewOnly 표식', rev1.task?.reviewOnly === true);
ok('D-4. 원본 메시지 참조', (rev1.task?.inputRefs ?? []).includes(A.messageRef(reviewMsg.id)));
ok('D-5. 수행자 없음', rev1.task?.executorKind === 'unassigned' && !rev1.task?.executorId);
ok('D-6. 첨부 원문을 업무에 복제하지 않음',
  !JSON.stringify(rev1.task ?? {}).includes('dataUrl') && !JSON.stringify(rev1.task ?? {}).includes('TEST-ATTACHMENT-BODY'));
ok('D-7. HQ 결정 경로(escalation)',
  rev1.task?.approvalRoute?.stages?.length === 1 && rev1.task.approvalRoute.stages[0].approverKind === 'hq',
  (rev1.task?.approvalRoute?.stages ?? []).map((x) => x.approverKind).join('->'));

const rid = rev1.task.ref.taskId;
ok('D-8. 수행자 선택 불가', A.assignExecutor(rid, { kind: 'human', actor: PRODUCT_LEAD }, ids)?.ok === false);
const revDecisions = A.availableDecisions(rev1.task, HQ).map((d) => d.kind);
ok('D-9. HQ 는 확인완료·수정요청·미채택만 가능(중단 없음)',
  revDecisions.includes('approve') && !revDecisions.includes('stop'), revDecisions.join(','));

LEDGER.logActivity({
  teamId: 'product', type: 'message_sent', status: 'info', title: '가격 인하안 확인',
  detail: '총괄에 확인요청', actor: PRODUCT_LEAD, relatedTeam: 'hq',
  refId: reviewMsg.id, taskId: rev1.task.ref.taskId, correlationId: rev1.task.ref.correlationId
});
const dLedger = LEDGER.loadActivity().filter((e) => e.refId === reviewMsg.id);
ok('D-10. 원장 1건에 메시지·확인 카드가 함께', dLedger.length === 1 && dLedger[0].taskId === rev1.task.ref.taskId);

const beforeIdem = STORE.loadLifecycleTasks().length;
const rev2 = A.createHqReviewRequest({ message: reviewMsg, actor: PRODUCT_LEAD }, ids);
ok('D-11. 같은 메시지 재처리 시 업무 미증가', STORE.loadLifecycleTasks().length === beforeIdem);
ok('D-12. 기존 카드를 그대로 돌려줌', rev2.ok === true && rev2.created === false && rev2.task?.ref.taskId === rid);

const dStatus = () => STORE.loadLifecycleTasks().find((t) => t.ref.taskId === rid)?.status;
ok('D-13. HQ 결정으로 종료', A.applyDecision(rid, { kind: 'approve', actor: HQ }, ids)?.ok === true && dStatus() === 'completed', dStatus());

rmSync(tmp, { recursive: true, force: true });
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
