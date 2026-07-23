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

const src = (p) => readFileSync(path.join(REPO, ...p.split('/')), 'utf8');
const appSource = src('src/App.tsx');
const chatConsole = src('src/components/ChatConsole.tsx');
const taskBoard = src('src/components/TaskBoard.tsx');
const agentModal = src('src/components/AgentDetailModal.tsx');
const apprDetail = src('src/components/ApprovalDetailModal.tsx');
const apprList = src('src/components/ApprovalListModal.tsx');

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

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (진단 전제 — fail>0이면 진단 재작성)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (확정 권한 정책 P1~P19)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 진단 전제 불일치'); process.exit(1); }
console.log(`\n✗ RC-2 D-1.2 RED — 권한 정책 ${redUnmet}건 미충족(의도된 실패 · GREEN 미승인)`);
process.exit(1);
