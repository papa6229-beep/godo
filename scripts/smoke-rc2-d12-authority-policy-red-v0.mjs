#!/usr/bin/env node
/*
 * scripts/smoke-rc2-d12-authority-policy-red-v0.mjs
 * RC-2 D-1.2 — 지휘 권한 정책 정정 (RED 진단)
 *
 * 확정 정책(사장):
 *   HQ 는 타 팀 AI 에게 **직접 명령할 권한이 없다**. HQ 는 각 팀의 **인간 팀장**에게 지시하고,
 *   각 팀 AI 는 **자기 팀장의 지시만** 받는다. 수행을 AI 에게 맡길지 팀장이 직접 할지는
 *   **팀장이 결정**한다. AI 결과는 HQ 로 직행하지 않고 **팀장이 먼저 확인**한 뒤 HQ 에 보고한다.
 *   HQ 의 수정 요청은 AI 가 아니라 **팀장에게 반환**되고, 팀장이 다시 수행 방식을 정한다.
 *   수정본은 새 버전이므로 **이전 팀장 확인을 승계하지 않는다**.
 *
 * 현재 구현(D-1.1)은 "HQ 가 AI 에게 직접 지시" 를 전제로 만들어져 이 정책과 충돌한다.
 * 이 검사는 그 충돌을 값으로 고정한다. **제품 소스는 한 줄도 고치지 않는다(RED 전용).**
 *
 *   [BASE] = 진단 전제(현재 코드에서도 참)
 *   [RED ] = 확정 정책 목표. 지금은 미충족(unmet)이 정상이다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'rc2d12-'));

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  addEventListener() {}, removeEventListener() {}
};

let A, L, S, D;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'taskLifecycleAppAdapter.ts'),
    path.join(REPO, 'src', 'services', 'standingDirectiveContract.ts'),
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
  try { D = await imp('standingDirectiveContract.js'); } catch { D = null; }
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const src = (p) => readFileSync(path.join(REPO, ...p.split('/')), 'utf8');
const appSource = src('src/App.tsx');
const chatConsole = src('src/components/ChatConsole.tsx');
const taskBoard = src('src/components/TaskBoard.tsx');
const agentModal = src('src/components/AgentDetailModal.tsx');
const apprDetail = src('src/components/ApprovalDetailModal.tsx');
const apprList = src('src/components/ApprovalListModal.tsx');
const agentTaskPanel = src('src/components/AgentTaskPanel.tsx');
const agentTaskRunner = src('src/services/agentTaskRunner.ts');

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== RC-2 D-1.2 — 지휘 권한 정책 정정 (RED 진단) ===');

const AT = '2026-07-23T00:00:00.000Z';
let _n = 0;
const ids = { newId: () => `id-${++_n}`, nowIso: AT };
const reset = () => { store.clear(); _n = 0; };
const HQ = A.actorForRole('hq');
const LEAD_PRODUCT = A.actorForRole('product');
const LEAD_CS = A.actorForRole('cs');

// ── [BASE] 진단 전제 ─────────────────────────────────────────────────────────
base('B1. 역할 전환기와 담당팀 근거는 D-1.1 에서 이미 동작한다',
  HQ.teamId === 'hq' && LEAD_PRODUCT.teamId === 'product' && A.teamOfAgent('inventory_monitor') === 'product',
  '역할→ActorRef · 에이전트 소속 판정 정상');

base('B2. 저장·결정·이력 기반은 유지된다(D-1 산출물)',
  typeof A.hydrateAppState === 'function' && typeof A.applyDecision === 'function' && typeof S.loadLifecycleTasks === 'function',
  'hydrate/applyDecision/load 존재');

// ── [RED] 확정 권한 정책 ─────────────────────────────────────────────────────
console.log('');

// P1 — HQ 가 타 팀 AI 를 직접 지정할 수 있는가
red('P1. HQ 는 타 팀 AI 를 직접 지정해 업무를 만들 수 없다',
  (() => { reset();
    const t = A.createManualTask({ title: 'HQ가 AI 직접 지시', assignedAgentId: 'inventory_monitor', createdBy: HQ }, ids);
    // 정책상 이 호출 자체가 거부되거나, 수행자가 AI 로 확정되지 않아야 한다.
    return !t || t.assignedAgentId !== 'inventory_monitor';
  })(),
  'createManualTask 가 HQ 의 AI 직접 지정을 그대로 수용(assignedAgentId=inventory_monitor)');

// P2 — HQ 생성 업무가 AI 로 바로 저장되는가
red('P2. HQ 생성 업무가 AI 수행자로 곧바로 저장되지 않는다',
  (() => { reset();
    A.createManualTask({ title: 'HQ 지시', assignedAgentId: 'inventory_monitor', createdBy: HQ }, ids);
    const saved = S.loadLifecycleTasks()[0];
    return saved.assignedAgentId !== 'inventory_monitor';
  })(),
  '저장 레코드에 assignedAgentId=inventory_monitor 로 확정 저장됨');

// P3 — AI 결과가 팀장 확인 없이 HQ 승인함으로 가는가 (runtime 경로)
red('P3. AI 결과가 담당 팀장 확인 없이 HQ 승인함으로 직행하지 않는다',
  (() => { reset();
    A.acceptRuntimeProposals({
      proposedTasks: [{ id: 'T1', correlationId: 'C1', title: 'AI 결과', agentId: 'inventory_monitor', description: 'd' }],
      proposedApprovalItems: [{ taskId: 'T1', correlationId: 'C1', title: 'AI 결과', agentId: 'inventory_monitor' }]
    }, { createdBy: HQ, nowIso: AT });
    const hqPending = A.pendingForActor(HQ);
    const leadPending = A.pendingForActor(LEAD_PRODUCT);
    return hqPending.length === 0 && leadPending.length === 1;
  })(), 'HQ 승인함 진입 여부 확인 필요', '팀장 확인 단계가 먼저');

// P4 — HQ 수정 요청 후 수정본이 AI 에게 자동 재배정되는가
red('P4. HQ 수정 요청 후 수정본이 AI 에게 자동 재배정되지 않는다(팀장이 수행 방식 재선택)',
  (() => { reset();
    const t = A.createManualTask({ title: 'HQ 지시', assignedAgentId: 'inventory_monitor', createdBy: HQ }, ids);
    A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.applyDecision(t.ref.taskId, { kind: 'request_revision', actor: HQ, reason: '재확인' }, { nowIso: AT, newId: ids.newId });
    const rev = S.loadLifecycleTasks().find((x) => x.ref.revisionOfTaskId === t.ref.taskId);
    // 정책: 수행자가 미정이거나 팀장 재선택 대기여야 한다.
    return !!rev && rev.assignedAgentId !== 'inventory_monitor';
  })(), '수정본이 같은 AI(inventory_monitor)로 자동 승계됨');

// P5 — 수행 방식(AI 재지시 / 인간 직접) 선택 상태·필드
red('P5. 팀장이 수행 방식(AI 배정 / 직접 처리)을 고를 상태·필드가 있다',
  (() => { reset();
    const t = A.createManualTask({ title: 'x', assignedAgentId: 'inventory_monitor', createdBy: LEAD_PRODUCT }, ids);
    const keys = Object.keys(t);
    return keys.includes('executorKind') || keys.includes('executorType') || keys.includes('assigneeKind');
  })(),
  `LifecycleTask 키=[${Object.keys(A.createManualTask({ title: 'x', assignedAgentId: 'inventory_monitor', createdBy: LEAD_PRODUCT }, ids)).join(',')}] → 수행자 유형 필드 없음`);

// P6 — 팀장이 직접 인수해도 기존 AI 시도·결과 보존
red('P6. 팀장이 AI 작업을 직접 인수해도 기존 AI 시도·결과가 보존된다',
  (() => { reset();
    const t = A.createManualTask({ title: 'x', assignedAgentId: 'inventory_monitor', createdBy: LEAD_PRODUCT }, ids);
    return typeof A.reassignExecutor === 'function' || typeof A.takeOverByLead === 'function';
  })(), '수행자 변경 API 자체가 없음(인수 시 이력 보존 경로 부재)');

// P7 — HQ 의 팀장 우회
red('P7. HQ 는 담당 팀장 확인 단계를 우회할 수 없다',
  (() => { reset();
    const t = A.createManualTask({ title: 'HQ 지시', assignedAgentId: 'inventory_monitor', createdBy: HQ }, ids);
    const r = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: HQ }, { nowIso: AT });
    return r.ok === false;
  })(), '우회 가능', '팀장 단계 선행 강제됨(D-1.1 에서 이미 충족)');

// P8 — 수정본이 승인 경로 처음부터
red('P8. 수정본은 승인 경로를 처음부터 다시 시작한다(이전 팀장 확인 미승계)',
  (() => { reset();
    const t = A.createManualTask({ title: 'HQ 지시', assignedAgentId: 'inventory_monitor', createdBy: HQ }, ids);
    A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.applyDecision(t.ref.taskId, { kind: 'request_revision', actor: HQ, reason: 'r' }, { nowIso: AT, newId: ids.newId });
    const rev = S.loadLifecycleTasks().find((x) => x.ref.revisionOfTaskId === t.ref.taskId);
    const hqCanDecideNow = A.pendingForActor(HQ).some((x) => x.id === rev.ref.taskId);
    return rev.approvalRoute.currentStageIndex === 0 && !hqCanDecideNow;
  })(), '수정본 currentStageIndex=1 로 팀장 확인을 승계하고 HQ 가 바로 결정 가능');

// P9 — 협업 반송 UI 실제 가능 여부
red('P9. 협업 업무 반송이 실제 UI 조건에서 노출된다',
  (() => { reset();
    const collab = A.createManualTask({ title: '협업 요청', assignedAgentId: 'inventory_monitor', createdBy: LEAD_CS }, ids);
    // App 은 parentTaskId 유무로 onReturn 을 노출한다.
    const appShowsReturn = /parentTaskId \? handleReturn : undefined/.test(appSource);
    return appShowsReturn && !!collab.ref.parentTaskId;
  })(), '협업 업무에 parentTaskId 가 없어(requestingTeamId 만 존재) 반송 버튼이 나오지 않음');

// P10 — 미상 AI 소속의 HQ 자동 승격
red('P10. 알 수 없는 AI 소속을 HQ 로 자동 승격하지 않는다',
  A.teamOfAgent('존재하지_않는_에이전트') !== 'hq',
  `teamOfAgent(미상)='${A.teamOfAgent('존재하지_않는_에이전트')}' — 미상이 총괄 권한 팀으로 승격됨`);

// P11 — 내부 ID / '알 수 없음' 노출
red('P11. 승인 화면에 내부 AI ID 나 "알 수 없음" 이 노출되지 않는다',
  !/requestedByAgentId\.toUpperCase\(\)/.test(apprDetail) && !/알 수 없음/.test(apprList + taskBoard),
  "ApprovalDetailModal 이 requestedByAgentId.toUpperCase() 로 내부 ID 노출 · 목록/보드에 '알 수 없음'");

// P12 — AI 자기승인 차단(유지 확인)
red('P12. AI 는 자기 결과를 승인할 수 없다',
  (() => { reset();
    const t = A.createManualTask({ title: 'x', assignedAgentId: 'inventory_monitor', createdBy: LEAD_PRODUCT }, ids);
    const r = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: { kind: 'agent', teamId: 'product', label: 'AI', agentId: 'inventory_monitor' } }, { nowIso: AT });
    return r.ok === false;
  })(), '자기승인 허용됨', '차단 유지(기존 계약)');

// P13 — 팀장이 확인한 결과만 HQ 최종 확인 대상
red('P13. 팀장이 확인한 결과만 HQ 최종 확인 대상으로 이동한다',
  (() => { reset();
    const t = A.createManualTask({ title: 'HQ 지시', assignedAgentId: 'inventory_monitor', createdBy: HQ }, ids);
    const beforeHq = A.pendingForActor(HQ).length;
    A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    const afterHq = A.pendingForActor(HQ).length;
    return beforeHq === 0 && afterHq === 1;
  })(), '이동 규칙 미충족', '팀장 확인 후에만 HQ 대기열로 이동(D-1.1 에서 이미 충족)');

// P14 — 원본·수정본·사유·수행자 변경 이력 보존
red('P14. 원본·수정본·수정 사유·수행자 변경 이력이 삭제 없이 보존된다',
  (() => { reset();
    const t = A.createManualTask({ title: 'HQ 지시', assignedAgentId: 'inventory_monitor', createdBy: HQ }, ids);
    A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.applyDecision(t.ref.taskId, { kind: 'request_revision', actor: HQ, reason: '수치 오류' }, { nowIso: AT, newId: ids.newId });
    const all = S.loadLifecycleTasks();
    const orig = all.find((x) => x.ref.taskId === t.ref.taskId);
    const rev = all.find((x) => x.ref.revisionOfTaskId === t.ref.taskId);
    const hasExecutorHistory = JSON.stringify(all).includes('executorKind') || JSON.stringify(all).includes('executorHistory');
    return all.length === 2 && orig.status === 'superseded' && !!rev
      && JSON.stringify(orig).includes('수치 오류') && hasExecutorHistory;
  })(), '원본·수정본·사유는 보존되나 **수행자 변경 이력**을 남길 필드가 없음');

// ── HQ → AI 직접 연결 소비자 전수 (소스 가드) ────────────────────────────────
console.log('');
console.log('  --- HQ → AI 직접 연결 소비자 ---');
red('P15. ChatConsole 이 AI 를 직접 골라 업무를 만들지 않는다(빠른 추가)',
  !/onAddTask\(quickTaskTitle, quickTaskAgent\)/.test(chatConsole),
  'ChatConsole 빠른 추가가 AI 를 직접 선택해 배정');
red('P16. ChatConsole 후보 업무가 AI 를 직접 배정하지 않는다',
  !/onAddTask\(candidate\.title, candidate\.agentId\)/.test(chatConsole),
  'ControlTaskCandidate.agentId 로 AI 직접 배정');
red('P17. TaskBoard 가 AI 를 직접 골라 업무를 만들지 않는다',
  !/onAddTask\(newTitle, selectedAgentId\)/.test(taskBoard),
  'TaskBoard 업무 추가가 AI 선택 드롭다운으로 직접 배정');
red('P18. AgentDetailModal 이 AI 에게 직접 지시하지 않는다',
  !/onDirectInstruct\(agent\.id, instruction\)/.test(agentModal),
  '에이전트 상세에서 AI 에게 직접 지시 전송');
red('P19. App 이 역할과 무관하게 AI 를 수행자로 확정하지 않는다',
  !/assignedAgentId: agentId, createdBy: sessionActor\(\)/.test(appSource),
  'handleAddTask 가 역할 확인 없이 AI 를 수행자로 확정');


// ════════════════════════════════════════════════════════════════════════════
// 업무 "수신" 과 "결과 승인" 분리 (P20~P36)
//   생성 즉시 awaiting_approval 이 되면 안 된다.
//   open → (팀장이 수행자 선택) in_progress → (결과 제출) awaiting_approval → 팀장 확인 → HQ
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 업무 수신 / 결과 승인 분리 (P20~P36) ---');

const hasFn = (fn) => typeof A[fn] === 'function';
const noFn = (fn) => `${fn}() 없음`;

// HQ 가 팀장에게 지시(수행자 미정) — 새 정책의 정상 진입점
const directive = (over = {}) => A.createDirectiveTask({
  title: 'HQ 지시', targetTeamId: 'product', instructedBy: HQ, ...over
}, ids);

red('P20. HQ 지시 생성 직후 status=open · executorKind=unassigned',
  (() => { if (!hasFn('createDirectiveTask')) return false;
    reset();
    const t = directive();
    return t.status === 'open' && t.executorKind === 'unassigned' && !t.executorId;
  })(), noFn('createDirectiveTask'), 'open · unassigned');

red('P21. 결과가 없으면 승인 대기열에 나오지 않는다',
  (() => { if (!hasFn('createDirectiveTask')) return false;
    reset(); directive();
    return A.pendingForActor(LEAD_PRODUCT).length === 0 && A.pendingForActor(HQ).length === 0;
  })(), noFn('createDirectiveTask'), '대기열 0건');

red('P22. 수행자 선택은 담당 팀장만 할 수 있다',
  (() => { if (!hasFn('assignExecutor')) return false;
    reset();
    const t = directive();
    const byOther = A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_CS }, { nowIso: AT });
    const byHq = A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: HQ }, { nowIso: AT });
    const byOwner = A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    return byOther.ok === false && byHq.ok === false && byOwner.ok === true;
  })(), noFn('assignExecutor'), '타 팀장·HQ 차단 · 담당 팀장만 허용');

red('P23. 타 팀 AI · 미상 AI · HQ 의 AI 직접 선택을 차단한다',
  (() => { if (!hasFn('assignExecutor')) return false;
    reset();
    const t = directive();
    const otherTeamAi = A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inquiry_analyst', actor: LEAD_PRODUCT }, { nowIso: AT });
    const unknownAi = A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: '존재하지_않는_AI', actor: LEAD_PRODUCT }, { nowIso: AT });
    return otherTeamAi.ok === false && unknownAi.ok === false;
  })(), noFn('assignExecutor'), '타 팀 AI·미상 AI 거부');

red('P24. 수행자 선택 후 status=in_progress (AI/인간 모두)',
  (() => { if (!hasFn('assignExecutor')) return false;
    reset();
    const t1 = directive();
    A.assignExecutor(t1.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    const a = S.loadLifecycleTasks().find((x) => x.ref.taskId === t1.ref.taskId);
    reset();
    const t2 = directive();
    A.assignExecutor(t2.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    const h = S.loadLifecycleTasks().find((x) => x.ref.taskId === t2.ref.taskId);
    return a.status === 'in_progress' && a.executorKind === 'agent' && a.executorId === 'inventory_monitor'
      && h.status === 'in_progress' && h.executorKind === 'human' && h.executorId === LEAD_PRODUCT.userId;
  })(), noFn('assignExecutor'), 'AI/인간 모두 in_progress');

red('P25. 결과물 없이 제출·승인 진입이 불가하다',
  (() => { if (!hasFn('submitResult')) return false;
    reset();
    const t = directive();
    A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    const empty = A.submitResult(t.ref.taskId, { artifactRefs: [], actor: LEAD_PRODUCT }, { nowIso: AT });
    const withRef = A.submitResult(t.ref.taskId, { artifactRefs: ['art-1'], actor: LEAD_PRODUCT }, { nowIso: AT });
    return empty.ok === false && withRef.ok === true;
  })(), noFn('submitResult'), '결과물 없으면 거부');

red('P26. 결과 제출 후에만 담당 팀장 확인 대기에 표시된다',
  (() => { if (!hasFn('submitResult')) return false;
    reset();
    const t = directive();
    A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    const before = A.pendingForActor(LEAD_PRODUCT).length;
    A.submitResult(t.ref.taskId, { artifactRefs: ['art-1'], actor: LEAD_PRODUCT }, { nowIso: AT });
    const after = A.pendingForActor(LEAD_PRODUCT).length;
    const saved = S.loadLifecycleTasks()[0];
    return before === 0 && after === 1 && saved.status === 'awaiting_approval' && !!saved.submittedBy;
  })(), noFn('submitResult'), '제출 전 0 → 제출 후 1 · submittedBy 기록');

red('P27. 팀장 확인 후에만 HQ 확인 대기에 표시된다',
  (() => { if (!hasFn('submitResult')) return false;
    reset();
    const t = directive();
    A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.submitResult(t.ref.taskId, { artifactRefs: ['art-1'], actor: LEAD_PRODUCT }, { nowIso: AT });
    const hqBefore = A.pendingForActor(HQ).length;
    A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    const hqAfter = A.pendingForActor(HQ).length;
    return hqBefore === 0 && hqAfter === 1;
  })(), noFn('submitResult'), '팀장 확인 전 0 → 후 1');

red('P28. HQ 는 제출 전 업무를 열람할 수 있으나 결정 행동은 없다',
  (() => { if (!hasFn('createDirectiveTask') || !hasFn('visibleTasksFor')) return false;
    reset();
    const t = directive();
    const view = A.visibleTasksFor(HQ);
    const canAct = A.pendingForActor(HQ).some((x) => x.id === t.ref.taskId);
    const decided = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: HQ }, { nowIso: AT });
    return view.some((x) => x.id === t.ref.taskId) && canAct === false && decided.ok === false;
  })(), noFn('visibleTasksFor'), '열람 가능 · 행동 불가');

red('P29. HQ 수정 요청 후 revision 은 open · unassigned · stageIndex=0',
  (() => { if (!hasFn('submitResult')) return false;
    reset();
    const t = directive();
    A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.submitResult(t.ref.taskId, { artifactRefs: ['art-1'], actor: LEAD_PRODUCT }, { nowIso: AT });
    A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.applyDecision(t.ref.taskId, { kind: 'request_revision', actor: HQ, reason: '재확인' }, { nowIso: AT, newId: ids.newId });
    const rev = S.loadLifecycleTasks().find((x) => x.ref.revisionOfTaskId === t.ref.taskId);
    return !!rev && rev.status === 'open' && rev.executorKind === 'unassigned'
      && rev.approvalRoute.currentStageIndex === 0;
  })(), noFn('submitResult'), 'open · unassigned · stage 0');

red('P30. 수정본은 직전 수행자를 자동 승계하지 않는다(추천값만 가능)',
  (() => { if (!hasFn('submitResult')) return false;
    const rev = S.loadLifecycleTasks().find((x) => !!x.ref.revisionOfTaskId);
    return !!rev && !rev.executorId && rev.executorKind === 'unassigned'
      && (rev.suggestedExecutorId === undefined || rev.suggestedExecutorId === 'inventory_monitor');
  })(), noFn('submitResult'), '자동 재배정 없음 · 추천값만');

red('P31. 인간 인수 시 기존 AI 시도·결과·인수 사유가 보존된다',
  (() => { if (!hasFn('assignExecutor')) return false;
    reset();
    const t = directive();
    A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.submitResult(t.ref.taskId, { artifactRefs: ['art-ai-1'], actor: LEAD_PRODUCT }, { nowIso: AT });
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT, reason: 'AI 결과 미흡해 직접 처리' }, { nowIso: AT });
    const saved = S.loadLifecycleTasks()[0];
    const hist = saved.executorHistory ?? [];
    return hist.length >= 2 && hist[0].kind === 'agent' && hist[0].id === 'inventory_monitor'
      && hist.some((h) => h.reason && h.reason.includes('직접 처리'))
      && (saved.artifactRefs ?? []).includes('art-ai-1');
  })(), noFn('assignExecutor'), 'AI 시도·결과·사유 보존');

red('P32. 팀장 부재 시 자동 대행 없이 대기하고, 임시 책임자 지정 후에만 진행',
  (() => { if (!hasFn('designateActingLead')) return false;
    reset();
    const t = directive({ targetTeamId: 'design' });   // 디자인팀장 부재 가정
    const byHq = A.assignExecutor(t.ref.taskId, { kind: 'human', actor: HQ }, { nowIso: AT });
    if (byHq.ok !== false) return false;               // HQ 자동 대행 금지
    const desig = A.designateActingLead(t.ref.taskId, { actingUserId: 'u-acting-1', actor: HQ, reason: '팀장 부재' }, { nowIso: AT });
    const after = A.assignExecutor(t.ref.taskId, { kind: 'human', actor: { kind: 'human', teamId: 'design', label: '임시 책임자', userId: 'u-acting-1' } }, { nowIso: AT });
    return desig.ok === true && after.ok === true;
  })(), noFn('designateActingLead'), 'HQ 대행 차단 · 임시 책임자 지정 후 진행');

red('P33. 팀장이 사전 승인하지 않은 실제 자동 스케줄은 실행되지 않는다',
  (() => { if (!hasFn('canRunStandingDirective')) return false;
    const unapproved = A.canRunStandingDirective({ id: 's1', ownerTeamId: 'product', active: true, approvedByLeadAt: undefined, mode: 'real' });
    const approved = A.canRunStandingDirective({ id: 's2', ownerTeamId: 'product', active: true, approvedByLeadAt: AT, mode: 'real' });
    return unapproved.allowed === false && /팀장 확인/.test(unapproved.reason ?? '') && approved.allowed === true;
  })(), noFn('canRunStandingDirective'), '미승인 차단 · 승인분만 실행');

red('P34. 시험 모드 시뮬레이션 스케줄은 시험자료로만 실행된다',
  (() => { if (!hasFn('canRunStandingDirective')) return false;
    const sim = A.canRunStandingDirective({ id: 's3', ownerTeamId: 'product', active: true, approvedByLeadAt: undefined, mode: 'simulation' });
    return sim.allowed === true && sim.dataKind === 'fixture';
  })(), noFn('canRunStandingDirective'), '시험자료로만 실행');

red('P35. 협업은 요청팀 부모 + 수행팀 자식으로 기록되고 수행팀이 반송할 수 있다',
  (() => { if (!hasFn('createCollaborationRequest')) return false;
    reset();
    const { parent, child } = A.createCollaborationRequest({
      title: '재고 확인 요청', requestingTeamId: 'cs', targetTeamId: 'product', instructedBy: LEAD_CS
    }, ids);
    const returned = A.applyDecision(child.ref.taskId, { kind: 'return', actor: LEAD_PRODUCT, reason: '자료 부족' }, { nowIso: AT });
    const saved = S.loadLifecycleTasks();
    const savedChild = saved.find((x) => x.ref.taskId === child.ref.taskId);
    const savedParent = saved.find((x) => x.ref.taskId === parent.ref.taskId);
    return child.ref.parentTaskId === parent.ref.taskId
      && child.ref.correlationId === parent.ref.correlationId
      && returned.ok === true && savedChild.status === 'returned'
      && JSON.stringify(savedChild).includes('자료 부족')
      && savedParent.status !== 'completed';
  })(), noFn('createCollaborationRequest'), '부모·자식 연결 · 반송·사유 보존');

red('P36. 내부 AI ID·"알 수 없음" 이 사용자 화면에 노출되지 않는다',
  !/requestedByAgentId\.toUpperCase\(\)/.test(apprDetail) && !/알 수 없음/.test(apprList + taskBoard),
  '내부 ID / "알 수 없음" 노출 잔존');

// ── A26·A27 교체(잘못된 HQ→AI fixture 폐기) ─────────────────────────────────
console.log('');
console.log('  --- A26/A27 교체: HQ→팀장 지시 정상 흐름 ---');
red('A26R. HQ→상품팀장 지시 → 팀장이 수행자 선택 → 결과 제출 (담당팀/경로 정상)',
  (() => { if (!hasFn('createDirectiveTask')) return false;
    reset();
    const t = directive();
    if (t.ownerTeamId !== 'product' || t.approvalRoute.stages.length !== 2) return false;
    const asg = A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    const sub = A.submitResult(t.ref.taskId, { artifactRefs: ['art-1'], actor: LEAD_PRODUCT }, { nowIso: AT });
    return asg.ok && sub.ok;
  })(), noFn('createDirectiveTask'), '담당팀 product · 2단계 · 배정·제출 성공');

red('A27R. 상품팀장 확인만으로 완료되지 않고 HQ 최종 확인 후 완료',
  (() => { if (!hasFn('createDirectiveTask')) return false;
    const t = S.loadLifecycleTasks()[0];
    const r1 = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    const mid = S.loadLifecycleTasks()[0];
    if (!r1.ok || mid.status === 'completed') return false;
    const r2 = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: HQ }, { nowIso: AT });
    return r2.ok && S.loadLifecycleTasks()[0].status === 'completed';
  })(), noFn('createDirectiveTask'), '팀장 후 대기 · HQ 후 완료');


// ════════════════════════════════════════════════════════════════════════════
// 협업 · 수정 · 표시 (P37~P41)
//   각 팀은 자기 업무만, HQ 는 전 팀 업무를 하나의 연결된 흐름으로 본다.
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 협업·수정·표시 ---');

red('P37. 팀장 화면에는 다른 팀 업무가 섞이지 않는다',
  (() => { if (!hasFn('visibleTasksFor')) return false; reset();
    A.createDirectiveTask({ title: '상품 업무', targetTeamId: 'product', instructedBy: HQ }, ids);
    A.createDirectiveTask({ title: 'CS 업무', targetTeamId: 'cs', instructedBy: HQ }, ids);
    const p = A.visibleTasksFor(LEAD_PRODUCT), c = A.visibleTasksFor(LEAD_CS), h = A.visibleTasksFor(HQ);
    return p.length === 1 && p[0].title === '상품 업무'
      && c.length === 1 && c[0].title === 'CS 업무'
      && h.length === 2;   // HQ 는 전 팀 열람
  })(), noFn('visibleTasksFor'), '팀장 각 1건 · HQ 2건');

red('P38. 협업은 요청팀 카드와 수행팀 카드가 하나의 흐름으로 이어진다',
  (() => { if (!hasFn('createCollaborationRequest')) return false; reset();
    const { parent, child } = A.createCollaborationRequest(
      { title: '상세페이지 문구', requestingTeamId: 'cs', targetTeamId: 'design', instructedBy: LEAD_CS }, ids);
    const cs = A.visibleTasksFor(LEAD_CS), design = A.visibleTasksFor(A.actorForRole('design'));
    const hq = A.visibleTasksFor(HQ);
    // 각 팀에는 자기 카드가 보이고, HQ 에는 부모·자식이 같은 흐름(correlationId)으로 이어져 보인다.
    return cs.some((t) => t.id === parent.ref.taskId)
      && design.some((t) => t.id === child.ref.taskId)
      && hq.length === 2
      && hq.every((t) => t.correlationId === parent.ref.correlationId)
      && hq.some((t) => t.parentTaskId === parent.ref.taskId);
  })(), noFn('createCollaborationRequest'), '요청팀·수행팀 각자 카드 · HQ 는 하나의 흐름');

red('P39. 요청팀은 자기가 요청한 협업의 진행도 볼 수 있다',
  (() => { if (!hasFn('createCollaborationRequest')) return false;
    const cs = A.visibleTasksFor(LEAD_CS);
    return cs.length === 2;   // 자기 카드(부모) + 자기가 요청한 수행팀 카드(자식)
  })(), noFn('createCollaborationRequest'), '요청팀에 부모·자식 모두 노출');

red('P40. App 이 역할별 업무 목록을 visibleTasksFor 로 만든다(전체 목록 노출 아님)',
  /visibleTasksFor/.test(appSource),
  'App 이 hydrateAppState().tasks 전체를 역할 구분 없이 그대로 보여줌');

red('P41. 수정본은 담당 팀장에게 돌아가고 직전 수행자는 추천값으로만 남는다',
  (() => { if (!hasFn('createDirectiveTask') || !hasFn('assignExecutor')) return false; reset();
    const t = A.createDirectiveTask({ title: '재고 점검', targetTeamId: 'product', instructedBy: HQ }, ids);
    A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.submitResult(t.ref.taskId, { artifactRefs: ['art-1'], actor: LEAD_PRODUCT }, { nowIso: AT });
    A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.applyDecision(t.ref.taskId, { kind: 'request_revision', actor: HQ, reason: '수치 재확인' }, { nowIso: AT, newId: ids.newId });
    const rev = S.loadLifecycleTasks().find((x) => x.ref.revisionOfTaskId === t.ref.taskId);
    const leadSees = A.visibleTasksFor(LEAD_PRODUCT).some((x) => x.id === rev.ref.taskId);
    const hqCanDecide = A.pendingForActor(HQ).some((x) => x.id === rev.ref.taskId);
    return rev.executorKind === 'unassigned' && rev.suggestedExecutorId === 'inventory_monitor'
      && rev.approvalRoute.currentStageIndex === 0 && leadSees && !hqCanDecide;
  })(), noFn('createDirectiveTask'), '수행자 미정 · 추천값 보존 · 팀장에게 반환');


// ════════════════════════════════════════════════════════════════════════════
// 상시 지시(자동 스케줄) P42~P48
//   팀장이 미리 승인한 것만 자동으로 돈다. 고위험은 상시 승인이 있어도 확인 생략 불가.
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 상시 지시(자동 스케줄) ---');

const noD = '상시 지시 계약(standingDirectiveContract) 없음';
const LEAD_ACTOR = { userId: 'u-product', teamId: 'product', label: '상품관리팀장' };
const mkStanding = (over) => ({
  ownerTeamId: 'product', ownerLeadUserId: 'u-product', scope: '재고 부족 알림만',
  schedule: { kind: 'daily', at: '09:00' }, active: true,
  riskLevel: 'normal', source: 'real', history: [], ...over
});

red('P42. 팀장 승인이 없는 자동 업무는 스스로 돌지 않는다',
  (() => { if (!D) return false;
    const v = D.canRunStandingDirective(mkStanding({ approvedByLeadAt: undefined }));
    const none = D.canRunStandingDirective(undefined);
    return v.allowed === false && v.reason.includes('팀장')
      && none.allowed === false && none.reason.includes('팀장');
  })(), noD, '미승인·미등록 모두 자동 실행 차단');

red('P43. 중지된 상시 지시는 실행되지 않는다',
  (() => { if (!D) return false;
    const v = D.canRunStandingDirective(mkStanding({ active: false, approvedByLeadAt: AT }));
    return v.allowed === false && v.reason.includes('중지');
  })(), noD, '중지 시 실행 차단');

red('P44. 상시 지시는 소유 팀장·범위·주기·활성·최근 승인 시각을 보존한다',
  (() => { if (!D) return false;
    const r = D.approveStanding(mkStanding({ approvedByLeadAt: undefined }), { actor: LEAD_ACTOR, nowIso: AT });
    if (!r.ok) return false;
    const d = r.directive;
    return d.ownerLeadUserId === 'u-product' && d.scope === '재고 부족 알림만'
      && d.schedule.kind === 'daily' && d.active === true && d.approvedByLeadAt === AT
      && D.canRunStandingDirective(d).allowed === true;
  })(), noD, '소유·범위·주기·활성·승인시각 보존');

red('P45. 중지·재개·범위변경 이력이 덮어써지지 않고 쌓인다',
  (() => { if (!D) return false;
    let d = mkStanding({ approvedByLeadAt: undefined });
    const a = D.approveStanding(d, { actor: LEAD_ACTOR, nowIso: AT }); if (!a.ok) return false;
    const b = D.pauseStanding(a.directive, { actor: LEAD_ACTOR, nowIso: AT, note: '점검' }); if (!b.ok) return false;
    const c = D.resumeStanding(b.directive, { actor: LEAD_ACTOR, nowIso: AT }); if (!c.ok) return false;
    const e = D.changeStandingScope(c.directive, { scope: '재고+가격', actor: LEAD_ACTOR, nowIso: AT }); if (!e.ok) return false;
    const kinds = e.directive.history.map((h) => h.kind);
    // 재개·범위변경 후에는 다시 승인해야 돈다(이전 승인을 승계하지 않는다).
    return kinds.join(',') === 'approved,paused,resumed,scope_changed'
      && e.directive.history.some((h) => h.note === '점검')
      && D.canRunStandingDirective(e.directive).allowed === false;
  })(), noD, '4건 누적 · 사유 보존 · 재승인 필요');

red('P46. 고위험 자동 업무는 상시 승인이 있어도 팀장 확인을 생략하지 않는다',
  (() => { if (!D) return false;
    const v = D.canRunStandingDirective(mkStanding({ approvedByLeadAt: AT, riskLevel: 'high' }));
    const n = D.canRunStandingDirective(mkStanding({ approvedByLeadAt: AT }));
    return v.allowed === true && v.requiresLeadConfirmation === true && n.requiresLeadConfirmation === false;
  })(), noD, '고위험은 결과 확인 필수');

red('P47. 시험 출처 스케줄 결과는 실제 자료로 표시되지 않는다',
  (() => { if (!D) return false;
    const sim = D.canRunStandingDirective(mkStanding({ approvedByLeadAt: AT, source: 'simulation' }));
    const real = D.canRunStandingDirective(mkStanding({ approvedByLeadAt: AT }));
    return sim.dataKind === 'fixture' && real.dataKind === 'real';
  })(), noD, '시험=fixture · 실제=real');

red('P48. 소유 팀장이 아니면 상시 지시를 승인·중지할 수 없다',
  (() => { if (!D) return false;
    const hqActor = { userId: 'u-hq', teamId: 'hq', label: '총괄 관리자' };
    const a = D.approveStanding(mkStanding({ approvedByLeadAt: undefined }), { actor: hqActor, nowIso: AT });
    const b = D.pauseStanding(mkStanding({ approvedByLeadAt: AT }), { actor: hqActor, nowIso: AT });
    return a.ok === false && b.ok === false;
  })(), noD, '소유 팀장 외 차단');

red('P49. 자동 실행 경로가 상시 지시 승인 여부를 확인한 뒤 실행한다',
  /canRunStandingDirective/.test(agentTaskPanel) || /canRunStandingDirective/.test(agentTaskRunner),
  '자동 업무 실행부가 승인 여부를 확인하지 않고 바로 실행');

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (진단 전제 — fail>0이면 진단 재작성)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (확정 권한 정책 P1~P49 + A26R/A27R)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 진단 전제 불일치'); process.exit(1); }
if (redUnmet > 0) {
  console.log(`\n✗ RC-2 D-1.2 — 권한 정책 ${redUnmet}건 미충족`);
  process.exit(1);
}
console.log('\n✓ 전부 충족 — RC-2 D-1.2 GREEN 도달 (지시는 팀장에게, 수행자는 팀장이, 승인은 결과 제출 후)');
