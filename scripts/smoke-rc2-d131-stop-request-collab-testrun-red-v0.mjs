#!/usr/bin/env node
/*
 * scripts/smoke-rc2-d131-stop-request-collab-testrun-red-v0.mjs
 * RC-2 D-1.3.1 — 중단 요청 · 협업 한 흐름 · 시험 운영 표시 (RED 진단)
 *
 * 확정 정책:
 *   총괄은 팀에 업무를 지시할 수 있지만 그 팀의 실무 상태를 직접 바꾸지 않는다.
 *   그만두고 싶으면 담당 팀장에게 **중단 요청**을 보내고, 실제 중단은 담당 팀장이 한다.
 *   일반 채팅의 "그거 중지해"는 업무를 자동으로 찾지도, 상태를 바꾸지도 않는다.
 *   중단은 삭제가 아니다 — 결과물·수행자 이력·요청·처리 사유가 모두 남는다.
 *   협업은 요청팀 '추적용' 카드와 수행팀 '실행용' 카드로 기록하되 화면에는 한 흐름으로 보인다.
 *   지금의 운영 시작 버튼은 검증 시나리오로 도는 **시험 운영**이다.
 *
 * 새 결재함·새 상태 머신·새 대시보드를 만들지 않는다. 기존 업무 카드와 기존 채팅을 쓴다.
 *
 *   [BASE] = 진단 전제(현재 코드에서도 참)
 *   [RED ] = 목표. 지금은 미충족(unmet)이 정상이다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'rc2d131-'));

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  addEventListener() {}, removeEventListener() {}
};

let A, L, S;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'taskLifecycleAppAdapter.ts'),
    '--ignoreConfig', '--rootDir', path.join(REPO, 'src'), '--outDir', tmp,
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--skipLibCheck'], { stdio: 'pipe' });
  for (const sub of ['services', 'types', 'data']) {
    const dir = path.join(tmp, sub);
    let files = [];
    try { files = readdirSync(dir).filter((x) => x.endsWith('.js')); } catch { continue; }
    for (const f of files) {
      const p = path.join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`)));
    }
  }
  const imp = async (n) => import(pathToFileURL(path.join(tmp, 'services', n)).href);
  A = await imp('taskLifecycleAppAdapter.js');
  L = await imp('taskLifecycleContract.js');
  S = await imp('taskLifecycleStore.js');
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const src = (p) => { try { return readFileSync(path.join(REPO, ...p.split('/')), 'utf8'); } catch { return ''; } };
const appSource = src('src/App.tsx');
const agentTaskRunner = src('src/services/agentTaskRunner.ts');
const deptPanel = src('src/components/DepartmentWorkspacePanel.tsx');
const teamMsgPanel = src('src/components/TeamMessagePanel.tsx');
const teamTaskPanel = src('src/components/TeamTaskPanel.tsx');
const chatConsole = src('src/components/ChatConsole.tsx');
const aiBriefing = src('src/components/AiBriefing.tsx');
const controlChat = src('src/services/controlChatService.ts');

const walk = (dir, out = []) => {
  for (const e of readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
};
const allSources = walk('src').map((f) => ({ f, s: src(f) }));

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== RC-2 D-1.3.1 — 중단 요청 · 협업 한 흐름 · 시험 운영 표시 (RED 진단) ===');

const AT = '2026-07-23T00:00:00.000Z';
const AT2 = '2026-07-23T01:00:00.000Z';
let _n = 0;
const ids = { newId: () => `id-${++_n}`, nowIso: AT };
const reset = () => { store.clear(); _n = 0; };
const HQ = A.actorForRole('hq');
const LEAD_PRODUCT = A.actorForRole('product');
const LEAD_CS = A.actorForRole('cs');
const LEAD_DESIGN = A.actorForRole('design');
const hasFn = (n) => typeof A[n] === 'function';
const noFn = (n) => `${n}() 없음`;
const readTask = (id) => S.loadLifecycleTasks().find((x) => x.ref.taskId === id);

/** HQ 가 상품팀에 지시한 open 업무 1건. */
const directive = (team = 'product') =>
  A.createDirectiveTask({ title: `${team} 업무`, targetTeamId: team, instructedBy: HQ }, ids);

/** 수행자까지 정해져 진행 중이고 결과물이 있는 업무. */
const inProgressWithWork = () => {
  const t = directive();
  A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
  A.takeOverByLead(t.ref.taskId, { actor: LEAD_PRODUCT, reason: '팀장 인수' }, { nowIso: AT });
  return t;
};

// ── [BASE] 진단 전제 ─────────────────────────────────────────────────────────
base('B1. D-1.3 전이 함수는 이미 동작한다',
  ['createDirectiveTask', 'assignExecutor', 'takeOverByLead', 'submitResult', 'createCollaborationRequest', 'availableDecisions'].every(hasFn),
  '6개 함수 존재');

base('B2. 저장·결정 기반이 살아 있다',
  typeof A.applyDecision === 'function' && typeof S.loadLifecycleTasks === 'function',
  'applyDecision/load 존재');

// ════════════════════════════════════════════════════════════════════════════
// GAP A — 중단 요청과 실제 중단 분리 (S1~S11)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 중단 요청 ≠ 실제 중단 ---');

red('S1. HQ 중단 요청 뒤에도 원래 업무 상태가 그대로다',
  (() => { if (!hasFn('requestTaskStop')) return false; reset();
    const t = inProgressWithWork();
    const before = readTask(t.ref.taskId).status;
    const r = A.requestTaskStop(t.ref.taskId, { reason: '우선순위가 바뀌었습니다', actor: HQ }, { nowIso: AT });
    const after = readTask(t.ref.taskId);
    return r.ok === true && before === 'in_progress' && after.status === 'in_progress';
  })(), noFn('requestTaskStop'), '요청해도 in_progress 유지');

red('S2. 중단 요청 뒤 수행자·결과물·이력이 그대로다',
  (() => { if (!hasFn('requestTaskStop')) return false; reset();
    const t = directive();
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.submitResult(t.ref.taskId, { resultSummary: '중간 보고', artifactRefs: ['art-1'], actor: LEAD_PRODUCT }, { nowIso: AT });
    const before = JSON.parse(JSON.stringify(readTask(t.ref.taskId)));
    A.requestTaskStop(t.ref.taskId, { reason: '방향 변경', actor: HQ }, { nowIso: AT });
    const after = readTask(t.ref.taskId);
    return after.executorId === before.executorId
      && after.resultSummary === before.resultSummary
      && JSON.stringify(after.artifactRefs) === JSON.stringify(before.artifactRefs)
      && JSON.stringify(after.executorHistory) === JSON.stringify(before.executorHistory)
      && after.decisions.length === before.decisions.length;
  })(), noFn('requestTaskStop'), '수행자·결과물·이력 불변');

red('S3. 중단 요청은 요청자·사유·시각이 append 된다(덮어쓰기 없음)',
  (() => { if (!hasFn('requestTaskStop')) return false; reset();
    const t = inProgressWithWork();
    A.requestTaskStop(t.ref.taskId, { reason: '첫 번째 사유', actor: HQ }, { nowIso: AT });
    A.requestTaskStop(t.ref.taskId, { reason: '두 번째 사유', actor: HQ }, { nowIso: AT2 });
    const reqs = readTask(t.ref.taskId).stopRequests ?? [];
    return reqs.length === 2
      && reqs[0].reason === '첫 번째 사유' && reqs[1].reason === '두 번째 사유'
      && reqs[0].requestedAt === AT && reqs[1].requestedAt === AT2
      && reqs[0].requestedBy.teamId === 'hq';
  })(), noFn('requestTaskStop'), '2건 누적 · 요청자·시각 보존');

red('S4. 사유 없는 중단 요청은 거부된다',
  (() => { if (!hasFn('requestTaskStop')) return false; reset();
    const t = inProgressWithWork();
    const empty = A.requestTaskStop(t.ref.taskId, { reason: '', actor: HQ }, { nowIso: AT });
    const blank = A.requestTaskStop(t.ref.taskId, { reason: '   ', actor: HQ }, { nowIso: AT });
    return empty.ok === false && blank.ok === false && (readTask(t.ref.taskId).stopRequests ?? []).length === 0;
  })(), noFn('requestTaskStop'), '빈 사유·공백 거부');

red('S5. 무관한 팀은 중단 요청을 만들 수 없다',
  (() => { if (!hasFn('requestTaskStop')) return false; reset();
    const t = inProgressWithWork();   // HQ 가 상품팀에 지시
    const byOther = A.requestTaskStop(t.ref.taskId, { reason: '남의 일 중단', actor: LEAD_CS }, { nowIso: AT });
    return byOther.ok === false && (readTask(t.ref.taskId).stopRequests ?? []).length === 0;
  })(), noFn('requestTaskStop'), '요청자·담당팀 외 차단');

red('S6. HQ 는 담당 팀 업무를 직접 stopped 로 바꿀 수 없다',
  (() => { reset();
    const t = inProgressWithWork();
    const r = A.applyDecision(t.ref.taskId, { kind: 'stop', actor: HQ, reason: '그만' }, { nowIso: AT });
    const after = readTask(t.ref.taskId);
    return r.ok === false && after.status === 'in_progress';
  })(), 'HQ 가 요청자 자격으로 즉시 stopped 로 전이시킴', 'HQ 직접 중단 차단');

red('S7. 담당 팀장은 정식 요청이 없어도 사유와 함께 중단할 수 있다',
  (() => { reset();
    const t = inProgressWithWork();   // 중단 요청 없음(채팅으로 들었다고 가정)
    const r = A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '총괄 채팅 지시로 중단' }, { nowIso: AT });
    const after = readTask(t.ref.taskId);
    return r.ok === true && after.status === 'stopped' && JSON.stringify(after).includes('총괄 채팅 지시로 중단');
  })(), '팀장 중단이 거부되거나 사유가 남지 않음', '요청 없이도 팀장 중단 가능');

red('S8. 중단 사유는 필수다(팀장 처리에도)',
  (() => { reset();
    const t = inProgressWithWork();
    const noReason = A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT }, { nowIso: AT });
    const blank = A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '  ' }, { nowIso: AT });
    return noReason.ok === false && blank.ok === false && readTask(t.ref.taskId).status === 'in_progress';
  })(), '사유 없이도 중단이 통과함', '사유 없으면 거부');

red('S9. 팀장이 처리해야 그때 stopped 가 되고, HQ 요청과 팀장 결정이 모두 남는다',
  (() => { if (!hasFn('requestTaskStop')) return false; reset();
    const t = inProgressWithWork();
    A.requestTaskStop(t.ref.taskId, { reason: '분기 계획 변경', actor: HQ }, { nowIso: AT });
    const midway = readTask(t.ref.taskId).status;
    const r = A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '총괄 요청 확인 후 중단' }, { nowIso: AT2 });
    const after = readTask(t.ref.taskId);
    const raw = JSON.stringify(after);
    return midway === 'in_progress' && r.ok === true && after.status === 'stopped'
      && raw.includes('분기 계획 변경')           // HQ 요청 사유
      && raw.includes('총괄 요청 확인 후 중단')   // 팀장 처리 사유
      && (after.stopRequests ?? []).length === 1
      && after.decisions.some((d) => d.kind === 'stop' && d.actorTeamId === 'product');
  })(), noFn('requestTaskStop'), '요청→팀장 처리 순서 · 양쪽 기록 보존');

red('S10. 중단은 삭제가 아니다 — 결과물·수행자 이력이 남는다',
  (() => { reset();
    const t = directive();
    A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.takeOverByLead(t.ref.taskId, { actor: LEAD_PRODUCT, reason: '인수' }, { nowIso: AT });
    A.submitResult(t.ref.taskId, { resultSummary: '중간 산출물', artifactRefs: ['art-keep'], actor: LEAD_PRODUCT }, { nowIso: AT });
    A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '중단' }, { nowIso: AT2 });
    const after = readTask(t.ref.taskId);
    return after.status === 'stopped'
      && (after.artifactRefs ?? []).includes('art-keep')
      && after.resultSummary === '중간 산출물'
      && after.executorHistory.length >= 2
      && after.executorHistory[0].id === 'inventory_monitor';
  })(), '중단 시 결과물·이력이 사라짐', '결과물·이력 전부 보존');

red('S11. 종료 상태는 재중단·재요청·재배정·재제출 모두 불가',
  (() => { reset();
    const t = inProgressWithWork();
    A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '중단' }, { nowIso: AT });
    const reStop = A.applyDecision(t.ref.taskId, { kind: 'stop', actor: LEAD_PRODUCT, reason: '또 중단' }, { nowIso: AT2 });
    const reReq = hasFn('requestTaskStop')
      ? A.requestTaskStop(t.ref.taskId, { reason: '또 요청', actor: HQ }, { nowIso: AT2 })
      : { ok: false };
    const reAssign = A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT2 });
    const reSubmit = A.submitResult(t.ref.taskId, { resultSummary: 'x', actor: LEAD_PRODUCT }, { nowIso: AT2 });
    const after = readTask(t.ref.taskId);
    return hasFn('requestTaskStop')
      && reStop.ok === false && reReq.ok === false && reAssign.ok === false && reSubmit.ok === false
      && after.status === 'stopped';
  })(), noFn('requestTaskStop'), '종료 상태 4종 조작 모두 차단');

// ════════════════════════════════════════════════════════════════════════════
// 일반 채팅은 자동으로 아무것도 하지 않는다 (S12~S13)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 일반 채팅은 자동 상태변경 없음 ---');

red('S12. 채팅 "그거 중지해" 가 업무를 자동 검색·자동 변경하지 않는다',
  (() => {
    // 채팅 경로 어디에도 업무 자동 중단/자동 매칭이 없어야 한다.
    const autoStop = allSources.some(({ f, s }) =>
      /Chat|chat/.test(f) && /applyDecision\([^)]*'stop'|kind: 'stop'|requestTaskStop\(/.test(s));
    const autoMatch = /중지|중단/.test(controlChat) && /findTask|tasks\.find|matchTask/.test(controlChat);
    return !autoStop && !autoMatch;
  })(), '채팅 경로에 업무 자동 중단·자동 매칭 코드가 있음', '채팅은 메시지로만 남음');

red('S13. 별도 "거부·협의 필요" 상태나 버튼을 만들지 않았다',
  (() => {
    const statusUnion = /export type TaskLifecycleStatus[\s\S]{0,400}?;/.exec(src('src/services/taskLifecycleContract.ts'));
    const noNewStatus = !statusUnion || !/negotiat|rejected_by_lead|협의/.test(statusUnion[0]);
    const noNewButton = !/협의 필요/.test(teamTaskPanel + deptPanel);
    return noNewStatus && noNewButton;
  })(), '새 상태·버튼이 추가됨', '새 상태·버튼 없음');

// ════════════════════════════════════════════════════════════════════════════
// GAP B/C — 협업: 추적 부모 · 실행 자식 · 한 흐름 (S14~S20)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 협업: 추적 부모 / 실행 자식 / 한 흐름 ---');

const collab = () => A.createCollaborationRequest(
  { title: '상세 문구 요청', requestingTeamId: 'cs', targetTeamId: 'design', instructedBy: LEAD_CS }, ids);

red('S14. 팀장 간 명시적 지원 요청만 부모·자식 협업을 만든다',
  (() => { reset();
    const pair = collab();
    const all = S.loadLifecycleTasks();
    return all.length === 2
      && pair.child.ref.parentTaskId === pair.parent.ref.taskId
      && pair.child.ref.correlationId === pair.parent.ref.correlationId
      && pair.parent.ownerTeamId === 'cs' && pair.child.ownerTeamId === 'design';
  })(), '부모·자식 생성 규칙 미충족', '부모(요청팀)+자식(수행팀) 2건 · 같은 흐름');

red('S15. 요청팀 추적 부모는 배정·인수·제출 대상이 아니다(서비스에서 차단)',
  (() => { reset();
    const pair = collab();
    const pid = pair.parent.ref.taskId;
    const a = A.assignExecutor(pid, { kind: 'human', actor: LEAD_CS }, { nowIso: AT });
    const tk = A.takeOverByLead(pid, { actor: LEAD_CS }, { nowIso: AT });
    const sb = A.submitResult(pid, { resultSummary: '내가 함', actor: LEAD_CS }, { nowIso: AT });
    const after = readTask(pid);
    return a.ok === false && tk.ok === false && sb.ok === false && after.status === 'open';
  })(), '요청팀 부모가 일반 open 업무라 배정·제출이 그대로 통과함(중복 실행 가능)',
  '부모 실행 3종 차단');

red('S16. 수행팀에는 실제로 처리할 자식 카드 한 장만 보인다',
  (() => { if (!hasFn('taskFlowsFor')) return false; reset();
    collab();
    const flows = A.taskFlowsFor(LEAD_DESIGN);
    return flows.length === 1 && flows[0].actionable === true
      && flows[0].task.ownerTeamId === 'design';
  })(), noFn('taskFlowsFor'), '수행팀 1장 · 실행 가능');

red('S17. 요청팀에는 중복 두 장이 아니라 추적 흐름 한 장이 보인다',
  (() => { if (!hasFn('taskFlowsFor')) return false; reset();
    collab();
    const flows = A.taskFlowsFor(LEAD_CS);
    return flows.length === 1 && flows[0].actionable === false
      && !!flows[0].tracking;
  })(), noFn('taskFlowsFor'), '요청팀 1장 · 추적 전용');

red('S18. HQ 도 같은 협업을 두 장이 아니라 한 흐름으로 본다',
  (() => { if (!hasFn('taskFlowsFor')) return false; reset();
    collab();
    const flows = A.taskFlowsFor(HQ);
    return flows.length === 1 && flows[0].task.ref.correlationId === S.loadLifecycleTasks()[0].ref.correlationId;
  })(), noFn('taskFlowsFor'), 'HQ 1흐름');

red('S19. 자식이 정상 완료되면 부모도 완료된다(영원히 진행 중으로 남지 않음)',
  (() => { reset();
    const pair = collab();
    const cid = pair.child.ref.taskId, pid = pair.parent.ref.taskId;
    A.assignExecutor(cid, { kind: 'human', actor: LEAD_DESIGN }, { nowIso: AT });
    A.submitResult(cid, { resultSummary: '문구 3안 작성', actor: LEAD_DESIGN }, { nowIso: AT });
    A.applyDecision(cid, { kind: 'approve', actor: LEAD_DESIGN }, { nowIso: AT });   // 수행 팀장 확인
    A.applyDecision(cid, { kind: 'approve', actor: LEAD_CS }, { nowIso: AT2 });      // 요청팀 확인 → 완료
    const child = readTask(cid), parent = readTask(pid);
    return child.status === 'completed' && parent.status === 'completed'
      && parent.ref.correlationId === child.ref.correlationId;
  })(), '자식이 완료돼도 부모가 in_progress 에 남음(정상 완료가 반영되지 않음)',
  '자식 완료 → 부모 완료');

red('S20. 반송·중단 부모 동기화는 그대로 동작한다(무회귀)',
  (() => { reset();
    const p1 = collab();
    A.applyDecision(p1.child.ref.taskId, { kind: 'return', actor: LEAD_DESIGN, reason: '규격 미정' }, { nowIso: AT });
    const parentReturned = readTask(p1.parent.ref.taskId);
    reset();
    const p2 = collab();
    A.assignExecutor(p2.child.ref.taskId, { kind: 'human', actor: LEAD_DESIGN }, { nowIso: AT });
    A.applyDecision(p2.child.ref.taskId, { kind: 'stop', actor: LEAD_DESIGN, reason: '자료 없음' }, { nowIso: AT });
    const parentStopped = readTask(p2.parent.ref.taskId);
    return parentReturned.status === 'returned' && JSON.stringify(parentReturned).includes('규격 미정')
      && parentStopped.status === 'stopped' && JSON.stringify(parentStopped).includes('자료 없음');
  })(), '반송·중단 동기화 실패', '반송·중단 모두 부모 반영');

// ════════════════════════════════════════════════════════════════════════════
// GAP D — 메시지 발신 신원 (S21~S23)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 메시지 발신 신원 ---');

red('S21. 보고 있는 팀과 실제 발신자가 분리되어 전달된다',
  (() => {
    // TeamMessagePanel 이 화면 선택값(teamId) 하나로 발신자를 만들면 사칭이 된다.
    const spoofs = /from: \{ kind: 'human', teamId, label: '운영자' \}/.test(teamMsgPanel);
    const separated = /viewedTeamId/.test(teamMsgPanel) && /actor/.test(teamMsgPanel);
    return !spoofs && separated;
  })(), "TeamMessagePanel 이 선택한 팀(teamId)으로 발신자를 만들어 HQ 가 '선택한 팀 운영자'로 기록됨",
  'viewedTeamId(보는 팀)와 actor(발신자) 분리');

red('S22. HQ 가 부서 화면에서 보내도 발신자는 총괄이다',
  (() => {
    // 부서 패널이 실제 세션 역할로 actor 를 만들어 넘겨야 한다.
    const passesActor = /actor=\{|actor:\s*\{ kind: 'human', teamId: role/.test(deptPanel)
      || /actorForRole\(role\)/.test(deptPanel);
    const resolvesBySelected = /kind: 'human' as const, teamId: selectedTeamId/.test(deptPanel);
    return passesActor && !resolvesBySelected;
  })(), '부서 패널이 selectedTeamId 로 actor 를 만들어 HQ 가 그 팀 사람으로 기록됨',
  '세션 역할로 actor 생성');

red('S23. HQ 는 다른 팀 메시지의 처리 상태를 대신 바꾸지 않는다',
  (() => {
    const guarded = /canResolve|isOwningTeam|role === m\.toTeam|actor\.teamId === /.test(teamMsgPanel + deptPanel);
    return guarded;
  })(), 'HQ 가 선택한 팀 메시지의 완료 처리를 그대로 누를 수 있음', '수신 팀장만 처리');

// ════════════════════════════════════════════════════════════════════════════
// GAP E — raw 실행 함수 비공개 (S24~S25)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 실행 진입점 폐쇄 ---');

red('S24. raw 실행 함수가 모듈 밖으로 공개되지 않는다',
  (() => {
    // 주석으로 '쓰지 말 것' 이라고 적는 것만으로는 막히지 않는다. export 자체가 없어야 한다.
    const rawExported = /export function runAgentTask\b/.test(agentTaskRunner)
      || /export function stageApprovalTask\b/.test(agentTaskRunner)
      || /export function postAgentReport\b/.test(agentTaskRunner);
    const externalUse = allSources.some(({ f, s }) =>
      f !== 'src/services/agentTaskRunner.ts' && /\brunAgentTask\s*\(|\bstageApprovalTask\s*\(/.test(s));
    return !rawExported && !externalUse;
  })(), 'runAgentTask/stageApprovalTask/postAgentReport 가 여전히 export 되어 게이트 우회가 가능',
  'raw 실행 비공개 · 외부 호출 0');

red('S25. 수동·스케줄 공개 진입점은 유지되고 각각 권한·standing gate 를 통과한다',
  (() => {
    const manual = /export function runManualAgentTask/.test(agentTaskRunner);
    const scheduled = /export function runScheduledAgentTask/.test(agentTaskRunner);
    const manualGate = /runManualAgentTask[\s\S]{0,600}?actor\.teamId !== spec\.teamId/.test(agentTaskRunner);
    const schedGate = /runScheduledAgentTask[\s\S]{0,400}?canRunStandingDirective/.test(agentTaskRunner);
    return manual && scheduled && manualGate && schedGate;
  })(), '공개 진입점 또는 게이트 누락', '수동=팀장 권한 · 스케줄=standing gate');

// ════════════════════════════════════════════════════════════════════════════
// GAP F — 시험 운영 표시 (S26~S28)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 시험 운영 표시 ---');

const FORBIDDEN = [
  '실시간으로 주문',
  '승인 대기 대기열에 결과를 채워',
  '승인 대기열에 결과를 채워',
  '오늘의 전체 자동 운영을 구동',
  '오늘의 운영 점검 완료'
];

red('S26. 시험 실행을 실제 운영처럼 말하는 표현이 남아 있지 않다',
  (() => {
    const hits = [];
    for (const { f, s } of allSources) {
      for (const bad of FORBIDDEN) if (s.includes(bad)) hits.push(`${f}:${bad}`);
    }
    return hits.length === 0;
  })(),
  (() => {
    const hits = [];
    for (const { f, s } of allSources) {
      for (const bad of FORBIDDEN) if (s.includes(bad)) hits.push(`${f.split('/').pop()}("${bad}")`);
    }
    return `금지 표현 ${hits.length}건 — ${hits.join(', ')}`;
  })(), '금지 표현 0건');

red('S27. 시험 실행 결과가 실제 승인함에 주입되지 않고 시험 표식을 갖는다',
  (() => {
    const noInject = !/acceptRuntimeProposals\(/.test(appSource);
    const labeledRun = /시험 운영/.test(appSource);
    // 시험 실행이 만드는 지시 카드도 시험 표식을 가져야 한다.
    const labeledDirective = /\[시험 시나리오\]/.test(appSource);
    return noInject && labeledRun && labeledDirective;
  })(), '시험 실행이 만든 지시 카드에 시험 표식이 없음(실제 지시와 구분 불가)',
  '승인함 주입 0 · 시험 표식 존재');

red('S28. 시험 실행 이력의 출처가 실제 데이터 출처로 저장되지 않는다',
  (() => {
    // 지금은 실행 입력이 snapshotToUse(검증 시나리오)인데 이력은 activeOperationsData.sourceType 으로 저장된다.
    const usesActiveSource = /sourceType: activeOperationsData\.sourceType/.test(appSource);
    const historyLabeled = /reportTitle: `\[시험 운영\]|시험 운영\] Native|시험 운영 · 검증 시나리오/.test(appSource);
    return !usesActiveSource && historyLabeled;
  })(), '운영 이력이 화면에 열려 있는 실제 데이터의 sourceType 으로 저장됨(시험 실행인데 실제로 기록)',
  '이력 출처=시험 실행 입력 · 제목에 시험 표시');

// ════════════════════════════════════════════════════════════════════════════
// 무회귀·불변성 (S29~S31)
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 무회귀 · 불변성 ---');

red('S29. 매출·주문·재고·문의 계산 모듈은 이번 작업에서 바뀌지 않는다',
  (() => {
    const changed = execFileSync('git', ['diff', '--name-only', 'd4334f38bee1125553e26b392ccf30420ea58c23', 'HEAD'], { cwd: REPO })
      .toString().split('\n').filter(Boolean);
    const calc = /departmentDataService|departmentDataSourceOfTruth|godomallRevenue|godomallMapper|revenueScreenState|inquiryStatusContract|commerceDataQueryEngine/;
    return !changed.some((f) => calc.test(f));
  })(), '계산 모듈이 변경됨', '계산 모듈 변경 0');

red('S30. 결정 함수는 입력 task 를 변형하지 않는다(append-only)',
  (() => { reset();
    const t = inProgressWithWork();
    const snapshot = readTask(t.ref.taskId);
    const frozen = JSON.stringify(snapshot);
    L.decideApproval(snapshot, { kind: 'stop', actor: LEAD_PRODUCT, reason: '중단' }, { nowIso: AT });
    L.canDecide(snapshot, HQ, 'stop');
    return JSON.stringify(snapshot) === frozen;
  })(), '입력 task 가 변형됨', '입력 불변');

red('S31. 화면에 보이는 행동과 서비스가 허용하는 행동이 계속 일치한다(중단 포함)',
  (() => { if (!hasFn('availableDecisions')) return false;
    const ALL = ['approve', 'request_revision', 'not_adopted', 'stop', 'return'];
    const cases = [
      { st: 'open', actor: LEAD_PRODUCT }, { st: 'open', actor: HQ }, { st: 'open', actor: LEAD_CS },
      { st: 'in_progress', actor: LEAD_PRODUCT }, { st: 'in_progress', actor: HQ },
      { st: 'awaiting_approval', actor: LEAD_PRODUCT }, { st: 'awaiting_approval', actor: HQ }
    ];
    const prepare = (st) => {
      reset();
      const t = directive();
      if (st !== 'open') A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
      if (st === 'awaiting_approval') A.submitResult(t.ref.taskId, { resultSummary: '보고', actor: LEAD_PRODUCT }, { nowIso: AT });
      return t;
    };
    return cases.every((c) => {
      const probe = prepare(c.st);
      let offered;
      try { offered = A.availableDecisions(readTask(probe.ref.taskId), c.actor).map((d) => d.kind); } catch { return false; }
      return ALL.every((kind) => {
        const t = prepare(c.st);
        const r = A.applyDecision(t.ref.taskId, { kind, actor: c.actor, reason: '사유' }, { nowIso: AT, newId: ids.newId });
        return offered.includes(kind) === (r.ok === true);
      });
    });
  })(), '표시와 허용이 어긋남(HQ 에게 중단 버튼이 제시되는 등)', '7개 조합 일치');

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (진단 전제 — fail>0이면 진단 재작성)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (중단 요청·협업 흐름·시험 운영 S1~S31)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 진단 전제 불일치'); process.exit(1); }
if (redUnmet > 0) {
  console.log(`\n✗ RC-2 D-1.3.1 — ${redUnmet}건 미충족`);
  process.exit(1);
}
console.log('\n✓ 전부 충족 — RC-2 D-1.3.1 GREEN 도달');
