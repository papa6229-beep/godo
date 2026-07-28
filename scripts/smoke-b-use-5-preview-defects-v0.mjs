#!/usr/bin/env node
/*
 * scripts/smoke-b-use-5-preview-defects-v0.mjs
 * B-use-5 — Preview 인수검사에서 사용자가 실제 화면으로 관측한 결함 마감 검사
 *
 * 단일 종료조건: "HQ 지시 → 팀 수행 → 결과 제출 → 팀장 확인 → HQ 최종 확인" 한 흐름에서
 *   **저장 상태와 보이는 상태가 즉시 일치**하고, 사용자가 **보이는 곳에서 간단하게 승인**할 수 있다.
 *
 * 검사 방식: 화면 문자열 대조가 아니라 **컴파일된 실제 저장소·계약 모듈을 실행**한다.
 *   화면 배선은 소스 가드로 함께 잠근다(실행할 수 없는 부분만).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'buse5-'));

// ── 브라우저 최소 shim: localStorage + 이벤트 타깃 ─────────────────────────────
//   같은 탭 알림을 실제로 관측해야 하므로 addEventListener/dispatchEvent 가 진짜로 동작해야 한다.
const store = new Map();
const listeners = new Map();
globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  addEventListener(type, fn) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)).add(fn); },
  removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  dispatchEvent(ev) { for (const fn of listeners.get(ev.type) ?? []) fn(ev); return true; }
};
/** 다른 탭의 쓰기를 흉내낸다(브라우저는 같은 탭 쓰기에 storage 이벤트를 발생시키지 않는다). */
const fireStorage = (key) => globalThis.window.dispatchEvent({ type: 'storage', key });

let pass = 0, fail = 0;
const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d ? `  — ${d}` : ''}`); c ? pass++ : fail++; };
const src = (p) => readFileSync(path.join(REPO, p), 'utf8');
const codeLines = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

console.log('=== B-use-5 Preview 결함 마감 smoke ===');

// ── 컴파일 ───────────────────────────────────────────────────────────────────
let LEDGER, MSG, LA, LSTORE, SYNC;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'activityLedger.ts'),
    path.join(REPO, 'src', 'services', 'teamMessageCenter.ts'),
    path.join(REPO, 'src', 'services', 'taskLifecycleAppAdapter.ts'),
    path.join(REPO, 'src', 'services', 'taskLifecycleStore.ts'),
    path.join(REPO, 'src', 'services', 'linkedMessageSync.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  const fix = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) fix(p);
      else if (e.name.endsWith('.js')) writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
    }
  };
  fix(tmp);
  const imp = (f) => import(pathToFileURL(path.join(tmp, 'services', f)).href);
  LEDGER = await imp('activityLedger.js');
  MSG = await imp('teamMessageCenter.js');
  LA = await imp('taskLifecycleAppAdapter.js');
  LSTORE = await imp('taskLifecycleStore.js');
  SYNC = await imp('linkedMessageSync.js');
} catch (e) {
  console.error('[smoke] 컴파일/import 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════════════════
// [N] 같은 탭 저장 알림 (증상 1 — 지시 직후 화면이 갱신되지 않음)
//
// 브라우저의 `storage` 이벤트는 **같은 탭의 쓰기에는 발생하지 않는다.**
// 그래서 저장은 성공했는데 같은 탭의 구독자(TeamOperationsBoard·ExecutiveBriefing·
// DepartmentWorkspacePanel)가 다시 읽지 못했다. sessionRole 의 CustomEvent 선례를 따른다.
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[N] 같은 탭 저장 알림');
{
  let n = 0;
  const un = LEDGER.subscribeActivity(() => { n += 1; });
  LEDGER.logActivity({ teamId: 'hq', type: 'message_sent', status: 'info', title: '지시', actor: { kind: 'human', teamId: 'hq', label: 'HQ' } });
  ok('N-1. 활동 원장: 같은 탭 저장 후 구독 callback 1회', n === 1, `${n}회`);
  fireStorage('godo_activity_ledger_v0');
  ok('N-2. 활동 원장: 다른 탭 storage 이벤트도 계속 처리', n === 2, `${n}회`);
  un();
  LEDGER.logActivity({ teamId: 'hq', type: 'note', status: 'info', title: '해제 후', actor: { kind: 'human', teamId: 'hq', label: 'HQ' } });
  fireStorage('godo_activity_ledger_v0');
  ok('N-3. 활동 원장: unsubscribe 후 callback 미호출', n === 2, `${n}회`);
}
{
  let n = 0;
  const un = MSG.subscribeTeamMessages(() => { n += 1; });
  MSG.postTeamMessage({ from: { kind: 'human', teamId: 'hq', label: 'HQ' }, toTeam: 'product', kind: 'info', title: '알림 확인', body: '' });
  ok('N-10. 팀 메시지: 같은 탭 저장 후 구독 callback 1회', n === 1, `${n}회`);
  fireStorage('godo_team_messages_v0');
  ok('N-11. 팀 메시지: 다른 탭 storage 이벤트도 계속 처리', n === 2, `${n}회`);
  un();
  MSG.postTeamMessage({ from: { kind: 'human', teamId: 'hq', label: 'HQ' }, toTeam: 'cs', kind: 'info', title: '해제 후', body: '' });
  fireStorage('godo_team_messages_v0');
  ok('N-12. 팀 메시지: unsubscribe 후 callback 미호출', n === 2, `${n}회`);
}
ok('N-20. 저장 실패 시 성공 알림을 보내지 않는다(성공 경로에서만 통지)',
  /catch \{[\s\S]{0,120}?return false/.test(codeLines('src/services/activityLedger.ts'))
  && /catch \{[\s\S]{0,120}?return false/.test(codeLines('src/services/teamMessageCenter.ts')));
ok('N-21. 화면은 repository facade 경계를 계속 통과한다(우회 없음)',
  /subscribeActivity/.test(src('src/services/repositories/activityLedgerRepository.ts'))
  && /subscribeTeamMessages/.test(src('src/services/repositories/teamMessageRepository.ts')));

// ══════════════════════════════════════════════════════════════════════════
// [L] 업무 ↔ 원본 메시지 상태 연결 (증상 2 — 완료했는데 메시지가 open 으로 남음)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[L] 연결된 원본 메시지 상태 동기화');
let seq = 0;
const ids = { newId: () => `t-${++seq}`, nowIso: () => `2026-07-28T10:0${seq % 10}:00.000Z` };
const HQ = { kind: 'human', teamId: 'hq', label: 'HQ', userId: 'u-hq', identitySource: 'demo_role' };
const LEAD = { kind: 'human', teamId: 'product', label: '상품팀장', userId: 'u-product', identitySource: 'demo_role' };
const statusOfMsg = (id) => MSG.loadTeamMessages().find((m) => m.id === id)?.status;

{
  const posted = MSG.postTeamMessage({ from: HQ, toTeam: 'product', kind: 'info', title: '재고 정리', body: '' });
  const task = LA.createDirectiveTask({ title: '재고 정리', targetTeamId: 'product', instructedBy: HQ, inputRefs: [LA.messageRef(posted.id)] }, ids);
  ok('L-1. 지시 직후 원본 메시지는 open', statusOfMsg(posted.id) === 'open', statusOfMsg(posted.id));

  const r1 = LA.assignExecutor(task.ref.taskId, { kind: 'human', executorId: LEAD.userId, actor: LEAD }, ids);
  SYNC.syncLinkedMessageForTask(r1.task, LEAD);
  ok('L-2. 수행자 지정 성공 → 연결 메시지 in_progress', statusOfMsg(posted.id) === 'in_progress', statusOfMsg(posted.id));

  LA.submitResult(task.ref.taskId, { resultSummary: '4건 정리', actor: LEAD }, ids);
  LA.applyDecision(task.ref.taskId, { kind: 'approve', actor: LEAD }, ids);
  const mid = statusOfMsg(posted.id);
  SYNC.syncLinkedMessageForTask(LSTORE.loadLifecycleTasks().find((t) => t.ref.taskId === task.ref.taskId), LEAD);
  ok('L-3. 팀장 1차 확인만으로는 완료로 닫지 않는다(HQ 단계 남음)',
    statusOfMsg(posted.id) !== 'done', `${mid} → ${statusOfMsg(posted.id)}`);

  LA.applyDecision(task.ref.taskId, { kind: 'approve', actor: HQ }, ids);
  SYNC.syncLinkedMessageForTask(LSTORE.loadLifecycleTasks().find((t) => t.ref.taskId === task.ref.taskId), HQ);
  ok('L-4. HQ 최종 확인 완료 → 연결 메시지 done', statusOfMsg(posted.id) === 'done', statusOfMsg(posted.id));
  ok('L-5. 완료 뒤 ExecutiveBriefing 대상(open)에서 제외',
    !MSG.loadTeamMessages().filter((m) => m.status === 'open').some((m) => m.id === posted.id));
  ok('L-6. 업무·메시지·결정 이력은 삭제되지 않는다',
    !!LSTORE.loadLifecycleTasks().find((t) => t.ref.taskId === task.ref.taskId)
    && !!MSG.loadTeamMessages().find((m) => m.id === posted.id)
    && (LSTORE.loadLifecycleTasks().find((t) => t.ref.taskId === task.ref.taskId)?.decisions ?? []).length === 2);
  const before = MSG.loadTeamMessages().find((m) => m.id === posted.id).events.length;
  SYNC.syncLinkedMessageForTask(LSTORE.loadLifecycleTasks().find((t) => t.ref.taskId === task.ref.taskId), HQ);
  ok('L-7. 이미 같은 상태면 중복 이력을 만들지 않는다',
    MSG.loadTeamMessages().find((m) => m.id === posted.id).events.length === before);
}
{
  // 수정 요청 — 후속 업무가 살아 있으므로 원본 메시지를 닫지 않는다.
  const posted = MSG.postTeamMessage({ from: HQ, toTeam: 'product', kind: 'info', title: '수정 요청 흐름', body: '' });
  const task = LA.createDirectiveTask({ title: '수정 요청 흐름', targetTeamId: 'product', instructedBy: HQ, inputRefs: [LA.messageRef(posted.id)] }, ids);
  LA.assignExecutor(task.ref.taskId, { kind: 'human', executorId: LEAD.userId, actor: LEAD }, ids);
  LA.submitResult(task.ref.taskId, { resultSummary: '초안', actor: LEAD }, ids);
  LA.applyDecision(task.ref.taskId, { kind: 'request_revision', actor: LEAD, reason: '기준 미달' }, ids);
  const orig = LSTORE.loadLifecycleTasks().find((t) => t.ref.taskId === task.ref.taskId);
  SYNC.syncLinkedMessageForTask(orig, LEAD);
  ok('L-10. 수정 요청으로 후속 업무가 생기면 원본 메시지를 done 으로 닫지 않는다',
    statusOfMsg(posted.id) !== 'done', `${statusOfMsg(posted.id)} (원본 상태 ${orig.status})`);
  ok('L-11. 같은 메시지를 참조하는 비종료 업무가 남아 있음을 실제로 확인',
    LSTORE.loadLifecycleTasks().some((t) => (t.inputRefs ?? []).includes(LA.messageRef(posted.id)) && !['completed', 'superseded', 'not_adopted', 'not_selected', 'stopped', 'returned', 'failed'].includes(t.status)));
}
{
  // 반송 — 다시 사람이 처리해야 하므로 조용히 완료로 숨기지 않는다.
  const posted = MSG.postTeamMessage({ from: LEAD, toTeam: 'cs', kind: 'support', title: '반송 흐름', body: '' });
  const collab = LA.createCollaborationRequest(
    { title: '반송 흐름', requestingTeamId: 'product', targetTeamId: 'cs', instructedBy: LEAD, inputRefs: [LA.messageRef(posted.id)] }, ids);
  const CS = { kind: 'human', teamId: 'cs', label: 'CS팀장', userId: 'u-cs', identitySource: 'demo_role' };
  LA.applyDecision(collab.child.ref.taskId, { kind: 'return', actor: CS, reason: '수행 불가' }, ids);
  SYNC.syncLinkedMessageForTask(LSTORE.loadLifecycleTasks().find((t) => t.ref.taskId === collab.child.ref.taskId), CS);
  ok('L-20. 반송은 원본 메시지를 완료로 숨기지 않는다', statusOfMsg(posted.id) !== 'done', statusOfMsg(posted.id));
}
{
  // 연결 참조가 없는 업무는 다른 메시지를 건드리지 않는다.
  const snapshot = JSON.stringify(MSG.loadTeamMessages().map((m) => [m.id, m.status]));
  const solo = LA.createDirectiveTask({ title: '참조 없음', targetTeamId: 'product', instructedBy: HQ }, ids);
  LA.assignExecutor(solo.ref.taskId, { kind: 'human', executorId: LEAD.userId, actor: LEAD }, ids);
  SYNC.syncLinkedMessageForTask(LSTORE.loadLifecycleTasks().find((t) => t.ref.taskId === solo.ref.taskId), LEAD);
  ok('L-30. inputRefs 가 없는 업무는 어떤 메시지도 바꾸지 않는다',
    JSON.stringify(MSG.loadTeamMessages().map((m) => [m.id, m.status])) === snapshot);
  ok('L-31. 존재하지 않는 메시지 참조는 조용히 무시한다',
    SYNC.syncLinkedMessageForTask({ ...solo, inputRefs: ['teammsg:없는id'], status: 'completed' }, HQ) === null);
}
ok('L-40. 상태 판정은 전용 계약이 하고 화면이 추측하지 않는다',
  /export function resolveLinkedMessageStatus/.test(src('src/services/linkedMessageSync.ts'))
  && !/setStatus\(|resolveTeamMessage\(/.test(codeLines('src/components/ExecutiveBriefing.tsx')));
ok('L-41. App 이 배정·결정 성공 경로에서 동기화를 호출한다',
  (codeLines('src/App.tsx').match(/syncLinkedMessageForTask\(/g) || []).length >= 2);

// ══════════════════════════════════════════════════════════════════════════
// [S] HQ 지시 전송 결과 (증상 7)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[S] HQ 지시 전송 결과 표시');
{
  const comp = codeLines('src/components/HqDirectiveComposer.tsx');
  ok('S-1. onSend 가 성공·실패 결과를 돌려주는 계약',
    /export interface DirectiveSendResult \{ ok: boolean; message: string \}/.test(comp)
    && /onSend: \([^)]*\) => DirectiveSendResult;/.test(comp));
  ok('S-2. **성공했을 때만** 입력·첨부를 비운다',
    comp.includes("if (result.ok) { setText(''); setAttachments([]); }")
    // 비우는 곳이 그 가드 안 한 곳뿐이다(결과를 보지 않고 지우는 경로가 없다).
    && (comp.match(/setText\(''\)/g) || []).length === 1
    && (comp.match(/setAttachments\(\[\]\)/g) || []).length === 1);
  ok('S-3. 성공 안내를 입력창 가까이 표시', /office-directive-note/.test(comp) && /notice\.message/.test(comp));
  ok('S-4. 실패도 같은 자리에서 이유를 보여준다(입력은 보존)',
    /notice\.ok \? 'ok' : 'fail'/.test(comp) && /notice\.message/.test(comp));
  ok('S-4a. App 이 실패 사유를 결과 message 로 돌려준다',
    /return \{ ok: false, message: reason \}/.test(codeLines('src/App.tsx')));
  const app = codeLines('src/App.tsx');
  ok('S-5. App.handleSendDirective 가 결과를 반환한다', /handleSendDirective[\s\S]{0,400}?return \{ ok: (true|false)/.test(app));
  ok('S-6. 중간 배선(MainLayout·OfficeView)이 결과 타입을 그대로 전달',
    /onSendDirective/.test(codeLines('src/components/MainLayout.tsx')) && /onSendDirective/.test(codeLines('src/components/OfficeView.tsx')));
}

// ══════════════════════════════════════════════════════════════════════════
// [E] 보이는 승인 진입점 단일화 (증상 3)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[E] 승인 진입점');
{
  const app = codeLines('src/App.tsx');
  const board = codeLines('src/components/TeamOperationsBoard.tsx');
  const exb = codeLines('src/components/ExecutiveBriefing.tsx');
  ok('E-1. 우측 하단 고정 플로팅 버튼 제거', !/position: 'fixed', right: 18, bottom: 18/.test(app) && !/내 확인 대기 \{myPendingApprovals\.length\}건/.test(app));
  ok('E-2. 승인 정본은 여전히 myPendingApprovals', /items=\{myPendingApprovals\}/.test(app));
  ok('E-3. 왼쪽 요약 승인 대기 영역이 눌린다', /onOpenApprovals/.test(board) && /summary-stat[^>]*onClick|onClick=\{[^}]*onOpenApprovals/.test(board));
  ok('E-4. 왼쪽 요약 숫자가 실제 승인 대기열 건수와 같은 값을 쓴다', /approvalItems\.length/.test(board) && !/lastRunResults\.filter\(r => r\.approvalRequired\)\.length \+ approvalItems\.length/.test(board));
  ok('E-5. 오른쪽 브리핑의 실제 승인 항목이 눌린다', /onOpenApprovals|onSelectApproval/.test(exb));
  ok('E-6. 일반 팀 메시지를 승인 항목처럼 보이지 않게 구분', /처리 필요|kind === 'request'/.test(exb));
  ok('E-7. App 이 두 진입점에 같은 핸들러를 내려보낸다', /onOpenApprovals=\{/.test(app));
}

// ══════════════════════════════════════════════════════════════════════════
// [A] 승인 화면 단순화 (증상 4·5) + 사실 아닌 문구 제거
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[A] 승인 화면');
{
  const d = src('src/components/ApprovalDetailModal.tsx');
  const dc = codeLines('src/components/ApprovalDetailModal.tsx');
  ok('A-1. 사실이 아닌 "고도몰 파트너 물류 API 샌드박스 임포트 커밋" 문구 제거', !/파트너 물류 API 샌드박스/.test(d));
  ok('A-2. 사실인 안내는 남는다(내부 결정 기록 · 외부 WRITE 미연결)', /고도몰 외부.*연동되지 않았|실제 고도몰에 자동 등록되지 않습니다/.test(d));
  ok('A-3. 주 버튼 확인 완료 · 보조 버튼 승인하지 않음', /확인 완료/.test(d) && /승인하지 않음/.test(d));
  ok('A-4. 승인하지 않음은 한 줄 사유 입력을 연다', /showRejectInput|rejectReason/.test(dc));
  ok('A-5. 빈 사유 제출 금지', /const reason = rejectReason\.trim\(\);\s*\n?\s*if \(!reason\) return;/.test(dc));
  ok('A-6. 사유를 not_adopted 결정으로 전달', /onReject\(item\.id, reason\)/.test(dc));
  ok('A-7. 수정 요청·작업 중단·협업 반송을 삭제하지 않고 접힌 "다른 처리" 안에 둔다',
    /다른 처리/.test(d) && /onRequestRevision/.test(dc) && /onCancel/.test(dc) && /onReturn/.test(dc));
  ok('A-8. 기술 메타데이터는 접힌 상세 정보 안', /showTechDetails/.test(dc));
  const app = codeLines('src/App.tsx');
  ok('A-9. App 의 reject 배선이 사유를 받는다', /handleReject = \(approvalId: string, reason/.test(app));
}

// ══════════════════════════════════════════════════════════════════════════
// [T] 다크·라이트 가독성 (증상 5) · 계정 관리 위치 (증상 6)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[T] 가독성 · 계정 관리 위치');
{
  const d = src('src/components/ApprovalDetailModal.tsx');
  ok('T-1. 승인 화면 본문 색에 강조 초록(#2df5a2)을 직접 쓰지 않는다',
    !/color: 'var\(--accent-primary, #2df5a2\)'/.test(d));
  ok('T-2. 본문·라벨·결과 요약은 테마 변수를 쓴다', /var\(--text-primary/.test(d) && /var\(--text-secondary/.test(d));
  // 증상 5의 실제 원인: 앱 테마는 [data-theme] 속성인데 일부 CSS 가 OS 설정을 따랐다.
  //   OS 라이트 + 앱 다크 조합에서 라이트용 짙은 초록 본문이 어두운 배경 위에 찍힌다.
  // 주석은 제외하고 **실제 코드 줄**만 본다(주석에 남은 사유 설명이 오탐이 되지 않게).
  ok('T-3. 승인 화면 안내 상자에 고정 연파랑(#93c5fd)을 쓰지 않는다',
    !/#93c5fd/.test(codeLines('src/components/ApprovalDetailModal.tsx')));
  const cssFiles = readdirSync('src/components').filter((f) => f.endsWith('.css'));
  const osThemed = cssFiles.filter((f) => /prefers-color-scheme/.test(src(`src/components/${f}`)));
  ok('T-4. 화면 CSS 가 OS 설정(prefers-color-scheme)으로 테마 색을 정하지 않는다',
    osThemed.length === 0, osThemed.join(', ') || '0건');
  const cs = src('src/components/CsTeamDashboard.css');
  ok('T-5. 라이트 전용 색은 data-theme=light 로 범위를 한정한다',
    /\[data-theme='light'\] \.cs-pop-sec-title/.test(cs) && /\[data-theme='light'\] \.cs-badge\.warn/.test(cs));
  const app = codeLines('src/App.tsx');
  const layout = codeLines('src/components/MainLayout.tsx');
  ok('T-10. 왼쪽 아래 fixed 계정 관리 버튼 제거', !/position: 'fixed', bottom: 16, left: 16/.test(app));
  ok('T-11. 계정 관리는 상단 헤더(신원·로그아웃 근처)에 배치', /onOpenAccountAdmin/.test(layout) && /auth-account-btn|계정 관리/.test(layout));
  ok('T-12. 권한 판정은 그대로(인증 모드 + hq/team_lead)',
    /identity\.mode === 'authenticated' && \(identity\.role === 'hq' \|\| identity\.role === 'team_lead'\)/.test(app));
  ok('T-13. 팀원에게는 보이지 않는다(같은 판정 재사용)', /canManageAccounts/.test(app) && /canManageAccounts/.test(layout));
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
