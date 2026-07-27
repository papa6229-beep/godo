#!/usr/bin/env node
/*
 * scripts/smoke-b-use-3-hq-directive-flow-v0.mjs
 * B-use-3 — HQ 지시 → 업무 카드 → 수행 → 확인 → 완료 (RED→GREEN)
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

// ── [1] 지시 1건 → 메시지 1건 + 업무 1건 + 원장 1건 ─────────────────────────
console.log('\n[1] HQ 지시 한 번 → 메시지·업무·원장');

// App 이 실제로 하는 일과 같은 순서로 부른다.
const posted = MSG.postTeamMessage({
  from: HQ, toTeam: 'product', kind: 'info', title: TITLE, body: '', attachments: []
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
  detail: '상품관리팀에 지시', actor: HQ, relatedTeam: 'product',
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
ok('3-3. 첨부·본문을 업무에 복제하지 않음', !taskJson.includes('dataUrl') && !(task?.artifactRefs ?? []).length);
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

rmSync(tmp, { recursive: true, force: true });
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
