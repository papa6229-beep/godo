#!/usr/bin/env node
/*
 * scripts/smoke-rc2-d13-consumer-wiring-red-v0.mjs
 * RC-2 D-1.3 — 소비자 실배선 · 전이 안전장치 (RED 진단)
 *
 * 배경: D-1.2 는 규칙 함수와 자동검사만 GREEN 이었다.
 *   assignExecutor / takeOverByLead / submitResult / designateActingLead / createCollaborationRequest
 *   다섯 함수는 **제품 소스 어디에서도 호출되지 않는다.** 따라서
 *   "팀장이 업무를 받아 → 수행 방식을 고르고 → 결과를 제출하고 → 팀장이 확인하고 → HQ 가 확인" 하는
 *   실제 사용자 흐름은 아직 화면에서 수행할 수 없다.
 *   또한 상태 전이 가드가 없어 종료된 업무를 되살리거나, 결과물 없이 승인하거나,
 *   아무나 결과를 제출할 수 있다.
 *
 * 이 검사는 그 간극을 값으로 고정한다. **제품 소스는 한 줄도 고치지 않는다(RED 전용).**
 *
 *   [BASE] = 진단 전제(현재 코드에서도 참)
 *   [RED ] = 목표. 지금은 미충족(unmet)이 정상이다.
 *
 * 주의: 소스 가드는 "함수가 존재한다"가 아니라 **제품 소비자(App/화면)에서 호출된다**를 본다.
 *   계약 모듈 자신(taskLifecycleAppAdapter / standingDirectiveContract)의 정의는 증거로 세지 않는다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const tscBin = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
const cacheRoot = path.join(REPO, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const tmp = mkdtempSync(path.join(cacheRoot, 'rc2d13-'));

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  addEventListener() {}, removeEventListener() {}
};

let A, L, S, R;
try {
  execFileSync(process.execPath, [tscBin,
    path.join(REPO, 'src', 'services', 'taskLifecycleAppAdapter.ts'),
    path.join(REPO, 'src', 'services', 'agentIdRegistry.ts'),
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
  R = await imp('agentIdRegistry.js');
} catch (e) {
  console.error('[smoke] tsc emit 실패:\n', e.stdout?.toString() || e.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const src = (p) => readFileSync(path.join(REPO, ...p.split('/')), 'utf8');
const appSource = src('src/App.tsx');
const deptPanel = src('src/components/DepartmentWorkspacePanel.tsx');
// 팀장 화면 = 부서 워크스페이스의 업무 탭. 그 안에서 실제로 그려지는 컴포넌트까지 함께 본다.
let teamTaskPanel = '';
try { teamTaskPanel = src('src/components/TeamTaskPanel.tsx'); } catch { teamTaskPanel = ''; }
const leadScreen = deptPanel + teamTaskPanel;
const deptRendersLeadScreen = /<TeamTaskPanel/.test(deptPanel);
const agentTaskPanel = src('src/components/AgentTaskPanel.tsx');
const agentTaskRunner = src('src/services/agentTaskRunner.ts');
const apprList = src('src/components/ApprovalListModal.tsx');
const taskBoard = src('src/components/TaskBoard.tsx');
const apprDetail = src('src/components/ApprovalDetailModal.tsx');

// 제품 소비자 전체(계약 모듈 자신은 제외) — "실제로 호출되는가" 의 근거.
const CONTRACT_FILES = new Set([
  'src/services/taskLifecycleAppAdapter.ts',
  'src/services/taskLifecycleContract.ts',
  'src/services/standingDirectiveContract.ts'
]);
const walk = (dir, out = []) => {
  for (const e of readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !CONTRACT_FILES.has(rel)) out.push(rel);
  }
  return out;
};
const consumerFiles = walk('src');
const consumerSources = consumerFiles.map((f) => ({ f, s: src(f) }));
/** 제품 소비자에서 이 함수를 실제로 호출하는 파일 목록(정의/재수출 제외). */
const callers = (fn) => consumerSources
  .filter(({ s }) => new RegExp(`(?<![\\w.])${fn}\\s*\\(`).test(s))
  .map(({ f }) => f);
const calledInProduct = (fn) => callers(fn).length > 0;

let baseP = 0, baseF = 0, redMet = 0, redUnmet = 0;
const base = (n, c, cur) => { console.log(`  ${c ? 'PASS' : 'FAIL'} [BASE] ${n}${cur ? `  — ${cur}` : ''}`); c ? baseP++ : baseF++; };
const red = (n, c, cur, met) => { console.log(`  ${c ? 'MET ' : 'RED '} [RED ] ${n}${c ? ((met ?? cur) ? `  — ${met ?? cur}` : '') : `  (현재: ${cur})`}`); c ? redMet++ : redUnmet++; };
console.log('=== RC-2 D-1.3 — 소비자 실배선 · 전이 안전장치 (RED 진단) ===');

const AT = '2026-07-23T00:00:00.000Z';
let _n = 0;
const ids = { newId: () => `id-${++_n}`, nowIso: AT };
const reset = () => { store.clear(); _n = 0; };
const HQ = A.actorForRole('hq');
const LEAD_PRODUCT = A.actorForRole('product');
const LEAD_CS = A.actorForRole('cs');
const hasFn = (n) => typeof A[n] === 'function';
const noFn = (n) => `${n}() 없음`;

/** open 업무 1건을 팀장 지시로 만든다. */
const mkOpen = (team = 'product', by = HQ) =>
  A.createDirectiveTask({ title: `${team} 업무`, targetTeamId: team, instructedBy: by }, ids);

// ── [BASE] 진단 전제 ─────────────────────────────────────────────────────────
base('B1. D-1.2 계약 함수는 모두 존재한다(규칙 자체는 GREEN)',
  ['createDirectiveTask', 'assignExecutor', 'takeOverByLead', 'submitResult', 'designateActingLead', 'createCollaborationRequest', 'visibleTasksFor']
    .every(hasFn),
  '7개 전이 함수 존재');

base('B2. 저장·결정 기반은 유지된다',
  typeof A.hydrateAppState === 'function' && typeof A.applyDecision === 'function' && typeof S.loadLifecycleTasks === 'function',
  'hydrate/applyDecision/load 존재');

// ── 실배선 (W1~W6) ──────────────────────────────────────────────────────────
console.log('');
console.log('  --- 팀장 화면 실배선 ---');

red('W1. HQ 지시 업무가 팀장 화면의 할 일 목록에 실제로 표시된다',
  (() => { if (!hasFn('createDirectiveTask')) return false; reset();
    const t = mkOpen('product');
    const inScope = A.visibleTasksFor(LEAD_PRODUCT).some((x) => x.id === t.ref.taskId);
    // 규칙만으로는 부족하다 — 팀장 화면(부서 워크스페이스)이 실제로 그 목록을 그려야 한다.
    // 규칙만으로는 부족하다 — 팀장 화면이 실제로 그 목록을 그려야 한다.
    const rendered = deptRendersLeadScreen && /할 일/.test(leadScreen) && /tasks\.filter|teamTasks/.test(leadScreen);
    return inScope && rendered;
  })(), '규칙상 범위에는 들어오지만 팀장 화면(DepartmentWorkspacePanel)이 할 일 목록을 그리지 않음',
  '규칙 범위 + 팀장 화면 렌더');

red('W2. 팀장이 open 업무에서 AI 맡기기 / 직접 처리를 고를 수 있다(화면)',
  deptRendersLeadScreen && /AI에게 맡기기|AI 에게 맡기기/.test(leadScreen) && /직접 처리/.test(leadScreen),
  '팀장 화면에 수행 방식 선택 UI 없음');

red('W3. HQ·타 팀장에게는 수행자 선택 수단이 아예 보이지 않는다',
  (() => { if (!hasFn('assignExecutor')) return false; reset();
    const t = mkOpen('product');
    const byHq = A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: HQ }, { nowIso: AT });
    const byOther = A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_CS }, { nowIso: AT });
    // 실행 차단(규칙)만이 아니라 화면에서 역할로 가려야 한다.
    const gatedInUi = /viewerRole|isOwningLead|canAssign|canOperate/.test(leadScreen);
    return byHq.ok === false && byOther.ok === false && gatedInUi;
  })(), '규칙은 차단하지만 화면에 역할 가드가 없음(버튼 자체가 없어 검증 불가)',
  '규칙 차단 + 화면 역할 가드');

red('W4. assignExecutor 가 실제 팀장 화면 핸들러에서 호출된다',
  calledInProduct('assignExecutor'),
  `제품 소비자 호출 0건 (호출처: ${callers('assignExecutor').join(', ') || '없음'})`);

red('W5. 수행자 선택 후 in_progress 가 되고 새로고침 후에도 유지된다',
  (() => { if (!hasFn('assignExecutor')) return false; reset();
    const t = mkOpen('product');
    const r = A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    const after = S.loadLifecycleTasks().find((x) => x.ref.taskId === t.ref.taskId);
    return r.ok === true && after.status === 'in_progress' && after.executorId === 'inventory_monitor';
  })(), '전이 실패', 'in_progress · 저장 유지');

red('W6. 결과물이 생긴 뒤 submitResult 로만 팀장 확인 대기로 이동한다(제품 경로 포함)',
  (() => { if (!hasFn('submitResult')) return false; reset();
    const t = mkOpen('product');
    A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    // 제출자는 배정받은 그 AI 본인이다(W27).
    const AI = { kind: 'agent', teamId: 'product', label: '재고 감시 AI', agentId: 'inventory_monitor' };
    const empty = A.submitResult(t.ref.taskId, { artifactRefs: [], actor: AI }, { nowIso: AT });
    const ok = A.submitResult(t.ref.taskId, { artifactRefs: ['art-1'], actor: AI }, { nowIso: AT });
    const after = S.loadLifecycleTasks().find((x) => x.ref.taskId === t.ref.taskId);
    return empty.ok === false && ok.ok === true && after.status === 'awaiting_approval'
      && calledInProduct('submitResult');
  })(), `규칙은 성립하나 제품 소비자 호출 0건 (호출처: ${callers('submitResult').join(', ') || '없음'})`,
  '규칙 + 제품 경로 호출');

// ── 전이 안전장치 (W7~W11) ──────────────────────────────────────────────────
console.log('');
console.log('  --- 전이 안전장치 ---');

red('W7. 결과 제출자는 현재 수행자 또는 인수한 담당 팀장만 가능하다',
  (() => { if (!hasFn('submitResult')) return false; reset();
    const t = mkOpen('product');
    A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    const byOtherTeam = A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: LEAD_CS }, { nowIso: AT });
    const byHq = A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: HQ }, { nowIso: AT });
    return byOtherTeam.ok === false && byHq.ok === false;
  })(), '아무나 제출 가능(타 팀장·HQ 제출이 통과됨)', '타 팀·HQ 제출 차단');

red('W8. submitResult 는 in_progress 에서만 가능하다',
  (() => { if (!hasFn('submitResult')) return false; reset();
    const t = mkOpen('product');
    const beforeAssign = A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: LEAD_PRODUCT }, { nowIso: AT });
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: LEAD_PRODUCT }, { nowIso: AT });
    const again = A.submitResult(t.ref.taskId, { artifactRefs: ['b'], actor: LEAD_PRODUCT }, { nowIso: AT });
    return beforeAssign.ok === false && again.ok === false;   // open 제출 금지 · 중복 제출 금지
  })(), 'awaiting_approval 상태에서도 재제출이 통과됨', 'open·재제출 모두 차단');

red('W9. assignExecutor 는 open 에서만 가능하며 종료된 업무를 되살릴 수 없다',
  (() => { if (!hasFn('assignExecutor')) return false;
    const terminals = ['completed', 'stopped', 'not_adopted', 'returned', 'superseded'];
    return terminals.every((st) => {
      reset();
      const t = mkOpen('product');
      const all = S.loadLifecycleTasks().map((x) => (x.ref.taskId === t.ref.taskId ? { ...x, status: st } : x));
      S.saveLifecycleTasks(all);
      const r = A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
      const after = S.loadLifecycleTasks().find((x) => x.ref.taskId === t.ref.taskId);
      return r.ok === false && after.status === st;
    });
  })(), '종료 상태(completed/stopped/not_adopted/returned/superseded)를 in_progress 로 되살릴 수 있음',
  '종료 상태 재개 차단');

red('W10. 결정행동은 awaiting_approval 에서만 받는다',
  (() => { reset();
    const t = mkOpen('product');
    const onOpen = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    const onProgress = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    return onOpen.ok === false && onProgress.ok === false;
  })(), 'open/in_progress 업무도 승인 결정이 통과됨(결과 없이 완료 가능)', 'open·in_progress 결정 차단');

red('W11. 결과물 참조가 없는 업무는 승인·완료할 수 없다',
  (() => { reset();
    const t = mkOpen('product');
    // 결과물 없이 상태만 awaiting_approval 로 만들어 둔 자료(구버전 저장분 포함)
    const all = S.loadLifecycleTasks().map((x) => (x.ref.taskId === t.ref.taskId
      ? { ...x, status: 'awaiting_approval', executorKind: 'human', executorId: 'u-product' } : x));
    S.saveLifecycleTasks(all);
    const r = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    const after = S.loadLifecycleTasks().find((x) => x.ref.taskId === t.ref.taskId);
    return r.ok === false && after.status !== 'completed';
  })(), '결과물 없이도 승인·완료됨', '결과물 없으면 승인 차단');

// ── HQ 읽기 전용 (W12~W14) ──────────────────────────────────────────────────
console.log('');
console.log('  --- HQ 열람과 결정의 분리 ---');

red('W12. 팀장이 결과를 확인한 뒤에만 HQ 확인 대기로 이동한다',
  (() => { reset();
    const t = mkOpen('product');
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: LEAD_PRODUCT }, { nowIso: AT });
    const beforeHq = A.pendingForActor(HQ).length;
    A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
    const afterHq = A.pendingForActor(HQ).length;
    return beforeHq === 0 && afterHq === 1;
  })(), '이동 규칙 미충족', '팀장 확인 후에만 HQ 대기열');

red('W13. HQ 는 팀장 제출 전 업무를 읽을 수 있지만 결정 대상은 아니다',
  (() => { reset();
    const t = mkOpen('product');
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    return A.visibleTasksFor(HQ).some((x) => x.id === t.ref.taskId)
      && A.pendingForActor(HQ).length === 0;
  })(), '열람/결정 분리 미충족', '열람 O · 결정 X');

red('W14. 담당 팀장 확인 단계에서 HQ 화면 결정 버튼이 처음부터 비활성이다',
  (() => { if (!hasFn('availableDecisions')) return false; reset();
    const t = mkOpen('product');
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: LEAD_PRODUCT }, { nowIso: AT });
    const saved = S.loadLifecycleTasks()[0];
    let forHq;
    try { forHq = A.availableDecisions(saved, HQ); } catch { return false; }
    const forLead = A.availableDecisions(saved, LEAD_PRODUCT);
    // HQ 에게는 이 단계에서 아무 결정도 제시되지 않아야 한다(눌러 보고 막는 것이 아니라).
    return Array.isArray(forHq) && forHq.length === 0 && Array.isArray(forLead) && forLead.length > 0;
  })(), 'availableDecisions 가 actor 를 받지 않아 HQ 에게도 같은 버튼 목록을 제시함',
  'HQ 0건 · 담당 팀장 N건');

// ── HQ 오늘 운영 시작 (W15~W16) ─────────────────────────────────────────────
console.log('');
console.log('  --- HQ 운영 시작의 팀장 우회 ---');

red('W15. HQ 오늘 운영 시작이 팀장 승인 없이 타 팀 AI 를 실행하지 않는다',
  (() => {
    // 현재 App: 버튼 → runNativeAgentOperation(전 팀 AI 실행) → acceptRuntimeProposals(결과)
    const scenarioRun = /getScenarioData\(/.test(appSource) && /runNativeAgentOperation\(/.test(appSource);
    if (!scenarioRun) return true;   // 시험 실행 자체가 없으면 우회 문제도 없다
    // (1) 시험 실행 결과를 실제 운영 lifecycle 에 저장하지 않는다
    const writesLifecycle = /acceptRuntimeProposals\(/.test(appSource);
    // (2) 총괄의 시작은 각 팀장에게 지시를 만든다
    const createsDirectives = /createDirectiveTask\(/.test(appSource) && /targets|VIEWER_ROLES\.filter/.test(appSource);
    // (3) 실제 운영으로 오인되지 않게 시험 표시가 붙는다
    const labeled = /시험 운영/.test(appSource);
    return !writesLifecycle && createsDirectives && labeled;
  })(), 'HQ 버튼이 곧바로 전 팀 AI 를 실행하고 그 결과를 운영 lifecycle 에 넣음',
  '시험 결과는 저장 안 함 · 실제 업무는 팀장 지시로만 · 시험 표시');

red('W16. 결과 인정에 artifact·소속·제출자가 모두 필요하다(taskId 존재만으로 불가)',
  (() => { reset();
    // (a) approvalItem 은 있지만 artifact 가 없다 → 결과로 인정하면 안 된다
    A.acceptRuntimeProposals({
      proposedTasks: [{ id: 'T1', correlationId: 'C1', title: '결과주장', agentId: 'inventory_monitor', description: 'd' }],
      proposedApprovalItems: [{ taskId: 'T1', correlationId: 'C1', title: '결과주장', agentId: 'inventory_monitor' }]
    }, { createdBy: HQ, nowIso: AT });
    const noArtifact = S.loadLifecycleTasks().find((x) => x.ref.taskId === 'T1');
    reset();
    // (b) 미상 AI 가 결과를 주장한다 → 인정하면 안 된다
    A.acceptRuntimeProposals({
      proposedTasks: [{ id: 'T2', correlationId: 'C2', title: '미상결과', agentId: '유령_AI', description: 'd' }],
      proposedApprovalItems: [{ taskId: 'T2', correlationId: 'C2', title: '미상결과', agentId: '유령_AI', artifactRefs: ['a'] }]
    }, { createdBy: HQ, nowIso: AT });
    const unknownAi = S.loadLifecycleTasks().find((x) => x.ref.taskId === 'T2');
    return noArtifact?.status !== 'awaiting_approval'
      && (!unknownAi || unknownAi.status !== 'awaiting_approval');
  })(), 'taskId 가 승인목록에 있다는 이유만으로 awaiting_approval + submittedBy 없이 결과로 인정',
  'artifact·소속·제출자 모두 필요');

// ── 미상 AI 취급 (W17~W19) ──────────────────────────────────────────────────
console.log('');
console.log('  --- 미상 AI: 신규 거부 vs 과거 격리 ---');

red('W17. 미상 AI 를 지정한 신규 업무는 지시자 팀으로 옮기지 않고 생성을 거부한다',
  (() => { reset();
    let created = null, threw = false;
    try {
      created = A.createManualTask({ title: '유령 배정', assignedAgentId: '유령_AI', createdBy: LEAD_PRODUCT }, ids);
    } catch { threw = true; }
    const saved = S.loadLifecycleTasks();
    return threw || created === null || saved.length === 0;
  })(), '미상 AI 지정이 조용히 지시자 팀 업무로 생성됨(거부되지 않음)', '신규 생성 거부');

red('W18. 과거 저장자료의 미상 AI 만 소속 확인 필요로 격리한다(신규 입력과 구분)',
  (() => { if (typeof A.quarantineUnknownAffiliation !== 'function') return false; reset();
    const t = mkOpen('product');
    const all = S.loadLifecycleTasks().map((x) => ({ ...x, executorKind: 'agent', executorId: '유령_AI' }));
    S.saveLifecycleTasks(all);
    const r = A.quarantineUnknownAffiliation();
    const after = S.loadLifecycleTasks().find((x) => x.ref.taskId === t.ref.taskId);
    return r.quarantined === 1 && !!after && after.needsAffiliationReview === true;
  })(), '과거 자료 격리 함수 없음(신규 거부와 과거 격리가 구분되지 않음)', '과거 1건 격리 · 삭제 없음');

red('W19. 알려진 AI 가 목록에서 소속 확인 필요로 오표시되지 않는다',
  (() => {
    // 정본은 canonical, 화면은 legacy id 로 캐릭터를 찾는다 → 정확 일치 검색이면 못 찾는다.
    const canonical = R.toCanonicalAgentId('stock');            // 'inventory_monitor'
    const listUsesExactFind = /agents\.find\(\s*a\s*=>\s*a\.id === agentId\s*\)/.test(apprList);
    const boardUsesExactFind = /agents\.find\(\s*\(a\)\s*=>\s*a\.id === agentId\s*\)/.test(taskBoard);
    const mapsThroughRegistry = /displayAgentId|isSameAgent/.test(apprList) && /displayAgentId|isSameAgent/.test(taskBoard);
    return canonical === 'inventory_monitor' && mapsThroughRegistry && !listUsesExactFind && !boardUsesExactFind;
  })(), "화면이 canonical id 를 legacy id 목록에서 정확 일치로 찾아 알려진 AI 도 '소속 확인 필요'로 표시됨",
  '별칭표를 거쳐 표시명 변환');

// ── 협업 부모 연결 (W20) ────────────────────────────────────────────────────
console.log('');
console.log('  --- 협업 부모·자식 연결 ---');

red('W20. 협업 자식의 상태 변화가 요청팀 부모 카드에 반영된다',
  (() => { if (!hasFn('createCollaborationRequest')) return false; reset();
    const { parent, child } = A.createCollaborationRequest(
      { title: '문구 요청', requestingTeamId: 'cs', targetTeamId: 'design', instructedBy: LEAD_CS }, ids);
    const LEAD_DESIGN = A.actorForRole('design');
    const readParent = () => S.loadLifecycleTasks().find((x) => x.ref.taskId === parent.ref.taskId);

    A.assignExecutor(child.ref.taskId, { kind: 'human', actor: LEAD_DESIGN }, { nowIso: AT });
    const p1 = readParent();                              // 자식 진행 중 → 부모도 진행 중
    A.applyDecision(child.ref.taskId, { kind: 'return', actor: LEAD_DESIGN, reason: '자료 부족' }, { nowIso: AT });
    const p2 = readParent();                              // 자식 반송 → 부모 반송됨
    return p1.status === 'in_progress' && p2.status === 'returned'
      && p1.status !== 'open' && calledInProduct('createCollaborationRequest');
  })(), '부모 상태가 자식과 무관하게 open 으로 남고, 협업 생성 자체가 제품에서 호출되지 않음',
  '부모 상태 연동 + 제품 경로 호출');

// ── 자동 업무 권한·게이트 (W21~W22) ─────────────────────────────────────────
console.log('');
console.log('  --- 자동 업무 권한과 스케줄 게이트 ---');

red('W21. HQ·타 팀장은 다른 팀 AgentTaskPanel 의 실행·승인을 사용할 수 없다',
  /viewerRole|canOperateTeam|readOnly/.test(agentTaskPanel) && /viewerRole|canOperateTeam|readOnly/.test(deptPanel),
  'AgentTaskPanel 이 역할을 받지 않아 HQ 도 타 팀 자동 업무를 실행·승인할 수 있음');

red('W22. 자동 스케줄 진입점이 standing gate 를 반드시 통과한다',
  (() => {
    // 수동(사람이 누름)과 자동(스케줄)의 실행 함수가 분리되어 있고,
    // 자동 진입점이 게이트를 우회할 수 없어야 한다.
    const hasAutoEntry = /export function runScheduledAgentTask/.test(agentTaskRunner);
    const gateInside = /runScheduledAgentTask[\s\S]{0,400}canRunStandingDirective|canAutoRunAgentTask/.test(agentTaskRunner);
    // 게이트 없이 바로 발신하는 runAgentTask 가 그대로 공개되어 있으면 우회 가능하다.
    const bypassable = /export function runAgentTask/.test(agentTaskRunner) && !hasAutoEntry;
    return hasAutoEntry && gateInside && !bypassable;
  })(), '자동 진입점이 없고 runAgentTask 가 공개되어 스케줄러가 게이트를 건너뛸 수 있음',
  '자동 전용 진입점 + 내부 게이트');


// ════════════════════════════════════════════════════════════════════════════
// 정정된 전이 규칙 (W23~W30)
//   결과물이 있어야 하는 것 : 확인 완료 · 수정 요청 · 이번 결과 사용 안 함
//   결과 전에도 가능한 통제 : 작업 중단 · 수행 불가 반송
// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('  --- 정정된 전이 규칙 ---');

/** 저장된 업무를 그대로 읽는다(검사용 관찰). */
const readTask = (id) => S.loadLifecycleTasks().find((x) => x.ref.taskId === id);

red('W23. 결과 전 업무에는 확인 완료·수정 요청·미채택이 거부되고 상태·이력이 그대로다',
  (() => {
    const kinds = ['approve', 'request_revision', 'not_adopted'];
    return ['open', 'in_progress'].every((st) => kinds.every((kind) => {
      reset();
      const t = mkOpen('product');
      if (st === 'in_progress') A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
      const before = readTask(t.ref.taskId);
      const r = A.applyDecision(t.ref.taskId, { kind, actor: LEAD_PRODUCT, reason: 'x' }, { nowIso: AT, newId: ids.newId });
      const after = readTask(t.ref.taskId);
      return r.ok === false && after.status === before.status
        && after.decisions.length === before.decisions.length
        && S.loadLifecycleTasks().length === 1;   // revision 도 생기면 안 된다
    }));
  })(), '결과 없이도 승인·수정요청·미채택이 통과함', 'open/in_progress × 3행동 모두 거부 · 불변');

red('W24. 결과 전에도 책임자·요청자는 사유와 함께 작업을 중단할 수 있다',
  (() => {
    const allowed = ['open', 'in_progress'].every((st) => [LEAD_PRODUCT, HQ].every((actor) => {
      reset();
      const t = mkOpen('product', HQ);   // HQ 가 만든 상품팀 업무 → 요청자=HQ, 책임자=상품팀장
      if (st === 'in_progress') A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
      const r = A.applyDecision(t.ref.taskId, { kind: 'stop', actor, reason: '우선순위 변경' }, { nowIso: AT });
      const after = readTask(t.ref.taskId);
      return r.ok === true && after.status === 'stopped'
        && JSON.stringify(after).includes('우선순위 변경');
    }));
    // 무관한 타 팀장은 중단할 수 없다.
    reset();
    const t2 = mkOpen('product', HQ);
    const blocked = A.applyDecision(t2.ref.taskId, { kind: 'stop', actor: LEAD_CS, reason: 'x' }, { nowIso: AT }).ok === false;
    return allowed && blocked;
  })(), '결과 전 중단이 승인 단계 권한 판정에 걸려 거부되거나 사유가 남지 않음',
  '요청자·책임 팀장 중단 O · 무관한 팀장 X');

red('W25. 지시·협업을 받은 수행 팀장은 결과 전에도 요청자에게 반송할 수 있다',
  (() => {
    // (a) HQ 지시 업무 — 수행 팀장이 반송
    reset();
    const t = mkOpen('product', HQ);
    const r1 = A.applyDecision(t.ref.taskId, { kind: 'return', actor: LEAD_PRODUCT, reason: '자료 부족' }, { nowIso: AT });
    const a1 = readTask(t.ref.taskId);
    // (b) 협업 자식 — 수행 팀장이 반송하면 요청팀(부모)에도 반송이 보인다
    if (!hasFn('createCollaborationRequest')) return false;
    reset();
    const pair = A.createCollaborationRequest(
      { title: '문구 요청', requestingTeamId: 'cs', targetTeamId: 'design', instructedBy: LEAD_CS }, ids);
    const r2 = A.applyDecision(pair.child.ref.taskId, { kind: 'return', actor: A.actorForRole('design'), reason: '규격 미정' }, { nowIso: AT });
    const savedParent = readTask(pair.parent.ref.taskId);
    return r1.ok === true && a1.status === 'returned' && JSON.stringify(a1).includes('자료 부족')
      && r2.ok === true && savedParent.status === 'returned' && JSON.stringify(savedParent).includes('규격 미정');
  })(), '결과 전 반송이 거부되거나 요청팀 부모에 반영되지 않음', '지시·협업 모두 반송 O · 요청자에게 보임');

red('W26. 종료 상태 업무는 배정·제출·일반 결정 어느 것으로도 되살아나지 않는다',
  (() => {
    const terminals = ['completed', 'superseded', 'stopped', 'returned', 'not_adopted'];
    return terminals.every((st) => {
      reset();
      const t = mkOpen('product');
      S.saveLifecycleTasks(S.loadLifecycleTasks().map((x) =>
        (x.ref.taskId === t.ref.taskId ? { ...x, status: st, executorKind: 'human', executorId: 'u-product' } : x)));
      const a = A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
      const b = A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: LEAD_PRODUCT }, { nowIso: AT });
      const c = A.applyDecision(t.ref.taskId, { kind: 'approve', actor: LEAD_PRODUCT }, { nowIso: AT });
      const after = readTask(t.ref.taskId);
      return a.ok === false && b.ok === false && c.ok === false && after.status === st;
    });
  })(), '종료 상태에서도 배정·제출·결정이 통과함', '5개 종료 상태 모두 불변');

red('W27. 결과 제출자는 현재 수행자 본인이어야 한다',
  (() => { reset();
    const t = mkOpen('product');
    A.assignExecutor(t.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    const AGENT_SELF = { kind: 'agent', teamId: 'product', label: '재고 AI', agentId: 'inventory_monitor' };
    const OTHER_AGENT = { kind: 'agent', teamId: 'cs', label: '문의 AI', agentId: 'inquiry_analyst' };
    const byLeadWithoutTakeover = A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: LEAD_PRODUCT }, { nowIso: AT });
    const byOtherAgent = A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: OTHER_AGENT }, { nowIso: AT });
    const byHq = A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: HQ }, { nowIso: AT });
    const bySelf = A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: AGENT_SELF }, { nowIso: AT });
    if (!(byLeadWithoutTakeover.ok === false && byOtherAgent.ok === false && byHq.ok === false && bySelf.ok === true)) return false;
    // 팀장이 제출하려면 먼저 인수해야 한다.
    reset();
    const t2 = mkOpen('product');
    A.assignExecutor(t2.ref.taskId, { kind: 'agent', executorId: 'inventory_monitor', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.takeOverByLead(t2.ref.taskId, { actor: LEAD_PRODUCT }, { nowIso: AT });
    const afterTakeover = A.submitResult(t2.ref.taskId, { artifactRefs: ['a'], actor: LEAD_PRODUCT }, { nowIso: AT });
    return afterTakeover.ok === true;
  })(), '제출자 신원을 확인하지 않아 팀장·타 AI·HQ 제출이 모두 통과', '수행자 본인만 · 인수 후 팀장 가능');

red('W28. submitResult 는 in_progress 에서만 가능하다(open·재제출 금지)',
  (() => { reset();
    const t = mkOpen('product');
    const onOpen = A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: LEAD_PRODUCT }, { nowIso: AT });
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    A.submitResult(t.ref.taskId, { artifactRefs: ['a'], actor: LEAD_PRODUCT }, { nowIso: AT });
    const again = A.submitResult(t.ref.taskId, { artifactRefs: ['b'], actor: LEAD_PRODUCT }, { nowIso: AT });
    return onOpen.ok === false && again.ok === false;
  })(), 'open 제출 또는 재제출이 통과함', 'in_progress 1회만');

red('W29. 빈 제출은 결과로 인정하지 않고, 텍스트 업무보고는 인정한다',
  (() => { reset();
    const t = mkOpen('product');
    A.assignExecutor(t.ref.taskId, { kind: 'human', actor: LEAD_PRODUCT }, { nowIso: AT });
    const empties = [
      { artifactRefs: [] },
      { artifactRefs: [''] },
      { artifactRefs: ['   '] },
      { resultSummary: '' },
      { resultSummary: '   ' },
      {}
    ].every((payload) => A.submitResult(t.ref.taskId, Object.assign({}, payload, { actor: LEAD_PRODUCT }), { nowIso: AT }).ok === false);
    // 텍스트 업무보고만으로도 제출 성립 — 그리고 그 내용이 보존돼야 한다.
    const text = A.submitResult(t.ref.taskId, { resultSummary: '재고 3건 보충 완료', actor: LEAD_PRODUCT }, { nowIso: AT });
    const after = readTask(t.ref.taskId);
    return empties && text.ok === true && after.status === 'awaiting_approval'
      && after.resultSummary === '재고 3건 보충 완료'
      && !!after.submittedBy && !!after.submittedAt;
  })(), '빈 배열·빈 문자열도 제출로 인정되고 텍스트 보고를 보존할 자리가 없음',
  '빈 제출 6종 거부 · 텍스트 보고 보존');

red('W30. 화면에 보이는 행동과 서비스가 허용하는 행동이 일치한다',
  (() => { if (!hasFn('availableDecisions')) return false;
    const ALL = ['approve', 'request_revision', 'not_adopted', 'stop', 'return'];
    // (상태, 행위자) 조합마다 제시된 행동은 반드시 성공하고, 제시되지 않은 행동은 반드시 거부돼야 한다.
    const cases = [
      { st: 'open', actor: LEAD_PRODUCT }, { st: 'open', actor: HQ }, { st: 'open', actor: LEAD_CS },
      { st: 'in_progress', actor: LEAD_PRODUCT }, { st: 'in_progress', actor: HQ },
      { st: 'awaiting_approval', actor: LEAD_PRODUCT }, { st: 'awaiting_approval', actor: HQ }, { st: 'awaiting_approval', actor: LEAD_CS }
    ];
    const prepare = (st) => {
      reset();
      const t = mkOpen('product', HQ);
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
  })(), 'availableDecisions 가 상태·행위자를 반영하지 않아 서비스가 거부할 행동을 버튼으로 제시함',
  '8개 (상태×행위자) 조합에서 표시=허용 일치');

console.log('');
console.log('--- 요약 ---');
console.log(`[BASE] ${baseP} pass / ${baseF} fail   (진단 전제 — fail>0이면 진단 재작성)`);
console.log(`[RED ] ${redMet} met / ${redUnmet} unmet  (소비자 실배선·전이 안전장치 W1~W30)`);
rmSync(tmp, { recursive: true, force: true });
if (baseF > 0) { console.log('\n✗ 진단 전제 불일치'); process.exit(1); }
if (redUnmet > 0) {
  console.log(`\n✗ RC-2 D-1.3 — ${redUnmet}건 미충족`);
  process.exit(1);
}
console.log('\n✓ 전부 충족 — RC-2 D-1.3 GREEN 도달 (계약이 실제 화면에서 수행 가능)');
